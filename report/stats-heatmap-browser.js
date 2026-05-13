/**
 * 难度热图：个人 × 全体常模，百分位横向可比（供 report 调试；训练选关可复用）
 *
 * 个人侧：每档「时间上最近」的最多 200 条 attempt；权重按 run.ts 与当前时间的「整天」年龄
 * 指数衰减，半衰期 14 天（λ = ln2 / 14）。同一局内多题共享同一 run.ts → 同一天，符合按天口径。
 */
(function (global) {
  var LEVEL_COUNT = 16;
  var MS_PER_DAY = 86400000;
  var PERSONAL_WINDOW_ATTEMPTS = 200;
  var PERSONAL_HALF_LIFE_DAYS = 14;

  function clampLevel(i) {
    return Math.max(0, Math.min(LEVEL_COUNT - 1, Number(i) || 0));
  }

  function filterArithmeticRuns(runs) {
    return (runs || []).filter(function (r) {
      var m = String(r && r.mode ? r.mode : 'survival').toLowerCase();
      return m === 'survival' || m === 'level' || m === 'training';
    });
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

  /**
   * 每档：按 run.ts 排序后取最近 window 条，再按「年龄整天数」指数权重聚合。
   * @returns {Array<{ n, weightedP, meanLnCorrect, sumW, nEff, minAgeDays, maxAgeDays }>}
   */
  function personalWeightedByLevel(filteredRuns, maxTimeMs, nowMs, windowMax, halfLifeDays) {
    nowMs = Number(nowMs) && Number.isFinite(nowMs) ? nowMs : Date.now();
    windowMax =
      Number(windowMax) > 0 && Number.isFinite(Number(windowMax))
        ? Math.min(500, Math.floor(Number(windowMax)))
        : PERSONAL_WINDOW_ATTEMPTS;
    var halfLife =
      Number(halfLifeDays) > 0 && Number.isFinite(Number(halfLifeDays))
        ? Number(halfLifeDays)
        : PERSONAL_HALF_LIFE_DAYS;
    var lambda = Math.LN2 / halfLife;

    var cap = Number(maxTimeMs);
    if (!Number.isFinite(cap) || cap <= 0) cap = 60 * 1000;

    var buckets = Array.from({ length: LEVEL_COUNT }, function () {
      return [];
    });

    (filteredRuns || []).forEach(function (r) {
      if (!Array.isArray(r.attempts)) return;
      var runTs = Number(r.ts) || 0;
      r.attempts.forEach(function (a) {
        var k = clampLevel(a.levelIndex);
        var ageDays = runTs > 0 ? Math.max(0, Math.floor((nowMs - runTs) / MS_PER_DAY)) : 0;
        var wRaw = Math.exp(-lambda * ageDays);
        buckets[k].push({
          correct: !!a.correct,
          timeSpentMs: Number(a.timeSpentMs),
          runTs: runTs,
          ageDays: ageDays,
          wRaw: wRaw,
        });
      });
    });

    var by = [];
    for (var k = 0; k < LEVEL_COUNT; k++) {
      var arr = buckets[k];
      arr.sort(function (u, v) {
        return u.runTs - v.runTs;
      });
      var slice = arr.length > windowMax ? arr.slice(arr.length - windowMax) : arr;
      var n = slice.length;
      var empty = {
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

      var sumWRaw = 0;
      for (var i = 0; i < n; i++) sumWRaw += slice[i].wRaw;
      if (!(sumWRaw > 0) || !Number.isFinite(sumWRaw)) sumWRaw = 1;

      var wc = 0;
      var wLnNum = 0;
      var wLnDen = 0;
      var minAge = null;
      var maxAge = null;
      var sumW2 = 0;

      for (var j = 0; j < n; j++) {
        var it = slice[j];
        var w = (it.wRaw * n) / sumWRaw;
        wc += w * (it.correct ? 1 : 0);
        sumW2 += w * w;
        if (minAge === null || it.ageDays < minAge) minAge = it.ageDays;
        if (maxAge === null || it.ageDays > maxAge) maxAge = it.ageDays;
        if (it.correct) {
          var ms = it.timeSpentMs;
          if (Number.isFinite(ms) && ms > 0 && ms <= cap) {
            wLnDen += w;
            wLnNum += w * Math.log(ms);
          }
        }
      }

      var sumW = n;
      by.push({
        n: n,
        weightedP: sumW > 0 ? wc / sumW : null,
        meanLnCorrect: wLnDen > 0 ? wLnNum / wLnDen : null,
        sumW: sumW,
        nEff: sumW2 > 0 ? (sumW * sumW) / sumW2 : n,
        minAgeDays: minAge,
        maxAgeDays: maxAge,
      });
    }
    return by;
  }

  /**
   * @param {object} opts
   * @param {Array} opts.runs 原始 runs（内部会筛 survival/level/training）
   * @param {object|null} opts.cohort GET /api/admin/stats/level-cohort 的 JSON
   * @param {number} [opts.minAttempts]
   * @param {number} [opts.maxTimeSpentMs] 与常模一致
   * @param {number} [opts.nowTs] 默认 Date.now()，便于测试
   * @param {number} [opts.personalWindowAttempts] 默认 200
   * @param {number} [opts.personalHalfLifeDays] 默认 14
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
    var nowMs = Number(opts.nowTs) && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var windowAttempts =
      Number(opts.personalWindowAttempts) > 0 ? Math.floor(Number(opts.personalWindowAttempts)) : PERSONAL_WINDOW_ATTEMPTS;
    var halfLifeDays =
      Number(opts.personalHalfLifeDays) > 0 ? Number(opts.personalHalfLifeDays) : PERSONAL_HALF_LIFE_DAYS;

    var by = personalWeightedByLevel(runs, maxTimeMs, nowMs, windowAttempts, halfLifeDays);
    var cohortLevels = cohort && Array.isArray(cohort.levels) ? cohort.levels : [];

    var cells = [];
    for (var k = 0; k < LEVEL_COUNT; k++) {
      var b = by[k];
      var p = b.weightedP;
      var pText = p != null ? Math.round(p * 100) + '%' : '-';
      var meanLn = b.meanLnCorrect;
      var active = b.n >= minAttempts;

      var cohortRow = cohortLevels[k] || {};
      var lnQ = cohortRow.cohortLnTimeCorrect || null;
      var accQ = cohortRow.cohortUserAccuracy && cohortRow.cohortUserAccuracy.sufficient ? cohortRow.cohortUserAccuracy : null;

      var accPct = active && p != null && accQ ? percentileFromQuantileSummary(p, accQ) : null;
      var timePct = active && meanLn != null && lnQ ? percentileFromQuantileSummary(meanLn, lnQ) : null;

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
        meanLnCorrect: meanLn,
        medianLnCorrect: meanLn,
        accPct: accPct,
        timePct: timePct,
        accRefNote: accRefNote,
        nEff: b.nEff != null ? Math.round(b.nEff * 10) / 10 : null,
        ageDaysMin: b.minAgeDays,
        ageDaysMax: b.maxAgeDays,
      });
    }
    return {
      cells: cells,
      minAttempts: minAttempts,
      maxTimeSpentMs: maxTimeMs,
      cohortLoaded: !!cohort,
      personalWindowAttempts: windowAttempts,
      personalHalfLifeDays: halfLifeDays,
      personalNowTs: nowMs,
    };
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
    MS_PER_DAY: MS_PER_DAY,
    PERSONAL_WINDOW_ATTEMPTS: PERSONAL_WINDOW_ATTEMPTS,
    PERSONAL_HALF_LIFE_DAYS: PERSONAL_HALF_LIFE_DAYS,
    filterArithmeticRuns: filterArithmeticRuns,
    buildHeatmapCells: buildHeatmapCells,
    recommendLevelIndex: recommendLevelIndex,
    percentileFromQuantileSummary: percentileFromQuantileSummary,
    personalWeightedByLevel: personalWeightedByLevel,
  };
})(typeof window !== 'undefined' ? window : this);
