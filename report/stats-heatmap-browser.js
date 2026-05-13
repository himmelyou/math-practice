/**
 * 难度热图：个人 × 全体常模，百分位横向可比（供 report 调试；训练选关可复用）
 */
(function (global) {
  var LEVEL_COUNT = 16;

  function clampLevel(i) {
    return Math.max(0, Math.min(LEVEL_COUNT - 1, Number(i) || 0));
  }

  function filterArithmeticRuns(runs) {
    return (runs || []).filter(function (r) {
      var m = String(r && r.mode ? r.mode : 'survival').toLowerCase();
      return m === 'survival' || m === 'level' || m === 'training';
    });
  }

  function medianSorted(sortedAsc) {
    if (!sortedAsc.length) return null;
    var mid = Math.floor(sortedAsc.length / 2);
    if (sortedAsc.length % 2) return sortedAsc[mid];
    return (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
  }

  function medianLnFromCorrectAttempts(lnArr) {
    if (!lnArr.length) return null;
    return medianSorted(lnArr.slice().sort(function (a, b) { return a - b; }));
  }

  /** 分位点摘要 → 近似百分位排名 0–100（值越大排名越高：准确率越高、ln(t) 越大越慢） */
  function percentileFromQuantileSummary(value, q) {
    if (value == null || !q || !q.n) return null;
    var q10 = q.q10;
    var q25 = q.q25;
    var q50 = q.q50;
    var q75 = q.q75;
    var q90 = q.q90;
    if (![q10, q25, q50, q75, q90].every(function (x) { return Number.isFinite(x); })) return null;

    function lerp(x, x1, y1, x2, y2) {
      if (Math.abs(x2 - x1) < 1e-9) return y1;
      return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    }

    if (value <= q10) {
      var left = q10 - Math.max(1e-6, q25 - q10);
      return Math.max(0, Math.min(100, lerp(value, left, 0, q10, 10)));
    }
    if (value <= q25) return lerp(value, q10, 10, q25, 25);
    if (value <= q50) return lerp(value, q25, 25, q50, 50);
    if (value <= q75) return lerp(value, q50, 50, q75, 75);
    if (value <= q90) return lerp(value, q75, 75, q90, 90);
    var right = q90 + Math.max(1e-6, q90 - q75);
    return Math.max(0, Math.min(100, lerp(value, q90, 90, right, 100)));
  }

  function personalByLevel(filteredRuns, maxTimeMs) {
    var cap = Number(maxTimeMs);
    if (!Number.isFinite(cap) || cap <= 0) cap = 60 * 1000;
    var by = Array.from({ length: LEVEL_COUNT }, function () {
      return { n: 0, correct: 0, lnCorrect: [] };
    });
    (filteredRuns || []).forEach(function (r) {
      if (!Array.isArray(r.attempts)) return;
      r.attempts.forEach(function (a) {
        var k = clampLevel(a.levelIndex);
        by[k].n += 1;
        if (a.correct) {
          by[k].correct += 1;
          var ms = Number(a.timeSpentMs);
          if (Number.isFinite(ms) && ms > 0 && ms <= cap) {
            by[k].lnCorrect.push(Math.log(ms));
          }
        }
      });
    });
    return by;
  }

  /**
   * @param {object} opts
   * @param {Array} opts.runs 原始 runs（内部会筛 survival/level/training）
   * @param {object|null} opts.cohort GET /api/admin/stats/level-cohort 的 JSON
   * @param {number} [opts.minAttempts]
   * @param {number} [opts.maxTimeSpentMs] 与常模一致，默认 1 分钟
   */
  function buildHeatmapCells(opts) {
    var runs = filterArithmeticRuns(opts.runs);
    var cohort = opts.cohort && opts.cohort.ok ? opts.cohort : null;
    var minAttempts =
      Number(opts.minAttempts) ||
      (cohort && Number(cohort.minAttemptsForHeatmap)) ||
      30;
    var maxTimeMs =
      Number(opts.maxTimeSpentMs) ||
      (cohort && Number(cohort.timeSpentMsCap)) ||
      60 * 1000;

    var by = personalByLevel(runs, maxTimeMs);
    var cohortLevels = cohort && Array.isArray(cohort.levels) ? cohort.levels : [];

    var cells = [];
    for (var k = 0; k < LEVEL_COUNT; k++) {
      var b = by[k];
      var p = b.n > 0 ? b.correct / b.n : null;
      var pText = b.n > 0 ? Math.round(p * 100) + '%' : '-';
      var medLn = medianLnFromCorrectAttempts(b.lnCorrect);
      var active = b.n >= minAttempts;

      var cohortRow = cohortLevels[k] || {};
      var lnQ = cohortRow.cohortLnTimeCorrect || null;
      var accQ = cohortRow.cohortUserAccuracy && cohortRow.cohortUserAccuracy.sufficient ? cohortRow.cohortUserAccuracy : null;

      var accPct = active && p != null && accQ ? percentileFromQuantileSummary(p, accQ) : null;
      var timePct = active && medLn != null && lnQ ? percentileFromQuantileSummary(medLn, lnQ) : null;

      var accRefNote = '';
      if (active && p != null && cohortRow.cohortUserAccuracy && !cohortRow.cohortUserAccuracy.sufficient) {
        accRefNote = '准确率常模：用户数<' + (cohort.minUsersForAccuracyRef || 5);
      }

      cells.push({
        levelIndex: k,
        active: active,
        n: b.n,
        p: p,
        pText: pText,
        medianLnCorrect: medLn,
        accPct: accPct,
        timePct: timePct,
        accRefNote: accRefNote,
      });
    }
    return { cells: cells, minAttempts: minAttempts, maxTimeSpentMs: maxTimeMs, cohortLoaded: !!cohort };
  }

  /** 准确率分位优先升序（越差越前），再按速度分位降序（越慢越前） */
  function recommendLevelIndex(cellsResult) {
    var list = (cellsResult && cellsResult.cells) || [];
    var ranked = list
      .filter(function (c) {
        return c.active && c.accPct != null;
      })
      .map(function (c) {
        var tp = c.timePct != null ? c.timePct : 0;
        return { k: c.levelIndex, accPct: c.accPct, timePct: tp };
      });
    ranked.sort(function (a, b) {
      if (a.accPct !== b.accPct) return a.accPct - b.accPct;
      return b.timePct - a.timePct;
    });
    return ranked.length ? ranked[0].k : null;
  }

  global.JmlStatsHeatmap = {
    LEVEL_COUNT: LEVEL_COUNT,
    filterArithmeticRuns: filterArithmeticRuns,
    buildHeatmapCells: buildHeatmapCells,
    recommendLevelIndex: recommendLevelIndex,
    percentileFromQuantileSummary: percentileFromQuantileSummary,
  };
})(typeof window !== 'undefined' ? window : this);
