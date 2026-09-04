/**
 * 临时：按报表与本局均速统一口径回填 trainingMeta.runMeanLn / runAvgSec。
 * 覆盖：training / decimal / perfectSquare / divisibility Z1–Z4。
 * 仅答对、几何均、timeSpentMs > cap 剔除。用完后可删本文件与对应 admin 路由。
 */
const DEFAULT_CAP_MS = 60 * 1000;
const ARITH_LEVEL_COUNT = 16;
const DECIMAL_LEVEL_COUNT = 6;
const PERFECT_SQUARE_LEVEL_COUNT = 4;
const DIVISIBILITY_HEAT_LEVEL_COUNT = 4; // Z1–Z4；Z5 不回填

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

function meanLnGeoFromAttempts(attempts, levelIndex, capMs, levelCount) {
  const cap = Number(capMs) > 0 ? Number(capMs) : DEFAULT_CAP_MS;
  const lc = levelCount > 0 ? levelCount : ARITH_LEVEL_COUNT;
  const filterLevel = levelIndex != null && Number.isFinite(Number(levelIndex));
  const lv = filterLevel
    ? Math.max(0, Math.min(lc - 1, Math.floor(Number(levelIndex))))
    : null;
  let sum = 0;
  let n = 0;
  const list = Array.isArray(attempts) ? attempts : [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a || a.correct !== true) continue;
    if (filterLevel) {
      const aLv = Math.max(0, Math.min(lc - 1, Math.floor(Number(a.levelIndex) || 0)));
      if (aLv !== lv) continue;
    }
    const ms = Number(a.timeSpentMs);
    if (!(ms > 0 && ms <= cap && Number.isFinite(ms))) continue;
    sum += Math.log(ms);
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

/** @returns {{ mode: string, levelCount: number } | null} */
function resolveSpeedBackfillTarget(run) {
  const m = normalizeRunMode(run && run.mode);
  if (m === "training") return { mode: "training", levelCount: ARITH_LEVEL_COUNT };
  if (m === "decimal") return { mode: "decimal", levelCount: DECIMAL_LEVEL_COUNT };
  if (m === "perfectsquare") return { mode: "perfectSquare", levelCount: PERFECT_SQUARE_LEVEL_COUNT };
  if (m === "divisibility") {
    const meta = run.trainingMeta;
    let lv = null;
    if (meta && Number.isFinite(Number(meta.pickedLevel))) lv = Math.floor(Number(meta.pickedLevel));
    else if (run.maxLevel != null && Number.isFinite(Number(run.maxLevel))) lv = Math.floor(Number(run.maxLevel));
    // Z5 = index 4：不回填
    if (lv != null && lv >= DIVISIBILITY_HEAT_LEVEL_COUNT) return null;
    return { mode: "divisibility", levelCount: DIVISIBILITY_HEAT_LEVEL_COUNT };
  }
  return null;
}

function resolvePickedLevel(run, levelCount) {
  const lc = levelCount > 0 ? levelCount : ARITH_LEVEL_COUNT;
  const m = run.trainingMeta;
  if (m && Number.isFinite(Number(m.pickedLevel))) {
    return Math.max(0, Math.min(lc - 1, Math.floor(Number(m.pickedLevel))));
  }
  if (run.maxLevel != null && Number.isFinite(Number(run.maxLevel))) {
    return Math.max(0, Math.min(lc - 1, Math.floor(Number(run.maxLevel))));
  }
  return null;
}

function backfillTrainingRunSpeedInRunsData(runsData, opts) {
  opts = opts || {};
  const capMs = Number(opts.capMs) > 0 ? Number(opts.capMs) : DEFAULT_CAP_MS;
  const dryRun = opts.dryRun === true;
  const stats = {
    ok: true,
    dryRun,
    capMs,
    usersScanned: 0,
    trainingRunsScanned: 0,
    decimalRunsScanned: 0,
    perfectSquareRunsScanned: 0,
    divisibilityRunsScanned: 0,
    runsScanned: 0,
    skippedZ5: 0,
    updated: 0,
    skippedNoAttempts: 0,
    skippedNoLevel: 0,
    clearedSpeed: 0,
  };
  if (!runsData || typeof runsData.runs !== "object") {
    return { ...stats, ok: false, error: "invalid runsData" };
  }

  Object.keys(runsData.runs).forEach((username) => {
    stats.usersScanned += 1;
    const runs = runsData.runs[username];
    if (!Array.isArray(runs)) return;
    runs.forEach((run) => {
      if (!run) return;
      const modeKey = normalizeRunMode(run.mode);
      if (modeKey === "divisibility") {
        const meta = run.trainingMeta;
        let lv = null;
        if (meta && Number.isFinite(Number(meta.pickedLevel))) lv = Math.floor(Number(meta.pickedLevel));
        else if (run.maxLevel != null && Number.isFinite(Number(run.maxLevel))) lv = Math.floor(Number(run.maxLevel));
        if (lv != null && lv >= DIVISIBILITY_HEAT_LEVEL_COUNT) {
          stats.skippedZ5 += 1;
          return;
        }
      }
      const target = resolveSpeedBackfillTarget(run);
      if (!target) return;

      stats.runsScanned += 1;
      if (target.mode === "training") stats.trainingRunsScanned += 1;
      else if (target.mode === "decimal") stats.decimalRunsScanned += 1;
      else if (target.mode === "perfectSquare") stats.perfectSquareRunsScanned += 1;
      else if (target.mode === "divisibility") stats.divisibilityRunsScanned += 1;

      if (!Array.isArray(run.attempts) || run.attempts.length === 0) {
        stats.skippedNoAttempts += 1;
        return;
      }
      const picked = resolvePickedLevel(run, target.levelCount);
      if (picked == null) {
        stats.skippedNoLevel += 1;
        return;
      }
      const meanLn = meanLnGeoFromAttempts(run.attempts, picked, capMs, target.levelCount);
      const runAvgSec = secFromMeanLn(meanLn);
      if (!run.trainingMeta || typeof run.trainingMeta !== "object") {
        run.trainingMeta = {};
      }
      if (run.trainingMeta.pickedLevel == null && Number.isFinite(picked)) {
        run.trainingMeta.pickedLevel = picked;
      }
      const prevLn = run.trainingMeta.runMeanLn;
      const prevSec = run.trainingMeta.runAvgSec;
      if (meanLn == null) {
        if (prevLn != null || prevSec != null) {
          delete run.trainingMeta.runMeanLn;
          delete run.trainingMeta.runAvgSec;
          stats.clearedSpeed += 1;
          stats.updated += 1;
        }
        return;
      }
      const changed = prevLn !== meanLn || prevSec !== runAvgSec;
      if (!changed) return;
      run.trainingMeta.runMeanLn = meanLn;
      run.trainingMeta.runAvgSec = runAvgSec;
      stats.updated += 1;
    });
  });

  if (dryRun) {
    stats.note = "dryRun: 未写入磁盘";
  }
  return stats;
}

module.exports = {
  backfillTrainingRunSpeedInRunsData,
  meanLnGeoFromAttempts,
  resolveSpeedBackfillTarget,
  DEFAULT_CAP_MS,
};
