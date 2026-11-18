/**
 * 练习建议 v0.55：特殊/小数无校内黄橙且无可开新则不硬留；自由格绿补跨模式按 fillerScore 混排。
 * v0.54：质数合数并入因倍 Y0（五年级起；rem 比 Y1 倒退一格；不挡四年级推因倍）。
 * v0.53：洞分准×5、分位×2（rem 仍×100）；rem 顶台同 v0.52。
 * v0.52：四则 rem 顶台 L13–L16=0；其它模式独立 rem 线。
 * v0.51：四则洞分改为 rem×100+(100−准%)×10+分位×5；取消未流畅整段。
 * v0.50：未通关摸底闯关默认可排垫后；L1～原纪录全绿则提到训练前；种子流不再按 ≤n 拆开。
 * v0.49：错题任务完成一次练习即成功；练习做对清题、做错保留。
 * v0.48：特殊硬留同模式黄洞冷却时改试下一格，不整档跳到绿补。
 * v0.47：自由格按全局优先级混排四则+其它（硬留之外也要能选到四则黄洞）。
 * v0.46：四则硬留按「不熟练 / 黄橙」两档熟练度；全绿不硬留；自由格不封顶特殊/小数。
 * v0.45：质数合数信用户索引（回填后）；无索引时再扫 runs。
 * v0.43：质数合数五年级起；特殊序改为平方→整除→质数→因倍。
 * v0.42：特殊/小数硬留按今日已结案消耗，重开不再重复占格。
 * v0.41：平方 L2+ 任务侧按超前（不开新；有数据黄橙才推）。
 * v0.40：开新关/超前进队闸与模式梯子同（准≥95% 且未过慢）。
 * v0.39：次日首开/刷新整单重算；去掉失败钟与补格；间隔破例排队尾。
 * v0.38：质数合数通关判定与成就对齐（cleared/perfect 或 score≥250）。
 * v0.37：已通关后，平台型和底板型都只在预估 ≤ 纪录 85% 时排冲榜闯关。
 * v0.36：黄橙排序改为先未达标，再靠前（v0.51 起洞分公式已换）。
 * v0.35：四则未流畅先占座。v0.34：成功线冻结。
 */
