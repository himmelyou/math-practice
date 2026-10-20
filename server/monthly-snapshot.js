/**
 * 局后写入当月能力快照：整表重算热图（slim）+ 解锁水位。
 */
const { buildUserHeatmapsByCategory } = require("./user-heatmap");

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

function slimHeatmapByCategory(byCategory) {
  const out = {};
  if (!byCategory || typeof byCategory !== "object") return out;
  Object.keys(byCategory).forEach(function (catId) {
    const block = byCategory[catId];
    const heat = block && block.heat ? block.heat : block;
    const cells = heat && Array.isArray(heat.cells) ? heat.cells : [];
    out[catId] = {
      cells: cells.map(slimCell).filter(Boolean),
      levelCount: heat && heat.levelCount != null ? heat.levelCount : cells.length,
      cohortLoaded: !!(heat && heat.cohortLoaded),
    };
  });
  return out;
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
    if (!username || !store) return { ok: false, error: "no_user" };

    const monthKey = store.chinaMonthKeyFromTs(runTs);
    if (!monthKey) return { ok: false, error: "bad_month" };

    const built = buildUserHeatmapsByCategory({
      runs: runs,
      cohortsByCategory: typeof cohortsByCategory === "function" ? cohortsByCategory() : {},
      nowMs: runTs,
    });
    if (!built || !built.ok) {
      return { ok: false, error: (built && built.error) || "heatmap_failed", monthKey: monthKey };
    }

    const heatmap = slimHeatmapByCategory(built.byCategory);
    const progress = progressFromUser(user);
    return store.upsertMonth(username, monthKey, {
      lastRunTs: runTs,
      heatmap: heatmap,
      progress: progress,
    });
  }

  return {
    slimHeatmapByCategory,
    progressFromUser,
    upsertAfterRun,
  };
}

module.exports = {
  createMonthlySnapshotWriter,
  slimHeatmapByCategory,
  progressFromUser,
  slimCell,
};
