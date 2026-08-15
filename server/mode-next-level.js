/**
 * 小数 / 整除 / 平方数选关（服务器权威）。
 *
 * 解锁（局内 special-mode）：0/1 错开下一档，不看热图。
 * 选关：不看上一局 0/1 错——未通关看梯子顶热图流畅；通关后刷弱项。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const DEFAULT_CAP_MS = 60 * 1000;
const DEFAULT_DECIMAL_MAX = 5; // D1–D6 → index 0–5
const DEFAULT_DIV_PLAYABLE_MAX = 4; // Z1–Z5 可玩；热图 4 档
const DEFAULT_PS_MAX = 3; // L1–L4 → index 0–3

function clampInt(n, lo, hi) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(lo, Math.min(hi, v));
}

function buildCategoryHeat(HM, runs, cohort, categoryId) {
  const cat = HM.getHeatmapCategory ? HM.getHeatmapCategory(categoryId) : null;
  const levelCount =
    cat && cat.levelCount > 0
      ? cat.levelCount
      : categoryId === "divisibility"
        ? HM.DIVISIBILITY_LEVEL_COUNT || 4
        : categoryId === "decimal"
          ? HM.DECIMAL_LEVEL_COUNT || 6
          : categoryId === "perfectSquare"
            ? HM.PERFECT_SQUARE_LEVEL_COUNT || 4
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

function loadHeatmapModule() {
  try {
    return { ok: true, HM: getJmlStatsHeatmap() };
  } catch (e) {
    return { ok: false, error: (e && e.message) || "heatmap unavailable" };
  }
}

/**
 * 通关前梯子选关。
 */
