/**
 * 局后写入当月能力快照：只重算本局所属热图类别并 merge；
 * progress 对齐学员概览各模式水位（不含训练熟悉格数、不含徽章）。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");
const {
  inferPrimeMasteredFromRun,
  PRIME_MASTERED_TARGET,
  PRIME_RANKING_MAX_WRONG,
} = require("./achievements/evaluators");

const DEFAULT_CAP_MS = 60 * 1000;
const LEVEL_MAX_INDEX = 15;
const PS_MAX_LEVEL = 3;
const DECIMAL_MAX_LEVEL = 5;
const DIV_MAX_LEVEL = 4;
const DIV_PERFECT_LEVEL_INDEX = 4;
const FM_MAX_LEVEL = 5;
const EXPAND_MAX_LEVEL = 4;
const PROGRESS_VERSION = 2;

function normalizeRunMode(mode) {
  return String(mode || "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

/** @returns {string|null} heatmap category id */
function categoryIdFromRunMode(mode) {
  const m = normalizeRunMode(mode);
  if (m === "survival" || m === "level" || m === "training") return "arithmetic";
  if (m === "perfectsquare") return "perfectSquare";
  if (m === "divisibility") return "divisibility";
  if (m === "factorsmultiples") return "factorsMultiples";
  if (m === "decimal") return "decimal";
  return null;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avgSecFromMeanLn(meanLn) {
  if (meanLn == null || !Number.isFinite(Number(meanLn))) return null;
  const sec = Math.exp(Number(meanLn)) / 1000;
  if (!(sec > 0) || !(sec < 600) || !Number.isFinite(sec)) return null;
  return Math.round(sec * 1000) / 1000;
}

function slimCell(c) {
  if (!c || typeof c !== "object") return null;
  const meanLn = numOrNull(c.meanLnCorrect);
  return {
    levelIndex: Math.max(0, Math.floor(Number(c.levelIndex) || 0)),
    active: !!c.active,
    n: Math.max(0, Math.floor(Number(c.n) || 0)),
    p: numOrNull(c.p),
    timePct: numOrNull(c.timePct),
    meanLnCorrect: meanLn,
    avgSec: avgSecFromMeanLn(meanLn),
    tooSlow: c.tooSlow === true ? true : c.tooSlow === false ? false : null,
    accurate: !!c.accurate,
    fluent: !!c.fluent,
  };
}

function slimCategoryBlock(heat) {
  const cells = heat && Array.isArray(heat.cells) ? heat.cells : [];
  return {
    cells: cells.map(slimCell).filter(Boolean),
    levelCount: heat && heat.levelCount != null ? heat.levelCount : cells.length,
    cohortLoaded: !!(heat && heat.cohortLoaded),
  };
}

function formatCompactRunTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? m + "m " + r + "s" : m + "m";
}

function emptyMark() {
  return { stage: "none", label: null, levelIndex: null, timeSec: null };
}

function rankingBetter(a, b) {
  if (!a) return false;
  if (!b) return true;
  const ta = Number(a.survivalTimeSec) || 0;
  const tb = Number(b.survivalTimeSec) || 0;
  if (ta !== tb) return ta < tb;
  const wa = Number(a.wrongCount) || 0;
  const wb = Number(b.wrongCount) || 0;
  if (wa !== wb) return wa < wb;
  return (Number(a.ts) || 0) < (Number(b.ts) || 0);
}

function bestClearedRankingFromRuns(runs, mode) {
  const want = normalizeRunMode(mode);
  let best = null;
  (runs || []).forEach(function (r) {
    if (!r || r.abandoned === true || r.comboOnly === true) return;
    if (normalizeRunMode(r.mode) !== want) return;
    if (r.cleared !== true) return;
    const sec = Number(r.survivalTimeSec) || 0;
    if (!(sec > 0)) return;
    const entry = {
      survivalTimeSec: sec,
      wrongCount: Number(r.wrongCount) || 0,
      ts: Number(r.ts) || 0,
    };
    if (rankingBetter(entry, best)) best = entry;
  });
  return best;
}

