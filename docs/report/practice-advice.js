/**
 * 练习建议 v0.7：年级先验 × 热图阶段 × 分型 × 混合任务单。
 * 绿档补格含 Q12 地基加权。只读推荐，不改训练开局。规则见《练习建议规则说明》§十。
 */
(function (root) {
  var RULE_VERSION = "0.7-provisional";
  var LEVEL_COUNT = 16;
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_YELLOW = 0.95;
  /** 绿档小步准度封顶 */
  var HEAT_P_STABLE = 0.97;
  var AHEAD_MASTERED_N = 80;
  /** Q3：绿快底板连续档数 */
  var FLOOR_MIN = 4;
  /** timePct 低于此视为「人群中不算慢」（越小越快） */
  var FAST_TIME_PCT = 50;
  /** Q12：绿档补格低于此分位关掉低级加权（已较快） */
  var FOUNDATION_FAST_PCT = 40;
  /** Q12：相邻低级在慢区压过「高 10 分位」的倍率 */
  var FOUNDATION_RATIO = 1.15;
  /** 热图低段：L1–L9 */
  var LOW_BAND_MAX_INDEX = 8;
  /** Q6：准度小步（百分点） */
  var ACC_STEP = 0.015;
  /** Q7：速度小步：任务窗均速 ≤ 基线 × 此系数；对照 timePct −10 */
  var SPEED_RATIO = 0.92;
  var SPEED_TIME_PCT_STEP = 10;
  /** 成功验收最少样本 */
  var MIN_SUCCESS_GAMES = 2;
  var MIN_SUCCESS_ITEMS = 20;
  /** Q8：当日封顶局数 */
  var FAIL_GAMES_PER_DAY = 3;
  /** Q9：跨日停滞（有练日） */
  var FAIL_PRACTICE_DAYS = 3;
  /** 未完成队列常驻格数；已完成最多条数；日历日过期 */
  var INCOMPLETE_SIZE = 5;
  var COMPLETED_MAX = 5;
  var COMPLETED_EXPIRE_DAYS = 5;
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
    if (p < HEAT_P_ORANGE || cell.tooSlow === true) return "orange";
    if (p < HEAT_P_YELLOW) return "yellow";
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
    if (row.stage === "weak" && row.tooSlow && row.p != null && row.p >= HEAT_P_ORANGE) {
      return "会但过慢";
    }
    if (row.stage === "weak") return "不会/很生";
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

  function lowBandFluentTopIndex(rows) {
    var top = -1;
    for (var i = 0; i <= LOW_BAND_MAX_INDEX && i < rows.length; i += 1) {
      if (rows[i].band === "fluent") top = i;
    }
    return top;
  }

  function resolveScanTarget(rows, opts) {
    var hist = null;
    if (opts.levelChallengeBestLevel != null && Number.isFinite(Number(opts.levelChallengeBestLevel))) {
      hist = Math.floor(Number(opts.levelChallengeBestLevel));
    }
    if (opts.levelBestFromRuns != null && Number.isFinite(Number(opts.levelBestFromRuns))) {
      var fromRuns = Math.floor(Number(opts.levelBestFromRuns));
      if (hist == null || fromRuns > hist) hist = fromRuns;
    }
    var low = lowBandFluentTopIndex(rows);
    var idx;
    if (hist != null && hist >= 2 && low >= 0) idx = Math.min(hist, low);
    else if (hist != null && hist >= 2) idx = hist;
    else if (low >= 2) idx = low;
    else idx = 5;
    idx = clampLevel(idx);
    return { levelIndex: idx, levelLabel: levelLabel(idx) };
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

  function isPlayRun(run) {
    if (!run || run.comboOnly === true) return false;
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
    return { games: 0, items: 0, correct: 0, avgSec: null, gamesByDay: {} };
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
    if (avgSec == null && run && run.trainingMeta && Number.isFinite(Number(run.trainingMeta.runAvgSec))) {
      avgSec = Number(run.trainingMeta.runAvgSec);
    }
    var maxLv = run && run.maxLevel != null && Number.isFinite(Number(run.maxLevel)) ? Math.floor(Number(run.maxLevel)) : null;
    return {
      n: n,
      correct: correct,
      p: n > 0 ? correct / n : null,
      avgSec: avgSec,
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

  function rowByLevel(rows, levelIndex) {
    if (levelIndex == null) return null;
    return rows[clampLevel(levelIndex)] || null;
  }

  function successKindForRow(row) {
    if (!row) return "acc_step";
    var p = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : null;
    if (row.tooSlow && p != null && p >= HEAT_P_ORANGE) return "speed_step";
    if (p != null && p < HEAT_P_YELLOW) return "acc_step";
    var accFrag = p != null ? Math.max(0, HEAT_P_STABLE - p) * 1000 : 0;
    var spd = timePctVal(row);
    if (spd >= FAST_TIME_PCT && spd >= accFrag) return "speed_step";
    return "acc_step";
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
    if (kind === "speed_step") {
      targetTimePct =
        row.timePct != null && Number.isFinite(Number(row.timePct))
          ? Math.max(0, Number(row.timePct) - SPEED_TIME_PCT_STEP)
          : null;
      targetAvgSec = row.avgSec != null ? row.avgSec * SPEED_RATIO : null;
    } else {
      var baseP = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : 0;
      var accCap = baseP >= HEAT_P_YELLOW ? HEAT_P_STABLE : HEAT_P_YELLOW;
      targetP = Math.min(accCap, baseP + ACC_STEP);
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

  function makeScanTask(plan, scan) {
    return {
      id: nextTaskId(plan),
      key: "level",
      action: "level",
      mode: "level",
      levelIndex: scan.levelIndex,
      levelLabel: "闯关→" + scan.levelLabel,
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
      scanLevelIndex: scan.levelIndex,
      scanLevelLabel: scan.levelLabel,
      failMaxGamesPerDay: FAIL_GAMES_PER_DAY,
      failMaxPracticeDays: FAIL_PRACTICE_DAYS,
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
      title: "闯关扫描，合格线 " + scan.levelLabel,
      detail: "从 L1 开，须到达 " + scan.levelLabel + "；更早出局不算成功",
    };
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
      holes.forEach(function (r) {
        tryAdd({ kind: "training", row: r });
      });
      if (!ctx.hasClearedLevel) tryAdd({ kind: "scan", scan: ctx.scan });
    } else {
      if (primary && (primary.stage === "weak" || primary.stage === "shaky")) {
        tryAdd({ kind: "training", row: primary });
      }
      tryAdd({ kind: "scan", scan: ctx.scan });
      holes.forEach(function (r) {
        tryAdd({ kind: "training", row: r });
      });
    }
    if (seeds.length < INCOMPLETE_SIZE) {
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
    }
    return seeds;
  }

  function seedIsNeeded(seed, ctx) {
    if (seed.kind === "scan") {
      if (ctx.profile.id === "skill_gaps" && ctx.hasClearedLevel) return false;
      return true;
    }
    var row = seed.row;
    if (!row) return false;
    if (row.stage === "weak" || row.stage === "shaky") return true;
    return fillerScore(row) > 0;
  }

  function chinaDayDiff(fromTs, toTs) {
    var a = chinaDateKeyFromTs(fromTs);
    var b = chinaDateKeyFromTs(toTs);
    if (!a || !b) return 0;
    var am = Date.parse(a + "T00:00:00+08:00");
    var bm = Date.parse(b + "T00:00:00+08:00");
    if (!Number.isFinite(am) || !Number.isFinite(bm)) return 0;
    return Math.round((bm - am) / 86400000);
  }

  function expireCompleted(plan, nowTs) {
    if (!plan.completed) plan.completed = [];
    plan.completed = plan.completed.filter(function (c) {
      var ts = c && c.completedAt != null ? Number(c.completedAt) : 0;
      return chinaDayDiff(ts, nowTs) < COMPLETED_EXPIRE_DAYS;
    });
  }

  function completedHasKey(plan, key) {
    return (plan.completed || []).some(function (c) {
      return c && c.key === key;
    });
  }

  function pushCompleted(plan, task, ts) {
    if (!plan.completed) plan.completed = [];
    expireCompleted(plan, ts);
    plan.completed.push({
      key: task.key,
      action: task.action,
      levelIndex: task.levelIndex,
      levelLabel: task.levelLabel,
      title: task.title,
      completedAt: ts,
      chinaDay: chinaDateKeyFromTs(ts),
    });
    while (plan.completed.length > COMPLETED_MAX) plan.completed.shift();
  }

  function filterSeedsNotCompleted(seeds, plan, allowCompleted) {
    if (allowCompleted) return seeds.slice();
    return seeds.filter(function (s) {
      return !completedHasKey(plan, seedKey(s));
    });
  }

  function fillIncomplete(plan, ctx, ts) {
    expireCompleted(plan, ts);
    var next = openTasks(plan);
    var needed = uniqueSeeds(ctx).filter(function (s) {
      return seedIsNeeded(s, ctx);
    });
    function pickPool(allowCompleted) {
      return filterSeedsNotCompleted(needed, plan, allowCompleted);
    }
    var pool = pickPool(false);
    if (next.length < INCOMPLETE_SIZE && !pool.length) {
      pool = pickPool(true);
    }
    pool.forEach(function (seed) {
      if (next.length >= INCOMPLETE_SIZE) return;
      var k = seedKey(seed);
      if (
        next.some(function (t) {
          return t.key === k;
        })
      ) {
        return;
      }
      next.push(seedToTask(plan, seed));
    });
    plan.tasks = next;
    activateFirst(plan.tasks);
  }

  function seedKey(seed) {
    return seed.kind === "scan" ? "level" : taskKey("training", seed.row.levelIndex);
  }

  function seedToTask(plan, seed) {
    return seed.kind === "scan" ? makeScanTask(plan, seed.scan) : makeTrainingTask(plan, seed.row);
  }

  function activateFirst(tasks) {
    var found = false;
    tasks.forEach(function (t) {
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
      completed: [],
      events: [],
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
      var reached = summarizeRun(run, null).maxLevel;
      return reached != null && task.scanLevelIndex != null && reached >= task.scanLevelIndex;
    }
    if (task.successKind === "speed_step") {
      if (task.targetAvgSec == null || task.window.avgSec == null) return false;
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
    var prevItems = w.items;
    w.games += 1;
    w.items += stats.n;
    w.correct += stats.correct;
    w.avgSec = mergeAvgSec(w.avgSec, prevItems, stats.avgSec, stats.n);
    if (day) w.gamesByDay[day] = (w.gamesByDay[day] || 0) + 1;
    if (evaluateSuccess(task, run)) return "success";
    var fail = evaluateFail(task);
    return fail || "";
  }

  function holeStillNeeded(seed, ctx, closedTask, reason) {
    return seedIsNeeded(seed, ctx);
  }

  function replan(plan, ctx, closedTask, reason, ts) {
    expireCompleted(plan, ts);
    var next = openTasks(plan).filter(function (t) {
      return !closedTask || t.id !== closedTask.id;
    });
    if (reason === "success" && closedTask) {
      next = next.filter(function (t) {
        return t.key !== closedTask.key;
      });
      pushCompleted(plan, closedTask, ts);
    } else if (reason === "fail" && closedTask) {
      closedTask.status = "pending";
      closedTask.window = emptyPlanWindow();
      closedTask.closedAt = null;
      closedTask.closeReason = "";
      if (next.length >= 1) next.splice(1, 0, closedTask);
      else next.push(closedTask);
    }
    plan.tasks = next;
    fillIncomplete(plan, ctx, ts);
    var head = getActiveTask(plan);
    pushEvent(
      plan,
      "replan",
      (reason === "success" ? "成功后补未完成" : reason === "fail" ? "失败后插回未完成" : "重排") +
        "：当前 " +
        (head ? head.title || head.levelLabel : "无任务") +
        "；已完成 " +
        (plan.completed || []).length +
        "/" +
        COMPLETED_MAX,
      ts
    );
  }

  function closeTask(plan, task, status, reason, ts) {
    task.status = status;
    task.closedAt = ts;
    task.closeReason = reason;
    pushEvent(
      plan,
      status === "success" ? "success" : "fail",
      (task.title || task.levelLabel) + (status === "success" ? " 成功" : " 失败（" + reason + "）"),
      ts
    );
  }

  function syncPlan(saved, ctx, runs, nowTs, username) {
    var plan;
    var rebuilt = false;
    if (
      !saved ||
      saved.ruleVersion !== RULE_VERSION ||
      (username && saved.username && saved.username !== username)
    ) {
      plan = issuePlan(ctx, nowTs, username);
      rebuilt = true;
      return { plan: plan, rebuilt: rebuilt };
    }
    plan = cloneJson(saved);
    if (!Array.isArray(plan.completed)) plan.completed = [];
    expireCompleted(plan, nowTs);
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
      expireCompleted(plan, ts);
      var active = getActiveTask(plan);
      if (!active) {
        plan = issuePlan(ctx, ts, username);
        plan.lastProcessedTs = ts;
        rebuilt = true;
        return;
      }
      if (runMatchesTask(run, active)) {
        var outcome = applyFollow(active, run);
        pushEvent(
          plan,
          "follow",
          "跟任务：" +
            (active.title || active.levelLabel) +
            " · 今日 " +
            (active.window.gamesByDay[chinaDateKeyFromTs(ts)] || 0) +
            "/" +
            FAIL_GAMES_PER_DAY +
            " 局",
          ts
        );
        if (outcome === "success") {
          closeTask(plan, active, "success", "success", ts);
          replan(plan, ctx, active, "success", ts);
        } else if (outcome) {
          closeTask(plan, active, "parked", outcome, ts);
          replan(plan, ctx, active, "fail", ts);
        }
      } else {
        plan = issuePlan(ctx, ts, username);
        pushEvent(plan, "off_path_rebuild", "未按当前任务走，测试期整单重算", ts);
        rebuilt = true;
      }
      plan.lastProcessedTs = ts;
    });
    expireCompleted(plan, nowTs);
    if (openTasks(plan).length < INCOMPLETE_SIZE) fillIncomplete(plan, ctx, nowTs);
    activateFirst(plan.tasks);
    return { plan: plan, rebuilt: rebuilt };
  }

  function successCopy(task) {
    if (!task) return "";
    if (task.successKind === "level_reach") {
      return "成功：本局从 L1 到达 " + (task.scanLevelLabel || levelLabel(task.scanLevelIndex));
    }
    if (task.successKind === "speed_step") {
      var sec = roundSec(task.targetAvgSec);
      var tp = task.targetTimePct != null ? Math.round(task.targetTimePct) : null;
      return (
        "成功：本任务新打均速 ≤ " +
        (sec != null ? sec + "s" : "开单均速的 92%") +
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
      return "到达 " + (task.scanLevelLabel || "") + " 即成功；未达则算一次尝试";
    }
    if (task.successKind === "speed_step") {
      var sec = roundSec(task.targetAvgSec);
      return "均速迈一小步" + (sec != null ? "（≤" + sec + "s）" : "");
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

  function tasksToQueue(plan) {
    return openTasks(plan).map(function (t) {
      return {
        action: t.action,
        mode: t.mode,
        levelIndex: t.levelIndex,
        levelLabel: t.levelLabel,
        games: null,
        until: untilCopy(t),
        title: t.title,
        detail: t.detail,
        status: t.status,
        statusLabel: statusLabel(t.status),
        successCopy: successCopy(t),
        failCopy: failCopy(t),
        progressCopy: t.status === "active" ? progressCopy(t) : "",
        successKind: t.successKind,
        targetP: t.targetP,
        targetAvgSec: t.targetAvgSec,
        scanLevelLabel: t.scanLevelLabel,
      };
    });
  }

  function buildAdviceContext(opts) {
    opts = opts || {};
    var rows = buildRows(opts.grade, opts.cells);
    var profile = classifyProfile(rows);
    var scan = resolveScanTarget(rows, opts);
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
    };
  }

  function computePracticeAdvice(opts) {
    opts = opts || {};
    var ctx = buildAdviceContext(opts);
    var nowTs = opts.nowTs != null && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var sync = syncPlan(opts.savedPlan || null, ctx, opts.runs || [], nowTs, opts.username || "");
    var plan = sync.plan;
    var reasons = [];
    var unresolved = [
      "Q1 超前「会了」暂定 n≥" + AHEAD_MASTERED_N,
      "Q2 已学/同步黄橙暂定永远压过超前",
      "Q3 绿快底板暂定连续 " + FLOOR_MIN + " 档且 timePct<" + FAST_TIME_PCT,
      "Q5 闯关合格线暂定 min(历史闯关最高, 热图 L1–L9 流畅顶)",
      "Q6 准度小步暂定 +" + Math.round(ACC_STEP * 1000) / 10 + "pp，封顶 95%",
      "Q7 速度小步暂定任务窗均速 ×" + SPEED_RATIO + "（对照 timePct−" + SPEED_TIME_PCT_STEP + "）",
      "Q8 当日封顶暂定 " + FAIL_GAMES_PER_DAY + " 局",
      "Q9 跨日停滞暂定 " + FAIL_PRACTICE_DAYS + " 个有练日",
      "Q10 未完成最多 " + INCOMPLETE_SIZE + " 条且不重复；黄橙优先，再按准度×地基加权速度×样本薄补已学流畅",
      "Q11 已完成最多 " + COMPLETED_MAX + " 条；满则挤最早；满 " + COMPLETED_EXPIRE_DAYS + " 个日历日移出",
      "Q12 绿档速度补格：timePct<" +
        FOUNDATION_FAST_PCT +
        " 只比分位；否则 ×" +
        FOUNDATION_RATIO +
        "^本线剩余步（加减/乘除汇合 L15–L16）",
    ];
    reasons.push(
      reason(
        "R-profile",
        ctx.profile.id,
        ctx.profile.label + "；绿快底板 " + ctx.profile.floorLabel + "（" + ctx.profile.floor + " 档）",
        "Q3 暂定"
      )
    );
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
    reasons.push(
      reason(
        "R-plan",
        "hybrid_task_list",
        "混合任务单：未完成最多 " +
          INCOMPLETE_SIZE +
          " 条且不重复（黄橙优先，准度×地基加权速度补格）；已完成最多 " +
          COMPLETED_MAX +
          " 条，量挤掉或日历 " +
          COMPLETED_EXPIRE_DAYS +
          " 天移出后才可再进；测试期跑偏整单重算",
        "成功进已完成；失败不进、未完成后插"
      )
    );

    var queue = tasksToQueue(plan);
    var active = getActiveTask(plan);
    var firstTrain = null;
    queue.forEach(function (step) {
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
    if (!active && !queue.length) {
      title = "暂无主建议";
      parentCopy = "热图或年级信号不足，无法按当前规则给出任务单。";
      detail = parentCopy;
    } else {
      title =
        (ctx.profile.id === "skill_gaps" ? "弱项任务单" : "平台任务单") +
        (active ? " · 当前 " + (active.levelLabel || "") : "");
      parentCopy = ctx.profile.label + "。";
      queue.forEach(function (step, i) {
        parentCopy +=
          (i + 1) +
          ". " +
          (step.title || step.levelLabel) +
          (step.until ? "（" + step.until + "）" : "") +
          (i < queue.length - 1 ? " → " : "");
      });
      if (plan.dontOpenLabel) parentCopy += " 不要开 " + plan.dontOpenLabel + "。";
      detail = active ? active.detail : "";
    }

    return {
      ruleVersion: RULE_VERSION,
      grade: ctx.grade,
      profile: ctx.profile,
      scanTarget: ctx.scan,
      queue: queue,
      completed: plan.completed || [],
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
      reasons: reasons,
      rows: ctx.rows,
      systemPick: opts.systemPick || null,
      divergesFromSystemPick: diverges,
      provisional: {
        Q1_aheadMasteredN: AHEAD_MASTERED_N,
        Q2_schoolHolesBeatAhead: true,
        Q3_floorMin: FLOOR_MIN,
        Q3_fastTimePct: FAST_TIME_PCT,
        Q6_accStep: ACC_STEP,
        Q7_speedRatio: SPEED_RATIO,
        Q8_failGamesPerDay: FAIL_GAMES_PER_DAY,
        Q9_failPracticeDays: FAIL_PRACTICE_DAYS,
        Q10_incompleteSize: INCOMPLETE_SIZE,
        Q11_completedMax: COMPLETED_MAX,
        Q11_completedExpireDays: COMPLETED_EXPIRE_DAYS,
        Q12_foundationFastPct: FOUNDATION_FAST_PCT,
        Q12_foundationRatio: FOUNDATION_RATIO,
      },
      unresolved: unresolved,
    };
  }

  var api = {
    RULE_VERSION: RULE_VERSION,
    AHEAD_MASTERED_N: AHEAD_MASTERED_N,
    FLOOR_MIN: FLOOR_MIN,
    FAST_TIME_PCT: FAST_TIME_PCT,
    ACC_STEP: ACC_STEP,
    SPEED_RATIO: SPEED_RATIO,
    FAIL_GAMES_PER_DAY: FAIL_GAMES_PER_DAY,
    FAIL_PRACTICE_DAYS: FAIL_PRACTICE_DAYS,
    INCOMPLETE_SIZE: INCOMPLETE_SIZE,
    COMPLETED_MAX: COMPLETED_MAX,
    COMPLETED_EXPIRE_DAYS: COMPLETED_EXPIRE_DAYS,
    FOUNDATION_FAST_PCT: FOUNDATION_FAST_PCT,
    FOUNDATION_RATIO: FOUNDATION_RATIO,
    curriculumPrior: curriculumPrior,
    classifyStage: classifyStage,
    classifyProfile: classifyProfile,
    heatBand: heatBand,
    foundationRemaining: foundationRemaining,
    fillerScore: fillerScore,
    computePracticeAdvice: computePracticeAdvice,
    chinaDateKeyFromTs: chinaDateKeyFromTs,
    PRIOR_LABEL: PRIOR_LABEL,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JmlPracticeAdvice = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
