/**
 * 难度热图核心算法（服务端与 stats-heatmap-browser.js 口径一致）
 */
const LEVEL_COUNT = 16;
const MS_PER_DAY = 86400000;
const PERSONAL_WINDOW_ATTEMPTS = 200;
const PERSONAL_HALF_LIFE_DAYS = 14;

function clampLevel(i) {
  return Math.max(0, Math.min(LEVEL_COUNT - 1, Number(i) || 0));
}

function filterArithmeticRuns(runs) {
  return (runs || []).filter((r) => {
    const m = String(r && r.mode ? r.mode : "survival").toLowerCase();
      if (m === "expandbrackets" || m === "primecomposite" || m === "perfectsquare") return false;
    return m === "survival" || m === "level" || m === "training";
  });
}

function percentileFromQuantileSummary(value, q) {
  if (value == null || !q || !q.n) return null;
  const { q10, q25, q50, q75, q90 } = q;
  if (![q10, q25, q50, q75, q90].every((x) => Number.isFinite(x))) return null;

  function lerp(x, x1, y1, x2, y2) {
    if (Math.abs(x2 - x1) < 1e-9) return y1;
    return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }

  if (value <= q10) {
    const left = q10 - Math.max(1e-6, q25 - q10);
    return Math.max(0, Math.min(100, lerp(value, left, 0, q10, 10)));
  }
  if (value <= q25) return lerp(value, q10, 10, q25, 25);
  if (value <= q50) return lerp(value, q25, 25, q50, 50);
  if (value <= q75) return lerp(value, q50, 50, q75, 75);
  if (value <= q90) return lerp(value, q75, 75, q90, 90);
  const right = q90 + Math.max(1e-6, q90 - q75);
  return Math.max(0, Math.min(100, lerp(value, q90, 90, right, 100)));
}

function personalWeightedByLevel(filteredRuns, maxTimeMs, nowMs, windowMax, halfLifeDays) {
  nowMs = Number(nowMs) && Number.isFinite(nowMs) ? nowMs : Date.now();
  windowMax =
    Number(windowMax) > 0 && Number.isFinite(Number(windowMax))
      ? Math.min(500, Math.floor(Number(windowMax)))
      : PERSONAL_WINDOW_ATTEMPTS;
  const halfLife =
    Number(halfLifeDays) > 0 && Number.isFinite(Number(halfLifeDays))
      ? Number(halfLifeDays)
      : PERSONAL_HALF_LIFE_DAYS;
  const lambda = Math.LN2 / halfLife;

  let cap = Number(maxTimeMs);
  if (!Number.isFinite(cap) || cap <= 0) cap = 60 * 1000;

  const buckets = Array.from({ length: LEVEL_COUNT }, () => []);

  (filteredRuns || []).forEach((r) => {
    if (!Array.isArray(r.attempts)) return;
    const runTs = Number(r.ts) || 0;
    r.attempts.forEach((a) => {
      const k = clampLevel(a.levelIndex);
      const ageDays = runTs > 0 ? Math.max(0, Math.floor((nowMs - runTs) / MS_PER_DAY)) : 0;
      const wRaw = Math.exp(-lambda * ageDays);
      buckets[k].push({
        correct: !!a.correct,
        timeSpentMs: Number(a.timeSpentMs),
        runTs,
        ageDays,
        wRaw,
      });
    });
  });

  const by = [];
  for (let k = 0; k < LEVEL_COUNT; k++) {
    const arr = buckets[k];
    arr.sort((u, v) => u.runTs - v.runTs);
    const slice = arr.length > windowMax ? arr.slice(arr.length - windowMax) : arr;
    const n = slice.length;
    const empty = {
      n: 0,
      weightedP: null,
      meanLnCorrect: null,
      sumW: 0,
      nEff: null,
      minAgeDays: null,
      maxAgeDays: null,
    };
    if (n === 0) {
      by.push(empty);
      continue;
    }

    let sumWRaw = 0;
    for (let i = 0; i < n; i++) sumWRaw += slice[i].wRaw;
    if (!(sumWRaw > 0) || !Number.isFinite(sumWRaw)) sumWRaw = 1;

    let wc = 0;
    let wLnNum = 0;
    let wLnDen = 0;
    let minAge = null;
    let maxAge = null;
    let sumW2 = 0;

    for (let j = 0; j < n; j++) {
      const it = slice[j];
      const w = (it.wRaw * n) / sumWRaw;
      wc += w * (it.correct ? 1 : 0);
      sumW2 += w * w;
      if (minAge === null || it.ageDays < minAge) minAge = it.ageDays;
      if (maxAge === null || it.ageDays > maxAge) maxAge = it.ageDays;
      if (it.correct) {
        const ms = it.timeSpentMs;
        if (Number.isFinite(ms) && ms > 0 && ms <= cap) {
          wLnDen += w;
          wLnNum += w * Math.log(ms);
        }
      }
    }

    const sumW = n;
    by.push({
      n,
      weightedP: sumW > 0 ? wc / sumW : null,
      meanLnCorrect: wLnDen > 0 ? wLnNum / wLnDen : null,
      sumW,
      nEff: sumW2 > 0 ? (sumW * sumW) / sumW2 : n,
      minAgeDays: minAge,
      maxAgeDays: maxAge,
    });
  }
  return by;
}