function maxLevelFromRuns(runs, mode) {
  const want = normalizeRunMode(mode);
  let best = -1;
  (runs || []).forEach(function (r) {
    if (!r || normalizeRunMode(r.mode) !== want) return;
    const ml = Number(r.maxLevel);
    if (Number.isFinite(ml) && Math.floor(ml) > best) best = Math.floor(ml);
    const li = Number(r.levelIndex);
    if (Number.isFinite(li) && Math.floor(li) > best) best = Math.floor(li);
  });
  return best;
}

function hasModeRun(runs, mode) {
  const want = normalizeRunMode(mode);
  return (runs || []).some(function (r) {
    return r && normalizeRunMode(r.mode) === want;
  });
}

function hasClearedMode(runs, mode) {
  const want = normalizeRunMode(mode);
  return (runs || []).some(function (r) {
    return r && normalizeRunMode(r.mode) === want && r.cleared === true;
  });
}

/** 闯关 / 生存：用时 → 通关 → Lx（与学员概览同序） */
function buildClearClimbProgress(runs, mode, userFlagCleared) {
  const rank = bestClearedRankingFromRuns(runs, mode);
  if (rank && rank.survivalTimeSec > 0) {
    return {
      stage: "timed",
      label: formatCompactRunTime(rank.survivalTimeSec),
      levelIndex: null,
      timeSec: Math.floor(rank.survivalTimeSec),
    };
  }
  const cleared = userFlagCleared === true || hasClearedMode(runs, mode);
  if (cleared) {
    return {
      stage: "cleared",
      label: "通关",
      levelIndex: null,
      timeSec: null,
    };
  }
  if (!hasModeRun(runs, mode)) return emptyMark();
  const best = maxLevelFromRuns(runs, mode);
  if (best < 0) return emptyMark();
  const idx = Math.min(LEVEL_MAX_INDEX, Math.max(0, best));
  return {
    stage: "climbing",
    label: "L" + (idx + 1),
    levelIndex: idx,
    timeSec: null,
  };
}

function unlockFromUser(user, unlockedKey, currentKey) {
  const u = user && typeof user === "object" ? user : {};
  if (typeof u[unlockedKey] === "number" && Number.isFinite(u[unlockedKey])) {
    return Math.floor(u[unlockedKey]);
  }
  if (typeof u[currentKey] === "number" && Number.isFinite(u[currentKey])) {
    return Math.floor(u[currentKey]);
  }
  return 0;
}

function unlockEstimateFromRuns(runs, mode) {
  const best = maxLevelFromRuns(runs, mode);
  return best < 0 ? 0 : best;
}

/**
 * 阶梯模式：UnlockedMax → Ln/Dn/Yn 或通关。
 * preferUserUnlock：局后写入用用户文档；重建历史月用 runs 估计（避免污染）。
 */
function buildLadderProgress(opts) {
  const runs = opts.runs;
  const mode = opts.mode;
  const maxLevelIndex = opts.maxLevelIndex;
  const prefix = opts.prefix;
  const userUnlocked = Math.max(0, Math.floor(Number(opts.userUnlocked) || 0));
  const fromRuns = unlockEstimateFromRuns(runs, mode);
  const unlocked = opts.preferUserUnlock ? Math.max(userUnlocked, fromRuns) : fromRuns;

  if (!hasModeRun(runs, mode) && unlocked <= 0) return emptyMark();
  if (unlocked > maxLevelIndex) {
    return {
      stage: "cleared",
      label: "通关",
      levelIndex: null,
      timeSec: null,
      unlockedMax: unlocked,
    };
  }
  const u = Math.min(maxLevelIndex, Math.max(0, unlocked));
  return {
    stage: "climbing",
    label: prefix + (u + 1),
    levelIndex: u,
    timeSec: null,
    unlockedMax: unlocked,
  };
}

function bestPrimeTimeFromRuns(runs) {
  let best = null;
  (runs || []).forEach(function (r) {
    if (!r) return;
    const mastered = inferPrimeMasteredFromRun(r);
    if (mastered < PRIME_MASTERED_TARGET) return;
    const sec = Number(r.survivalTimeSec) || 0;
    if (!(sec > 0)) return;
    const wrong = Number(r.wrongCount) || 0;
    if (wrong > PRIME_RANKING_MAX_WRONG) return;
    const entry = { survivalTimeSec: sec, wrongCount: wrong, ts: Number(r.ts) || 0 };
    if (rankingBetter(entry, best)) best = entry;
  });
  return best;
}