function pickLadderBeforeClear(HM, opts) {
  const playableMax = opts.playableMax;
  const unlockedMax = opts.unlockedMax;
  const categoryId = opts.categoryId;
  const mode = opts.mode || categoryId;
  const { heat } = buildCategoryHeat(HM, opts.runs, opts.cohort, categoryId);

  if (typeof HM.recommendSpecialModeLadderLevel !== "function") {
    const U = Math.min(unlockedMax, playableMax);
    return {
      ok: true,
      levelIndex: U,
      reason: "ladder_fallback_unlock_tip",
      mode: "frontier",
      cleared: false,
      unlockedMax,
      playableMax,
      ladderTop: null,
      heat,
    };
  }

  const pick = HM.recommendSpecialModeLadderLevel({
    cellsResult: heat,
    unlockedMax,
    playableMax,
    runs: opts.runs,
    mode,
  });
  const levelIndex = Math.max(
    0,
    Math.min(playableMax, Math.floor(Number(pick && pick.levelIndex) || 0))
  );
  return {
    ok: true,
    levelIndex,
    reason: (pick && pick.reason) || "ladder",
    mode: "frontier",
    cleared: false,
    unlockedMax,
    playableMax,
    ladderTop: pick && pick.ladderTop != null ? pick.ladderTop : null,
    unlockedPlayable: pick && pick.unlockedPlayable != null ? pick.unlockedPlayable : null,
    heat,
  };
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
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
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
 * 小数模式下一关：未通关 → 梯子顶热图；通关后 → 全池刷弱项。
 */
function computeDecimalNextLevel(opts) {
  opts = opts || {};
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_DECIMAL_MAX;
  const clearedUnlock = playableMax + 1;
  const unlockedMax = clampInt(opts.unlockedMax, 0, clearedUnlock);
  const currentLevel = clampInt(opts.currentLevel, 0, playableMax);

  if (unlockedMax <= playableMax) {
    return pickLadderBeforeClear(HM, {
      runs: opts.runs,
      cohort: opts.cohort,
      unlockedMax,
      playableMax,
      categoryId: "decimal",
      mode: "decimal",
    });
  }

  const brush = computeDecimalBrushLevel({
    runs: opts.runs,
    cohort: opts.cohort,
    poolMax: playableMax,
    playableMax,
  });
  if (!brush.ok) return brush;
  if (brush.levelIndex == null) {
    return {
      ok: true,
      levelIndex: currentLevel,
      reason: "current_fallback",
      mode: "brush",
      cleared: true,
      unlockedMax,
      playableMax,
      poolMax: playableMax,
    };
  }
  return {
    ok: true,
    levelIndex: brush.levelIndex,
    reason: brush.reason || "cleared_brush",
    mode: "brush",
    cleared: true,
    unlockedMax,
    playableMax,
    poolMax: brush.poolMax,
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
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
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

/**
 * 整除模式下一关：未通关 → 梯子顶热图；通关后 → post-clear 刷弱项。
 */
function computeDivisibilityNextLevel(opts) {
  opts = opts || {};
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_DIV_PLAYABLE_MAX;
  const clearedUnlock = playableMax + 1;
  const unlockedMax = clampInt(opts.unlockedMax, 0, clearedUnlock);
  const currentLevel = clampInt(opts.currentLevel, 0, playableMax);

  if (unlockedMax <= playableMax) {
    return pickLadderBeforeClear(HM, {
      runs: opts.runs,
      cohort: opts.cohort,
      unlockedMax,
      playableMax,
      categoryId: "divisibility",
      mode: "divisibility",
    });
  }

  const post = computeDivisibilityPostClearLevel({
    runs: opts.runs,
    cohort: opts.cohort,
    unlockedMax,
    playableMax,
  });
  if (!post.ok) return post;
  if (post.levelIndex == null) {
    return {
      ok: true,
      levelIndex: currentLevel,
      reason: post.reason || "current_fallback",
      mode: "brush",
      cleared: true,
      unlockedMax,
      playableMax,
    };
  }
  return {
    ok: true,
    levelIndex: post.levelIndex,
    reason: post.reason || "cleared_brush",
    mode: "brush",
    cleared: true,
    unlockedMax,
    playableMax,
  };
}

/**
 * 平方数解锁池刷选（通关后）。
 */
function computePerfectSquareBrushLevel(opts) {
  opts = opts || {};
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }
  if (typeof HM.recommendUnlockedWeightedBrush !== "function") {
    return { ok: false, error: "recommendUnlockedWeightedBrush missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_PS_MAX;
  const { heat, levelCount } = buildCategoryHeat(HM, opts.runs, opts.cohort, "perfectSquare");
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
 * 平方数模式下一关：未通关 → 梯子顶热图；通关后 → 全池刷弱项。
 */
function computePerfectSquareNextLevel(opts) {
  opts = opts || {};
  const loaded = loadHeatmapModule();
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const HM = loaded.HM;
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { ok: false, error: "buildHeatmapCells missing" };
  }

  const playableMax =
    opts.playableMax != null && Number.isFinite(Number(opts.playableMax))
      ? Math.max(0, Math.floor(Number(opts.playableMax)))
      : DEFAULT_PS_MAX;
  const clearedUnlock = playableMax + 1;
  const unlockedMax = clampInt(opts.unlockedMax, 0, clearedUnlock);
  const currentLevel = clampInt(opts.currentLevel, 0, playableMax);

  if (unlockedMax <= playableMax) {
    return pickLadderBeforeClear(HM, {
      runs: opts.runs,
      cohort: opts.cohort,
      unlockedMax,
      playableMax,
      categoryId: "perfectSquare",
      mode: "perfectSquare",
    });
  }

  const brush = computePerfectSquareBrushLevel({
    runs: opts.runs,
    cohort: opts.cohort,
    poolMax: playableMax,
    playableMax,
  });
  if (!brush.ok) return brush;
  if (brush.levelIndex == null) {
    return {
      ok: true,
      levelIndex: currentLevel,
      reason: "current_fallback",
      mode: "brush",
      cleared: true,
      unlockedMax,
      playableMax,
      poolMax: playableMax,
    };
  }
  return {
    ok: true,
    levelIndex: brush.levelIndex,
    reason: brush.reason || "cleared_brush",
    mode: "brush",
    cleared: true,
    unlockedMax,
    playableMax,
    poolMax: brush.poolMax,
  };
}

/**
 * 从 user 档案字段组装三类特殊模式推荐（不含四则）。
 * @param {object} opts
 * @param {object} opts.user
 * @param {Array} opts.runs
 * @param {object} opts.cohorts { decimal, perfectSquare, divisibility }
 */
function computeSpecialCategoryNextLevels(opts) {
  opts = opts || {};
  const user = opts.user || {};
  const runs = opts.runs || [];
  const cohorts = opts.cohorts || {};

  const decimal = computeDecimalNextLevel({
    runs,
    cohort: cohorts.decimal || null,
    unlockedMax:
      typeof user.levelDecimalUnlockedMax === "number" ? user.levelDecimalUnlockedMax : 0,
    currentLevel:
      typeof user.levelDecimalCurrentLevel === "number" ? user.levelDecimalCurrentLevel : 0,
  });
  const perfectSquare = computePerfectSquareNextLevel({
    runs,
    cohort: cohorts.perfectSquare || null,
    unlockedMax:
      typeof user.levelPerfectSquareUnlockedMax === "number"
        ? user.levelPerfectSquareUnlockedMax
        : 0,
    currentLevel:
      typeof user.levelPerfectSquareCurrentLevel === "number"
        ? user.levelPerfectSquareCurrentLevel
        : 0,
  });
  const divisibility = computeDivisibilityNextLevel({
    runs,
    cohort: cohorts.divisibility || null,
    unlockedMax:
      typeof user.levelDivisibilityUnlockedMax === "number"
        ? user.levelDivisibilityUnlockedMax
        : 0,
    currentLevel:
      typeof user.levelDivisibilityCurrentLevel === "number"
        ? user.levelDivisibilityCurrentLevel
        : 0,
  });

  return {
    ok: true,
    byCategory: {
      decimal,
      perfectSquare,
      divisibility,
    },
  };
}

module.exports = {
  DEFAULT_DECIMAL_MAX,
  DEFAULT_DIV_PLAYABLE_MAX,
  DEFAULT_PS_MAX,
  computeDecimalBrushLevel,
  computeDecimalNextLevel,
  computeDivisibilityPostClearLevel,
  computeDivisibilityNextLevel,
  computePerfectSquareBrushLevel,
  computePerfectSquareNextLevel,
  computeSpecialCategoryNextLevels,
};