(function (root) {
  var RULE_VERSION = "0.55-provisional";
  /** 旧质数合数局：掌握 50 题 ×5 分，与成就 isPrimeCompositeRunCompleted 同口径 */
  var PRIME_CLEAR_SCORE = 250;
  var Modes = null;
  try {
    if (typeof require === "function") Modes = require("./practice-advice-modes");
  } catch (eModes) {
    Modes = null;
  }
  /**
   * 任务/开新关只看「内容已上线」档。
   * 当前 = 17（L1–L17，与 JmlArithmetic.CONTENT_MAX_INDEX+1 同步）；L18 上线后改为 18。
   * 隐藏档在内容上线且学员已解锁后，可作四则开新关。
   * 闯关封顶 / 「其它模式入队」仍按公开档 L1–L16（ARITH_PUBLIC_LEVEL_COUNT）。
   */
  var LEVEL_COUNT = 17;
  var ARITH_CONTENT_MAX_INDEX = LEVEL_COUNT - 1;
  var ARITH_PUBLIC_LEVEL_COUNT = 16;
  var ARITH_PUBLIC_MAX_INDEX = ARITH_PUBLIC_LEVEL_COUNT - 1;
  var ARITH_TOTAL_LEVEL_COUNT = 20;
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_YELLOW = 0.95;
  /** 绿档补格权重：离此越远越先补；不是任务及格线 */
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
  /** 黄橙洞分权重（v0.53）：rem×100 + (100−准%)×5 + 分位×2 */
  var HOLE_REM_WEIGHT = 100;
  var HOLE_ACC_WEIGHT = 5;
  var HOLE_SPEED_WEIGHT = 2;
  /** 兼容旧字段名 */
  var HOLE_LEVEL_WEIGHT = HOLE_REM_WEIGHT;
  var HOLE_UNFLUENT_BAND = 0;
  var HOLE_FOUNDATION_STEP = HOLE_REM_WEIGHT;
  /** Q6 已废：准度不再小步。常量仅兼容旧输出字段。 */
  var ACC_STEP = 0.015;
  /** Q7：速度任务：本局均速 ≤ 基线 × 此系数；对照 timePct − 步长（现为达均速） */
  var SPEED_RATIO = 1;
  var SPEED_TIME_PCT_STEP = 0;
  /** 成功验收最少样本 */
  var MIN_SUCCESS_GAMES = 2;
  var MIN_SUCCESS_ITEMS = 20;
  /** Q14：开新关激活门槛（1 局或 20 题） */
  var MIN_OPEN_GAMES = 1;
  /** Q8/Q9 已废：不靠失败次数结案；换项靠次日整单重算 */
  var FAIL_GAMES_PER_DAY = null;
  var FAIL_PRACTICE_DAYS = null;
  /** 未完成常驻格数；冷却窗（成功+失败）最多条数 */
  var INCOMPLETE_SIZE = 5;
  var COMPLETED_MAX = 5;
  /** 中国日历日：今日结案(成功+失败)+未完成 ≤ 此数；满则不补新任务 */
  var DAILY_TASK_QUOTA = 5;
  /** 同一 key 两次出现之间至少隔这么多条；凑不满五格时破例，破例关排队尾 */
  var SAME_TASK_GAP = 5;
  /** 全量成功历史；冷却窗走 plan.tasks 里 success/fail（合计最多 5）。 */
  var STORE_FULL_HISTORY = true;
  /** 冲榜闯关：每关按 10 题均速加总，再乘开销；预估须 ≤ 纪录 × 此系数 */
  var SCAN_CLEAR_ITEMS = 10;
  var SCAN_CLEAR_OVERHEAD = 1.1;
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
    factorsmultiples: true,
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
    if (!Number.isInteger(g) || g < 0 || g > 13) return "unknown";
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
   * 加减 / 乘除两条进度线；顶台 L13–L16 rem=0（乘除难 / 两步难同属顶格）。
   * L5 与 L6、L7 与 L8 同深；L17+ 挂加减线为负。
   * 跨线不对齐：L5≠L10，L9≠L13。
   */
  var ADD_TRACK_GROUPS = [
    [1],
    [2],
    [3],
    [4],
    [5, 6],
    [7, 8],
    [9],
    [12],
    [13, 14, 15, 16],
    [17],
    [18],
    [19],
    [20],
  ];
  var MUL_TRACK_GROUPS = [[10], [11], [13, 14, 15, 16]];
  /** 顶台锚点：组内含此关即 tip（L13–L16 同组 rem=0） */
  var REM_TIP_LEVEL = 16;

  /**
   * 其它模式 rem（不借四则号）。tip = 该线顶档关号。
   * 平方：L1→分出 L2/L4，L2→L3（顶）；L2 与 L4 同深。L2+ 任务先验仍为超前。
   * 因倍：Y0（质数）比 Y1 倒退一格；Y3 后分出 Y4/Y5 同深，Y6 为顶。
   */
  var MODE_REM_TRACKS = {
    decimal: { tip: 6, groups: [[1], [2], [3], [4], [5], [6]] },
    perfectSquare: { tip: 3, groups: [[1], [2, 4], [3]] },
    divisibility: { tip: 4, groups: [[1], [2], [3], [4]] },
    factorsMultiples: { tip: 6, groups: [[0], [1], [2], [3], [4, 5], [6]] },
  };

  function remFromTip(groups, L, tipLevel) {
    var tipLv = tipLevel != null ? tipLevel : REM_TIP_LEVEL;
    var tip = -1;
    var i;
    for (i = 0; i < groups.length; i += 1) {
      if (groups[i].indexOf(tipLv) !== -1) {
        tip = i;
        break;
      }
    }
    if (tip < 0) tip = groups.length - 1;
    for (i = 0; i < groups.length; i += 1) {
      if (groups[i].indexOf(L) !== -1) return tip - i;
    }
    return null;
  }

  function foundationRemaining(levelIndexOrL) {
    var n = Math.floor(Number(levelIndexOrL) || 0);
    var L = n >= 1 && n <= ARITH_TOTAL_LEVEL_COUNT ? n : n + 1;
    var add = remFromTip(ADD_TRACK_GROUPS, L, REM_TIP_LEVEL);
    if (add != null) return add;
    var mul = remFromTip(MUL_TRACK_GROUPS, L, REM_TIP_LEVEL);
    if (mul != null) return mul;
    return 0;
  }

  function modeFoundationRemaining(modeId, levelIndexOrL) {
    var track = MODE_REM_TRACKS[modeId];
    if (!track || !track.groups) return 0;
    var n = Number(levelIndexOrL);
    if (!Number.isFinite(n)) return 0;
    n = Math.floor(n);
    /** 含 Y0（L=0）；若直接命中关号则用关号，否则按 0-based index→L=n+1 */
    var rem = remFromTip(track.groups, n, track.tip);
    if (rem != null) return rem;
    rem = remFromTip(track.groups, n + 1, track.tip);
    return rem == null ? 0 : rem;
  }

  function foundationRemainingForRow(row) {
    if (!row) return 0;
    var L = row.L != null ? row.L : row.levelIndex != null ? Math.floor(Number(row.levelIndex)) + 1 : 0;
    var modeId = row.modeId;
    if (modeId && modeId !== "training" && MODE_REM_TRACKS[modeId]) {
      return modeFoundationRemaining(modeId, L);
    }
    return foundationRemaining(L);
  }

  /** 慢区：timePct × 1.15^rem；已快（<40）关掉低级优势，只比分位。 */
  function speedFoundationTerm(row) {
    var tp = timePctVal(row);
    if (tp < FOUNDATION_FAST_PCT) return tp;
    return tp * Math.pow(FOUNDATION_RATIO, foundationRemainingForRow(row));
  }

  /** 准度 0–1；>1.5 视为百分数（避开 p≈1 的浮点误判）。 */
  function normalizeP01(p) {
    var x = Number(p);
    if (!Number.isFinite(x)) return null;
    if (x > 1.5) x = x / 100;
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    return x;
  }

  /** 准度离 95% 的缺口，封顶 100（旧洞分 / 兼容输出仍用）。 */
  function accuracySeverity(row) {
    var p =
      row && row.p != null && Number.isFinite(Number(row.p))
        ? normalizeP01(row.p)
        : 0;
    if (p == null) p = 0;
    if (p >= HEAT_P_YELLOW) return 0;
    return Math.min(100, ((HEAT_P_YELLOW - p) / (1 - HEAT_P_YELLOW)) * 100);
  }

  /**
   * 黄橙洞分（v0.53）：rem×100 + (100−准%)×5 + 分位×2。
   * rem：四则见 foundationRemaining；其它模式见 modeFoundationRemaining（单线、末档=0）。
   */
  function holeScore(row) {
    if (!row || (row.stage !== "weak" && row.stage !== "shaky")) return 0;
    var rem = foundationRemainingForRow(row);
    var p = row.p != null && Number.isFinite(Number(row.p)) ? normalizeP01(row.p) : 1;
    if (p == null) p = 1;
    var pPct = p * 100;
    var tp = timePctVal(row);
    return rem * HOLE_REM_WEIGHT + (100 - pPct) * HOLE_ACC_WEIGHT + tp * HOLE_SPEED_WEIGHT;
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

  /** 原闯关纪录最高关（0-based）；无纪录返回 null。合格线与「全绿提权」共用。 */
  function resolveLevelBestIndex(opts) {
    opts = opts || {};
    var hist = null;
    if (opts.levelChallengeBestLevel != null && Number.isFinite(Number(opts.levelChallengeBestLevel))) {
      hist = Math.floor(Number(opts.levelChallengeBestLevel));
    }
    if (opts.levelBestFromRuns != null && Number.isFinite(Number(opts.levelBestFromRuns))) {
      var fromRuns = Math.floor(Number(opts.levelBestFromRuns));
      if (hist == null || fromRuns > hist) hist = fromRuns;
    }
    return hist != null && hist >= 0 ? hist : null;
  }

  /**
   * L1～原最高关（含）均为绿快：准≥95% 且 timePct&lt;50。
   * 无纪录、缺数据、或缺分位 → false（摸底闯关仍可排，但不提权）。
   */
  function foundationGreenThroughBest(rows, bestIdx) {
    if (bestIdx == null || !Number.isFinite(Number(bestIdx)) || Number(bestIdx) < 0) return false;
    var top = Math.floor(Number(bestIdx));
    var list = rows || [];
    for (var i = 0; i <= top; i += 1) {
      var r = list[i];
      if (!r || !(r.n > 0)) return false;
      var p = r.p != null && Number.isFinite(Number(r.p)) ? Number(r.p) : null;
      if (p == null || p < HEAT_P_YELLOW) return false;
      var tp = r.timePct != null && Number.isFinite(Number(r.timePct)) ? Number(r.timePct) : null;
      if (tp == null || tp >= FAST_TIME_PCT) return false;
    }
    return true;
  }

  /** 合格线 Ln = 须通过 Ln。取历史最高与热图连续准≥95%顶的 max。无历史且 L1 不够 95% 时目标仍是 L1。 */
  function resolveScanTarget(rows, opts) {
    opts = opts || {};
    var hist = resolveLevelBestIndex(opts);
    var accTop = accConsecutiveTopIndex(rows);
    var heatIdx = accTop >= 0 ? accTop : null;
    var idx;
    if (hist != null && hist >= 0) {
      idx = heatIdx == null ? hist : Math.max(hist, heatIdx);
    } else {
      idx = heatIdx == null ? 0 : heatIdx;
    }
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

  function bestClearedLevelSec(runs, overrideSec) {
    if (overrideSec != null && Number.isFinite(Number(overrideSec)) && Number(overrideSec) > 0) {
      return Number(overrideSec);
    }
    var best = null;
    (runs || []).forEach(function (r) {
      if (normalizeRunMode(r && r.mode) !== "level" || r.cleared !== true) return;
      var sec = runDurationSec(r);
      if (sec == null) return;
      if (best == null || sec < best) best = sec;
    });
    return best;
  }

  /** 闯关全通估时：只加总公开档 L1–L16（隐藏档不进闯关）。 */
  function estimateClearSec(rows) {
    var sum = 0;
    var list = rows || [];
    for (var i = 0; i < ARITH_PUBLIC_LEVEL_COUNT; i += 1) {
      var row = list[i];
      var sec = row && row.avgSec != null && Number.isFinite(Number(row.avgSec)) ? Number(row.avgSec) : null;
      if (sec == null || sec <= 0) return null;
      sum += sec;
    }
    return sum * SCAN_CLEAR_ITEMS * SCAN_CLEAR_OVERHEAD;
  }

  function retryClearInfo(rows, runs, overrideSec) {
    var recordSec = bestClearedLevelSec(runs, overrideSec);
    var estimateSec = estimateClearSec(rows);
    if (recordSec == null || estimateSec == null) return null;
    return {
      estimateSec: estimateSec,
      recordSec: recordSec,
      improve: estimateSec <= recordSec * SCAN_CLEAR_IMPROVE,
    };
  }

  function clearEstimateInfo(rows, runs, overrideSec) {
    var estimateSec = estimateClearSec(rows);
    var recordSec = bestClearedLevelSec(runs, overrideSec);
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
        "（每关10题×" +
        SCAN_CLEAR_OVERHEAD +
        "）" +
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
    if (ctx.hasClearedLevel) return isRetryClearScan(ctx);
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

  /** 过 Ln：须打完该关。公开顶关 L16 看 cleared；其余看 maxLevel 是否到达下一关。 */
  function passedScanTarget(run, scanLevelIndex) {
    if (scanLevelIndex == null || !Number.isFinite(Number(scanLevelIndex))) return false;
    var idx = clampLevel(scanLevelIndex);
    if (idx >= ARITH_PUBLIC_MAX_INDEX) return !!(run && run.cleared === true);
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

  /** 二选一局均速口径（与热图一致）：整除 Z1–Z4 / 质数 / 因倍 Y1–Y2 */
  function isChoiceRunSpeedMode(run, levelIndex) {
    var mode = normalizeRunMode(run && run.mode);
    if (mode === "primecomposite") return true;
    var lv = levelIndex;
    if (lv == null || !Number.isFinite(Number(lv))) {
      var meta = run && run.trainingMeta && typeof run.trainingMeta === "object" ? run.trainingMeta : null;
      var raw = meta && meta.pickedLevel != null ? meta.pickedLevel : run && run.maxLevel;
      lv = Math.floor(Number(raw));
    } else {
      lv = Math.floor(Number(lv));
    }
    if (mode === "divisibility") return Number.isFinite(lv) && lv >= 0 && lv < 4;
    if (mode === "factorsmultiples") return Number.isFinite(lv) && lv >= 0 && lv <= 1;
    return false;
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
    var avgSec = null;
    var speedN = 0;
    if (isChoiceRunSpeedMode(run, levelIndex)) {
      var durSec = runDurationSec(run);
      var nRun = Array.isArray(run && run.attempts) && run.attempts.length ? run.attempts.length : n;
      if (durSec != null && nRun > 0) {
        var msPerQ = (durSec * 1000) / nRun;
        if (msPerQ > 0 && Number.isFinite(msPerQ) && msPerQ < 60000) {
          avgSec = msPerQ / 1000;
          speedN = nRun;
        }
      }
    } else {
      avgSec = lnN > 0 ? Math.exp(lnSum / lnN) / 1000 : null;
      speedN = lnN;
      if (avgSec == null && run && run.trainingMeta && Number.isFinite(Number(run.trainingMeta.runAvgSec))) {
        avgSec = Number(run.trainingMeta.runAvgSec);
        if (speedN <= 0 && correct > 0) speedN = correct;
        else if (speedN <= 0) speedN = 1;
      }
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
      /** 超前且已有数据的黄橙（准度或速度）；校内已激活均流畅后进五格（见 uniqueSeeds） */
      aheadHoles: rows.filter(function (r) {
        return aheadHoleEligible(r);
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

  /**
   * 超前洞：已有数据的黄橙（准度不够或速度不够同一套）。空关不开。
   * 是否进队还要校内已激活均流畅（未过慢），见 canScheduleAheadHoles。
   */
  function aheadHoleEligible(row) {
    if (!row || row.prior !== "ahead") return false;
    if (row.stage !== "weak" && row.stage !== "shaky") return false;
    return row.p != null && Number.isFinite(Number(row.p));
  }

  /** 不熟练：无数据 / 准<95% / +1sd 过慢（与概览未 fluent 同）。只计公开档 L1–L16。 */
  function arithUnfluentCount(rows) {
    var n = 0;
    var list = rows || [];
    for (var i = 0; i < ARITH_PUBLIC_LEVEL_COUNT; i += 1) {
      var r = list[i];
      if (!r || r.fluent !== true) n += 1;
    }
    return n;
  }

  /** 黄橙：无数据，或热图黄/橙（准不够，或 timePct≥50 / 过慢）。含「准够但仍偏慢」的黄档。只计公开档 L1–L16。 */
  function arithYellowOrangeCount(rows) {
    var n = 0;
    var list = rows || [];
    for (var i = 0; i < ARITH_PUBLIC_LEVEL_COUNT; i += 1) {
      var r = list[i];
      if (!r || r.stage === "no_data") {
        n += 1;
        continue;
      }
      if (r.band === "yellow" || r.band === "orange") n += 1;
      else if (r.stage === "weak" || r.stage === "shaky") n += 1;
      else if (r.fluent !== true) n += 1;
    }
    return n;
  }

  /**
   * 四则硬留格数（含错题/闯关/四则训练）。
   * 未全开热图 → 5；已全开：max(不熟练, 黄橙≥3 ? 3 : 黄橙)，全绿 → 0。
   * 熟练度只看公开档；隐藏 L17+ 不抬硬留。
   */
  function arithSlotReserve(rows) {
    if (!arithHeatmapFullyUnlocked(rows)) return INCOMPLETE_SIZE;
    var unfluent = arithUnfluentCount(rows);
    var yellowOrange = arithYellowOrangeCount(rows);
    var floor =
      yellowOrange >= 3 ? Math.max(unfluent, 3) : Math.max(unfluent, yellowOrange);
    return Math.min(INCOMPLETE_SIZE, Math.max(0, floor));
  }

  /** 校内已激活均流畅（未过慢）时，可把符合条件的超前黄橙进队。 */
  function canScheduleAheadHoles(rows) {
    return schoolActivatedReady(rows || []);
  }

  function modePriorToSchool(prior) {
    return prior === "learned" || prior === "current";
  }

  function buildGenericRows(grade, cells, modeId, levelCount, labelFn, priorFn) {
    var rows = [];
    var nLevels = levelCount > 0 ? levelCount : LEVEL_COUNT;
    for (var i = 0; i < nLevels; i += 1) {
      var cell = getCell(cells, i);
      var prior = priorFn(grade, i);
      if (prior === "blocked") prior = "ahead";
      var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
      var p = cell && cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
      var row = {
        modeId: modeId || "training",
        levelIndex: i,
        L: i + 1,
        levelLabel: labelFn(i),
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
      row.stageLabel =
        row.stage === "weak"
          ? "弱"
          : row.stage === "shaky"
            ? "不熟"
            : row.stage === "thin"
              ? "样本薄"
              : row.stage === "mastered"
                ? "会了"
                : "无数据";
      rows.push(row);
    }
    return rows;
  }

  function emptyPrimeY0HeatCell() {
    return {
      levelIndex: -1,
      active: false,
      n: 0,
      p: null,
      timePct: null,
      tooSlow: false,
      fluent: false,
      isPrimeY0: true,
    };
  }

  function buildFactorsY0Row(grade, y0Cell) {
    var cell = y0Cell && typeof y0Cell === "object" ? y0Cell : emptyPrimeY0HeatCell();
    var priorRaw = Modes.modeCurriculumPrior("factorsMultiples", grade, -1);
    var prior = priorRaw === "blocked" ? "ahead" : priorRaw;
    var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
    var p = cell && cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
    var row = {
      modeId: "factorsMultiples",
      levelIndex: -1,
      L: 0,
      levelLabel: "Y0",
      prior: prior,
      priorLabel: PRIOR_LABEL[prior] || prior,
      stage: classifyStage(cell, prior),
      n: n,
      p: p,
      pPct: pctText(p),
      tooSlow: !!(cell && cell.tooSlow),
      fluent: !!(cell && cell.fluent),
      band: heatBand(cell),
      timePct:
        cell && cell.timePct != null && Number.isFinite(Number(cell.timePct))
          ? Number(cell.timePct)
          : null,
      avgSec: avgSecFromCell(cell),
      meanLnCorrect:
        cell && cell.meanLnCorrect != null && Number.isFinite(Number(cell.meanLnCorrect))
          ? Number(cell.meanLnCorrect)
          : null,
      isPrimeY0: true,
      blocked: priorRaw === "blocked",
    };
    row.stageLabel =
      row.stage === "weak"
        ? "弱"
        : row.stage === "shaky"
          ? "不熟"
          : row.stage === "thin"
            ? "样本薄"
            : row.stage === "mastered"
              ? "会了"
              : "无数据";
    return row;
  }

  function buildModePack(modeId, grade, cells, opts) {
    opts = opts || {};
    if (!Modes || !Modes.MODE_META[modeId]) return null;
    if (!Modes.modeAllowed(modeId, grade)) return null;
    var meta = Modes.MODE_META[modeId];
    var rows = buildGenericRows(
      grade,
      cells || [],
      modeId,
      meta.levelCount,
      function (i) {
        return Modes.modeLevelLabel(modeId, i);
      },
      function (g, i) {
        var pr = Modes.modeCurriculumPrior(modeId, g, i);
        return pr === "blocked" ? "ahead" : pr;
      }
    );
    rows.forEach(function (r) {
      var raw = Modes.modeCurriculumPrior(modeId, grade, r.levelIndex);
      if (raw === "blocked") {
        r.prior = "ahead";
        r.blocked = true;
      }
    });
    /** 因倍前置 Y0（质数合数）；四年级 prior=blocked，不进洞/开新 */
    if (modeId === "factorsMultiples") {
      rows.unshift(buildFactorsY0Row(grade, opts.y0Cell));
    }
    var schoolHoles = rows.filter(function (r) {
      return !r.blocked && modePriorToSchool(r.prior) && (r.stage === "weak" || r.stage === "shaky");
    });
    var aheadHoles = rows.filter(function (r) {
      return !r.blocked && aheadHoleEligible(r);
    });
    var openRow = null;
    if (schoolActivatedReady(rows.filter(function (r) {
      return !r.blocked && modePriorToSchool(r.prior);
    })) || !rows.some(function (r) {
      return !r.blocked && modePriorToSchool(r.prior) && r.stage !== "no_data";
    })) {
      var best = null;
      rows.forEach(function (r) {
        if (r.blocked || !modePriorToSchool(r.prior) || r.stage !== "no_data") return;
        if (!best || r.levelIndex < best.levelIndex) best = r;
      });
      openRow = best;
    }
    if (openRow && !canScheduleOpenNewForMode(rows)) openRow = null;
    var fillers = rows
      .filter(function (r) {
        return !r.blocked && fillerScore(r) > 0;
      })
      .slice()
      .sort(function (a, b) {
        return fillerScore(b) - fillerScore(a);
      });
    return {
      modeId: modeId,
      meta: meta,
      rows: rows,
      schoolHoles: schoolHoles,
      aheadHoles: canScheduleAheadHoles(rows) ? aheadHoles : [],
      openRow: openRow,
      fillers: fillers,
    };
  }

  function canScheduleOpenNewForMode(rows) {
    var schoolRows = (rows || []).filter(function (r) {
      return !r.blocked && modePriorToSchool(r.prior);
    });
    if (!(schoolRows || []).some(function (r) {
      return r && r.stage && r.stage !== "no_data";
    })) {
      return !!nextOpenableModeRow(rows);
    }
    return schoolActivatedReady(schoolRows) && !!nextOpenableModeRow(rows);
  }

  function nextOpenableModeRow(rows) {
    var best = null;
    (rows || []).forEach(function (r) {
      if (!r || r.blocked || !modePriorToSchool(r.prior) || r.stage !== "no_data") return;
      if (!best || r.levelIndex < best.levelIndex) best = r;
    });
    return best;
  }

  /** 该模式线是否还有「硬留理由」：校内黄橙，或校内可开新（无数据）。超前洞/绿补不算。 */
  function modePackNeedsHoleReserve(pack) {
    if (!pack) return false;
    return !!(
      (pack.schoolHoles && pack.schoolHoles.length) ||
      pack.openRow
    );
  }

  function specialLineNeedsReserve(ctx) {
    if (!Modes || !ctx.modePacks) return false;
    var order = Modes.SPECIAL_ORDER || [];
    var i;
    for (i = 0; i < order.length; i += 1) {
      if (modePackNeedsHoleReserve(ctx.modePacks[order[i]])) return true;
    }
    return false;
  }

  function decimalLineNeedsReserve(ctx) {
    return modePackNeedsHoleReserve(ctx.modePacks && ctx.modePacks.decimal);
  }

  /** 硬留只取校内黄橙 / 开新；超前与绿补走自由格。 */
  function pickFromPackHoleOrOpen(pack, cooldownSeq) {
    if (!pack) return null;
    function okKey(seed) {
      var k = seedKey(seed);
      if (cooldownSeq && keyTooSoon(k, cooldownSeq)) return false;
      return true;
    }
    var holes = sortHolesWorstFirst(pack.schoolHoles || []);
    var i;
    for (i = 0; i < holes.length; i += 1) {
      var s0 = { kind: "mode", modeId: pack.modeId, row: holes[i] };
      if (okKey(s0)) return s0;
    }
    if (pack.openRow) {
      var s1 = { kind: "mode_open", modeId: pack.modeId, row: pack.openRow };
      if (okKey(s1)) return s1;
    }
    return null;
  }

  function pickSpecialReserve(ctx, cooldownSeq) {
    if (!Modes) return null;
    var order = Modes.SPECIAL_ORDER;
    var tiers = ["hole", "open"];
    function okSeed(seed) {
      return !!(seed && !(cooldownSeq && keyTooSoon(seedKey(seed), cooldownSeq)));
    }
    var t;
    var m;
    var i;
    for (t = 0; t < tiers.length; t += 1) {
      for (m = 0; m < order.length; m += 1) {
        var pack = ctx.modePacks && ctx.modePacks[order[m]];
        if (!pack) continue;
        /** 同模式按差→好试完；最差格冷却时改下一格，不整档跳到开新/别模式绿补。 */
        if (tiers[t] === "hole") {
          var holes = sortHolesWorstFirst(pack.schoolHoles || []);
          for (i = 0; i < holes.length; i += 1) {
            var hSeed = { kind: "mode", modeId: pack.modeId, row: holes[i] };
            if (okSeed(hSeed)) return hSeed;
          }
        } else if (tiers[t] === "open" && pack.openRow) {
          var oSeed = { kind: "mode_open", modeId: pack.modeId, row: pack.openRow };
          if (okSeed(oSeed)) return oSeed;
        }
      }
    }
    return null;
  }

  function pickDecimalReserve(ctx, cooldownSeq) {
    return pickFromPackHoleOrOpen(ctx.modePacks && ctx.modePacks.decimal, cooldownSeq);
  }

  /**
   * 已学/同步里已激活的关全部流畅：准≥95% 且未过慢（与模式梯子 / 概览 fluent 同口径）。
   * 偏慢黄档（timePct≥50 但仍未过慢）不挡开新关。无已激活时视为可开第一档。
   */
  function schoolActivatedReady(rows) {
    var list = rows || [];
    for (var i = 0; i < list.length; i += 1) {
      var r = list[i];
      if (!inSchoolPrior(r.prior)) continue;
      if (r.stage === "no_data") continue;
      if (r.fluent !== true) return false;
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

  /** 四则公开档 L1–L16 热图均已激活（有数据）；特殊/小数硬留前提。不含隐藏 L17+。 */
  function arithHeatmapFullyUnlocked(rows) {
    var list = rows || [];
    if (list.length < ARITH_PUBLIC_LEVEL_COUNT) return false;
    for (var i = 0; i < ARITH_PUBLIC_LEVEL_COUNT; i += 1) {
      var r = list[i];
      if (!r || !r.stage || r.stage === "no_data") return false;
    }
    return true;
  }

  function resolveSlotBudget(grade, rows) {
    if (!Modes || typeof Modes.slotBudget !== "function") {
      return { arith: INCOMPLETE_SIZE, special: 0, decimal: 0 };
    }
    return Modes.slotBudget(grade, { arithFullyUnlocked: arithHeatmapFullyUnlocked(rows) });
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
    if (p != null && p + 1e-9 >= HEAT_P_YELLOW) return "speed_step";
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
      targetP = HEAT_P_YELLOW;
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
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
    };
    return applyScanFields(task, scan);
  }

  function listOtherModeSeeds(ctx, tier) {
    var out = [];
    if (!Modes || !ctx.modePacks) return out;
    var ids = Modes.SPECIAL_ORDER.concat(["decimal"]);
    var i;
    for (i = 0; i < ids.length; i += 1) {
      var pack = ctx.modePacks[ids[i]];
      if (!pack) continue;
      if (tier === "hole") {
        sortHolesWorstFirst(pack.schoolHoles || []).forEach(function (r) {
          out.push({ kind: "mode", modeId: pack.modeId, row: r });
        });
      } else if (tier === "open" && pack.openRow) {
        out.push({ kind: "mode_open", modeId: pack.modeId, row: pack.openRow });
      } else if (tier === "ahead") {
        sortHolesWorstFirst(pack.aheadHoles || []).forEach(function (r) {
          out.push({ kind: "mode", modeId: pack.modeId, row: r });
        });
      } else if (tier === "fill") {
        (pack.fillers || []).forEach(function (r) {
          out.push({ kind: "mode", modeId: pack.modeId, row: r });
        });
      }
    }
    return out;
  }

  function isSpecialModeAction(action) {
    if (!action) return false;
    /** Y0 任务 action 仍是 primeComposite，占特殊硬留 */
    if (action === "primeComposite") return true;
    if (!Modes || !Modes.SPECIAL_ORDER) return false;
    return Modes.SPECIAL_ORDER.indexOf(action) >= 0;
  }

  function isDecimalAction(action) {
    return action === "decimal";
  }

  /** 今日留牌已占用的硬留：特殊四选一 / 小数（按中国日历日）。 */
  function countTodaySlotSpend(plan, dayKey) {
    var spend = { special: 0, decimal: 0, arith: 0 };
    if (!dayKey) return spend;
    (plan && plan.tasks ? plan.tasks : []).forEach(function (t) {
      if (!t || (t.status !== "success" && t.status !== "fail")) return;
      if (t.chinaDay !== dayKey) return;
      if (isDecimalAction(t.action)) spend.decimal += 1;
      else if (isSpecialModeAction(t.action)) spend.special += 1;
      else spend.arith += 1;
    });
    return spend;
  }

  function isArithSeed(seed) {
    return (
      !!seed &&
      (seed.kind === "training" ||
        seed.kind === "open" ||
        seed.kind === "scan" ||
        seed.kind === "wrongbook")
    );
  }

  function isDecimalSeed(seed) {
    return !!(seed && seed.modeId === "decimal");
  }

  function isSpecialSeed(seed) {
    if (!seed || isArithSeed(seed) || isDecimalSeed(seed)) return false;
    return seed.kind === "mode" || seed.kind === "mode_open";
  }

  function uniqueSeeds(ctx) {
    var budget = resolveSlotBudget(ctx.grade, ctx.rows);
    var cooldownHint = ctx._cooldownSeq || [];
    var spend = ctx.daySlotSpend || { special: 0, decimal: 0, arith: 0 };
    var specialLeft = Math.max(0, (budget.special || 0) - (spend.special || 0));
    var decimalLeft = Math.max(0, (budget.decimal || 0) - (spend.decimal || 0));

    /** 年级至少硬留：该线仍有校内黄橙或可开新才占；全绿/仅超前或绿补则放进自由格。 */
    var reservedSpecial =
      specialLeft > 0 && specialLineNeedsReserve(ctx)
        ? pickSpecialReserve(ctx, cooldownHint)
        : null;
    var reservedDecimal =
      decimalLeft > 0 && decimalLineNeedsReserve(ctx)
        ? pickDecimalReserve(ctx, cooldownHint)
        : null;

    var stream = [];
    if (ctx.wrongbookNeeded) stream.push({ kind: "wrongbook" });

    var holes = sortHolesWorstFirst(ctx.schoolHoles || []);
    var primary = ctx.primaryRow;
    if (ctx.profile && ctx.profile.id === "skill_gaps") {
      if (
        !holes.length &&
        primary &&
        (primary.stage === "weak" || primary.stage === "shaky") &&
        (inSchoolPrior(primary.prior) || aheadHoleEligible(primary))
      ) {
        holes = [primary];
      }
    }
    var needScan = scanIsNeeded(ctx);
    /** 未通关且 L1～原纪录全绿：闯关提到四则训练前；否则垫后（有空格才上）。 */
    var elevateScan = needScan && !isRetryClearScan(ctx) && !!ctx.scanElevate;

    if (heatmapIsEmpty(ctx.rows)) {
      if (needScan) stream.push({ kind: "scan", scan: ctx.scan });
    } else if (needScan && isRetryClearScan(ctx)) {
      if (holes.length) stream.push({ kind: "training", row: holes[0] });
      stream.push({ kind: "scan", scan: ctx.scan });
      holes.slice(1).forEach(function (r) {
        stream.push({ kind: "training", row: r });
      });
    } else {
      if (elevateScan) stream.push({ kind: "scan", scan: ctx.scan });
      holes.forEach(function (r) {
        stream.push({ kind: "training", row: r });
      });
    }
    if (canScheduleOpenNew(ctx.rows || [])) {
      var openR = nextOpenableRow(ctx.rows);
      if (openR) stream.push({ kind: "open", row: openR });
    }
    if (canScheduleAheadHoles(ctx.rows || [])) {
      sortHolesWorstFirst(ctx.aheadHoles || []).forEach(function (r) {
        stream.push({ kind: "training", row: r });
      });
    }
    var allowOtherModes = arithHeatmapFullyUnlocked(ctx.rows || []);
    if (allowOtherModes) {
      listOtherModeSeeds(ctx, "hole").forEach(function (s) {
        stream.push(s);
      });
      listOtherModeSeeds(ctx, "open").forEach(function (s) {
        stream.push(s);
      });
      listOtherModeSeeds(ctx, "ahead").forEach(function (s) {
        stream.push(s);
      });
    }
    /** 绿补：四则与其它模式同一池，按 fillerScore 跨模式比（公式不变）。 */
    var greenPool = [];
    (ctx.rows || []).forEach(function (r) {
      if (fillerScore(r) > 0) greenPool.push({ kind: "training", row: r });
    });
    if (allowOtherModes) {
      listOtherModeSeeds(ctx, "fill").forEach(function (s) {
        greenPool.push(s);
      });
    }
    greenPool.sort(function (a, b) {
      return fillerScore(b.row) - fillerScore(a.row);
    });
    greenPool.forEach(function (s) {
      stream.push(s);
    });
    /** 未通关默认：闯关垫在训练/绿补之后，有空格才进五格。 */
    if (needScan && !heatmapIsEmpty(ctx.rows) && !isRetryClearScan(ctx) && !elevateScan) {
      stream.push({ kind: "scan", scan: ctx.scan });
    }

    /**
     * 1) 四则硬留（熟练度）；2) 年级特殊/小数至少硬留；
     * 3) 自由格按 stream 全局优先级混排四则+其它（不再只填其它、最后才回填四则）。
     */
    var arithPrefer = arithSlotReserve(ctx.rows || []);
    if ((ctx.wrongbookNeeded || ctx.wrongbookSticky) && arithPrefer < 1) arithPrefer = 1;
    if (needScan && arithPrefer < 1) arithPrefer = 1;
    var arithSeeds = [];
    stream.forEach(function (seed) {
      if (isArithSeed(seed)) arithSeeds.push(seed);
    });

    var picked = [];
    var usedKey = {};
    function take(seed) {
      if (!seed || picked.length >= INCOMPLETE_SIZE) return false;
      var k = seedKey(seed);
      if (!k || usedKey[k]) return false;
      usedKey[k] = true;
      picked.push(seed);
      return true;
    }

    var ai;
    var arithN = 0;
    for (ai = 0; ai < arithSeeds.length && arithN < arithPrefer; ai += 1) {
      if (take(arithSeeds[ai])) arithN += 1;
    }
    var specialTaken = 0;
    var decimalTaken = 0;
    var otherRoom = INCOMPLETE_SIZE - picked.length;
    var reserveQueue = [];
    if (reservedSpecial) reserveQueue.push(reservedSpecial);
    if (reservedDecimal) reserveQueue.push(reservedDecimal);
    var oi;
    /** 年级硬留下限：先各占特殊/小数额度内的 1 格（今日未耗尽时）。 */
    for (oi = 0; oi < reserveQueue.length && otherRoom > 0; oi += 1) {
      var rSeed = reserveQueue[oi];
      if (isSpecialSeed(rSeed) && specialTaken >= specialLeft) continue;
      if (isDecimalSeed(rSeed) && decimalTaken >= decimalLeft) continue;
      if (take(rSeed)) {
        otherRoom -= 1;
        if (isSpecialSeed(rSeed)) specialTaken += 1;
        if (isDecimalSeed(rSeed)) decimalTaken += 1;
      }
    }
    /** 自由格：沿全局优先级流继续取（含四则黄橙/开新/绿补与其它模式）。 */
    var si;
    for (si = 0; si < stream.length && picked.length < INCOMPLETE_SIZE; si += 1) {
      take(stream[si]);
    }
    return picked;
  }

  function seedIsNeeded(seed, ctx) {
    if (seed.kind === "wrongbook") {
      return !!(ctx && (ctx.wrongbookNeeded || ctx.wrongbookSticky));
    }
    if (seed.kind === "scan") return scanIsNeeded(ctx);
    if (seed.kind === "open") {
      var openRow = seed.row;
      if (!openRow || openRow.stage !== "no_data") return false;
      return canScheduleOpenNew(ctx.rows || []);
    }
    if (seed.kind === "mode_open") {
      return !!(seed.row && seed.row.stage === "no_data");
    }
    var row = seed.row;
    if (!row) return false;
    if (row.stage === "weak" || row.stage === "shaky") {
      if (row.prior === "ahead") return aheadHoleEligible(row);
      return true;
    }
    return fillerScore(row) > 0;
  }

  function isCooldownTask(t) {
    return !!(t && (t.status === "success" || t.status === "fail"));
  }

  function doneTasks(plan) {
    return (plan.tasks || []).filter(function (t) {
      return t && t.status === "success";
    });
  }

  function cooldownTasks(plan) {
    return (plan.tasks || []).filter(isCooldownTask);
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

  /**
   * 未通关摸底闯关位置（开单/日切/重新开单时）：
   * - 默认垫后（有空格才上）；
   * - L1～原纪录全绿则提到错题之后、四则训练之前。
   * 冲榜不走这条。
   */
  function placeScanByPriority(next, ctx) {
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
    if (ctx && ctx.scanElevate) {
      var at = 0;
      while (at < list.length && list[at] && list[at].action === "wrongbook") at += 1;
      list.splice(at, 0, scan);
      return list;
    }
    list.push(scan);
    return list;
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
    var hasSchoolHole = !!(ctx && ctx.schoolHoles && ctx.schoolHoles.length);
    var hasAheadHole =
      !!(ctx && ctx.aheadHoles && ctx.aheadHoles.length) && canScheduleAheadHoles(ctx.rows || []);
    var hasHole = hasSchoolHole || hasAheadHole;
    if (!hasHole) return [scan].concat(list);
    var at = Math.min(1, list.length);
    list.splice(at, 0, scan);
    return list;
  }

  /** 冷却窗里 chinaDay=当日 的成功+失败条数。 */
  function todayClosedCount(plan, dayKey) {
    if (!dayKey) return 0;
    var n = 0;
    (plan && plan.tasks ? plan.tasks : []).forEach(function (t) {
      if (!t) return;
      if (t.status !== "success" && t.status !== "fail") return;
      if (t.chinaDay === dayKey) n += 1;
    });
    return n;
  }

  /** 当日未完成上限：配额 − 今日已结案；并不超过 INCOMPLETE_SIZE。 */
  function maxOpenForDay(plan, ts) {
    var day = chinaDateKeyFromTs(ts);
    var closed = todayClosedCount(plan, day);
    return Math.min(INCOMPLETE_SIZE, Math.max(0, DAILY_TASK_QUOTA - closed));
  }

  function isTodayBoardClosed(t, dayKey) {
    return !!(t && isCooldownTask(t) && dayKey && t.chinaDay === dayKey);
  }

  function openCountIn(list) {
    var n = 0;
    (list || []).forEach(function (t) {
      if (t && (t.status === "active" || t.status === "pending")) n += 1;
    });
    return n;
  }

  function keepOpenTask(t, ctx, keepExisting) {
    if (keepExisting) return true;
    if (t && t.action === "wrongbook") {
      return !!(ctx.wrongbookNeeded || ctx.wrongbookSticky || (ctx.wrongAnswersVisible || 0) > 0);
    }
    if (isScanTask(t) && !scanIsNeeded(ctx)) return false;
    if (t.successKind !== "open_activate") return true;
    if (t.action === "training") {
      var row = rowByLevel(ctx.rows || [], t.levelIndex);
      if (!row || row.stage !== "no_data") return false;
      return canScheduleOpenNew(ctx.rows || []);
    }
    return true;
  }

  function fillIncomplete(plan, ctx, ts, opts) {
    opts = opts || {};
    var keepExisting = opts.keepExisting === true;
    var reorderScan = opts.reorderScan === true;
    /** false：只整理留牌/归档，不新开任务（结案、跑偏）。开单/日切/重新开单才 true。 */
    var appendNew = opts.appendNew !== false;
    var day = chinaDateKeyFromTs(ts);
    /** 非今日结案 → 冷却归档；今日结案留在主列表（留牌）直到跨日。 */
    var archive = [];
    var board = [];
    (plan.tasks || []).forEach(function (t) {
      if (!t) return;
      if (isCooldownTask(t)) {
        if (isTodayBoardClosed(t, day)) board.push(t);
        else archive.push(t);
        return;
      }
      if (t.status !== "active" && t.status !== "pending") return;
      if (!keepOpenTask(t, ctx, keepExisting)) return;
      board.push(t);
    });
    archive = trimDone(archive);
    var stickyWrong = board.some(function (t) {
      return t && (t.status === "active" || t.status === "pending") && t.action === "wrongbook";
    });
    ctx.wrongbookSticky = stickyWrong;
    ctx._cooldownSeq = archive.concat(board);
    ctx.daySlotSpend = countTodaySlotSpend(plan, day);
    plan._adviceCtx = ctx;
    /** 今日留牌占配额；开单时按剩余额度发新卡。正常路径不「补空格」。 */
    var maxOpen = maxOpenForDay(plan, ts);
    if (appendNew) {
      var needed = uniqueSeeds(ctx).filter(function (s) {
        return seedIsNeeded(s, ctx);
      });
      function appendFromNeeded(allowCloseRepeat) {
        needed.forEach(function (seed) {
          if (openCountIn(board) >= maxOpen) return;
          var k = seedKey(seed);
          if (
            board.some(function (t) {
              return t && t.key === k;
            })
          ) {
            return;
          }
          if (!allowCloseRepeat && keyTooSoon(k, archive.concat(board))) return;
          board.push(seedToTask(plan, seed));
        });
      }
      appendFromNeeded(false);
      /** 先遵守间隔；仍不满五格再破例，破例关追加在队尾。 */
      if (openCountIn(board) < maxOpen) appendFromNeeded(true);
    }
    if (reorderScan) {
      var todays = [];
      var opens = [];
      board.forEach(function (t) {
        if (isTodayBoardClosed(t, day)) todays.push(t);
        else opens.push(t);
      });
      if (isRetryClearScan(ctx)) opens = placeRetryScanSecond(opens, ctx);
      else opens = placeScanByPriority(opens, ctx);
      board = todays.concat(opens);
    }
    plan.tasks = archive.concat(board);
    activateFirst(plan.tasks);
  }

  function seedKey(seed) {
    if (!seed) return "";
    if (seed.kind === "scan") return "level";
    if (seed.kind === "wrongbook") return "wrongbook";
    if (seed.kind === "mode" || seed.kind === "mode_open") {
      if (seed.row && seed.row.isPrimeY0) return taskKey("primeComposite", -1);
      return taskKey(seed.modeId || "mode", seed.row && seed.row.levelIndex);
    }
    return taskKey("training", seed.row && seed.row.levelIndex);
  }

  function isWrongbookSuccessKind(kind) {
    return kind === "wrongbook_session" || kind === "wrongbook_clear";
  }

  function makeWrongbookTask(plan, ctx) {
    var n = ctx && ctx.wrongAnswersVisible != null ? Number(ctx.wrongAnswersVisible) : 0;
    return {
      id: nextTaskId(plan),
      key: "wrongbook",
      action: "wrongbook",
      mode: "wrongbook",
      levelIndex: null,
      levelLabel: "错题本",
      status: "pending",
      successKind: "wrongbook_session",
      baseline: {
        p: null,
        timePct: null,
        n: n,
        tooSlow: false,
        avgSec: null,
        stageLabel: "",
        priorLabel: "",
      },
      targetP: null,
      targetTimePct: null,
      targetAvgSec: null,
      scanLevelIndex: null,
      scanLevelLabel: "",
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
      title: "错题本（四则）",
      detail: "可练错题 " + n + " 道；完成一次练习即成功。做对的清掉，做错的留着。",
    };
  }

  function makeModeTask(plan, seed) {
    var row = seed.row;
    var modeId = seed.modeId;
    var meta = Modes && Modes.MODE_META[modeId] ? Modes.MODE_META[modeId] : null;
    var isPrimeY0 = !!(row && row.isPrimeY0);
    var action = isPrimeY0 ? "primeComposite" : modeId;
    var playMode = isPrimeY0
      ? "primeComposite"
      : meta
        ? meta.playMode
        : modeId;
    var isOpen = seed.kind === "mode_open";
    var kind = isOpen ? "open_activate" : successKindForRow(row);
    var targetP = null;
    var targetTimePct = null;
    var targetAvgSec = null;
    if (!isOpen && kind !== "speed_step") targetP = HEAT_P_YELLOW;
    if (!isOpen && kind === "speed_step") {
      var spdT = applySpeedTargets(row);
      targetTimePct = spdT.targetTimePct;
      targetAvgSec = spdT.targetAvgSec;
    }
    var title = isPrimeY0
      ? "质数合数 Y0" + (isOpen ? "（开新关）" : "")
      : (meta ? meta.label : modeId) +
        (row.levelLabel && !(meta && meta.singlePool) ? " " + row.levelLabel : "") +
        (isOpen ? "（开新关）" : "");
    return {
      id: nextTaskId(plan),
      key: taskKey(action, isPrimeY0 ? -1 : row.levelIndex),
      action: action,
      mode: playMode,
      levelIndex: isPrimeY0 ? -1 : row.levelIndex,
      levelLabel: isPrimeY0 ? "Y0" : row.levelLabel,
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
      window: emptyPlanWindow(),
      closedAt: null,
      closeReason: "",
      title: title,
      detail:
        (row.priorLabel || "") +
        " · " +
        row.stageLabel +
        (isOpen
          ? "；打满 " + MIN_OPEN_GAMES + " 局或 " + MIN_SUCCESS_ITEMS + " 题即激活"
          : " 准" + row.pPct + " n=" + row.n),
    };
  }

  function seedToTask(plan, seed) {
    if (seed.kind === "scan") return makeScanTask(plan, seed.scan);
    if (seed.kind === "open") return makeOpenTask(plan, seed.row);
    if (seed.kind === "wrongbook") return makeWrongbookTask(plan, plan._adviceCtx || {});
    if (seed.kind === "mode" || seed.kind === "mode_open") return makeModeTask(plan, seed);
    return makeTrainingTask(plan, seed.row);
  }

  function activateFirst(tasks) {
    var found = false;
    (tasks || []).forEach(function (t) {
      if (!t || isCooldownTask(t)) return;
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

  function stampDailyIssued(plan, ts) {
    if (!plan) return;
    plan.dailyIssuedDay = chinaDateKeyFromTs(ts) || "";
  }

  function needsDailyIssue(plan, nowTs) {
    var day = chinaDateKeyFromTs(nowTs);
    if (!day) return false;
    return !plan || plan.dailyIssuedDay !== day;
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
    fillIncomplete(plan, ctx, issuedAt, {
      keepExisting: false,
      reorderScan: true,
      appendNew: true,
    });
    stampDailyIssued(plan, issuedAt);
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

  function isTaskModeRun(run) {
    var m = run && run.trainingMeta && typeof run.trainingMeta === "object" ? run.trainingMeta : null;
    return !!(m && m.dailyTask === true);
  }

  /**
   * keepOpenBoard !== false（跑偏）：整份未完成保留（成功线已冻结），不补空位。
   * keepOpenBoard === false（日切/重新开单）：丢掉未完成，按热图重开。
   */
  function reissueIncomplete(plan, ctx, ts, text, keepOpenBoard) {
    var fullRebuild = keepOpenBoard === false;
    var done = trimDone(cooldownTasks(plan));
    var kept = [];
    if (!fullRebuild) {
      openTasks(plan).forEach(function (t) {
        kept.push(t);
      });
    }
    plan.tasks = done.concat(kept);
    if (ctx && ctx.profile) plan.profile = ctx.profile;
    if (ctx) {
      plan.pickNote = ctx.pickNote;
      var dont = dontOpenFrom(ctx.aheadNoData || []);
      plan.dontOpen = dont.labels;
      plan.dontOpenLabel = dont.copy;
    }
    fillIncomplete(plan, ctx, ts, {
      keepExisting: !fullRebuild,
      reorderScan: fullRebuild,
      appendNew: fullRebuild,
    });
    activateFirst(plan.tasks);
    pushEvent(
      plan,
      "rebuild",
      text ||
        (fullRebuild
          ? "重开未完成（冷却窗保留）"
          : "跑偏：未完成保留（成功线不改），不补空位；冷却窗保留"),
      ts
    );
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
    if (task.action === "wrongbook") return false;
    var mode = normalizeRunMode(run.mode);
    if (task.action === "training") {
      if (mode !== "training") return false;
      var lv = trainingLevelIndex(run);
      return lv != null && lv === task.levelIndex;
    }
    if (task.action === "level") return mode === "level";
    if (task.action === "primeComposite") {
      return mode === "primecomposite";
    }
    var want = normalizeRunMode(task.mode || task.action);
    if (mode !== want) return false;
    if (task.levelIndex == null) return true;
    var runLv =
      run.levelIndex != null && Number.isFinite(Number(run.levelIndex))
        ? Math.floor(Number(run.levelIndex))
        : trainingLevelIndex(run);
    if (runLv == null && run.startLevel != null && Number.isFinite(Number(run.startLevel))) {
      runLv = Math.floor(Number(run.startLevel));
    }
    return runLv != null && runLv === task.levelIndex;
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

  /** 仅补齐开单时缺失的速度基线；已有目标绝不改写。 */
  function captureBaselineAvgSec(task, run) {
    if (!task || task.successKind !== "speed_step") return;
    if (task.targetAvgSec != null) return;
    if (task.baseline && task.baseline.avgSec != null) {
      task.targetAvgSec = Number(task.baseline.avgSec) * SPEED_RATIO;
      return;
    }
    var m = run && run.trainingMeta && typeof run.trainingMeta === "object" ? run.trainingMeta : null;
    var start = m && Number.isFinite(Number(m.heatAvgSecAtStart)) ? Number(m.heatAvgSecAtStart) : null;
    if (start != null && start > 0) {
      if (!task.baseline) task.baseline = {};
      task.baseline.avgSec = start;
      task.targetAvgSec = start * SPEED_RATIO;
    }
  }

  function evaluateSuccess(task, run, stats) {
    if (isWrongbookSuccessKind(task.successKind)) return false;
    var sumLv =
      task.action === "training" ||
      (Modes && Modes.MODE_META && Modes.MODE_META[task.action] && !Modes.MODE_META[task.action].singlePool)
        ? task.levelIndex
        : null;
    /** 质数 Y0：整局统计（无分关）；开新/准/速与其它模式同口径 */
    if (task.action === "primeComposite") sumLv = null;
    stats = stats || summarizeRun(run, sumLv);
    if (task.successKind === "level_reach") {
      return passedScanTarget(run, task.scanLevelIndex);
    }
    if (task.successKind === "open_activate") return !!(stats && stats.n > 0);
    if (!stats || !stats.n) return false;
    if (task.successKind === "speed_step") {
      if (task.targetAvgSec == null || stats.avgSec == null) return false;
      if (stats.p == null || stats.p + 1e-9 < HEAT_P_YELLOW) return false;
      return Number(stats.avgSec) <= Number(task.targetAvgSec) + 1e-9;
    }
    if (stats.p == null) return false;
    return stats.p + 1e-9 >= HEAT_P_YELLOW;
  }

  /** Q8/Q9 已废：当日无限再试；不适合练的关靠次日整单重算换掉。 */
  function evaluateFail() {
    return "";
  }

  function settleWrongbookTasks(plan, ctx, nowTs, lastFollow, flags) {
    flags = flags || {};
    var sessionDone = flags.wrongbookSessionDone === true;
    var open = openTasks(plan);
    var i;
    for (i = 0; i < open.length; i += 1) {
      var t = open[i];
      if (!t || t.action !== "wrongbook") continue;
      if (!isWrongbookSuccessKind(t.successKind) && t.action !== "wrongbook") continue;
      /** 完成一次练习即成功；旧「全清」路径：可见错题已空也算成功。 */
      if (!sessionDone && (ctx.wrongAnswersVisible || 0) > 0) continue;
      pushEvent(
        plan,
        "follow",
        (t.title || "错题本") + (sessionDone ? " 成功（完成一次练习）" : " 成功（已清空）"),
        nowTs
      );
      if (lastFollow) {
        lastFollow.kind = "success";
        lastFollow.taskId = t.id || "";
      }
      closeTask(plan, t, "success", "success", nowTs);
      replan(plan, ctx, t, "success", nowTs);
      return true;
    }
    return false;
  }

  function applyFollow(task, run) {
    var day = chinaDateKeyFromTs(runTs(run));
    var sumLv =
      task.action === "training" ||
      (Modes && Modes.MODE_META && Modes.MODE_META[task.action] && !Modes.MODE_META[task.action].singlePool)
        ? task.levelIndex
        : null;
    var stats = summarizeRun(run, sumLv);
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
    if (evaluateSuccess(task, run, stats)) return "success";
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
      targetP: task.targetP,
      targetAvgSec: task.targetAvgSec,
      title: task.title || "",
      tileGoal: tileGoal(task),
      tileLabel: tileLabel(task),
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
        scanLevelLabel: h.scanLevelLabel || "",
        targetP: h.targetP,
        targetAvgSec: h.targetAvgSec,
        tileGoal: h.tileGoal || "",
        tileLabel: h.tileLabel || "",
        tileProgress: h.chinaDay || "",
        status: "success",
        completedAt: h.completedAt || null,
        chinaDay: h.chinaDay || "",
      });
    }
    return out;
  }

  function replan(plan, ctx, closedTask, reason, ts) {
    var day = chinaDateKeyFromTs(ts);
    if (closedTask && closedTask.status === "parked") {
      plan.tasks = (plan.tasks || []).filter(function (t) {
        return !t || t.id !== closedTask.id;
      });
    }
    if (reason === "success" && closedTask) {
      closedTask.status = "success";
      if (closedTask.completedAt == null) closedTask.completedAt = ts;
      if (!closedTask.chinaDay) closedTask.chinaDay = day;
      plan.tasks = (plan.tasks || []).filter(function (t) {
        if (!t) return false;
        if (t.id === closedTask.id) return true;
        if ((t.status === "active" || t.status === "pending") && t.key === closedTask.key) return false;
        return true;
      });
      rememberSuccess(plan, closedTask);
    } else if (reason === "fail" && closedTask) {
      closedTask.status = "fail";
      closedTask.window = emptyPlanWindow();
      closedTask.completedAt = null;
      if (!closedTask.chinaDay) closedTask.chinaDay = day;
    }
    /** 当日留牌：结案后不补新；次日首开/刷新整单重算。 */
    fillIncomplete(plan, ctx, ts, {
      keepExisting: true,
      reorderScan: false,
      appendNew: false,
    });
    var head = getActiveTask(plan);
    var openN = openTasks(plan).length;
    var boardClosed = todayClosedCount(plan, day);
    var coolN = (plan.tasks || []).filter(function (t) {
      return isCooldownTask(t) && t.chinaDay !== day;
    }).length;
    pushEvent(
      plan,
      "replan",
      (reason === "success" ? "成功留牌" : reason === "fail" ? "失败留牌" : "留牌") +
        "（当日不补）：当前 " +
        (head ? head.title || head.levelLabel : "无未完成") +
        "；未完成 " +
        openN +
        " · 今日留牌 " +
        boardClosed +
        "；冷却归档 " +
        coolN +
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
    } else if (status === "fail") {
      task.chinaDay = chinaDateKeyFromTs(ts);
    }
    pushEvent(
      plan,
      status === "success" ? "success" : "fail",
      (task.title || task.levelLabel) + (status === "success" ? " 成功" : " 失败（" + reason + "）"),
      ts
    );
  }

  function emptySnapshotPlan(username) {
    return {
      username: username || "",
      ruleVersion: RULE_VERSION,
      issuedAt: 0,
      lastProcessedTs: 0,
      nextId: 1,
      tasks: [],
      events: [],
      history: [],
    };
  }

  function syncPlan(saved, ctx, runs, nowTs, username, flags) {
    flags = flags || {};
    var plan;
    var rebuilt = false;
    var lastFollow = { kind: "none" };
    if (flags.snapshot) {
      if (!saved || (username && saved.username && saved.username !== username)) {
        return { plan: emptySnapshotPlan(username), rebuilt: false, lastFollow: lastFollow };
      }
      plan = cloneJson(saved);
      if (!Array.isArray(plan.tasks)) plan.tasks = [];
      if (!Array.isArray(plan.history)) plan.history = [];
      return { plan: plan, rebuilt: false, lastFollow: lastFollow };
    }
    if (!saved || (username && saved.username && saved.username !== username)) {
      plan = issuePlan(ctx, nowTs, username);
      plan.refreshedAt = nowTs;
      rebuilt = true;
      return { plan: plan, rebuilt: rebuilt, lastFollow: lastFollow };
    }
    plan = cloneJson(saved);
    if (!Array.isArray(plan.tasks)) plan.tasks = [];
    if (!STORE_FULL_HISTORY) plan.history = [];
    else if (!Array.isArray(plan.history)) plan.history = [];
    if (username) plan.username = username;
    activateFirst(plan.tasks);
    if (settleWrongbookTasks(plan, ctx, nowTs, lastFollow, flags)) {
      rebuilt = true;
    }
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
      var matched = findMatchingOpenTask(plan, run);
      if (matched) {
        var outcome = applyFollow(matched, run);
        var label = matched.title || matched.levelLabel;
        var fromTaskBtn = isTaskModeRun(run);
        if (outcome === "success") {
          pushEvent(plan, "follow", (fromTaskBtn ? "" : "碰巧完成：") + label + (fromTaskBtn ? " 成功" : ""), ts);
          lastFollow = { kind: fromTaskBtn ? "success" : "lucky", taskId: matched.id || "" };
          closeTask(plan, matched, "success", "success", ts);
          replan(plan, ctx, matched, "success", ts);
        } else if (outcome) {
          pushEvent(plan, "follow", label + " 失败（" + outcome + "）", ts);
          lastFollow = { kind: "fail", taskId: matched.id || "", reason: outcome };
          closeTask(plan, matched, "fail", outcome, ts);
          replan(plan, ctx, matched, "fail", ts);
        } else {
          pushEvent(plan, "follow", label + " 未达", ts);
          lastFollow = { kind: "pending", taskId: matched.id || "" };
        }
      } else {
        reissueIncomplete(
          plan,
          ctx,
          ts,
          "跑偏：未完成保留（成功线不改），不补空位；冷却窗保留"
        );
        lastFollow = { kind: "drift" };
        rebuilt = true;
      }
      plan.lastProcessedTs = ts;
    });
    var versionBump = plan.ruleVersion !== RULE_VERSION;
    if (versionBump) {
      plan.ruleVersion = RULE_VERSION;
      pushEvent(plan, "rebuild", "规则升级：只更新版本号，未完成不重排", nowTs);
    }
    /** 积压局已按旧五格跟完；再日切/重新开单。 */
    if (flags.resetIncomplete) {
      plan.ruleVersion = RULE_VERSION;
      reissueIncomplete(plan, ctx, nowTs, "重新开单：重算未完成（冷却窗保留）", false);
      stampDailyIssued(plan, nowTs);
      rebuilt = true;
    } else if (needsDailyIssue(plan, nowTs)) {
      plan.ruleVersion = RULE_VERSION;
      reissueIncomplete(
        plan,
        ctx,
        nowTs,
        "日切开单：先清积压后按最新情况重开未完成（一天一次）",
        false
      );
      stampDailyIssued(plan, nowTs);
      rebuilt = true;
    }
    activateFirst(plan.tasks);
    plan.refreshedAt = nowTs;
    return { plan: plan, rebuilt: rebuilt, lastFollow: lastFollow };
  }

  function planRefreshedToday(plan, nowTs) {
    var day = chinaDateKeyFromTs(nowTs);
    if (!day || !plan) return false;
    if (plan.dailyIssuedDay && plan.dailyIssuedDay === day) return true;
    if (plan.refreshedAt == null) return false;
    return chinaDateKeyFromTs(plan.refreshedAt) === day;
  }

  function firstOpenTrainingTask(plan) {
    var tasks = plan && plan.tasks ? plan.tasks : [];
    var i;
    for (i = 0; i < tasks.length; i += 1) {
      var t = tasks[i];
      if (!t || t.action !== "training") continue;
      if (t.status !== "active" && t.status !== "pending") continue;
      if (t.levelIndex == null || !Number.isFinite(Number(t.levelIndex))) continue;
      return t;
    }
    return null;
  }

  function firstPriorityTrainingRow(ctx) {
    if (!ctx) return null;
    ctx._cooldownSeq = ctx._cooldownSeq || [];
    var seeds = uniqueSeeds(ctx);
    var i;
    for (i = 0; i < seeds.length; i += 1) {
      var s = seeds[i];
      if (!s || (s.kind !== "training" && s.kind !== "open")) continue;
      if (!s.row || s.row.levelIndex == null) continue;
      return s.row;
    }
    return null;
  }

  /**
   * 训练默认关：今天刷新过任务单且还有未完成四则 → 列表里第一个；
   * 否则按四则黄橙优先顺序现算一关。不写任务单。
   */
  function recommendTrainingLevel(opts) {
    opts = opts || {};
    var nowTs = opts.nowTs != null && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var ctx = buildAdviceContext(opts);
    var plan = opts.savedPlan || null;
    if (planRefreshedToday(plan, nowTs)) {
      var open = firstOpenTrainingTask(plan);
      if (open) {
        return {
          ok: true,
          levelIndex: clampLevel(open.levelIndex),
          levelLabel: open.levelLabel || levelLabel(open.levelIndex),
          source: "open_task",
          reason: "task_open_training",
        };
      }
    }
    var row = firstPriorityTrainingRow(ctx);
    if (!row || row.levelIndex == null || !Number.isFinite(Number(row.levelIndex))) {
      return {
        ok: false,
        levelIndex: null,
        levelLabel: "",
        source: "advice_priority",
        reason: "no_training_level",
      };
    }
    var idx = clampLevel(row.levelIndex);
    return {
      ok: true,
      levelIndex: idx,
      levelLabel: row.levelLabel ? row.levelLabel : levelLabel(idx),
      source: "advice_priority",
      reason: planRefreshedToday(plan, nowTs) ? "task_arith_done" : "task_not_refreshed",
    };
  }

  function successCopy(task) {
    if (!task) return "";
    if (isWrongbookSuccessKind(task.successKind)) {
      return "成功：完成一次错题练习（做对的已清掉）";
    }
    if (task.successKind === "level_reach") {
      var lab = task.scanLevelLabel || levelLabel(task.scanLevelIndex);
      if (task.scanLevelIndex >= ARITH_PUBLIC_MAX_INDEX) {
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
        "成功：本局均速 ≤ " +
        (sec != null ? sec + "s" : "开单均速") +
        "，且本局准度 ≥ " +
        pctText(HEAT_P_YELLOW) +
        (tp != null ? "（对照 timePct→" + tp + "）" : "")
      );
    }
    return (
      "成功：本局准度 ≥ " +
      pctText(HEAT_P_YELLOW) +
      "（不是整格热图）"
    );
  }

  function failCopy(task) {
    if (task && isWrongbookSuccessKind(task.successKind)) {
      return "错题任务：再练一次也可；次日开单时按最新情况重排";
    }
    return "未达可继续尝试；次日进每日任务或管理页刷新时按最新情况重开";
  }

  function progressCopy(task) {
    if (!task || !task.window) return "";
    var w = task.window;
    var today = chinaDateKeyFromTs(Date.now());
    var todayN = (w.gamesByDay && w.gamesByDay[today]) || 0;
    var p = windowP(task);
    var bits = [
      "已试 " + (w.games || 0) + " 局",
      "今日 " + todayN + " 局",
      "任务窗 " + w.items + " 题" + (p != null ? " 准" + pctText(p) : ""),
    ];
    if (w.avgSec != null) bits.push("均速 " + roundSec(w.avgSec) + "s");
    return bits.join(" · ");
  }

  function untilCopy(task) {
    if (isWrongbookSuccessKind(task.successKind)) return "完成一次错题练习即成功";
    if (task.successKind === "level_reach") {
      if (task.scanKind === "retry_clear") return "通关 L16 即成功";
      return "通过 " + (task.scanLevelLabel || "") + " 即成功；在该关出局不算";
    }
    if (task.successKind === "open_activate") {
      return "开新关：打满 " + MIN_OPEN_GAMES + " 局或 " + MIN_SUCCESS_ITEMS + " 题即激活";
    }
    if (task.successKind === "speed_step") {
      var sec = roundSec(task.targetAvgSec);
      return "达到均速" + (sec != null ? "（≤" + sec + "s）" : "") + "，且准≥" + pctText(HEAT_P_YELLOW);
    }
    return "本局准度 ≥" + pctText(HEAT_P_YELLOW) + " 即成功";
  }

  function statusLabel(st) {
    if (st === "active") return "当前";
    if (st === "pending") return "排队";
    if (st === "success") return "已完成";
    if (st === "fail") return "失败";
    if (st === "parked") return "搁置";
    if (st === "cancelled") return "已取消";
    return st || "";
  }

  function tileLabel(t) {
    if (!t) return "";
    if (t.action === "wrongbook") return "错题";
    if (t.action === "level") return t.scanKind === "retry_clear" ? "冲榜" : "闯关";
    if (t.successKind === "open_activate") return "开" + (t.levelLabel || "");
    return t.levelLabel || t.title || "";
  }

  function tileGoal(t) {
    if (!t) return "";
    if (isWrongbookSuccessKind(t.successKind)) return "完成一次";
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
    return "准≥" + pctText(HEAT_P_YELLOW);
  }

  function tileProgress(t) {
    if (!t) return "";
    var w = t.window || emptyPlanWindow();
    var bits = [];
    if (t.status === "success") {
      if (t.chinaDay) bits.push(t.chinaDay);
      else bits.push("完成");
    } else if (t.status === "fail") {
      bits.push("失败");
      if (t.chinaDay) bits.push(t.chinaDay);
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
        id: t.id,
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
        windowP: windowP(t),
        windowAvgSec: t.window && t.window.avgSec != null ? roundSec(t.window.avgSec) : null,
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

  function isPrimeCompositeClearedRun(run) {
    if (!run) return false;
    if (run.cleared === true || run.perfect === true) return true;
    var score = Number(run.score);
    return Number.isFinite(score) && score >= PRIME_CLEAR_SCORE;
  }

  var PRIME_PLAYED_MIN_ATTEMPTS = 10;

  function runAttemptCountForPrime(r) {
    if (!r) return 0;
    if (Array.isArray(r.attempts)) return r.attempts.length;
    var n = Number(r.attemptCount);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  /** 有用户索引（fromIndex）时信索引；否则扫 runs（玩过=至少一局≥10题）。 */
  function detectPrimeFlags(runs, override) {
    if (override && (override.played === true || override.cleared === true || override.fromIndex === true)) {
      return { played: !!override.played, cleared: !!override.cleared };
    }
    var played = false;
    var cleared = false;
    (runs || []).forEach(function (r) {
      if (normalizeRunMode(r && r.mode) !== "primecomposite") return;
      if (runAttemptCountForPrime(r) >= PRIME_PLAYED_MIN_ATTEMPTS) played = true;
      if (isPrimeCompositeClearedRun(r)) cleared = true;
    });
    if (cleared) played = true;
    return { played: played, cleared: cleared };
  }

  function buildAdviceContext(opts) {
    opts = opts || {};
    var rows = buildRows(opts.grade, opts.cells);
    var profile = classifyProfile(rows);
    var clearBestSec =
      opts.levelClearBestSec != null && Number.isFinite(Number(opts.levelClearBestSec))
        ? Number(opts.levelClearBestSec)
        : null;
    var retry = retryClearInfo(rows, opts.runs, clearBestSec);
    var clearEstimate = clearEstimateInfo(rows, opts.runs, clearBestSec);
    var levelBestIndex = resolveLevelBestIndex(opts);
    var scanElevate =
      opts.hasClearedLevel !== true && foundationGreenThroughBest(rows, levelBestIndex);
    var scan = resolveScanTarget(rows, opts);
    if (opts.hasClearedLevel === true && retry && retry.improve) {
      scan = {
        levelIndex: ARITH_PUBLIC_MAX_INDEX,
        levelLabel: levelLabel(ARITH_PUBLIC_MAX_INDEX),
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
    var wrongVisible =
      opts.wrongAnswersVisible != null && Number.isFinite(Number(opts.wrongAnswersVisible))
        ? Math.max(0, Math.floor(Number(opts.wrongAnswersVisible)))
        : 0;
    var wrongMin = Modes && Modes.WRONGBOOK_MIN != null ? Modes.WRONGBOOK_MIN : 30;
    var modeCells = opts.modeCells && typeof opts.modeCells === "object" ? opts.modeCells : {};
    var modePacks = {};
    if (Modes) {
      ["decimal", "perfectSquare", "divisibility", "factorsMultiples"].forEach(function (id) {
        var packOpts = {};
        if (id === "factorsMultiples") {
          packOpts.y0Cell = modeCells.factorsMultiplesY0 || null;
        }
        var pack = buildModePack(id, opts.grade, modeCells[id] || [], packOpts);
        if (pack) modePacks[id] = pack;
      });
    }
    return {
      grade: opts.grade,
      rows: rows,
      profile: profile,
      scan: scan,
      hasClearedLevel: opts.hasClearedLevel === true,
      levelBestIndex: levelBestIndex,
      scanElevate: scanElevate,
      schoolHoles: groups.schoolHoles,
      aheadHoles: groups.aheadHoles,
      aheadNoData: groups.aheadNoData,
      aheadMastered: groups.aheadMastered,
      aheadThin: groups.aheadThin,
      schoolMastered: groups.schoolMastered,
      primaryRow: picked.primaryRow,
      pickNote: picked.pickNote,
      alternatives: picked.alternatives,
      retryClear: retry,
      clearEstimate: clearEstimate,
      wrongAnswersVisible: wrongVisible,
      wrongbookNeeded: wrongVisible >= wrongMin,
      wrongbookSticky: false,
      modePacks: modePacks,
      slotBudget: resolveSlotBudget(opts.grade, rows),
      arithFullyUnlocked: arithHeatmapFullyUnlocked(rows),
      arithUnfluent: arithUnfluentCount(rows),
      arithYellowOrange: arithYellowOrangeCount(rows),
      arithReserve: arithSlotReserve(rows),
    };
  }

  function computePracticeAdvice(opts) {
    opts = opts || {};
    var ctx = buildAdviceContext(opts);
    var nowTs = opts.nowTs != null && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var sync = syncPlan(opts.savedPlan || null, ctx, opts.runs || [], nowTs, opts.username || "", {
      resetIncomplete: opts.resetIncomplete === true,
      snapshot: opts.snapshot === true,
      wrongbookSessionDone: opts.wrongbookSessionDone === true,
    });
    var plan = sync.plan;
    var reasons = [];
    var unresolved = [
      "Q1 超前「会了」暂定 n≥" + AHEAD_MASTERED_N,
      "Q2 已学/同步黄橙永远压过超前；校内已激活均流畅（未过慢）后，超前里已有数据的黄橙（准度或速度）可进五格",
      "Q3 绿快底板暂定连续 " + FLOOR_MIN + " 档且 timePct<" + FAST_TIME_PCT,
      "Q5 闯关合格线：历史最高与热图连续准≥95%顶取 max（不计分位）；目标 Ln 须通过 Ln。无历史且 L1 不够 95% 时目标仍是 L1。不因热图变差把目标降到低于历史",
      "Q6 已废：准度任务本局≥" + Math.round(HEAT_P_YELLOW * 100) + "% 即成功，不再小步、不准写出低于 95% 的目标",
      "Q7 速度任务：本局均速 ≤ 基线 ×" + SPEED_RATIO + "（对照 timePct−" + SPEED_TIME_PCT_STEP + "），且本局准度≥" + Math.round(HEAT_P_YELLOW * 100) + "%。训练成功按本局判，不再多局平均",
      "Q8/Q9 已废：不靠失败次数结案；未达可无限再试，换项靠次日整单重算",
      "Q10 一条队列：未完成最多 " +
        INCOMPLETE_SIZE +
        " 条且不重复；黄橙优先，再按准度×地基加权速度×样本薄补已学流畅",
      "Q18 日配额：中国日历日「今日结案(成功+失败)+未完成」≤" +
        DAILY_TASK_QUOTA +
        "；结案当日留牌不补新。次日进每日任务或管理页刷新：先清积压再整单重开（一天一次）。无补空格",
      "Q11 同 key 默认隔 " +
        SAME_TASK_GAP +
        " 条才可再出现；冷却窗最多 " +
        COMPLETED_MAX +
        " 条（成功+失败），满则挤最早。规则升级不拆未完成；跑偏保留未完成（成功线冻结）不补空；日切/重新开单才重算未完成。都不清冷却。凑不满五格才破例，破例关排队尾",
      "Q12 绿档速度补格：timePct<" +
        FOUNDATION_FAST_PCT +
        " 只比分位；否则 ×" +
        FOUNDATION_RATIO +
        "^本线 rem（L16=0；加减含 L17+）",
      "Q13 黄橙与热图二维上色对齐：橙=准<90%或timePct≥" +
        HEAT_PCT_PLUS1 +
        "；黄=准<95%或timePct≥" +
        FAST_TIME_PCT +
        "。洞分=rem×" +
        HOLE_REM_WEIGHT +
        "+(100−准%)×" +
        HOLE_ACC_WEIGHT +
        "+分位×" +
        HOLE_SPEED_WEIGHT +
        "（v0.54；准×5 分位×2；因倍 Y0=质数 rem+1；顶台 L13–L16 rem=0；L17+ 负）",
      "Q14 已激活校内均流畅（准≥95%且未过慢，与模式梯子同）才开一档已学/同步空关；其后可排超前里已有数据的黄橙；空关不开；多模式同此。偏慢黄档不挡开新。四则未流畅关先占座（与概览 fluent 相同），其它模式只坐剩余格。质数合数=因倍 Y0（五年级起；不挡四年级推 Y1+）。Q17 错题≥30；L1–L16 全激活后才考虑其它模式；生存/拆括号不进。v0.55：特殊/小数仅当仍有校内黄橙或可开新才年级硬留；绿补跨模式比 fillerScore",
      "Q15 已通关（平台型与底板型相同）：热图预估全通≤纪录×" +
        SCAN_CLEAR_IMPROVE +
        " 才再排冲榜闯关（每关10题均速×" +
        SCAN_CLEAR_OVERHEAD +
        "）；不走≤n前置，有洞时占第二格",
      "Q16 未完成 1～5 对上就跟局（记尝试/成功），不限队头；点任务按钮和首页碰巧同一套。训练成功按本局准度/均速对照目标。非任务入口当场成功称碰巧完成。放弃局整局不算。任务局不重算五格；名单外跑偏：未完成整份保留（成功线冻结），不补空。规则升级不拆队、不改成功线；日切/重新开单才丢掉未完成进度"
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
              "（连续准度顶与历史最高取 max，不计分位）" +
              (ctx.scanElevate
                ? "；L1～原纪录全绿，闯关提到训练前"
                : "；默认垫后，有空格才上"),
            "v0.50：种子流不按 ≤n 拆开；全绿提权见 R-scan-elevate"
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
    var schoolReady = canScheduleAheadHoles(ctx.rows || []);
    ctx.aheadThin.forEach(function (r) {
      if (schoolReady && aheadHoleEligible(r)) return;
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
          "school_fluent_open",
          "校内已激活均流畅（未过慢），安排开新关 " + (openRow ? openRow.levelLabel : ""),
          "Q14：与模式梯子同口径；超前无数据仍不开；闯关留下数据即当老关"
        )
      );
    }
    if (schoolReady && ctx.aheadHoles && ctx.aheadHoles.length) {
      var aheadHole = pickWorstHole(ctx.aheadHoles);
      reasons.push(
        reason(
          "R-ahead-hole",
          "school_fluent_ahead_hole",
          "校内已激活均流畅（未过慢），超前黄橙可进队 " +
            (aheadHole
              ? aheadHole.levelLabel + " · " + aheadHole.stageLabel + " 准" + aheadHole.pPct
              : ""),
          "Q14：超前有数据的黄橙在校内流畅后可练；空关不开；不抬档案年级"
        )
      );
    }
    reasons.push(
      reason(
        "R-plan",
        "hybrid_task_list",
        "一条队列：未完成最多 " +
          INCOMPLETE_SIZE +
          " 条且不重复（黄橙按洞分；未通关闯关默认垫后，全绿快可提权）。同 key 默认隔 " +
          SAME_TASK_GAP +
          " 条；冷却窗最多 " +
          COMPLETED_MAX +
          " 条（成功+失败）。凑不满五格才破例，破例关排队尾。1～5 对上就跟局；未达可再试；成功当日留牌不补；次日整单重开。跑偏保留未完成（成功线冻结）不补空",
        "Q8/Q9 已废；Q16 1～5 都能跟局/碰巧完成；日切一天一次",
      )
    );

    var queue = tasksToQueue(plan);
    var openQueue = queue.filter(function (step) {
      return step.status === "active" || step.status === "pending";
    });
    var active = getActiveTask(plan);

    var title = "";
    var parentCopy = "";
    var detail = "";
    var todayKeyAdvice = chinaDateKeyFromTs(nowTs);
    var todayBoardN = todayClosedCount(plan, todayKeyAdvice);
    var archiveCoolN = (plan.tasks || []).filter(function (t) {
      return isCooldownTask(t) && t.chinaDay !== todayKeyAdvice;
    }).length;
    if (!active && !openQueue.length) {
      if (todayBoardN > 0) {
        title = "今日任务已完成";
        parentCopy = "今日 " + todayBoardN + " 条已留牌；明天进任务或刷新时按最新情况重开。";
        detail = parentCopy;
      } else {
        title = "暂无主建议";
        parentCopy = "热图或年级信号不足，无法按当前规则给出任务单。";
        detail = parentCopy;
      }
    } else {
      title =
        (ctx.profile.id === "skill_gaps" ? "弱项任务单" : "平台任务单") +
        " · 未完成 " +
        openQueue.length +
        " · 今日留牌 " +
        todayBoardN +
        " / 冷却 " +
        archiveCoolN;
      parentCopy =
        ctx.profile.label +
        "。未完成 1～5 对上就跟局；开出后成功线冻结；未达可再试；成功当日留牌不补；次日进任务或刷新时整单重开；首页碰巧同一套；放弃局整局不算；名单外跑偏保留未完成不补空。";
      if (plan.dontOpenLabel) parentCopy += " 不要开 " + plan.dontOpenLabel + "。";
      detail = active ? active.detail : "";
    }

    return {
      ruleVersion: RULE_VERSION,
      todayKey: chinaDateKeyFromTs(nowTs),
      grade: ctx.grade,
      profile: ctx.profile,
      scanTarget: ctx.scan,
      lastFollow: sync.lastFollow || { kind: "none" },
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
      provisional: {
        Q1_aheadMasteredN: AHEAD_MASTERED_N,
        Q2_schoolHolesBeatAhead: true,
        Q3_floorMin: FLOOR_MIN,
        Q3_fastTimePct: FAST_TIME_PCT,
        Q5_scanPassNotReach: true,
        Q6_accStep: ACC_STEP,
        Q7_speedRatio: SPEED_RATIO,
        Q8_failGamesPerDay: null,
        Q9_failPracticeDays: null,
        Q10_incompleteSize: INCOMPLETE_SIZE,
        Q18_dailyTaskQuota: DAILY_TASK_QUOTA,
        Q18_sameDayKeepClosedNoFill: true,
        Q18_dailyFullReissue: true,
        Q11_sameTaskGap: SAME_TASK_GAP,
        Q11_completedMax: COMPLETED_MAX,
        Q12_foundationFastPct: FOUNDATION_FAST_PCT,
        Q12_foundationRatio: FOUNDATION_RATIO,
        Q13_holeFoundationStep: HOLE_FOUNDATION_STEP,
        Q13_heatPctPlus1: HEAT_PCT_PLUS1,
        Q14_openWhenSchoolGreen: true,
        Q14_openWhenSchoolFluent: true,
        Q14_aheadHolesWhenSchoolGreen: true,
        Q14_aheadHolesWhenSchoolFluent: true,
        Q17_wrongbookMin: Modes && Modes.WRONGBOOK_MIN != null ? Modes.WRONGBOOK_MIN : 30,
        Q17_multiModeSlots: true,
        Q17_arithFullyUnlockedForReserve: true,
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
    LEVEL_COUNT: LEVEL_COUNT,
    ARITH_CONTENT_MAX_INDEX: ARITH_CONTENT_MAX_INDEX,
    ARITH_PUBLIC_LEVEL_COUNT: ARITH_PUBLIC_LEVEL_COUNT,
    ARITH_PUBLIC_MAX_INDEX: ARITH_PUBLIC_MAX_INDEX,
    ARITH_TOTAL_LEVEL_COUNT: ARITH_TOTAL_LEVEL_COUNT,
    INCOMPLETE_SIZE: INCOMPLETE_SIZE,
    DAILY_TASK_QUOTA: DAILY_TASK_QUOTA,
    COMPLETED_MAX: COMPLETED_MAX,
    needsDailyIssue: needsDailyIssue,
    todayClosedCount: todayClosedCount,
    countTodaySlotSpend: countTodaySlotSpend,
    maxOpenForDay: maxOpenForDay,
    SAME_TASK_GAP: SAME_TASK_GAP,
    SCAN_CLEAR_IMPROVE: SCAN_CLEAR_IMPROVE,
    FOUNDATION_FAST_PCT: FOUNDATION_FAST_PCT,
    FOUNDATION_RATIO: FOUNDATION_RATIO,
    HOLE_FOUNDATION_STEP: HOLE_FOUNDATION_STEP,
    HOLE_REM_WEIGHT: HOLE_REM_WEIGHT,
    HOLE_ACC_WEIGHT: HOLE_ACC_WEIGHT,
    HOLE_SPEED_WEIGHT: HOLE_SPEED_WEIGHT,
    HOLE_LEVEL_WEIGHT: HOLE_LEVEL_WEIGHT,
    HOLE_UNFLUENT_BAND: HOLE_UNFLUENT_BAND,
    curriculumPrior: curriculumPrior,
    classifyStage: classifyStage,
    classifyProfile: classifyProfile,
    heatBand: heatBand,
    foundationRemaining: foundationRemaining,
    modeFoundationRemaining: modeFoundationRemaining,
    foundationRemainingForRow: foundationRemainingForRow,
    fillerScore: fillerScore,
    holeScore: holeScore,
    successKindForRow: successKindForRow,
    schoolActivatedReady: schoolActivatedReady,
    nextOpenableRow: nextOpenableRow,
    heatmapIsEmpty: heatmapIsEmpty,
    arithHeatmapFullyUnlocked: arithHeatmapFullyUnlocked,
    canScheduleOpenNew: canScheduleOpenNew,
    canScheduleAheadHoles: canScheduleAheadHoles,
    aheadHoleEligible: aheadHoleEligible,
    arithUnfluentCount: arithUnfluentCount,
    resolveLevelBestIndex: resolveLevelBestIndex,
    foundationGreenThroughBest: foundationGreenThroughBest,
    resolveScanTarget: resolveScanTarget,
    passedScanTarget: passedScanTarget,
    estimateClearSec: estimateClearSec,
    bestClearedLevelSec: bestClearedLevelSec,
    formatAdviceClock: formatAdviceClock,
    computePracticeAdvice: computePracticeAdvice,
    recommendTrainingLevel: recommendTrainingLevel,
    historyToClientList: historyToClientList,
    chinaDateKeyFromTs: chinaDateKeyFromTs,
    PRIOR_LABEL: PRIOR_LABEL,
    Modes: Modes,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JmlPracticeAdvice = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