function bestDivPerfectFromRuns(runs) {
  let best = null;
  (runs || []).forEach(function (r) {
    if (!r || normalizeRunMode(r.mode) !== "divisibility") return;
    if (r.abandoned === true || r.comboOnly === true) return;
    if ((Number(r.wrongCount) || 0) !== 0) return;
    if (Math.floor(Number(r.maxLevel) || -1) !== DIV_PERFECT_LEVEL_INDEX) return;
    const sec = Number(r.survivalTimeSec) || 0;
    if (!(sec > 0)) return;
    const entry = { survivalTimeSec: sec, wrongCount: 0, ts: Number(r.ts) || 0 };
    if (!best || sec < best.survivalTimeSec || (sec === best.survivalTimeSec && entry.ts < best.ts)) {
      best = entry;
    }
  });
  return best;
}

function buildDivisibilityProgress(runs, userUnlocked, preferUserUnlock) {
  const perfect = bestDivPerfectFromRuns(runs);
  if (perfect && perfect.survivalTimeSec > 0) {
    return {
      stage: "timed",
      label: formatCompactRunTime(perfect.survivalTimeSec),
      levelIndex: null,
      timeSec: Math.floor(perfect.survivalTimeSec),
      unlockedMax: Math.max(DIV_MAX_LEVEL + 1, unlockEstimateFromRuns(runs, "divisibility")),
    };
  }
  return buildLadderProgress({
    runs: runs,
    mode: "divisibility",
    maxLevelIndex: DIV_MAX_LEVEL,
    prefix: "Z",
    userUnlocked: userUnlocked,
    preferUserUnlock: preferUserUnlock,
  });
}

/**
 * @param {object} opts
 * @param {object} [opts.user]
 * @param {array} opts.runs 截至 asOf 的 runs
 * @param {boolean} [opts.preferUserUnlock=true] 局后 true；历史重建 false
 */
function buildProgressSnapshot(opts) {
  opts = opts || {};
  const user = opts.user && typeof opts.user === "object" ? opts.user : {};
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const preferUserUnlock = opts.preferUserUnlock !== false;

  const level = buildClearClimbProgress(
    runs,
    "level",
    preferUserUnlock && user.hasClearedLevel === true
  );
  if (preferUserUnlock && typeof user.levelChallengeBestLevel === "number" && level.stage === "climbing") {
    const ub = Math.floor(user.levelChallengeBestLevel);
    if (Number.isFinite(ub) && ub > (level.levelIndex == null ? -1 : level.levelIndex)) {
      const idx = Math.min(LEVEL_MAX_INDEX, Math.max(0, ub));
      level.levelIndex = idx;
      level.label = "L" + (idx + 1);
    }
  }

  const survival = buildClearClimbProgress(
    runs,
    "survival",
    preferUserUnlock && user.hasClearedSurvival === true
  );

  const primeBest = bestPrimeTimeFromRuns(runs);
  const prime = primeBest
    ? {
        stage: "timed",
        label: formatCompactRunTime(primeBest.survivalTimeSec),
        levelIndex: null,
        timeSec: Math.floor(primeBest.survivalTimeSec),
      }
    : emptyMark();

  return {
    version: PROGRESS_VERSION,
    level: level,
    survival: survival,
    prime: prime,
    perfectSquare: buildLadderProgress({
      runs: runs,
      mode: "perfectSquare",
      maxLevelIndex: PS_MAX_LEVEL,
      prefix: "L",
      userUnlocked: unlockFromUser(user, "levelPerfectSquareUnlockedMax", "levelPerfectSquareCurrentLevel"),
      preferUserUnlock: preferUserUnlock,
    }),
    decimal: buildLadderProgress({
      runs: runs,
      mode: "decimal",
      maxLevelIndex: DECIMAL_MAX_LEVEL,
      prefix: "D",
      userUnlocked: unlockFromUser(user, "levelDecimalUnlockedMax", "levelDecimalCurrentLevel"),
      preferUserUnlock: preferUserUnlock,
    }),
    divisibility: buildDivisibilityProgress(
      runs,
      unlockFromUser(user, "levelDivisibilityUnlockedMax", "levelDivisibilityCurrentLevel"),
      preferUserUnlock
    ),
    factorsMultiples: buildLadderProgress({
      runs: runs,
      mode: "factorsMultiples",
      maxLevelIndex: FM_MAX_LEVEL,
      prefix: "Y",
      userUnlocked: unlockFromUser(
        user,
        "levelFactorsMultiplesUnlockedMax",
        "levelFactorsMultiplesCurrentLevel"
      ),
      preferUserUnlock: preferUserUnlock,
    }),
    expandBrackets: buildLadderProgress({
      runs: runs,
      mode: "expandBrackets",
      maxLevelIndex: EXPAND_MAX_LEVEL,
      prefix: "L",
      userUnlocked: unlockFromUser(
        user,
        "levelExpandBracketsUnlockedMax",
        "levelExpandBracketsCurrentLevel"
      ),
      preferUserUnlock: preferUserUnlock,
    }),
  };
}

