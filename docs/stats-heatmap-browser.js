/**
 * 难度热图：个人加权指标 × 全体速度常模（答对 ln(耗时) 分位）；主站与学员数据页共用，单文件置于 docs/。
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
      if (m === 'expandbrackets' || m === 'primecomposite' || m === 'perfectsquare') return false;
      return m === 'survival' || m === 'level' || m === 'training';
    });
  }

  /** 分位点摘要 → 近似百分位排名 0–100（值越大排名越高：ln(t) 越大越慢） */
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
      10;
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
      var pText = p != null ? (Math.round(p * 1000) / 10).toFixed(1) + '%' : '-';
      var meanLn = b.meanLnCorrect;
      var active = b.n >= minAttempts;

      var cohortRow = cohortLevels[k] || {};
      var lnQ = cohortRow.cohortLnTimeCorrect || null;

      var timePct = active && meanLn != null && lnQ ? percentileFromQuantileSummary(meanLn, lnQ) : null;

      var avgSecText = '-';
      if (meanLn != null && Number.isFinite(meanLn)) {
        // meanLn 为加权 ln(timeSpentMs)，ms 为毫秒；exp 得几何平均耗时（毫秒），再换「秒」展示
        var geoMeanMs = Math.exp(meanLn);
        var secDisplay = geoMeanMs / 1000;
        if (secDisplay > 0 && secDisplay < 600 && Number.isFinite(secDisplay)) {
          avgSecText = String(Math.round(secDisplay * 10) / 10) + 's';
        }
      }

      cells.push({
        levelIndex: k,
        active: active,
        n: b.n,
        p: p,
        pText: pText,
        meanLnCorrect: meanLn,
        medianLnCorrect: meanLn,
        timePct: timePct,
        nEff: b.nEff != null ? Math.round(b.nEff * 10) / 10 : null,
        ageDaysMin: b.minAgeDays,
        ageDaysMax: b.maxAgeDays,
        avgSecText: avgSecText,
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

  /** 速度分位降序（越慢越前）；无速度分位时按加权准确率升序（越低越前） */
  function recommendLevelIndex(cellsResult) {
    var list = (cellsResult && cellsResult.cells) || [];
    var ranked = list
      .filter(function (c) {
        return c.active;
      })
      .map(function (c) {
        return {
          k: c.levelIndex,
          timePct: c.timePct,
          p: c.p != null ? c.p : 1,
        };
      });
    ranked.sort(function (a, b) {
      var aHas = a.timePct != null;
      var bHas = b.timePct != null;
      if (aHas && bHas) return b.timePct - a.timePct;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return a.p - b.p;
    });
    return ranked.length ? ranked[0].k : null;
  }

  var TRAINING_BRUSH_PASS_ACCURACY = 0.95;

  function cmpMinWeightedP(a, b) {
    var pa = a.p != null ? a.p : 1;
    var pb = b.p != null ? b.p : 1;
    if (pa !== pb) return pa - pb;
    return a.levelIndex - b.levelIndex;
  }

  var TRAINING_DAY_PASS_ACCURACY = 0.95;
  var TRAINING_FLOW_STORAGE_PREFIX = 'jml_training_flow_v3:';
  var TRAINING_FAILS_BEFORE_BRUSH = 3;

  function getCell(cellsResult, levelIndex) {
    var list = (cellsResult && cellsResult.cells) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].levelIndex === levelIndex) return list[i];
    }
    return { levelIndex: levelIndex, active: false, n: 0, p: null, timePct: null };
  }

  function isWeightedBelowPass(cell) {
    return !!(cell && cell.active && cell.p != null && cell.p < TRAINING_DAY_PASS_ACCURACY);
  }

  function isNewLevelCell(cell) {
    return !!(cell && !cell.active);
  }

  function findFirstBelowPassFrom(cellsResult, startIdx) {
    for (var i = Math.max(0, startIdx); i < LEVEL_COUNT; i++) {
      var c = getCell(cellsResult, i);
      if (isWeightedBelowPass(c)) return i;
    }
    return null;
  }

  function findFirstNewLevelFrom(cellsResult, startIdx) {
    for (var i = Math.max(0, startIdx); i < LEVEL_COUNT; i++) {
      var c = getCell(cellsResult, i);
      if (isNewLevelCell(c)) return i;
    }
    return null;
  }

  /** 刷热图：active 且加权 p≥95% 中取速度分位最差（最慢） */
  function recommendTrainingBrushSlowAmongPass(cellsResult) {
    var list = (cellsResult && cellsResult.cells) || [];
    var candidates = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.active && c.p != null && c.p >= TRAINING_DAY_PASS_ACCURACY) candidates.push(c);
    }
    if (!candidates.length) return null;
    var withPct = [];
    for (var t = 0; t < candidates.length; t++) {
      if (candidates[t].timePct != null) withPct.push(candidates[t]);
    }
    if (withPct.length) {
      var bt = withPct[0];
      for (var u = 1; u < withPct.length; u++) {
        var du = withPct[u].timePct - bt.timePct;
        if (du > 0 || (du === 0 && withPct[u].levelIndex < bt.levelIndex)) bt = withPct[u];
      }
      return bt.levelIndex;
    }
    var best = candidates[0];
    for (var v = 1; v < candidates.length; v++) {
      if (cmpMinWeightedP(candidates[v], best) < 0) best = candidates[v];
    }
    return best.levelIndex;
  }

  function dailyScanFrom(cellsResult, startIdx) {
    var below = findFirstBelowPassFrom(cellsResult, startIdx);
    if (below != null) {
      return { mode: 'daily', levelIndex: below, reason: 'scan_below', enterBrush: false };
    }
    var neu = findFirstNewLevelFrom(cellsResult, startIdx);
    if (neu != null) {
      return { mode: 'daily', levelIndex: neu, reason: 'open_new', enterBrush: false };
    }
    return { mode: 'brush', levelIndex: null, reason: 'daily_clear', enterBrush: true };
  }

  /** 同一关当日失败 3 次后：从 k+1 找 <95%；遇 n<10 空洞则截断进刷热图，不可开新关、不可跳过 */
  function dailyAfterThreeFails(cellsResult, k) {
    for (var i = k + 1; i < LEVEL_COUNT; i++) {
      var c = getCell(cellsResult, i);
      if (isNewLevelCell(c)) {
        return { mode: 'brush', levelIndex: null, reason: 'gap_block_at_L' + (i + 1), enterBrush: true };
      }
      if (isWeightedBelowPass(c)) {
        return { mode: 'daily', levelIndex: i, reason: 'after_fail_below', enterBrush: false };
      }
    }
    return { mode: 'brush', levelIndex: null, reason: 'no_more_below', enterBrush: true };
  }

  function normalizeTrainingDayState(o, todayKey) {
    var d = { dayKey: todayKey, brushMode: false, lastRun: null };
    if (!o || typeof o !== 'object') return d;
    if (o.dayKey !== todayKey) return d;
    var lr = o.lastRun;
    var lastRun = null;
    if (lr && typeof lr === 'object') {
      var li = Math.min(15, Math.max(0, Math.floor(Number(lr.levelIndex))));
      lastRun = {
        levelIndex: li,
        passed: !!lr.passed,
        failCount: Math.min(
          TRAINING_FAILS_BEFORE_BRUSH,
          Math.max(0, Math.floor(Number(lr.failCount) || 0))
        ),
      };
    }
    return {
      dayKey: todayKey,
      brushMode: !!(o.brushMode || o.forcedBrush),
      lastRun: lastRun,
    };
  }

  /**
   * 训练 / Report 统一：根据热图 + 当日状态计算下一局关卡。
   * dayState: { dayKey, brushMode, lastRun|null }
   * lastRun: { levelIndex, passed, failCount } — 仅闯关阶段；刷热图不写 failCount 语义
   */
  function computeTrainingNextLevel(cellsResult, dayState, todayKey) {
    var today = todayKey || '';
    var st = normalizeTrainingDayState(dayState, today);
    if (st.brushMode) {
      var brushK = recommendTrainingBrushSlowAmongPass(cellsResult);
      return {
        mode: 'brush',
        levelIndex: brushK != null ? brushK : 0,
        reason: 'brush_pick',
        enterBrush: false,
        brushMode: true,
      };
    }
    var lr = st.lastRun;
    var daily;
    if (!lr) {
      daily = dailyScanFrom(cellsResult, 0);
    } else if (lr.passed) {
      daily = dailyScanFrom(cellsResult, lr.levelIndex + 1);
    } else if (lr.failCount >= TRAINING_FAILS_BEFORE_BRUSH) {
      daily = dailyAfterThreeFails(cellsResult, lr.levelIndex);
    } else {
      return {
        mode: 'daily',
        levelIndex: lr.levelIndex,
        reason: 'retry_same',
        enterBrush: false,
        brushMode: false,
      };
    }
    if (daily.enterBrush) {
      var bk = recommendTrainingBrushSlowAmongPass(cellsResult);
      return {
        mode: 'brush',
        levelIndex: bk != null ? bk : 0,
        reason: daily.reason,
        enterBrush: true,
        brushMode: true,
      };
    }
    return {
      mode: 'daily',
      levelIndex: daily.levelIndex,
      reason: daily.reason,
      enterBrush: false,
      brushMode: false,
    };
  }

  function trainingNextLevelReasonText(result, labels) {
    if (!result) return '';
    var L = labels || {};
    if (result.mode === 'brush') {
      return L.brush || '刷热图：加权≥95% 且速度分位最慢';
    }
    if (result.reason === 'scan_below') return L.scanBelow || '当日闯关：第一个加权准确率<95%';
    if (result.reason === 'open_new') return L.openNew || '当日闯关：开新关（题数<10）';
    if (result.reason === 'retry_same') return L.retrySame || '当日闯关：本关继续（未达单局95%）';
    if (result.reason === 'after_fail_below') return L.afterFailBelow || '当日闯关：三败后下一弱关';
    return L.dailyDefault || '当日闯关';
  }

  /**
   * @deprecated 旧刷热图规则；请用 computeTrainingNextLevel / recommendTrainingBrushSlowAmongPass
   */
  function recommendTrainingBrushLevel(cellsResult, poolIndices) {
    var passLine = TRAINING_BRUSH_PASS_ACCURACY;
    var pool = poolIndices;
    if (!pool || !pool.length) {
      pool = [];
      for (var pi = 0; pi < LEVEL_COUNT; pi++) pool.push(pi);
    }
    var poolSet = {};
    for (var i = 0; i < pool.length; i++) poolSet[pool[i]] = true;

    var list = (cellsResult && cellsResult.cells) || [];
    var active = [];
    for (var j = 0; j < list.length; j++) {
      var c = list[j];
      if (c.active && poolSet[c.levelIndex]) active.push(c);
    }
    if (!active.length) return null;

    var belowPass = [];
    for (var b = 0; b < active.length; b++) {
      var p = active[b].p;
      if (p != null && p < passLine) belowPass.push(active[b]);
    }
    if (belowPass.length) {
      var bestBelow = belowPass[0];
      for (var k = 1; k < belowPass.length; k++) {
        if (cmpMinWeightedP(belowPass[k], bestBelow) < 0) bestBelow = belowPass[k];
      }
      return bestBelow.levelIndex;
    }

    var withPct = [];
    for (var t = 0; t < active.length; t++) {
      if (active[t].timePct != null) withPct.push(active[t]);
    }
    if (withPct.length) {
      var bt = withPct[0];
      for (var u = 1; u < withPct.length; u++) {
        var du = withPct[u].timePct - bt.timePct;
        if (du > 0 || (du === 0 && withPct[u].levelIndex < bt.levelIndex)) bt = withPct[u];
      }
      return bt.levelIndex;
    }

    var bestP = active[0];
    for (var v = 1; v < active.length; v++) {
      if (cmpMinWeightedP(active[v], bestP) < 0) bestP = active[v];
    }
    return bestP.levelIndex;
  }

  /** @deprecated 请用 recommendTrainingBrushLevel */
  function recommendLevelIndexAccuracyBrush(cellsResult) {
    return recommendTrainingBrushLevel(cellsResult, null);
  }

  /** 刷热图 / report 推荐用的全档位候选（L1–L16） */
  function fullLevelPoolIndices() {
    var pool = [];
    for (var pi = 0; pi < LEVEL_COUNT; pi++) pool.push(pi);
    return pool;
  }

  function localDayKeyFromTs(ts) {
    var d = new Date(ts || 0);
    if (Number.isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /**
   * 从服务端 runs 反推当日训练流程状态（Report 建议下一关；不依赖浏览器 localStorage）。
   * buildHeatOpts: { cohort, maxTimeSpentMs }
   */
  function reconstructTrainingDayStateFromRuns(runs, todayKey, buildHeatOpts) {
    var st = { dayKey: todayKey, brushMode: false, lastRun: null };
    if (!todayKey) return normalizeTrainingDayState(st, todayKey);
    var trainingToday = (runs || [])
      .filter(function (r) {
        return String(r && r.mode ? r.mode : '').toLowerCase() === 'training';
      })
      .filter(function (r) {
        return localDayKeyFromTs(r.ts) === todayKey;
      })
      .sort(function (a, b) {
        return (a.ts || 0) - (b.ts || 0);
      });
    var arith = filterArithmeticRuns(runs || []);
    var capMs =
      buildHeatOpts && Number(buildHeatOpts.maxTimeSpentMs)
        ? Number(buildHeatOpts.maxTimeSpentMs)
        : 60 * 1000;
    var cohort = buildHeatOpts && buildHeatOpts.cohort ? buildHeatOpts.cohort : null;

    for (var i = 0; i < trainingToday.length; i++) {
      var run = trainingToday[i];
      if (run.trainingMeta && run.trainingMeta.dayStateAfter) {
        var da = run.trainingMeta.dayStateAfter;
        st = {
          dayKey: todayKey,
          brushMode: !!da.brushMode,
          lastRun: da.lastRun && typeof da.lastRun === 'object' ? da.lastRun : null,
        };
        continue;
      }
      var levelIndex = Math.min(15, Math.max(0, Math.floor(Number(run.maxLevel) || 0)));
      var runPass = run.cleared === true;
      var runBrush = !!(run.trainingMeta && run.trainingMeta.runBrushMode);

      if (runBrush) {
        st.lastRun = { levelIndex: levelIndex, passed: runPass, failCount: 0 };
        continue;
      }

      var failCount = 0;
      if (!runPass) {
        if (
          st.lastRun &&
          st.lastRun.levelIndex === levelIndex &&
          st.lastRun.passed === false
        ) {
          failCount = Math.min(
            TRAINING_FAILS_BEFORE_BRUSH,
            (st.lastRun.failCount || 0) + 1
          );
        } else {
          failCount = 1;
        }
      }
      st.lastRun = { levelIndex: levelIndex, passed: runPass, failCount: failCount };

      if (typeof buildHeatmapCells === 'function' && typeof computeTrainingNextLevel === 'function') {
        var runsUpTo = arith.filter(function (r) {
          return (r.ts || 0) <= (run.ts || 0);
        });
        var heat = buildHeatmapCells({
          runs: runsUpTo,
          cohort: cohort,
          maxTimeSpentMs: capMs,
        });
        var result = computeTrainingNextLevel(heat, st, todayKey);
        if (result && result.enterBrush) {
          st.brushMode = true;
          st.lastRun = null;
        }
      }
    }
    return normalizeTrainingDayState(st, todayKey);
  }

  global.JmlStatsHeatmap = {
    LEVEL_COUNT: LEVEL_COUNT,
    fullLevelPoolIndices: fullLevelPoolIndices,
    MS_PER_DAY: MS_PER_DAY,
    PERSONAL_WINDOW_ATTEMPTS: PERSONAL_WINDOW_ATTEMPTS,
    PERSONAL_HALF_LIFE_DAYS: PERSONAL_HALF_LIFE_DAYS,
    filterArithmeticRuns: filterArithmeticRuns,
    buildHeatmapCells: buildHeatmapCells,
    recommendLevelIndex: recommendLevelIndex,
    recommendLevelIndexAccuracyBrush: recommendLevelIndexAccuracyBrush,
    recommendTrainingBrushLevel: recommendTrainingBrushLevel,
    recommendTrainingBrushSlowAmongPass: recommendTrainingBrushSlowAmongPass,
    computeTrainingNextLevel: computeTrainingNextLevel,
    normalizeTrainingDayState: normalizeTrainingDayState,
    reconstructTrainingDayStateFromRuns: reconstructTrainingDayStateFromRuns,
    localDayKeyFromTs: localDayKeyFromTs,
    trainingNextLevelReasonText: trainingNextLevelReasonText,
    TRAINING_BRUSH_PASS_ACCURACY: TRAINING_BRUSH_PASS_ACCURACY,
    TRAINING_DAY_PASS_ACCURACY: TRAINING_DAY_PASS_ACCURACY,
    TRAINING_FLOW_STORAGE_PREFIX: TRAINING_FLOW_STORAGE_PREFIX,
    TRAINING_FAILS_BEFORE_BRUSH: TRAINING_FAILS_BEFORE_BRUSH,
    percentileFromQuantileSummary: percentileFromQuantileSummary,
    personalWeightedByLevel: personalWeightedByLevel,
  };
})(typeof window !== 'undefined' ? window : this);
