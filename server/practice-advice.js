/**
 * 练习建议 v0.18：速度任务须任务窗准度 ≥95%。放弃局不算。均速只算对题。
 */
(function (root) {
  var RULE_VERSION = "0.18-provisional";
  var LEVEL_COUNT = 16;
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_YELLOW = 0.95;
  /** 绿档小步准度封顶 */
  var HEAT_P_STABLE = 0.97;
  var AHEAD_MASTERED_N = 80;
  /** Q3：绿快底板连续档数 */
  var FLOOR_MIN = 4;
  /** 热图速分门槛：≥此为黄族（中位）；与 heatmap HEAT_PCT_MEAN 相同 */
  var FAST_TIME_PCT = 50;
  /** 热图橙：分位 ≥ mean+1σ；与 heatmap HEAT_PCT_PLUS1 相同 */
  var HEAT_PCT_PLUS1 = 84;
  /** Q12：绿档补格低于此分位关掉低级加权（已较快） */
  var FOUNDATION_FAST_PCT = 40;
  /** Q12：相邻低级在慢区压过「高 10 分位」的倍率 */
  var FOUNDATION_RATIO = 1.15;
  /** Q6：准度小步（百分点） */
  var ACC_STEP = 0.015;
  /** Q7：速度小步：任务窗均速 ≤ 基线 × 此系数；对照 timePct −10 */
  var SPEED_RATIO = 0.92;
  var SPEED_TIME_PCT_STEP = 10;
  /** 成功验收最少样本 */
  var MIN_SUCCESS_GAMES = 2;
  var MIN_SUCCESS_ITEMS = 20;
  /** Q14：开新关激活门槛（1 局或 20 题） */
  var MIN_OPEN_GAMES = 1;
  /** Q8：当日封顶局数 */
  var FAIL_GAMES_PER_DAY = 3;
  /** Q9：跨日停滞（有练日） */
  var FAIL_PRACTICE_DAYS = 3;
  /** 未完成常驻格数；已完成在同一条队列里最多保留条数 */
  var INCOMPLETE_SIZE = 5;
  var COMPLETED_MAX = 5;
  /** 同一 key 两次出现之间至少隔这么多条；可练池空时破例 */
  var SAME_TASK_GAP = 5;
  /** 测试期不落全量成功历史；上线后改 true。冷却窗仍走 plan.tasks 里 status=success（最多 5）。 */
  var STORE_FULL_HISTORY = false;
  /** 冲榜闯关：每关按 10 题均速加总，再乘开销；预估须 ≤ 纪录 × 此系数 */
  var SCAN_CLEAR_ITEMS = 10;
  var SCAN_CLEAR_OVERHEAD = 1.2;
  var SCAN_CLEAR_IMPROVE = 0.85;
  var MAX_EVENTS = 40;
  var PLAY_MODES = {
    training: true,
    level: true,
    survival: true,
    decimal: true,
    perfectsquare: true,
    expandbrackets: true,
    divisibility: true,
    primecomposite: true,
  };

  var PRIOR_LABEL = {
    learned: "已学",
    current: "同步",
    ahead: "超前",
    unknown: "年级未填",
  };
  var PROFILE_LABEL = {
    skill_gaps: "底板型（前面能快，后面是弱项）",
    global_baseline: "平台型（整体底子，没有又绿又快的底板）",
  };

  function clampLevel(i) {
    var n = Math.floor(Number(i) || 0);
    if (n < 0) return 0;
    if (n > LEVEL_COUNT - 1) return LEVEL_COUNT - 1;
    return n;
  }

  function levelLabel(levelIndex) {
    return "L" + (clampLevel(levelIndex) + 1);
  }

  function curriculumPrior(grade, levelIndex) {
    var L = clampLevel(levelIndex) + 1;
    if (grade === null || grade === undefined || grade === "") return "unknown";
    var g = Number(grade);
    if (!Number.isInteger(g) || g < 0 || g > 12) return "unknown";
    if (g === 0) return L <= 4 ? "current" : "ahead";
    if (g === 1) {
      if (L <= 6) return "learned";
      if (L <= 9) return "current";
      return "ahead";
    }
    if (g === 2) {
      if (L <= 9) return "learned";
      if (L <= 11) return "current";
      if (L === 12) return "learned";
      return "ahead";
    }
    if (g === 3) {
      if (L <= 12) return "learned";
      return "ahead";
    }
    if (g === 4) {
      if (L <= 14) return "learned";
      return "current";
    }
    return "learned";
  }

  function heatBand(cell) {
    if (!cell || !cell.active) return "inactive";
    var p = cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
    if (p == null) return "unknown";
    var pct =
      cell.timePct != null && Number.isFinite(Number(cell.timePct))
        ? Number(cell.timePct)
        : null;
    var tooSlow = cell.tooSlow === true || (pct != null && pct >= HEAT_PCT_PLUS1);
    if (p < HEAT_P_ORANGE || tooSlow) return "orange";
    if (p < HEAT_P_YELLOW || (pct != null && pct >= FAST_TIME_PCT)) return "yellow";
    return "fluent";
  }

  function classifyStage(cell, prior) {
    var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
    if (!cell || !cell.active || n <= 0) return "no_data";
    var band = heatBand(cell);
    if (band === "orange") return "weak";
    if (band === "yellow") return "shaky";
    if (band !== "fluent") return "shaky";
    if (prior === "ahead" && n < AHEAD_MASTERED_N) return "thin";
    return "mastered";
  }

  function stageLabelOf(row) {
    if (row.stage === "weak" && row.p != null && row.p >= HEAT_P_ORANGE) {
      return "会但过慢";
    }
    if (row.stage === "weak") return "不会/很生";
    if (row.stage === "shaky" && row.p != null && row.p >= HEAT_P_YELLOW) {
      return "会但偏慢";
    }
    if (row.stage === "shaky") return "不熟";
    if (row.stage === "thin") return "样本薄";
    if (row.stage === "mastered") return "会了";
    if (row.stage === "no_data") return "无数据";
    return row.stage;
  }

  function avgSecFromCell(cell) {
    if (!cell) return null;
    if (cell.meanLnCorrect != null && Number.isFinite(Number(cell.meanLnCorrect))) {
      var sec = Math.exp(Number(cell.meanLnCorrect)) / 1000;
      return Number.isFinite(sec) && sec > 0 ? sec : null;
    }
    if (cell.avgSec != null && Number.isFinite(Number(cell.avgSec))) return Number(cell.avgSec);
    if (typeof cell.avgSecText === "string") {
      var m = cell.avgSecText.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function getCell(cells, levelIndex) {
    var list = Array.isArray(cells) ? cells : [];
    var k = clampLevel(levelIndex);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].levelIndex === k) return list[i];
    }
    return list[k] || { levelIndex: k, active: false, n: 0, p: null, tooSlow: false, fluent: false };
  }

  function timePctVal(row) {
    return row && row.timePct != null && Number.isFinite(Number(row.timePct)) ? Number(row.timePct) : 0;
  }

  /**
   * 加减 / 乘除两条进度线，在 L15–L16 汇合。
   * L5 与 L6、L7 与 L8 同深（不强制先加后减）。
   * remaining = 本线后面还有几档 + 混合 2 档（地基越前权重越大）。
   */
  var ADD_TRACK_GROUPS = [[1], [2], [3], [4], [5, 6], [7, 8], [9], [12]];
  var MUL_TRACK_GROUPS = [[10], [11], [13], [14]];
  var MIX_TRACK_GROUPS = [[15], [16]];

  function remainingInGroups(groups, L, extra) {
    var i;
    for (i = 0; i < groups.length; i += 1) {
      if (groups[i].indexOf(L) !== -1) return groups.length - 1 - i + extra;
    }
    return null;
  }

  function foundationRemaining(levelIndexOrL) {
    var n = Math.floor(Number(levelIndexOrL) || 0);
    var L = n >= 1 && n <= LEVEL_COUNT ? n : n + 1;
    var add = remainingInGroups(ADD_TRACK_GROUPS, L, MIX_TRACK_GROUPS.length);
    if (add != null) return add;
    var mul = remainingInGroups(MUL_TRACK_GROUPS, L, MIX_TRACK_GROUPS.length);
    if (mul != null) return mul;
    var mix = remainingInGroups(MIX_TRACK_GROUPS, L, 0);
    if (mix != null) return mix;
    return 0;
  }

  /** 慢区：timePct × 1.15^剩余步；已快（<40）关掉低级优势，只比分位。 */
  function speedFoundationTerm(row) {
    var tp = timePctVal(row);
    if (tp < FOUNDATION_FAST_PCT) return tp;
    return tp * Math.pow(FOUNDATION_RATIO, foundationRemaining(row.L || (row.levelIndex != null ? row.levelIndex + 1 : 0)));
  }

  function holeScore(row) {
    var p = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : 0;
    var spd = timePctVal(row);
    if (row.stage === "weak") return 2000 + (1 - p) * 1000 + (row.tooSlow ? 80 : 0) + spd;
    if (row.stage === "shaky") return 1000 + (1 - p) * 1000 + spd;
    return 0;
  }

  /** 已学流畅档：准度离 97% + 地基加权速度项 + 样本偏薄。越大越该补进未完成。 */
  function fillerScore(row) {
    if (!row || !inSchoolPrior(row.prior)) return -1;
    if (row.stage === "no_data" || row.stage === "weak" || row.stage === "shaky") return -1;
    var p = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : 1;
    var accFrag = Math.max(0, HEAT_P_STABLE - p) * 1000;
    var spd = speedFoundationTerm(row);
    var thin = row.n > 0 && row.n < 80 ? (80 - row.n) * 0.4 : 0;
    var s = accFrag + spd + thin;
    return s > 0 ? s : -1;
  }

  function pickWorstHole(rows) {
    var best = null;
    for (var i = 0; i < rows.length; i += 1) {
      if (!best || holeScore(rows[i]) > holeScore(best) + 1e-9) best = rows[i];
    }
    return best;
  }

  function sortHolesWorstFirst(rows) {
    return rows.slice().sort(function (a, b) {
      return holeScore(b) - holeScore(a);
    });
  }

  function pctText(p) {
    if (p == null || !Number.isFinite(Number(p))) return "—";
    return Math.round(Number(p) * 1000) / 10 + "%";
  }

  function inSchoolPrior(prior) {
    return prior === "learned" || prior === "current" || prior === "unknown";
  }

  function buildRows(grade, cells) {
    var rows = [];
    for (var i = 0; i < LEVEL_COUNT; i += 1) {
      var cell = getCell(cells, i);
      var prior = curriculumPrior(grade, i);
      var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
      var p = cell && cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
      var row = {
        levelIndex: i,
        L: i + 1,
        levelLabel: levelLabel(i),
        prior: prior,
        priorLabel: PRIOR_LABEL[prior] || prior,
        stage: classifyStage(cell, prior),
        n: n,
        p: p,
        pPct: pctText(p),
        tooSlow: !!(cell && cell.tooSlow),
        fluent: !!(cell && cell.fluent),
        band: heatBand(cell),
        timePct: cell && cell.timePct != null && Number.isFinite(Number(cell.timePct)) ? Number(cell.timePct) : null,
        avgSec: avgSecFromCell(cell),
        meanLnCorrect:
          cell && cell.meanLnCorrect != null && Number.isFinite(Number(cell.meanLnCorrect))
            ? Number(cell.meanLnCorrect)
            : null,
      };
      row.stageLabel = stageLabelOf(row);
      rows.push(row);
    }
    return rows;
  }

  function greenFastFloorLen(rows) {
    var n = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      if (r.band !== "fluent") break;
      if (r.timePct == null || r.timePct >= FAST_TIME_PCT) break;
      n += 1;
    }
    return n;
  }

  function classifyProfile(rows) {
    var floor = greenFastFloorLen(rows);
    var holesAbove = rows.some(function (r) {
      return r.levelIndex >= floor && (r.stage === "weak" || r.stage === "shaky");
    });
    var id = floor >= FLOOR_MIN && holesAbove ? "skill_gaps" : "global_baseline";
    return {
      id: id,
      label: PROFILE_LABEL[id],
      floor: floor,
      floorLabel: floor > 0 ? "L1–L" + floor : "无",
    };
  }

  function accConsecutiveTopIndex(rows) {
    var top = -1;
    var list = rows || [];
    for (var i = 0; i < list.length; i += 1) {
      var p = list[i] && list[i].p != null && Number.isFinite(Number(list[i].p)) ? Number(list[i].p) : null;
      if (p == null || p < HEAT_P_YELLOW) break;
      top = i;
    }
    return top;
  }

  /** 合格线 Ln = 须通过 Ln。只看从 L1 起连续准≥95%，再和历史最高取 min。L1 不够 95% 时目标仍是 L1。 */
  function resolveScanTarget(rows, opts) {
    opts = opts || {};
    var hist = null;
    if (opts.levelChallengeBestLevel != null && Number.isFinite(Number(opts.levelChallengeBestLevel))) {
      hist = Math.floor(Number(opts.levelChallengeBestLevel));
    }
    if (opts.levelBestFromRuns != null && Number.isFinite(Number(opts.levelBestFromRuns))) {
      var fromRuns = Math.floor(Number(opts.levelBestFromRuns));
      if (hist == null || fromRuns > hist) hist = fromRuns;
    }
    var accTop = accConsecutiveTopIndex(rows);
    var idx;
    if (accTop < 0) idx = 0;
    else if (hist != null && hist >= 0) idx = Math.min(hist, accTop);
    else idx = accTop;
    idx = clampLevel(idx);
    return { levelIndex: idx, levelLabel: levelLabel(idx) };
  }

  function runDurationSec(run) {
    if (!run) return null;
    if (run.survivalTimeSec != null && Number.isFinite(Number(run.survivalTimeSec))) {
      var a = Number(run.survivalTimeSec);
      if (a > 0) return a;
    }
    if (run.durationSec != null && Number.isFinite(Number(run.durationSec))) {
      var b = Number(run.durationSec);
      if (b > 0) return b;
    }
    return null;
  }

  function bestClearedLevelSec(runs) {
    var best = null;
    (runs || []).forEach(function (r) {
      if (normalizeRunMode(r && r.mode) !== "level" || r.cleared !== true) return;
      var sec = runDurationSec(r);
      if (sec == null) return;
      if (best == null || sec < best) best = sec;
    });
    return best;
  }

  function estimateClearSec(rows) {
    var sum = 0;
    var list = rows || [];
    for (var i = 0; i < LEVEL_COUNT; i += 1) {
      var row = list[i];
      var sec = row && row.avgSec != null && Number.isFinite(Number(row.avgSec)) ? Number(row.avgSec) : null;
      if (sec == null || sec <= 0) return null;
      sum += sec;
    }
    return sum * SCAN_CLEAR_ITEMS * SCAN_CLEAR_OVERHEAD;
  }

  function retryClearInfo(rows, runs) {
    var recordSec = bestClearedLevelSec(runs);
    var estimateSec = estimateClearSec(rows);
    if (recordSec == null || estimateSec == null) return null;
    return {
      estimateSec: estimateSec,
      recordSec: recordSec,
      improve: estimateSec <= recordSec * SCAN_CLEAR_IMPROVE,
    };
  }

  function clearEstimateInfo(rows, runs) {
    var estimateSec = estimateClearSec(rows);
    var recordSec = bestClearedLevelSec(runs);
    if (estimateSec == null) return null;
    var ratio = recordSec != null && recordSec > 0 ? estimateSec / recordSec : null;
    return {
      estimateSec: estimateSec,
      recordSec: recordSec,
      ratio: ratio,
      improve: ratio != null ? estimateSec <= recordSec * SCAN_CLEAR_IMPROVE : null,
      copy:
        "预估全通 " +
        formatAdviceClock(estimateSec) +
        "（每关10题×1.2）" +
        (recordSec != null
          ? " · 纪录 " +
            formatAdviceClock(recordSec) +
            "（预估 " +
            Math.round(ratio * 100) +
            "% 纪录" +
            (estimateSec <= recordSec * SCAN_CLEAR_IMPROVE ? "，可排冲榜" : "，未到85%") +
            "）"
          : " · 无通关纪录"),
    };
  }

  function isRetryClearScan(ctx) {
    return !!(ctx && ctx.scan && ctx.scan.kind === "retry_clear");
  }

  function scanIsNeeded(ctx) {
    if (!ctx) return false;
    if (ctx.profile && ctx.profile.id === "skill_gaps" && ctx.hasClearedLevel) {
      return isRetryClearScan(ctx);
    }
    return true;
  }

  function formatAdviceClock(sec) {
    if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) <= 0) return "—";
    var s = Math.round(Number(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m <= 0) return r + "秒";
    return m + "分" + (r < 10 ? "0" : "") + r + "秒";
  }

  /** 过 Ln：须打完该关。L16 看 cleared；其余看 maxLevel 是否到达下一关。 */
  function passedScanTarget(run, scanLevelIndex) {
    if (scanLevelIndex == null || !Number.isFinite(Number(scanLevelIndex))) return false;
    var idx = clampLevel(scanLevelIndex);
    if (idx >= LEVEL_COUNT - 1) return !!(run && run.cleared === true);
    var reached = summarizeRun(run, null).maxLevel;
    return reached != null && reached >= idx + 1;
  }

  function reason(ruleId, code, evidence, note) {
    return { ruleId: ruleId, code: code, evidence: evidence || "", note: note || "" };
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function chinaDateKeyFromTs(ts) {
    var n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(n));
    } catch (e) {
      return new Date(n).toISOString().slice(0, 10);
    }
  }

  function roundSec(sec) {
    if (sec == null || !Number.isFinite(Number(sec))) return null;
    return Math.round(Number(sec) * 10) / 10;
  }

  function normalizeRunMode(mode) {
    return String(mode || "")
      .toLowerCase()
      .replace(/[_-]/g, "");
  }

  function runTs(run) {
    var n = Number(run && run.ts);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isAbandonedRun(run) {
    if (!run) return false;
    if (run.abandoned === true) return true;
    var m = run.trainingMeta;
    return !!(m && typeof m === "object" && m.abandoned === true);
  }

  function isPlayRun(run) {
    if (!run || run.comboOnly === true) return false;
    if (isAbandonedRun(run)) return false;
    if (!runTs(run)) return false;
    return !!PLAY_MODES[normalizeRunMode(run.mode)];
  }

  function trainingLevelIndex(run) {
    var m = run && run.trainingMeta && typeof run.trainingMeta === "object" ? run.trainingMeta : null;
    if (m && m.pickedLevel != null && Number.isFinite(Number(m.pickedLevel))) {
      return clampLevel(Number(m.pickedLevel));
    }
    if (run && run.maxLevel != null && Number.isFinite(Number(run.maxLevel))) {
      return clampLevel(Number(run.maxLevel));
    }
    return null;
  }

  function taskKey(action, levelIndex) {
    if (action === "level") return "level";
    return String(action || "training") + ":" + String(levelIndex);
  }

  function emptyWindow() {
    return { games: 0, items: 0, correct: 0, avgSec: null, speedN: 0, gamesByDay: {} };
  }

  function summarizeRun(run, levelIndex) {
    var attempts = run && Array.isArray(run.attempts) ? run.attempts : [];
    var filtered = attempts;
    if (levelIndex != null && attempts.length) {
      var matched = attempts.filter(function (a) {
        return a && a.levelIndex != null && Math.floor(Number(a.levelIndex)) === levelIndex;
      });
      if (matched.length) filtered = matched;
    }
    var n = filtered.length;
    var correct = 0;
    var lnSum = 0;
    var lnN = 0;
    filtered.forEach(function (a) {
      if (!a) return;
      if (a.correct) {
        correct += 1;
        var ms = Number(a.timeSpentMs);
        if (ms > 0 && ms < 60000) {
          lnSum += Math.log(ms);
          lnN += 1;
        }
      }
    });
    if (n === 0) {
      var score = Number(run && run.score);
      var wrong = Number(run && run.wrongCount);
      if (Number.isFinite(score) && score >= 0 && Number.isFinite(wrong) && wrong >= 0) {
        n = score + wrong;
        correct = score;
      }
    }
    var avgSec = lnN > 0 ? Math.exp(lnSum / lnN) / 1000 : null;
    var speedN = lnN;
    if (avgSec == null && run && run.trainingMeta && Number.isFinite(Number(run.trainingMeta.runAvgSec))) {
      avgSec = Number(run.trainingMeta.runAvgSec);
      if (speedN <= 0 && correct > 0) speedN = correct;
      else if (speedN <= 0) speedN = 1;
    }
    var maxLv = run && run.maxLevel != null && Number.isFinite(Number(run.maxLevel)) ? Math.floor(Number(run.maxLevel)) : null;
    return {
      n: n,
      correct: correct,
      p: n > 0 ? correct / n : null,
      avgSec: avgSec,
      speedN: speedN,
      maxLevel: maxLv,
    };
  }

  function mergeAvgSec(prevAvg, prevN, nextAvg, nextN) {
    if (nextAvg == null || !nextN) return prevAvg;
    if (prevAvg == null || !prevN) return nextAvg;
    var a = Math.log(prevAvg) * prevN + Math.log(nextAvg) * nextN;
    var d = prevN + nextN;
    return d > 0 ? Math.exp(a / d) : nextAvg;
  }

  function pickPrimaryRow(rows, schoolHoles, aheadMastered, aheadThin, schoolMastered) {
    var primaryRow = null;
    var pickNote = "";
    var alternatives = [];
    if (schoolHoles.length) {
      primaryRow = pickWorstHole(schoolHoles);
      pickNote = "in_school_hole";
      schoolHoles.forEach(function (r) {
        if (r.levelIndex !== primaryRow.levelIndex) {
          alternatives.push({
            action: "training",
            levelIndex: r.levelIndex,
            levelLabel: r.levelLabel,
            title: "次要短板 " + r.levelLabel,
            detail: r.priorLabel + " · " + r.stageLabel + " 准" + r.pPct,
          });
        }
      });
    } else if (aheadMastered.length) {
      primaryRow = aheadMastered[0];
      for (var am = 1; am < aheadMastered.length; am += 1) {
        if (aheadMastered[am].levelIndex < primaryRow.levelIndex) primaryRow = aheadMastered[am];
      }
      pickNote = "ahead_mastered";
    } else if (schoolMastered.length) {
      var slow = schoolMastered.slice().sort(function (a, b) {
        var ta = a.timePct == null ? -1 : a.timePct;
        var tb = b.timePct == null ? -1 : b.timePct;
        return tb - ta;
      });
      primaryRow = slow[0];
      pickNote = "school_slowest";
    } else if (aheadThin.length) {
      primaryRow = aheadThin[0];
      for (var at = 1; at < aheadThin.length; at += 1) {
        if (aheadThin[at].levelIndex < primaryRow.levelIndex) primaryRow = aheadThin[at];
      }
      pickNote = "ahead_thin_only";
    } else {
      var openable = rows.filter(function (r) {
        return (r.prior === "current" || r.prior === "unknown") && r.stage === "no_data";
      });
      if (openable.length) {
        primaryRow = openable[0];
        pickNote = "open_current";
      }
    }
    return { primaryRow: primaryRow, pickNote: pickNote, alternatives: alternatives };
  }

  function splitGroups(rows) {
    return {
      schoolHoles: rows.filter(function (r) {
        return inSchoolPrior(r.prior) && (r.stage === "weak" || r.stage === "shaky");
      }),
      aheadNoData: rows.filter(function (r) {
        return r.prior === "ahead" && r.stage === "no_data";
      }),
      aheadMastered: rows.filter(function (r) {
        return r.prior === "ahead" && r.stage === "mastered";
      }),
      aheadThin: rows.filter(function (r) {
        return r.prior === "ahead" && (r.stage === "thin" || r.stage === "shaky");
      }),
      schoolMastered: rows.filter(function (r) {
        return inSchoolPrior(r.prior) && r.stage === "mastered";
      }),
    };
  }

  /** 已学/同步里已激活的关全部热图绿（无黄橙）。无已激活时视为可开第一档。 */
  function schoolActivatedReady(rows) {
    var list = rows || [];
    var activated = 0;
    for (var i = 0; i < list.length; i += 1) {
      var r = list[i];
      if (!inSchoolPrior(r.prior)) continue;
      if (r.stage === "no_data") continue;
      activated += 1;
      if (r.stage === "weak" || r.stage === "shaky") return false;
    }
    return true;
  }

  /** 已学/同步里关号最小的无数据档。超前不开。闯关留下 n>0 后不再是候选。 */
  function nextOpenableRow(rows) {
    var list = rows || [];
    var best = null;
    for (var i = 0; i < list.length; i += 1) {
      var r = list[i];
      if (!inSchoolPrior(r.prior) || r.stage !== "no_data") continue;
      if (!best || r.levelIndex < best.levelIndex) best = r;
    }
    return best;
  }

  /** 四则热图尚无任何已激活格（全是无数据）。 */
  function heatmapIsEmpty(rows) {
    return !(rows || []).some(function (r) {
      return r && r.stage && r.stage !== "no_data";
    });
  }

  function canScheduleOpenNew(rows) {
    if (heatmapIsEmpty(rows)) return false;
    return schoolActivatedReady(rows) && !!nextOpenableRow(rows);
  }

  function rowByLevel(rows, levelIndex) {
    if (levelIndex == null) return null;
    return rows[clampLevel(levelIndex)] || null;
  }

  function successKindForRow(row) {
    if (!row) return "acc_step";
    var p = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : null;
    if (row.tooSlow && p != null && p >= HEAT_P_ORANGE) return "speed_step";
    if (p != null && p >= HEAT_P_ORANGE && timePctVal(row) >= HEAT_PCT_PLUS1) return "speed_step";
    if (p != null && p < HEAT_P_YELLOW) return "acc_step";
    if (p != null && p + 1e-9 >= HEAT_P_STABLE) return "speed_step";
    var accFrag = p != null ? Math.max(0, HEAT_P_STABLE - p) * 1000 : 0;
    var spd = timePctVal(row);
    if (spd >= FAST_TIME_PCT && spd >= accFrag) return "speed_step";
    return "acc_step";
  }

  function applySpeedTargets(row) {
    return {
      targetTimePct:
        row.timePct != null && Number.isFinite(Number(row.timePct))
          ? Math.max(0, Number(row.timePct) - SPEED_TIME_PCT_STEP)
          : null,
      targetAvgSec: row.avgSec != null ? row.avgSec * SPEED_RATIO : null,
    };
  }

  function emptyPlanWindow() {
    return emptyWindow();
  }

  function nextTaskId(plan) {
    var id = "t" + plan.nextId;
    plan.nextId += 1;
    return id;
  }

  function makeTrainingTask(plan, row) {
    var kind = successKindForRow(row);
    var targetP = null;
    var targetTimePct = null;
    var targetAvgSec = null;
    if (kind !== "speed_step") {
      var baseP = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : 0;
      var accCap = baseP >= HEAT_P_YELLOW ? HEAT_P_STABLE : HEAT_P_YELLOW;
      if (baseP + 1e-9 >= accCap) {
        kind = "speed_step";
      } else {
        targetP = Math.min(accCap, baseP + ACC_STEP);
      }
    }
    if (kind === "speed_step") {
      var spdT = applySpeedTargets(row);
      targetTimePct = spdT.targetTimePct;
      targetAvgSec = spdT.targetAvgSec;
    }
    var title = "训练 " + row.levelLabel;
    var detail =
      (row.priorLabel || "") +
      " · " +
      row.stageLabel +
      " 准" +
      row.pPct +
      (row.tooSlow ? " 过慢" : "") +
      (row.timePct != null ? " timePct " + Math.round(row.timePct) : "") +
      " n=" +
      row.n;
    return {
      id: nextTaskId(plan),
      key: taskKey("training", row.levelIndex),
      action: "training",
      mode: "training",
      levelIndex: row.levelIndex,
      levelLabel: row.levelLabel,
      status: "pending",
      successKind: kind,
      baseline: {
        p: row.p,
        timePct: row.timePct,
        n: row.n,
        tooSlow: !!row.tooSlow,
        avgSec: row.avgSec,
        stageLabel: row.stageLabel,
        priorLabel: row.priorLabel,
      },
      targetP: targetP,
      targetTimePct: targetTimePct,
      targetAvgSec: targetAvgSec,
      scanLevelIndex: null,
      scanLevelLabel: "",
      failMaxGamesPerDay: FAIL_GAMES_PER_DAY,
      failMaxPracticeDays: FAIL_PRACTICE_DAYS,
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
      title: title,
      detail: detail,
    };
  }

  function makeOpenTask(plan, row) {
    return {
      id: nextTaskId(plan),
      key: taskKey("training", row.levelIndex),
      action: "training",
      mode: "training",
      levelIndex: row.levelIndex,
      levelLabel: row.levelLabel,
      status: "pending",
      successKind: "open_activate",
      baseline: {
        p: row.p,
        timePct: row.timePct,
        n: row.n,
        tooSlow: false,
        avgSec: row.avgSec,
        stageLabel: row.stageLabel,
        priorLabel: row.priorLabel,
      },
      targetP: null,
      targetTimePct: null,
      targetAvgSec: null,
      scanLevelIndex: null,
      scanLevelLabel: "",
      failMaxGamesPerDay: FAIL_GAMES_PER_DAY,
      failMaxPracticeDays: FAIL_PRACTICE_DAYS,
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
      title: "训练 " + row.levelLabel + "（开新关）",
      detail:
        (row.priorLabel || "") +
        " · 未激活；已学/同步空档，前面已激活的校内关都是热图绿。打满 " +
        MIN_OPEN_GAMES +
        " 局或 " +
        MIN_SUCCESS_ITEMS +
        " 题即激活，不要求一次练熟",
    };
  }

  function applyScanFields(task, scan) {
    if (!task || !scan) return task;
    task.levelIndex = scan.levelIndex;
    task.levelLabel = "闯关→" + scan.levelLabel;
    task.scanLevelIndex = scan.levelIndex;
    task.scanLevelLabel = scan.levelLabel;
    task.scanKind = scan.kind || "";
    if (scan.kind === "retry_clear") {
      task.title = "冲榜闯关，须通关 " + scan.levelLabel;
      task.detail =
        "热图预估 " +
        formatAdviceClock(scan.estimateSec) +
        "，纪录 " +
        formatAdviceClock(scan.recordSec) +
        "（≤" +
        Math.round(SCAN_CLEAR_IMPROVE * 100) +
        "% 才排）。从 L1 开须全通，不要求本局破纪录";
    } else {
      task.title = "闯关扫描，须过 " + scan.levelLabel;
      task.detail = "从 L1 开，须通过 " + scan.levelLabel + "（打完该关，不是摸到）；更早出局不算成功";
    }
    return task;
  }

  function makeScanTask(plan, scan) {
    var task = {
      id: nextTaskId(plan),
      key: "level",
      action: "level",
      mode: "level",
      status: "pending",
      successKind: "level_reach",
      baseline: {
        p: null,
        timePct: null,
        n: 0,
        tooSlow: false,
        avgSec: null,
        stageLabel: "",
        priorLabel: "",
      },
      targetP: null,
      targetTimePct: null,
      targetAvgSec: null,
      failMaxGamesPerDay: FAIL_GAMES_PER_DAY,
      failMaxPracticeDays: FAIL_PRACTICE_DAYS,
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
    };
    return applyScanFields(task, scan);
  }

  function uniqueSeeds(ctx) {
    var seeds = [];
    var used = {};
    function tryAdd(seed) {
      var k = seedKey(seed);
      if (used[k]) return;
      used[k] = true;
      seeds.push(seed);
    }
    var holes = sortHolesWorstFirst(ctx.schoolHoles);
    var primary = ctx.primaryRow;
    if (ctx.profile.id === "skill_gaps") {
      if (!holes.length && primary && (primary.stage === "weak" || primary.stage === "shaky")) {
        holes = [primary];
      }
    }
    var needScan = scanIsNeeded(ctx);
    var n = ctx.scan && ctx.scan.levelIndex != null ? ctx.scan.levelIndex : 0;
    if (heatmapIsEmpty(ctx.rows)) {
      if (needScan) tryAdd({ kind: "scan", scan: ctx.scan });
      return seeds;
    }
    if (needScan && isRetryClearScan(ctx)) {
      if (holes.length) {
        tryAdd({ kind: "training", row: holes[0] });
        tryAdd({ kind: "scan", scan: ctx.scan });
        holes.slice(1).forEach(function (r) {
          tryAdd({ kind: "training", row: r });
        });
      } else {
        tryAdd({ kind: "scan", scan: ctx.scan });
      }
    } else if (needScan) {
      holes.forEach(function (r) {
        if (r.levelIndex <= n) tryAdd({ kind: "training", row: r });
      });
      tryAdd({ kind: "scan", scan: ctx.scan });
      holes.forEach(function (r) {
        if (r.levelIndex > n) tryAdd({ kind: "training", row: r });
      });
    } else {
      holes.forEach(function (r) {
        tryAdd({ kind: "training", row: r });
      });
    }
    if (canScheduleOpenNew(ctx.rows || [])) {
      tryAdd({ kind: "open", row: nextOpenableRow(ctx.rows) });
    }
    var fillers = (ctx.rows || [])
      .filter(function (r) {
        return fillerScore(r) > 0;
      })
      .slice()
      .sort(function (a, b) {
        return fillerScore(b) - fillerScore(a);
      });
    fillers.forEach(function (r) {
      tryAdd({ kind: "training", row: r });
    });
    return seeds;
  }

  function seedIsNeeded(seed, ctx) {
    if (seed.kind === "scan") return scanIsNeeded(ctx);
    if (seed.kind === "open") {
      var openRow = seed.row;
      if (!openRow || openRow.stage !== "no_data") return false;
      return canScheduleOpenNew(ctx.rows || []);
    }
    var row = seed.row;
    if (!row) return false;
    if (row.stage === "weak" || row.stage === "shaky") return true;
    return fillerScore(row) > 0;
  }

  function doneTasks(plan) {
    return (plan.tasks || []).filter(function (t) {
      return t && t.status === "success";
    });
  }

  function trimDone(done) {
    var list = (done || []).slice();
    while (list.length > COMPLETED_MAX) list.shift();
    return list;
  }

  /** 上一次出现之后若还不到 SAME_TASK_GAP 条，则太密。 */
  function keyTooSoon(key, seq) {
    var last = -1;
    for (var i = 0; i < seq.length; i += 1) {
      if (seq[i] && seq[i].key === key) last = i;
    }
    if (last < 0) return false;
    return seq.length - last - 1 < SAME_TASK_GAP;
  }

  function isScanTask(t) {
    return !!(t && (t.key === "level" || t.action === "level"));
  }

  function doneHasTrainingLevel(done, levelIndex) {
    var k = taskKey("training", levelIndex);
    return (done || []).some(function (t) {
      return t && t.key === k;
    });
  }

  /** 未完成里关号≤n 且不在已完成窗口的训练，必须排在闯关前面。冲榜闯关不走这条。 */
  function placeScanAfterPrereqs(next, done, scanLevelIndex) {
    var list = (next || []).slice();
    var scanIdx = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (isScanTask(list[i])) {
        scanIdx = i;
        break;
      }
    }
    if (scanIdx < 0 || scanLevelIndex == null) return list;
    var prereq = [];
    var kept = [];
    list.forEach(function (t, idx) {
      if (idx === scanIdx) {
        kept.push(t);
        return;
      }
      var low =
        t.action === "training" && t.levelIndex != null && t.levelIndex <= scanLevelIndex;
      if (low && !doneHasTrainingLevel(done, t.levelIndex)) prereq.push(t);
      else kept.push(t);
    });
    var newScanIdx = -1;
    for (var j = 0; j < kept.length; j += 1) {
      if (isScanTask(kept[j])) {
        newScanIdx = j;
        break;
      }
    }
    if (newScanIdx < 0) return list;
    return kept.slice(0, newScanIdx).concat(prereq, kept.slice(newScanIdx));
  }

  /** 冲榜闯关：有黄橙洞则第二格，全绿则队头。 */
  function placeRetryScanSecond(next, ctx) {
    var list = (next || []).slice();
    var si = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (isScanTask(list[i])) {
        si = i;
        break;
      }
    }
    if (si < 0) return list;
    var scan = list.splice(si, 1)[0];
    var hasHole = !!(ctx && ctx.schoolHoles && ctx.schoolHoles.length);
    if (!hasHole) return [scan].concat(list);
    var at = Math.min(1, list.length);
    list.splice(at, 0, scan);
    return list;
  }

  function fillIncomplete(plan, ctx, ts) {
    var done = trimDone(doneTasks(plan));
    var next = openTasks(plan).filter(function (t) {
      if (isScanTask(t) && !scanIsNeeded(ctx)) return false;
      if (t.successKind !== "open_activate") return true;
      var row = rowByLevel(ctx.rows || [], t.levelIndex);
      if (!row || row.stage !== "no_data") return false;
      return canScheduleOpenNew(ctx.rows || []);
    });
    if (ctx.scan) {
      next.forEach(function (t) {
        if (isScanTask(t)) applyScanFields(t, ctx.scan);
      });
    }
    var needed = uniqueSeeds(ctx).filter(function (s) {
      return seedIsNeeded(s, ctx);
    });
    function appendFromNeeded(allowCloseRepeat) {
      needed.forEach(function (seed) {
        if (next.length >= INCOMPLETE_SIZE) return;
        var k = seedKey(seed);
        if (
          next.some(function (t) {
            return t.key === k;
          })
        ) {
          return;
        }
        if (!allowCloseRepeat && keyTooSoon(k, done.concat(next))) return;
        next.push(seedToTask(plan, seed));
      });
    }
    appendFromNeeded(false);
    if (!next.length) appendFromNeeded(true);
    var scanN = ctx.scan && ctx.scan.levelIndex != null ? ctx.scan.levelIndex : null;
    if (isRetryClearScan(ctx)) next = placeRetryScanSecond(next, ctx);
    else next = placeScanAfterPrereqs(next, done, scanN);
    plan.tasks = done.concat(next);
    activateFirst(plan.tasks);
  }

  function seedKey(seed) {
    return seed.kind === "scan" ? "level" : taskKey("training", seed.row.levelIndex);
  }

  function seedToTask(plan, seed) {
    if (seed.kind === "scan") return makeScanTask(plan, seed.scan);
    if (seed.kind === "open") return makeOpenTask(plan, seed.row);
    return makeTrainingTask(plan, seed.row);
  }

  function activateFirst(tasks) {
    var found = false;
    (tasks || []).forEach(function (t) {
      if (!t || t.status === "success") return;
      if (t.status === "pending" || t.status === "active") {
        if (!found) {
          t.status = "active";
          found = true;
        } else {
          t.status = "pending";
        }
      }
    });
  }

  function pushEvent(plan, type, text, ts) {
    if (!plan.events) plan.events = [];
    plan.events.push({ ts: ts || plan.issuedAt, type: type, text: text });
    if (plan.events.length > MAX_EVENTS) plan.events = plan.events.slice(-MAX_EVENTS);
  }

  function dontOpenFrom(aheadNoData) {
    var labels = aheadNoData.map(function (r) {
      return r.levelLabel;
    });
    var copy = "";
    if (labels.length === 1) copy = labels[0];
    else if (labels.length > 1) copy = labels[0] + " 及以上";
    return { labels: labels, copy: copy };
  }

  function issuePlan(ctx, issuedAt, username) {
    var dont = dontOpenFrom(ctx.aheadNoData);
    var plan = {
      ruleVersion: RULE_VERSION,
      username: username || "",
      issuedAt: issuedAt,
      lastProcessedTs: issuedAt,
      phase: "test",
      nextId: 1,
      profile: ctx.profile,
      pickNote: ctx.pickNote,
      dontOpen: dont.labels,
      dontOpenLabel: dont.copy,
      tasks: [],
      events: [],
      history: [],
    };
    fillIncomplete(plan, ctx, issuedAt);
    var head = getActiveTask(plan);
    pushEvent(
      plan,
      "issue",
      head ? "开单：当前任务 " + (head.title || head.levelLabel) : "开单：暂无任务",
      issuedAt
    );
    return plan;
  }

  function findMatchingOpenTask(plan, run) {
    var open = openTasks(plan);
    for (var i = 0; i < open.length; i += 1) {
      if (runMatchesTask(run, open[i])) return open[i];
    }
    return null;
  }

  /** 只用这一局当任务窗，看是否已达成功线（不把失败写回原任务）。 */
  function probeRunSuccess(task, run) {
    if (!task || !run) return null;
    var probe = cloneJson(task);
    probe.window = emptyPlanWindow();
    if (applyFollow(probe, run) !== "success") return null;
    return probe;
  }

  function reissueIncomplete(plan, ctx, ts, text, keepOpenWindows) {
    var done = trimDone(doneTasks(plan));
    var kept = {};
    if (keepOpenWindows !== false) {
      openTasks(plan).forEach(function (t) {
        if (!t || !t.key) return;
        kept[t.key] = cloneJson(t.window || emptyPlanWindow());
      });
    }
    plan.tasks = done;
    if (ctx && ctx.profile) plan.profile = ctx.profile;
    if (ctx) {
      plan.pickNote = ctx.pickNote;
      var dont = dontOpenFrom(ctx.aheadNoData || []);
      plan.dontOpen = dont.labels;
      plan.dontOpenLabel = dont.copy;
    }
    fillIncomplete(plan, ctx, ts);
    openTasks(plan).forEach(function (t) {
      if (kept[t.key]) t.window = kept[t.key];
    });
    activateFirst(plan.tasks);
    pushEvent(plan, "rebuild", text || "跑偏：按热图重算未完成（已完成与同关进度保留）", ts);
  }

  function getActiveTask(plan) {
    if (!plan || !Array.isArray(plan.tasks)) return null;
    for (var i = 0; i < plan.tasks.length; i += 1) {
      if (plan.tasks[i].status === "active") return plan.tasks[i];
    }
    return null;
  }

  function openTasks(plan) {
    return (plan.tasks || []).filter(function (t) {
      return t.status === "active" || t.status === "pending";
    });
  }

  function runMatchesTask(run, task) {
    if (!task || !isPlayRun(run)) return false;
    var mode = normalizeRunMode(run.mode);
    if (task.action === "training") {
      if (mode !== "training") return false;
      var lv = trainingLevelIndex(run);
      return lv != null && lv === task.levelIndex;
    }
    if (task.action === "level") return mode === "level";
    return false;
  }

  function sampleOk(task) {
    var w = task.window || emptyPlanWindow();
    if (task.successKind === "level_reach") return w.games >= 1;
    if (task.successKind === "open_activate") {
      return w.games >= MIN_OPEN_GAMES || w.items >= MIN_SUCCESS_ITEMS;
    }
    return w.items >= MIN_SUCCESS_ITEMS || w.games >= MIN_SUCCESS_GAMES;
  }

  function windowP(task) {
    var w = task.window || emptyPlanWindow();
    if (!w.items) return null;
    return w.correct / w.items;
  }

  function captureBaselineAvgSec(task, run) {
    if (task.baseline && task.baseline.avgSec != null) return;
    if (task.targetAvgSec != null) return;
    var m = run && run.trainingMeta && typeof run.trainingMeta === "object" ? run.trainingMeta : null;
    var start = m && Number.isFinite(Number(m.heatAvgSecAtStart)) ? Number(m.heatAvgSecAtStart) : null;
    if (start != null && start > 0) {
      task.baseline.avgSec = start;
      task.targetAvgSec = start * SPEED_RATIO;
    }
  }

  function evaluateSuccess(task, run) {
    if (!sampleOk(task)) return false;
    if (task.successKind === "level_reach") {
      return passedScanTarget(run, task.scanLevelIndex);
    }
    if (task.successKind === "open_activate") return true;
    if (task.successKind === "speed_step") {
      if (task.targetAvgSec == null || task.window.avgSec == null) return false;
      var speedP = windowP(task);
      if (speedP == null || speedP + 1e-9 < HEAT_P_YELLOW) return false;
      return Number(task.window.avgSec) <= Number(task.targetAvgSec) + 1e-9;
    }
    var p = windowP(task);
    if (p == null || task.targetP == null) return false;
    return p + 1e-9 >= Number(task.targetP);
  }

  function evaluateFail(task) {
    var w = task.window || emptyPlanWindow();
    var days = Object.keys(w.gamesByDay || {}).filter(function (d) {
      return (w.gamesByDay[d] || 0) > 0;
    });
    if (days.length >= (task.failMaxPracticeDays || FAIL_PRACTICE_DAYS)) return "stagnate_days";
    var maxDay = 0;
    days.forEach(function (d) {
      if (w.gamesByDay[d] > maxDay) maxDay = w.gamesByDay[d];
    });
    if (maxDay >= (task.failMaxGamesPerDay || FAIL_GAMES_PER_DAY)) return "day_cap";
    return "";
  }

  function applyFollow(task, run) {
    var day = chinaDateKeyFromTs(runTs(run));
    var stats = summarizeRun(run, task.action === "training" ? task.levelIndex : null);
    if (task.successKind === "speed_step") captureBaselineAvgSec(task, run);
    if (!task.window) task.window = emptyPlanWindow();
    var w = task.window;
    var prevSpeedN =
      w.speedN > 0 ? w.speedN : w.avgSec != null && w.correct > 0 ? w.correct : 0;
    w.games += 1;
    w.items += stats.n;
    w.correct += stats.correct;
    w.avgSec = mergeAvgSec(w.avgSec, prevSpeedN, stats.avgSec, stats.speedN);
    if (stats.avgSec != null && stats.speedN > 0) {
      w.speedN = prevSpeedN + stats.speedN;
    }
    if (day) w.gamesByDay[day] = (w.gamesByDay[day] || 0) + 1;
    if (evaluateSuccess(task, run)) return "success";
    var fail = evaluateFail(task);
    return fail || "";
  }

  function holeStillNeeded(seed, ctx, closedTask, reason) {
    return seedIsNeeded(seed, ctx);
  }

  function slimHistoryEntry(task) {
    if (!task) return null;
    return {
      id: task.id,
      key: task.key,
      action: task.action,
      mode: task.mode,
      levelIndex: task.levelIndex,
      levelLabel: task.levelLabel,
      successKind: task.successKind,
      scanKind: task.scanKind || "",
      scanLevelLabel: task.scanLevelLabel || "",
      title: task.title || "",
      tileGoal: tileGoal(task),
      completedAt: task.completedAt || null,
      chinaDay: task.chinaDay || "",
      status: "success",
    };
  }

  function rememberSuccess(plan, task) {
    if (!STORE_FULL_HISTORY) return;
    if (!plan || !task || task.status !== "success" || !task.id) return;
    if (!Array.isArray(plan.history)) plan.history = [];
    var i;
    for (i = 0; i < plan.history.length; i += 1) {
      if (plan.history[i] && plan.history[i].id === task.id) return;
    }
    var row = slimHistoryEntry(task);
    if (row) plan.history.push(row);
  }

  function historyToClientList(plan) {
    if (!STORE_FULL_HISTORY) return [];
    var list = (plan && Array.isArray(plan.history) ? plan.history : []).slice();
    var out = [];
    var i;
    for (i = list.length - 1; i >= 0; i -= 1) {
      var h = list[i];
      if (!h) continue;
      out.push({
        id: h.id,
        key: h.key,
        action: h.action,
        mode: h.mode,
        levelIndex: h.levelIndex,
        levelLabel: h.levelLabel,
        successKind: h.successKind,
        scanKind: h.scanKind || "",
        tileGoal: h.tileGoal || "",
        tileProgress: h.chinaDay || "",
        status: "success",
        completedAt: h.completedAt || null,
        chinaDay: h.chinaDay || "",
      });
    }
    return out;
  }

  function replan(plan, ctx, closedTask, reason, ts) {
    var done = doneTasks(plan);
    if (closedTask && closedTask.status === "parked") {
      done = done.filter(function (t) {
        return t.id !== closedTask.id;
      });
    }
    var next = openTasks(plan).filter(function (t) {
      return !closedTask || t.id !== closedTask.id;
    });
    if (reason === "success" && closedTask) {
      next = next.filter(function (t) {
        return t.key !== closedTask.key;
      });
      closedTask.status = "success";
      if (closedTask.completedAt == null) {
        closedTask.completedAt = ts;
        closedTask.chinaDay = chinaDateKeyFromTs(ts);
      }
      if (
        !done.some(function (t) {
          return t.id === closedTask.id;
        })
      ) {
        done.push(closedTask);
      }
      rememberSuccess(plan, closedTask);
      done = trimDone(done);
    } else if (reason === "fail" && closedTask) {
      closedTask.status = "pending";
      closedTask.window = emptyPlanWindow();
      closedTask.closedAt = null;
      closedTask.closeReason = "";
      if (next.length >= 1) next.splice(1, 0, closedTask);
      else next.push(closedTask);
    }
    plan.tasks = done.concat(next);
    fillIncomplete(plan, ctx, ts);
    if (reason === "fail" && closedTask) {
      var openNow = openTasks(plan);
      if (openNow.length >= 2 && openNow[0].key === closedTask.key) {
        var i0 = plan.tasks.indexOf(openNow[0]);
        var i1 = plan.tasks.indexOf(openNow[1]);
        if (i0 >= 0 && i1 >= 0) {
          var swap = plan.tasks[i0];
          plan.tasks[i0] = plan.tasks[i1];
          plan.tasks[i1] = swap;
        }
        activateFirst(plan.tasks);
      }
    }
    var head = getActiveTask(plan);
    var openN = openTasks(plan).length;
    var doneN = doneTasks(plan).length;
    pushEvent(
      plan,
      "replan",
      (reason === "success" ? "成功后重排队列" : reason === "fail" ? "失败后插回队列" : "重排") +
        "：当前 " +
        (head ? head.title || head.levelLabel : "无任务") +
        "；排队 " +
        openN +
        "/" +
        INCOMPLETE_SIZE +
        "；已完成窗口 " +
        doneN +
        "/" +
        COMPLETED_MAX,
      ts
    );
  }

  function closeTask(plan, task, status, reason, ts) {
    task.status = status;
    task.closedAt = ts;
    task.closeReason = reason;
    if (status === "success") {
      task.completedAt = ts;
      task.chinaDay = chinaDateKeyFromTs(ts);
    }
    pushEvent(
      plan,
      status === "success" ? "success" : "fail",
      (task.title || task.levelLabel) + (status === "success" ? " 成功" : " 失败（" + reason + "）"),
      ts
    );
  }

  function syncPlan(saved, ctx, runs, nowTs, username, flags) {
    flags = flags || {};
    var plan;
    var rebuilt = false;
    if (!saved || (username && saved.username && saved.username !== username)) {
      plan = issuePlan(ctx, nowTs, username);
      rebuilt = true;
      return { plan: plan, rebuilt: rebuilt };
    }
    plan = cloneJson(saved);
    if (!Array.isArray(plan.tasks)) plan.tasks = [];
    if (!STORE_FULL_HISTORY) plan.history = [];
    else if (!Array.isArray(plan.history)) plan.history = [];
    var versionBump = plan.ruleVersion !== RULE_VERSION;
    if (versionBump || flags.resetIncomplete) {
      plan.ruleVersion = RULE_VERSION;
      if (username) plan.username = username;
      reissueIncomplete(
        plan,
        ctx,
        nowTs,
        flags.resetIncomplete
          ? "重新开单：重算未完成（已完成窗口保留）"
          : "规则升级：重算未完成（已完成窗口保留）",
        flags.resetIncomplete ? false : true
      );
      rebuilt = true;
    }
    if (openTasks(plan).length < INCOMPLETE_SIZE) fillIncomplete(plan, ctx, nowTs);
    activateFirst(plan.tasks);
    var after = Number(plan.lastProcessedTs || plan.issuedAt || 0);
    var incoming = (runs || [])
      .filter(isPlayRun)
      .filter(function (r) {
        return runTs(r) > after;
      })
      .slice()
      .sort(function (a, b) {
        return runTs(a) - runTs(b);
      });
    incoming.forEach(function (run) {
      var ts = runTs(run);
      var head = getActiveTask(plan);
      var matched = findMatchingOpenTask(plan, run);
      if (matched && head && matched.id === head.id) {
        var outcome = applyFollow(matched, run);
        pushEvent(
          plan,
          "follow",
          (matched.title || matched.levelLabel) +
            (outcome === "success" ? " 成功" : outcome ? " 失败（" + outcome + "）" : " 未达"),
          ts
        );
        if (outcome === "success") {
          closeTask(plan, matched, "success", "success", ts);
          replan(plan, ctx, matched, "success", ts);
        } else if (outcome) {
          closeTask(plan, matched, "fail", outcome, ts);
          replan(plan, ctx, matched, "fail", ts);
        }
      } else if (matched) {
        var probe = probeRunSuccess(matched, run);
        if (probe) {
          matched.window = probe.window;
          if (probe.baseline) matched.baseline = probe.baseline;
          if (probe.targetAvgSec != null) matched.targetAvgSec = probe.targetAvgSec;
          pushEvent(plan, "follow", "碰巧完成：" + (matched.title || matched.levelLabel), ts);
          closeTask(plan, matched, "success", "success", ts);
          replan(plan, ctx, matched, "success", ts);
        }
      } else {
        reissueIncomplete(plan, ctx, ts, "跑偏：按热图重算未完成（已完成与同关进度保留）");
        rebuilt = true;
      }
      plan.lastProcessedTs = ts;
    });
    if (openTasks(plan).length < INCOMPLETE_SIZE) fillIncomplete(plan, ctx, nowTs);
    activateFirst(plan.tasks);
    return { plan: plan, rebuilt: rebuilt };
  }

  function successCopy(task) {
    if (!task) return "";
    if (task.successKind === "level_reach") {
      var lab = task.scanLevelLabel || levelLabel(task.scanLevelIndex);
      if (task.scanLevelIndex >= LEVEL_COUNT - 1) {
        return "成功：本局闯关通关（通过 L16）";
      }
      return "成功：本局通过 " + lab + "（须打完该关，不是摸到）";
    }
    if (task.successKind === "open_activate") {
      return (
        "成功：打满 " +
        MIN_OPEN_GAMES +
        " 局或 " +
        MIN_SUCCESS_ITEMS +
        " 题即激活（不要求一次练熟）"
      );
    }
    if (task.successKind === "speed_step") {
      var sec = roundSec(task.targetAvgSec);
      var tp = task.targetTimePct != null ? Math.round(task.targetTimePct) : null;
      return (
        "成功：本任务新打均速 ≤ " +
        (sec != null ? sec + "s" : "开单均速的 92%") +
        "，且准度 ≥ " +
        pctText(HEAT_P_YELLOW) +
        "（至少 " +
        MIN_SUCCESS_GAMES +
        " 局或 " +
        MIN_SUCCESS_ITEMS +
        " 题" +
        (tp != null ? "；对照 timePct→" + tp : "") +
        "）"
      );
    }
    return (
      "成功：本任务新打准度达到 " +
      pctText(task.targetP) +
      "（至少 " +
      MIN_SUCCESS_GAMES +
      " 局或 " +
      MIN_SUCCESS_ITEMS +
      " 题，不是整格热图）"
    );
  }

  function failCopy(task) {
    var g = (task && task.failMaxGamesPerDay) || FAIL_GAMES_PER_DAY;
    var d = (task && task.failMaxPracticeDays) || FAIL_PRACTICE_DAYS;
    return "失败：当天打满 " + g + " 局仍未达标则换项；连续 " + d + " 个有练日未达标则搁置后插";
  }

  function progressCopy(task) {
    if (!task || !task.window) return "";
    var w = task.window;
    var today = chinaDateKeyFromTs(Date.now());
    var todayN = (w.gamesByDay && w.gamesByDay[today]) || 0;
    var days = Object.keys(w.gamesByDay || {}).filter(function (k) {
      return (w.gamesByDay[k] || 0) > 0;
    }).length;
    var p = windowP(task);
    var bits = [
      "今日 " + todayN + "/" + FAIL_GAMES_PER_DAY + " 局",
      "有练日 " + days + "/" + FAIL_PRACTICE_DAYS,
      "任务窗 " + w.items + " 题" + (p != null ? " 准" + pctText(p) : ""),
    ];
    if (w.avgSec != null) bits.push("均速 " + roundSec(w.avgSec) + "s");
    return bits.join(" · ");
  }

  function untilCopy(task) {
    if (task.successKind === "level_reach") {
      if (task.scanKind === "retry_clear") return "通关 L16 即成功";
      return "通过 " + (task.scanLevelLabel || "") + " 即成功；在该关出局不算";
    }
    if (task.successKind === "open_activate") {
      return "开新关：打满 " + MIN_OPEN_GAMES + " 局或 " + MIN_SUCCESS_ITEMS + " 题即激活";
    }
    if (task.successKind === "speed_step") {
      var sec = roundSec(task.targetAvgSec);
      return "均速迈一小步" + (sec != null ? "（≤" + sec + "s）" : "") + "，且准≥" + pctText(HEAT_P_YELLOW);
    }
    return "准度迈一小步（→" + pctText(task.targetP) + "）";
  }

  function statusLabel(st) {
    if (st === "active") return "当前";
    if (st === "pending") return "排队";
    if (st === "success") return "已完成";
    if (st === "parked") return "搁置";
    if (st === "cancelled") return "已取消";
    return st || "";
  }

  function tileLabel(t) {
    if (!t) return "";
    if (t.action === "level") return t.scanKind === "retry_clear" ? "冲榜" : "闯关";
    if (t.successKind === "open_activate") return "开" + (t.levelLabel || "");
    return t.levelLabel || t.title || "";
  }

  function tileGoal(t) {
    if (!t) return "";
    if (t.successKind === "level_reach") {
      if (t.scanKind === "retry_clear") return "通关L16";
      return t.scanLevelLabel ? "过" + t.scanLevelLabel : "过关";
    }
    if (t.successKind === "open_activate") return "1局或20题";
    if (t.successKind === "speed_step") {
      var sec = roundSec(t.targetAvgSec);
      return sec != null
        ? "均速≤" + sec + "s 且准≥" + pctText(HEAT_P_YELLOW)
        : "均速↓ 且准≥" + pctText(HEAT_P_YELLOW);
    }
    return t.targetP != null ? "准≥" + pctText(t.targetP) : "准度↑";
  }

  function tileProgress(t) {
    if (!t) return "";
    var w = t.window || emptyPlanWindow();
    var bits = [];
    if (t.status === "success") {
      if (t.chinaDay) bits.push(t.chinaDay);
      else bits.push("完成");
    } else if (!w.games) {
      bits.push("未练");
    } else {
      bits.push("已试" + w.games + "局");
    }
    if (w.games) {
      var p = windowP(t);
      if (p != null) bits.push("准" + pctText(p));
      if (w.avgSec != null) bits.push(roundSec(w.avgSec) + "s");
    }
    return bits.join(" ");
  }

  function tileWhy(t) {
    if (!t) return "";
    if (t.detail) return t.detail;
    var b = t.baseline || {};
    var bits = [];
    if (b.priorLabel) bits.push(b.priorLabel);
    if (b.stageLabel) bits.push(b.stageLabel);
    if (b.p != null) bits.push("热图准" + pctText(b.p));
    if (b.tooSlow) bits.push("过慢");
    else if (b.timePct != null) bits.push("速度分位" + Math.round(b.timePct));
    if (b.n != null) bits.push("n=" + b.n);
    return bits.join(" · ");
  }

  function tasksToQueue(plan) {
    return (plan.tasks || []).map(function (t) {
      var isOpen = t.status === "active" || t.status === "pending";
      return {
        action: t.action,
        mode: t.mode,
        levelIndex: t.levelIndex,
        levelLabel: t.levelLabel,
        games: (t.window && t.window.games) || 0,
        until: isOpen ? untilCopy(t) : "",
        title: t.title,
        detail: t.detail || "",
        status: t.status,
        statusLabel: statusLabel(t.status),
        successCopy: isOpen ? successCopy(t) : "",
        failCopy: isOpen ? failCopy(t) : "",
        progressCopy: isOpen ? progressCopy(t) : "",
        successKind: t.successKind,
        targetP: t.targetP,
        targetAvgSec: t.targetAvgSec,
        scanLevelLabel: t.scanLevelLabel,
        scanKind: t.scanKind || "",
        tileLabel: tileLabel(t),
        tileGoal: tileGoal(t),
        tileProgress: tileProgress(t),
        tileWhy: tileWhy(t),
        completedAt: t.completedAt || null,
        chinaDay: t.chinaDay || "",
      };
    });
  }

  function buildAdviceContext(opts) {
    opts = opts || {};
    var rows = buildRows(opts.grade, opts.cells);
    var profile = classifyProfile(rows);
    var retry = retryClearInfo(rows, opts.runs);
    var clearEstimate = clearEstimateInfo(rows, opts.runs);
    var scan = resolveScanTarget(rows, opts);
    if (profile.id === "skill_gaps" && opts.hasClearedLevel === true && retry && retry.improve) {
      scan = {
        levelIndex: LEVEL_COUNT - 1,
        levelLabel: levelLabel(LEVEL_COUNT - 1),
        kind: "retry_clear",
        estimateSec: retry.estimateSec,
        recordSec: retry.recordSec,
      };
    }
    var groups = splitGroups(rows);
    var picked = pickPrimaryRow(
      rows,
      groups.schoolHoles,
      groups.aheadMastered,
      groups.aheadThin,
      groups.schoolMastered
    );
    return {
      grade: opts.grade,
      rows: rows,
      profile: profile,
      scan: scan,
      hasClearedLevel: opts.hasClearedLevel === true,
      schoolHoles: groups.schoolHoles,
      aheadNoData: groups.aheadNoData,
      aheadMastered: groups.aheadMastered,
      aheadThin: groups.aheadThin,
      schoolMastered: groups.schoolMastered,
      primaryRow: picked.primaryRow,
      pickNote: picked.pickNote,
      alternatives: picked.alternatives,
      retryClear: retry,
      clearEstimate: clearEstimate,
    };
  }

  function computePracticeAdvice(opts) {
    opts = opts || {};
    var ctx = buildAdviceContext(opts);
    var nowTs = opts.nowTs != null && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var sync = syncPlan(opts.savedPlan || null, ctx, opts.runs || [], nowTs, opts.username || "", {
      resetIncomplete: opts.resetIncomplete === true,
    });
    var plan = sync.plan;
    var reasons = [];
    var unresolved = [
      "Q1 超前「会了」暂定 n≥" + AHEAD_MASTERED_N,
      "Q2 已学/同步黄橙暂定永远压过超前",
      "Q3 绿快底板暂定连续 " + FLOOR_MIN + " 档且 timePct<" + FAST_TIME_PCT,
      "Q5 闯关合格线：从 L1 起连续准≥95%（不计分位），再和历史最高取 min；目标 Ln 须通过 Ln。L1 不够 95% 时仍排闯关且目标为 L1",
      "Q6 准度小步暂定 +" + Math.round(ACC_STEP * 1000) / 10 + "pp，封顶 95%",
      "Q7 速度小步暂定任务窗均速 ×" + SPEED_RATIO + "（对照 timePct−" + SPEED_TIME_PCT_STEP + "），且窗内准度≥" + Math.round(HEAT_P_YELLOW * 100) + "%",
      "Q8 当日封顶暂定 " + FAIL_GAMES_PER_DAY + " 局",
      "Q9 跨日停滞暂定 " + FAIL_PRACTICE_DAYS + " 个有练日",
      "Q10 一条队列：未完成最多 " +
        INCOMPLETE_SIZE +
        " 条且不重复；黄橙优先，再按准度×地基加权速度×样本薄补已学流畅",
      "Q11 同 key 默认隔 " +
        SAME_TASK_GAP +
        " 条才可再出现；已完成冷却窗最多 " +
        COMPLETED_MAX +
        " 条，满则挤最早。规则升级/重新开单/跑偏/热图变都不清冷却。只有可练池空才允许更密",
      "Q12 绿档速度补格：timePct<" +
        FOUNDATION_FAST_PCT +
        " 只比分位；否则 ×" +
        FOUNDATION_RATIO +
        "^本线剩余步（加减/乘除汇合 L15–L16）",
      "Q13 黄橙与热图二维上色对齐：橙=准<90%或timePct≥" +
        HEAT_PCT_PLUS1 +
        "；黄=准<95%或timePct≥" +
        FAST_TIME_PCT,
      "Q14 已激活校内全绿才开一档已学/同步空关；热图全空只排闯关、不开新关；闯关留下数据即当老关；超前无数据不开",
      "Q15 底板型已通关：热图预估全通≤纪录×" +
        SCAN_CLEAR_IMPROVE +
        " 才再排冲榜闯关（每关10题均速×" +
        SCAN_CLEAR_OVERHEAD +
        "）；不走≤n前置，有洞时占第二格",
      "Q16 队头按成功/失败退出；2～5 碰巧这一局达标才提前完成，未达标不记失败、不后插。放弃局整局不算。跑偏/规则升级/重新开单只重算未完成（已完成窗口保留）"
    ];
    reasons.push(
      reason(
        "R-profile",
        ctx.profile.id,
        ctx.profile.label + "；绿快底板 " + ctx.profile.floorLabel + "（" + ctx.profile.floor + " 档）",
        "Q3 暂定"
      )
    );
    if (scanIsNeeded(ctx) && ctx.scan) {
      if (isRetryClearScan(ctx)) {
        reasons.push(
          reason(
            "R-scan",
            "retry_clear",
            "冲榜闯关须通关 L16；预估 " +
              formatAdviceClock(ctx.scan.estimateSec) +
              " / 纪录 " +
              formatAdviceClock(ctx.scan.recordSec),
            "Q15：不把全部训练排在闯关前；有洞时第二格"
          )
        );
      } else {
        reasons.push(
          reason(
            "R-scan",
            "acc_pass_target",
            "闯关须过 " +
              ctx.scan.levelLabel +
              "（连续准度顶，不计分位；与历史最高取 min）",
            "Q5：未完成里关号≤目标且刚练过的除外，排在闯关前"
          )
        );
      }
    }
    if (ctx.primaryRow && ctx.pickNote === "in_school_hole") {
      reasons.push(
        reason(
          "R-main-hole",
          "learned_or_current_hole",
          ctx.primaryRow.levelLabel +
            " " +
            ctx.primaryRow.priorLabel +
            " · " +
            ctx.primaryRow.stageLabel +
            " 准" +
            ctx.primaryRow.pPct +
            " n=" +
            ctx.primaryRow.n,
          "Q2 暂定：已学/同步短板优先于超前"
        )
      );
    }
    ctx.aheadThin.forEach(function (r) {
      ctx.alternatives.push({
        action: "training",
        levelIndex: r.levelIndex,
        levelLabel: r.levelLabel,
        title: "可以练但不是主线 " + r.levelLabel,
        detail: r.priorLabel + " · " + r.stageLabel + " n=" + r.n,
      });
    });
    ctx.aheadNoData.forEach(function (r) {
      reasons.push(
        reason("R-ahead-nodata", "ahead_no_data_block", r.levelLabel + " 超前且无数据，先别开", "不拿开局去试超纲")
      );
    });
    if (canScheduleOpenNew(ctx.rows || [])) {
      var openRow = nextOpenableRow(ctx.rows);
      reasons.push(
        reason(
          "R-open-new",
          "school_all_green_open",
          "校内已激活全绿，安排开新关 " + (openRow ? openRow.levelLabel : ""),
          "Q14：超前无数据仍不开；闯关留下数据即当老关"
        )
      );
    }
    reasons.push(
      reason(
        "R-plan",
        "hybrid_task_list",
        "一条队列：未完成最多 " +
          INCOMPLETE_SIZE +
          " 条且不重复（黄橙优先；有闯关时关号≤目标的训练先占格）。同 key 默认隔 " +
          SAME_TASK_GAP +
          " 条；已完成留在队里最多 " +
          COMPLETED_MAX +
          " 条。可练池空才允许提前重复。队头失败才后插；2～5 只认碰巧成功；跑偏重算未完成并保留同关进度",
        "Q8/Q9 队头失败；Q16 排队项碰巧成功",
      )
    );

    var queue = tasksToQueue(plan);
    var openQueue = queue.filter(function (step) {
      return step.status === "active" || step.status === "pending";
    });
    var active = getActiveTask(plan);
    var firstTrain = null;
    openQueue.forEach(function (step) {
      if (!firstTrain && step.action === "training") firstTrain = step;
    });

    var sysLevel =
      opts.systemPick && opts.systemPick.levelIndex != null && Number.isFinite(Number(opts.systemPick.levelIndex))
        ? clampLevel(opts.systemPick.levelIndex)
        : opts.systemPick && opts.systemPick.pickedL != null
          ? clampLevel(Number(opts.systemPick.pickedL) - 1)
          : null;
    var compareLevel = active && active.action === "training" ? active.levelIndex : firstTrain ? firstTrain.levelIndex : null;
    var diverges = compareLevel != null && sysLevel != null ? compareLevel !== sysLevel : false;

    var title = "";
    var parentCopy = "";
    var detail = "";
    if (!active && !openQueue.length) {
      title = "暂无主建议";
      parentCopy = "热图或年级信号不足，无法按当前规则给出任务单。";
      detail = parentCopy;
    } else {
      var doneN = doneTasks(plan).length;
      title =
        (ctx.profile.id === "skill_gaps" ? "弱项任务单" : "平台任务单") +
        " · 未完成 " +
        openQueue.length +
        " / 已完成 " +
        doneN;
      parentCopy =
        ctx.profile.label +
        "。队头按成功/失败退出；排队项碰巧达标可提前完成；放弃局整局不算；跑偏才重算未完成。";
      if (plan.dontOpenLabel) parentCopy += " 不要开 " + plan.dontOpenLabel + "。";
      detail = active ? active.detail : "";
    }

    return {
      ruleVersion: RULE_VERSION,
      grade: ctx.grade,
      profile: ctx.profile,
      scanTarget: ctx.scan,
      queue: queue,
      completed: doneTasks(plan),
      plan: plan,
      planEvents: plan.events || [],
      primary: active
        ? {
            action: active.action,
            mode: active.mode,
            levelIndex: active.levelIndex,
            levelLabel: active.levelLabel,
            overwriteTrainingPick: true,
            title: title,
            parentCopy: parentCopy,
            detail: detail,
            prior: active.baseline && active.baseline.priorLabel,
            stage: active.successKind,
            pickNote: ctx.pickNote,
          }
        : {
            action: "insufficient_data",
            mode: "training",
            levelIndex: null,
            levelLabel: "",
            overwriteTrainingPick: false,
            title: title,
            parentCopy: parentCopy,
            detail: detail,
            pickNote: ctx.pickNote || "none",
          },
      alternatives: ctx.alternatives,
      dontOpen: plan.dontOpen || [],
      dontOpenLabel: plan.dontOpenLabel || "",
      clearEstimate: ctx.clearEstimate || null,
      reasons: reasons,
      rows: ctx.rows,
      systemPick: opts.systemPick || null,
      divergesFromSystemPick: diverges,
      provisional: {
        Q1_aheadMasteredN: AHEAD_MASTERED_N,
        Q2_schoolHolesBeatAhead: true,
        Q3_floorMin: FLOOR_MIN,
        Q3_fastTimePct: FAST_TIME_PCT,
        Q5_scanPassNotReach: true,
        Q6_accStep: ACC_STEP,
        Q7_speedRatio: SPEED_RATIO,
        Q8_failGamesPerDay: FAIL_GAMES_PER_DAY,
        Q9_failPracticeDays: FAIL_PRACTICE_DAYS,
        Q10_incompleteSize: INCOMPLETE_SIZE,
        Q11_sameTaskGap: SAME_TASK_GAP,
        Q11_completedMax: COMPLETED_MAX,
        Q12_foundationFastPct: FOUNDATION_FAST_PCT,
        Q12_foundationRatio: FOUNDATION_RATIO,
        Q13_heatPctPlus1: HEAT_PCT_PLUS1,
        Q14_openWhenSchoolGreen: true,
        Q15_retryClearImprove: SCAN_CLEAR_IMPROVE,
        Q15_retryClearItems: SCAN_CLEAR_ITEMS,
        Q15_retryClearOverhead: SCAN_CLEAR_OVERHEAD,
      },
      unresolved: unresolved,
    };
  }

  var api = {
    RULE_VERSION: RULE_VERSION,
    STORE_FULL_HISTORY: STORE_FULL_HISTORY,
    AHEAD_MASTERED_N: AHEAD_MASTERED_N,
    FLOOR_MIN: FLOOR_MIN,
    FAST_TIME_PCT: FAST_TIME_PCT,
    HEAT_PCT_PLUS1: HEAT_PCT_PLUS1,
    ACC_STEP: ACC_STEP,
    SPEED_RATIO: SPEED_RATIO,
    FAIL_GAMES_PER_DAY: FAIL_GAMES_PER_DAY,
    FAIL_PRACTICE_DAYS: FAIL_PRACTICE_DAYS,
    INCOMPLETE_SIZE: INCOMPLETE_SIZE,
    COMPLETED_MAX: COMPLETED_MAX,
    SAME_TASK_GAP: SAME_TASK_GAP,
    SCAN_CLEAR_IMPROVE: SCAN_CLEAR_IMPROVE,
    FOUNDATION_FAST_PCT: FOUNDATION_FAST_PCT,
    FOUNDATION_RATIO: FOUNDATION_RATIO,
    curriculumPrior: curriculumPrior,
    classifyStage: classifyStage,
    classifyProfile: classifyProfile,
    heatBand: heatBand,
    foundationRemaining: foundationRemaining,
    fillerScore: fillerScore,
    successKindForRow: successKindForRow,
    schoolActivatedReady: schoolActivatedReady,
    nextOpenableRow: nextOpenableRow,
    heatmapIsEmpty: heatmapIsEmpty,
    canScheduleOpenNew: canScheduleOpenNew,
    resolveScanTarget: resolveScanTarget,
    passedScanTarget: passedScanTarget,
    estimateClearSec: estimateClearSec,
    bestClearedLevelSec: bestClearedLevelSec,
    formatAdviceClock: formatAdviceClock,
    computePracticeAdvice: computePracticeAdvice,
    historyToClientList: historyToClientList,
    chinaDateKeyFromTs: chinaDateKeyFromTs,
    PRIOR_LABEL: PRIOR_LABEL,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JmlPracticeAdvice = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