/** @deprecated 兼容旧调用名；无 runs 时仅用用户文档估阶梯水位 */
function progressFromUser(user) {
  return buildProgressSnapshot({ user: user, runs: [], preferUserUnlock: true });
}

function buildOneCategorySlim(opts) {
  opts = opts || {};
  const categoryId = opts.categoryId;
  if (!categoryId) return { ok: false, error: "no_category" };

  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return { ok: false, error: (e && e.message) || "heatmap module unavailable" };
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.getHeatmapCategory !== "function") {
    return { ok: false, error: "heatmap API incomplete" };
  }

  const cat = HM.getHeatmapCategory(categoryId);
  if (!cat) return { ok: false, error: "unknown_category" };

  const cohorts = opts.cohortsByCategory && typeof opts.cohortsByCategory === "object" ? opts.cohortsByCategory : {};
  const cohortRaw = cohorts[categoryId];
  const cohort = cohortRaw && cohortRaw.ok ? cohortRaw : null;
  const capMs =
    cohort && Number(cohort.timeSpentMsCap) > 0 ? Number(cohort.timeSpentMsCap) : DEFAULT_CAP_MS;
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const heat = HM.buildHeatmapCells({
    runs: Array.isArray(opts.runs) ? opts.runs : [],
    cohort: cohort,
    modes: cat.modes,
    levelCount: cat.levelCount,
    maxTimeSpentMs: capMs,
    nowTs: nowMs,
  });
  return {
    ok: true,
    categoryId: categoryId,
    block: slimCategoryBlock(heat),
  };
}

/**
 * @param {object} deps
 * @param {{ upsertMonth: Function, chinaMonthKeyFromTs: Function }} deps.store
 * @param {() => object} deps.cohortsByCategory
 */