function buildHeatmapCells(opts) {
  const runs = filterArithmeticRuns(opts.runs);
  const cohort = opts.cohort && opts.cohort.ok ? opts.cohort : null;
  const minAttempts =
    Number(opts.minAttempts) ||
    (cohort && Number(cohort.minAttemptsForHeatmap)) ||
    10;
  const maxTimeMs =
    Number(opts.maxTimeSpentMs) ||
    (cohort && Number(cohort.timeSpentMsCap)) ||
    60 * 1000;
  const nowMs = Number(opts.nowTs) && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
  const windowAttempts =
    Number(opts.personalWindowAttempts) > 0 ? Math.floor(Number(opts.personalWindowAttempts)) : PERSONAL_WINDOW_ATTEMPTS;
  const halfLifeDays =
    Number(opts.personalHalfLifeDays) > 0 ? Number(opts.personalHalfLifeDays) : PERSONAL_HALF_LIFE_DAYS;

  const by = personalWeightedByLevel(runs, maxTimeMs, nowMs, windowAttempts, halfLifeDays);
  const cohortLevels = cohort && Array.isArray(cohort.levels) ? cohort.levels : [];

  const cells = [];
  for (let k = 0; k < LEVEL_COUNT; k++) {
    const b = by[k];
    const p = b.weightedP;
    const pText = p != null ? `${(Math.round(p * 1000) / 10).toFixed(1)}%` : "-";
    const meanLn = b.meanLnCorrect;
    const active = b.n >= minAttempts;

    const cohortRow = cohortLevels[k] || {};
    const lnQ = cohortRow.cohortLnTimeCorrect || null;
    const timePct = active && meanLn != null && lnQ ? percentileFromQuantileSummary(meanLn, lnQ) : null;

    let avgSecText = "-";
    if (meanLn != null && Number.isFinite(meanLn)) {
      const geoMeanMs = Math.exp(meanLn);
      const secDisplay = geoMeanMs / 1000;
      if (secDisplay > 0 && secDisplay < 600 && Number.isFinite(secDisplay)) {
        avgSecText = `${Math.round(secDisplay * 10) / 10}s`;
      }
    }

    cells.push({
      levelIndex: k,
      active,
      n: b.n,
      p,
      pText,
      meanLnCorrect: meanLn,
      medianLnCorrect: meanLn,
      timePct,
      nEff: b.nEff != null ? Math.round(b.nEff * 10) / 10 : null,
      ageDaysMin: b.minAgeDays,
      ageDaysMax: b.maxAgeDays,
      avgSecText,
    });
  }
  return {
    cells,
    minAttempts,
    maxTimeSpentMs: maxTimeMs,
    cohortLoaded: !!cohort,
    personalWindowAttempts: windowAttempts,
    personalHalfLifeDays: halfLifeDays,
    personalNowTs: nowMs,
  };
}

function isHeatmapLevelPassed(cellsResult, levelIndex, minP) {
  const cells = (cellsResult && cellsResult.cells) || [];
  const k = clampLevel(levelIndex);
  const cell = cells[k];
  if (!cell || !cell.active) return false;
  const p = cell.p;
  if (p == null || !Number.isFinite(p)) return false;
  return p >= (Number(minP) || 0.95);
}

module.exports = {
  LEVEL_COUNT,
  MS_PER_DAY,
  PERSONAL_WINDOW_ATTEMPTS,
  PERSONAL_HALF_LIFE_DAYS,
  filterArithmeticRuns,
  personalWeightedByLevel,
  buildHeatmapCells,
  isHeatmapLevelPassed,
};
