/**
 * 兼容入口：热图算法真源为 server/stats-heatmap-browser.js（经 load-jml-stats-heatmap）。
 * 勿在此文件再实现一套 buildHeatmapCells。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

function HM() {
  return getJmlStatsHeatmap();
}

function buildHeatmapCells(opts) {
  return HM().buildHeatmapCells(opts);
}

function filterArithmeticRuns(runs) {
  return HM().filterArithmeticRuns(runs);
}

function isHeatmapLevelPassed(cellsResult, levelIndex, minP) {
  if (typeof HM().isHeatmapLevelPassed === "function") {
    return HM().isHeatmapLevelPassed(cellsResult, levelIndex, minP);
  }
  const cells = (cellsResult && cellsResult.cells) || [];
  const k = Math.max(0, Math.min(15, Math.floor(Number(levelIndex) || 0)));
  const cell = cells.find((c) => c && c.levelIndex === k) || cells[k];
  if (!cell || !cell.active) return false;
  if (cell.fluent === true) return true;
  if (cell.fluent === false) return false;
  const p = cell.p;
  if (p == null || !Number.isFinite(p)) return false;
  return p >= (Number(minP) || 0.95);
}

function personalWeightedByLevel() {
  return HM().personalWeightedByLevel.apply(null, arguments);
}

function percentileFromQuantileSummary() {
  return HM().percentileFromQuantileSummary.apply(null, arguments);
}

function percentileFromMeanSd() {
  return HM().percentileFromMeanSd.apply(null, arguments);
}

module.exports = {
  get LEVEL_COUNT() {
    return HM().LEVEL_COUNT;
  },
  get MS_PER_DAY() {
    return HM().MS_PER_DAY;
  },
  get PERSONAL_WINDOW_ATTEMPTS() {
    return HM().PERSONAL_WINDOW_ATTEMPTS;
  },
  get PERSONAL_HALF_LIFE_DAYS() {
    return HM().PERSONAL_HALF_LIFE_DAYS;
  },
  filterArithmeticRuns,
  personalWeightedByLevel,
  buildHeatmapCells,
  isHeatmapLevelPassed,
  percentileFromQuantileSummary,
  percentileFromMeanSd,
};