function createMonthlySnapshotWriter(deps) {
  const store = deps.store;
  const cohortsByCategory = deps.cohortsByCategory;

  function upsertAfterRun(opts) {
    opts = opts || {};
    const username = String(opts.username || "");
    const user = opts.user;
    const runs = Array.isArray(opts.runs) ? opts.runs : [];
    const runTs = Number(opts.runTs) || Date.now();
    const mode = opts.mode;
    if (!username || !store) return { ok: false, error: "no_user" };

    const monthKey = store.chinaMonthKeyFromTs(runTs);
    if (!monthKey) return { ok: false, error: "bad_month" };

    const progress = buildProgressSnapshot({
      user: user,
      runs: runs,
      preferUserUnlock: true,
    });
    const categoryId = categoryIdFromRunMode(mode);
    let heatmapPatch = null;

    if (categoryId) {
      const one = buildOneCategorySlim({
        categoryId: categoryId,
        runs: runs,
        cohortsByCategory: typeof cohortsByCategory === "function" ? cohortsByCategory() : {},
        nowMs: runTs,
      });
      if (!one.ok) {
        return { ok: false, error: one.error || "heatmap_failed", monthKey: monthKey, categoryId: categoryId };
      }
      heatmapPatch = {};
      heatmapPatch[categoryId] = one.block;
    }

    return store.upsertMonth(username, monthKey, {
      lastRunTs: runTs,
      heatmapPatch: heatmapPatch,
      progress: progress,
    });
  }

  /**
   * 用现有 runs 按「每月每类末局」重建快照。
   * progress：各模式水位按该月末局 asOf 从 runs 倒推（阶梯解锁不读「今天」用户文档）。
   */
  function rebuildUserFromRuns(opts) {
    opts = opts || {};
    const username = String(opts.username || "");
    const user = opts.user;
    const runsIn = Array.isArray(opts.runs) ? opts.runs : [];
    if (!username || !store) return { ok: false, error: "no_user" };

    const sorted = runsIn
      .map(function (r) {
        return r && typeof r === "object" ? r : null;
      })
      .filter(Boolean)
      .slice()
      .sort(function (a, b) {
        return (Number(a.ts) || 0) - (Number(b.ts) || 0);
      });

    const lastByMonth = {};
    const lastByMonthCat = {};
    sorted.forEach(function (run) {
      const ts = Number(run.ts) || 0;
      if (!ts) return;
      const mk = store.chinaMonthKeyFromTs(ts);
      if (!mk) return;
      if (lastByMonth[mk] == null || ts >= lastByMonth[mk]) lastByMonth[mk] = ts;
      const cat = categoryIdFromRunMode(run.mode);
      if (!cat) return;
      if (!lastByMonthCat[mk]) lastByMonthCat[mk] = {};
      const prev = lastByMonthCat[mk][cat];
      if (!prev || ts >= prev.ts) lastByMonthCat[mk][cat] = { ts: ts };
    });

    const monthKeys = Object.keys(lastByMonth).sort();
    if (!monthKeys.length) {
      return { ok: true, username: username, monthsWritten: 0, categoryWrites: 0 };
    }

    const cohorts = typeof cohortsByCategory === "function" ? cohortsByCategory() : {};
    let monthsWritten = 0;
    let categoryWrites = 0;
    const errors = [];

    monthKeys.forEach(function (mk) {
      const monthEndTs = lastByMonth[mk];
      const runsAsOfMonth = sorted.filter(function (r) {
        return (Number(r.ts) || 0) <= monthEndTs;
      });
      const progress = buildProgressSnapshot({
        user: user,
        runs: runsAsOfMonth,
        preferUserUnlock: false,
      });

      const patch = {};
      const cats = lastByMonthCat[mk] || {};
      Object.keys(cats).forEach(function (catId) {
        const endTs = cats[catId].ts;
        const runsCut = sorted.filter(function (r) {
          return (Number(r.ts) || 0) <= endTs;
        });
        const one = buildOneCategorySlim({
          categoryId: catId,
          runs: runsCut,
          cohortsByCategory: cohorts,
          nowMs: endTs,
        });
        if (!one.ok) {
          errors.push(mk + "/" + catId + ": " + (one.error || "fail"));
          return;
        }
        patch[catId] = one.block;
        categoryWrites += 1;
      });
      store.upsertMonth(username, mk, {
        lastRunTs: monthEndTs,
        heatmapPatch: patch,
        replaceHeatmap: true,
        progress: progress,
      });
      monthsWritten += 1;
    });

    return {
      ok: errors.length === 0,
      username: username,
      monthsWritten: monthsWritten,
      categoryWrites: categoryWrites,
      errors: errors,
    };
  }

  return {
    categoryIdFromRunMode: categoryIdFromRunMode,
    progressFromUser: progressFromUser,
    buildProgressSnapshot: buildProgressSnapshot,
    buildOneCategorySlim: buildOneCategorySlim,
    upsertAfterRun: upsertAfterRun,
    rebuildUserFromRuns: rebuildUserFromRuns,
  };
}

module.exports = {
  createMonthlySnapshotWriter,
  categoryIdFromRunMode,
  progressFromUser,
  buildProgressSnapshot,
  slimCell,
  slimCategoryBlock,
  buildOneCategorySlim,
};
