/**
 * 小数刷选 / 整除通关后选关（服务器权威，与浏览器旧本地逻辑同函数）。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const DEFAULT_CAP_MS = 60 * 1000;
const DEFAULT_DECIMAL_MAX = 5; // D1–D6 → index 0–5；页面 decMaxLevel 可能更严
const DEFAULT_DIV_PLAYABLE_MAX = 4; // Z1–Z5 可玩；热图 4 档

function buildCategoryHeat(HM, runs, cohort, categoryId) {
  const cat = HM.getHeatmapCategory ? HM.getHeatmapCategory(categoryId) : null;
  const levelCount =
    cat && cat.levelCount > 0
      ? cat.levelCount
      : categoryId === "divisibility"
        ? HM.DIVISIBILITY_LEVEL_COUNT || 4
        : categoryId === "decimal"
          ? HM.DECIMAL_LEVEL_COUNT || 6
          : 16;
  const modes = cat && cat.modes ? cat.modes : [categoryId];
  const capMs =
    cohort && Number(cohort.timeSpentMsCap) > 0 ? Number(cohort.timeSpentMsCap) : DEFAULT_CAP_MS;
  const heat = HM.buildHeatmapCells({
    runs: runs || [],
    cohort: cohort && cohort.ok ? cohort : null,
    modes: modes,
    levelCount: levelCount,
    maxTimeSpentMs: capMs,
  });
  return { heat, levelCount, modes, capMs };
}

/**
 * @param {object} opts
 * @param {Array} opts.runs
 * @param {object|null} opts.cohort decimal cohort
 * @param {number} opts.poolMax 已解锁池上限（含）
 * @param {number} [opts.playableMax] 可玩最高关 index，默认 5
 */
function computeDecimalBrushLevel(opts) {
  opts = opts || {};
  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return { ok: false, error: (e && e.message) || "heatmap unavailable" };
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }
  if (typeof HM.recommendUnlockedWeightedBrush !== "function") {
    return { ok: false, error: "recommendUnlockedWeightedBrush missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_DECIMAL_MAX;
  const { heat, levelCount } = buildCategoryHeat(HM, opts.runs, opts.cohort, "decimal");
  const poolMax = Math.max(
    0,
    Math.min(playableMax, levelCount - 1, Math.floor(Number(opts.poolMax) || 0))
  );
  const pick = HM.recommendUnlockedWeightedBrush(heat, poolMax);
  if (!pick || pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) {
    return {
      ok: true,
      levelIndex: null,
      reason: "no_pick",
      poolMax,
      heat,
    };
  }
  const levelIndex = Math.max(0, Math.min(poolMax, Math.floor(Number(pick.levelIndex))));
  return {
    ok: true,
    levelIndex,
    reason: pick.reason || "brush",
    poolMax,
    heat,
  };
}

/**
 * @param {object} opts
 * @param {Array} opts.runs
 * @param {object|null} opts.cohort
 * @param {number} opts.unlockedMax 含通关位（> playableMax 表示已通关）
 * @param {number} [opts.playableMax] 可玩最高关 index，默认 4（Z5）
 */
function computeDivisibilityPostClearLevel(opts) {
  opts = opts || {};
  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return { ok: false, error: (e && e.message) || "heatmap unavailable" };
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_DIV_PLAYABLE_MAX;
  const unlockedMax = Math.floor(Number(opts.unlockedMax) || 0);
  if (unlockedMax <= playableMax) {
    return {
      ok: true,
      levelIndex: null,
      reason: "not_cleared",
      cleared: false,
      playableMax,
      unlockedMax,
    };
  }

  const { heat } = buildCategoryHeat(HM, opts.runs, opts.cohort, "divisibility");
  const pick =
    typeof HM.recommendDivisibilityPostClearLevel === "function"
      ? HM.recommendDivisibilityPostClearLevel(heat)
      : null;
  if (!pick || pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) {
    return {
      ok: true,
      levelIndex: null,
      reason: "no_pick",
      cleared: true,
      playableMax,
      unlockedMax,
      heat,
    };
  }
  const levelIndex = Math.max(0, Math.min(playableMax, Math.floor(Number(pick.levelIndex))));
  return {
    ok: true,
    levelIndex,
    reason: pick.reason || "div_post_clear",
    cleared: true,
    playableMax,
    unlockedMax,
    heat,
  };
}

module.exports = {
  computeDecimalBrushLevel,
  computeDivisibilityPostClearLevel,
};
