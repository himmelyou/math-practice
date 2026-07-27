/**
 * 临时：按报表与本局均速统一口径回填 trainingMeta.runMeanLn / runAvgSec。
 * 对+错、几何均、timeSpentMs > cap 剔除。用完后可删本文件与对应 admin 路由。
 */
const DEFAULT_CAP_MS = 60 * 1000;
const ARITH_LEVEL_COUNT = 16;

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
    if (!a) continue;
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

function resolvePickedLevel(run) {
  const m = run.trainingMeta;
  if (m && Number.isFinite(Number(m.pickedLevel))) {
    return Math.max(0, Math.min(ARITH_LEVEL_COUNT - 1, Math.floor(Number(m.pickedLevel))));
  }
  if (run.maxLevel != null && Number.isFinite(Number(run.maxLevel))) {
    return Math.max(0, Math.min(ARITH_LEVEL_COUNT - 1, Math.floor(Number(run.maxLevel))));
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
      if (!run || normalizeRunMode(run.mode) !== "training") return;
      stats.trainingRunsScanned += 1;
      if (!Array.isArray(run.attempts) || run.attempts.length === 0) {
        stats.skippedNoAttempts += 1;
        return;
      }
      const picked = resolvePickedLevel(run);
      if (picked == null) {
        stats.skippedNoLevel += 1;
        return;
      }
      const meanLn = meanLnGeoFromAttempts(run.attempts, picked, capMs, ARITH_LEVEL_COUNT);
      const runAvgSec = secFromMeanLn(meanLn);
      if (!run.trainingMeta || typeof run.trainingMeta !== "object") {
        run.trainingMeta = {};
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
  DEFAULT_CAP_MS,
};
