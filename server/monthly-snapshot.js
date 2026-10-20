/**
 * 局后写入当月能力快照：只重算本局所属热图类别并 merge；进度水位整份覆盖。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const DEFAULT_CAP_MS = 60 * 1000;

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

function progressFromUser(user) {
  const u = user && typeof user === "object" ? user : {};
  function lv(key, fallback) {
    const n = Number(u[key]);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }
  return {
    levelTrainingCurrentLevel: lv("levelTrainingCurrentLevel", -1),
    levelChallengeBestLevel: lv("levelChallengeBestLevel", 0),
    levelPerfectSquareCurrentLevel: lv("levelPerfectSquareCurrentLevel", 0),
    levelPerfectSquareUnlockedMax: lv("levelPerfectSquareUnlockedMax", 0),
    levelDecimalCurrentLevel: lv("levelDecimalCurrentLevel", 0),
    levelDecimalUnlockedMax: lv("levelDecimalUnlockedMax", 0),
    levelDivisibilityCurrentLevel: lv("levelDivisibilityCurrentLevel", 0),
    levelDivisibilityUnlockedMax: lv("levelDivisibilityUnlockedMax", 0),
    levelFactorsMultiplesCurrentLevel: lv("levelFactorsMultiplesCurrentLevel", 0),
    levelFactorsMultiplesUnlockedMax: lv("levelFactorsMultiplesUnlockedMax", 0),
    levelExpandBracketsCurrentLevel: lv("levelExpandBracketsCurrentLevel", 0),
    levelExpandBracketsUnlockedMax: lv("levelExpandBracketsUnlockedMax", 0),
    hasClearedLevel: u.hasClearedLevel === true,
    hasClearedSurvival: u.hasClearedSurvival === true,
    survivalUnlocked: u.survivalUnlocked === true,
    trainingL16Cleared: u.trainingL16Cleared === true,
    heatmapL16Passed: u.heatmapL16Passed === true,
  };
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

    const progress = progressFromUser(user);
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
   * 用现有 runs 按「每月每类末局」重建快照（与局后单类重算同一套 buildOneCategorySlim）。
   * progress 使用当前用户文档（历史水位无法完美还原）。
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

    const cohorts =
      typeof cohortsByCategory === "function" ? cohortsByCategory() : {};
    const progress = progressFromUser(user);
    let monthsWritten = 0;
    let categoryWrites = 0;
    const errors = [];

    monthKeys.forEach(function (mk) {
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
        lastRunTs: lastByMonth[mk],
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
    buildOneCategorySlim: buildOneCategorySlim,
    upsertAfterRun: upsertAfterRun,
    rebuildUserFromRuns: rebuildUserFromRuns,
  };
}

module.exports = {
  createMonthlySnapshotWriter,
  categoryIdFromRunMode,
  progressFromUser,
  slimCell,
  slimCategoryBlock,
  buildOneCategorySlim,
};
