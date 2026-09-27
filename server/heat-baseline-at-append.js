/**
 * 入库前开局加权速：用「本局写入前」的既有 runs 建热图，写入 trainingMeta。
 * 覆盖 training / decimal / perfectSquare / divisibility Z1–Z4。
 * 客户端 heatAvgSecAtStart 不再作权威；可保留为 heat*AtStartClient 诊断。
 */
const heatmapStats = require("./stats-heatmap");

const ARITH_LEVEL_COUNT = 16;
const DECIMAL_LEVEL_COUNT = 6;
const PERFECT_SQUARE_LEVEL_COUNT = 4;
const DIVISIBILITY_HEAT_LEVEL_COUNT = 4;
const DEFAULT_CAP_MS = 60 * 1000;

function normalizeRunMode(mode) {
  return String(mode || "survival")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function secFromMeanLn(meanLn) {
  if (meanLn == null || !Number.isFinite(Number(meanLn))) return null;
  const sec = Math.exp(Number(meanLn)) / 1000;
  if (!(sec > 0 && sec < 600 && Number.isFinite(sec))) return null;
  return Math.round(sec * 10) / 10;
}

/** @returns {{ modes: string[], levelCount: number, cohortKey: string } | null} */
function resolveHeatTarget(mode) {
  const m = normalizeRunMode(mode);
  if (m === "training") {
    return {
      modes: ["survival", "level", "training"],
      levelCount: ARITH_LEVEL_COUNT,
      cohortKey: "arithmetic",
    };
  }
  if (m === "decimal") {
    return {
      modes: ["decimal"],
      levelCount: DECIMAL_LEVEL_COUNT,
      cohortKey: "decimal",
    };
  }
  if (m === "perfectsquare") {
    return {
      modes: ["perfectSquare"],
      levelCount: PERFECT_SQUARE_LEVEL_COUNT,
      cohortKey: "perfectSquare",
    };
  }
  if (m === "divisibility") {
    return {
      modes: ["divisibility"],
      levelCount: DIVISIBILITY_HEAT_LEVEL_COUNT,
      cohortKey: "divisibility",
    };
  }
  return null;
}

function resolveRawPickedLevel(runEntry) {
  const tm = runEntry && runEntry.trainingMeta;
  if (tm && Number.isFinite(Number(tm.pickedLevel))) {
    return Math.floor(Number(tm.pickedLevel));
  }
  if (runEntry && runEntry.maxLevel != null && Number.isFinite(Number(runEntry.maxLevel))) {
    return Math.floor(Number(runEntry.maxLevel));
  }
  return null;
}

function resolvePickedLevel(runEntry, levelCount) {
  const lc = levelCount > 0 ? levelCount : ARITH_LEVEL_COUNT;
  const raw = resolveRawPickedLevel(runEntry);
  if (raw == null) return 0;
  return Math.max(0, Math.min(lc - 1, raw));
}

function cellMeanLnCorrect(heat, levelIndex) {
  if (!heat || !Array.isArray(heat.cells)) return null;
  const cell =
    heat.cells.find((c) => c && c.levelIndex === levelIndex) || heat.cells[levelIndex] || null;
  if (!cell || cell.meanLnCorrect == null || !Number.isFinite(Number(cell.meanLnCorrect))) return null;
  return Number(cell.meanLnCorrect);
}

/**
 * @param {object} opts
 * @param {object} opts.runEntry 即将写入的局（会被原地改 trainingMeta）
 * @param {array} opts.existingRuns 写入前该用户全部 runs（不含本局）
 * @param {object} [opts.cohortsByCategory] { arithmetic, decimal, perfectSquare, divisibility }
 * @returns {{ applied: boolean, reason?: string, heatAvgSecAtStart?: number|null }}
 */
function attachHeatBaselineBeforeWrite(opts) {
  opts = opts || {};
  const runEntry = opts.runEntry;
  if (!runEntry || typeof runEntry !== "object") {
    return { applied: false, reason: "no_run" };
  }

  const target = resolveHeatTarget(runEntry.mode);
  if (!target) return { applied: false, reason: "mode_skip" };

  const rawLv = resolveRawPickedLevel(runEntry);
  // 整除 Z5（index≥4）：不写开局速度权威字段（勿先按热图 4 档夹紧）
  if (
    normalizeRunMode(runEntry.mode) === "divisibility" &&
    rawLv != null &&
    rawLv >= DIVISIBILITY_HEAT_LEVEL_COUNT
  ) {
    return { applied: false, reason: "div_z5_skip" };
  }

  const lv = resolvePickedLevel(runEntry, target.levelCount);

  if (!runEntry.trainingMeta || typeof runEntry.trainingMeta !== "object") {
    runEntry.trainingMeta = {};
  }
  const tm = runEntry.trainingMeta;

  // 客户端快照降级为诊断，不覆盖服务端权威字段
  if (tm.heatAvgSecAtStart != null && tm.heatAvgSecAtStartClient == null) {
    tm.heatAvgSecAtStartClient = tm.heatAvgSecAtStart;
  }
  if (tm.heatMeanLnAtStart != null && tm.heatMeanLnAtStartClient == null) {
    tm.heatMeanLnAtStartClient = tm.heatMeanLnAtStart;
  }

  const cohorts = opts.cohortsByCategory || {};
  const cohort = cohorts[target.cohortKey] || null;
  const capMs =
    cohort && Number(cohort.timeSpentMsCap) > 0 ? Number(cohort.timeSpentMsCap) : DEFAULT_CAP_MS;

  let heat = null;
  try {
    heat = heatmapStats.buildHeatmapCells({
      runs: Array.isArray(opts.existingRuns) ? opts.existingRuns : [],
      cohort: cohort && cohort.ok !== false ? cohort : null,
      modes: target.modes,
      levelCount: target.levelCount,
      maxTimeSpentMs: capMs,
      minAttempts: 10,
      nowTs: Date.now(),
    });
  } catch (e) {
    tm.heatMeanLnAtStart = null;
    tm.heatAvgSecAtStart = null;
    tm.heatBaselineSource = "server_pre_append_error";
    return { applied: false, reason: "heat_error", heatAvgSecAtStart: null };
  }

  const meanLn = cellMeanLnCorrect(heat, lv);
  const avgSec = secFromMeanLn(meanLn);
  tm.heatMeanLnAtStart = meanLn;
  tm.heatAvgSecAtStart = avgSec;
  tm.heatBaselineSource = "server_pre_append";
  if (tm.pickedLevel == null || !Number.isFinite(Number(tm.pickedLevel))) {
    tm.pickedLevel = lv;
  }

  return {
    applied: true,
    heatAvgSecAtStart: avgSec,
    heatMeanLnAtStart: meanLn,
    pickedLevel: lv,
  };
}

module.exports = {
  attachHeatBaselineBeforeWrite,
  resolveHeatTarget,
  resolvePickedLevel,
  secFromMeanLn,
  ARITH_LEVEL_COUNT,
  DECIMAL_LEVEL_COUNT,
  PERFECT_SQUARE_LEVEL_COUNT,
  DIVISIBILITY_HEAT_LEVEL_COUNT,
};
