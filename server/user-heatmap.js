/**
 * 按分类为学员构建热图格子（权威：server/stats-heatmap-browser.js）。
 * 供学员端 / 管理端展示；与训练选关共用同一 buildHeatmapCells。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const DEFAULT_CAP_MS = 60 * 1000;

/**
 * @param {object} opts
 * @param {Array} opts.runs
 * @param {object} opts.cohortsByCategory { arithmetic, decimal, perfectSquare, divisibility }
 * @param {number} [opts.nowMs]
 * @returns {{ ok: boolean, byCategory: object, categories: Array, error?: string }}
 */
function buildUserHeatmapsByCategory(opts) {
  opts = opts || {};
  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return {
      ok: false,
      error: (e && e.message) || "heatmap module unavailable",
      byCategory: {},
      categories: [],
    };
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.getHeatmapCategories !== "function") {
    return { ok: false, error: "heatmap API incomplete", byCategory: {}, categories: [] };
  }

  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cohorts = opts.cohortsByCategory && typeof opts.cohortsByCategory === "object" ? opts.cohortsByCategory : {};
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const cats = HM.getHeatmapCategories();
  const byCategory = {};

  cats.forEach(function (cat) {
    const cohortRaw = cohorts[cat.id];
    const cohort = cohortRaw && cohortRaw.ok ? cohortRaw : null;
    const capMs =
      cohort && Number(cohort.timeSpentMsCap) > 0 ? Number(cohort.timeSpentMsCap) : DEFAULT_CAP_MS;
    const heat = HM.buildHeatmapCells({
      runs: runs,
      cohort: cohort,
      modes: cat.modes,
      levelCount: cat.levelCount,
      maxTimeSpentMs: capMs,
      nowTs: nowMs,
    });
    const cells = (heat && heat.cells) || [];
    // 附带上色 style，前端可纯展示
    const cellsWithStyle = cells.map(function (c) {
      const style =
        typeof HM.heatmapCellInlineStyle === "function" ? HM.heatmapCellInlineStyle(c) || "" : "";
      return Object.assign({}, c, { cellStyle: style });
    });
    byCategory[cat.id] = {
      category: {
        id: cat.id,
        modes: cat.modes,
        levelCount: cat.levelCount,
        levelPrefix: cat.levelPrefix,
        labelKey: cat.labelKey,
        labelFallback: cat.labelFallback,
        cohortKind: cat.cohortKind,
      },
      heat: Object.assign({}, heat, { cells: cellsWithStyle }),
      cohortLoaded: !!(heat && heat.cohortLoaded),
      timeSpentMsCap: capMs,
    };
  });

  return {
    ok: true,
    byCategory: byCategory,
    categories: cats.map(function (c) {
      return {
        id: c.id,
        modes: c.modes,
        levelCount: c.levelCount,
        levelPrefix: c.levelPrefix,
        labelKey: c.labelKey,
        labelFallback: c.labelFallback,
      };
    }),
  };
}

module.exports = {
  buildUserHeatmapsByCategory,
};
