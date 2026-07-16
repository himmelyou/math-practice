/**
 * 难度热图：个人加权指标 × 全体速度常模（答对 ln(耗时) 分位）；主站与学员数据页共用，单文件置于 docs/。
 *
 * 个人侧：每档「时间上最近」的最多 200 条 attempt；权重按 run.ts 与当前时间的「整天」年龄
 * 指数衰减，半衰期 14 天（λ = ln2 / 14）。同一局内多题共享同一 run.ts → 同一天，符合按天口径。
 */
(function (global) {
  var LEVEL_COUNT = 16;
  var DECIMAL_LEVEL_COUNT = 6;
  var MS_PER_DAY = 86400000;
  var PERSONAL_WINDOW_ATTEMPTS = 200;
  var PERSONAL_HALF_LIFE_DAYS = 14;

  /** 热图分类注册表（后期加平方数等在此扩展） */
  var HEATMAP_CATEGORIES = [
    {
      id: 'arithmetic',
      modes: ['survival', 'level', 'training'],
      levelCount: LEVEL_COUNT,
      levelPrefix: 'L',
      labelKey: 'stats.cat.arithmetic',
      labelFallback: '四则运算',
      cohortKind: 'level',
    },
    {
      id: 'decimal',
      modes: ['decimal'],
      levelCount: DECIMAL_LEVEL_COUNT,
      levelPrefix: 'D',
      labelKey: 'stats.cat.decimal',
      labelFallback: '小数运算',
      cohortKind: 'decimal',
    },
  ];

  function normalizeMode(mode) {
    return String(mode || 'survival')
      .toLowerCase()
      .replace(/[_-]/g, '');
  }

  function clampLevel(i, levelCount) {
    var n = levelCount > 0 && Number.isFinite(Number(levelCount)) ? Math.floor(Number(levelCount)) : LEVEL_COUNT;
    return Math.max(0, Math.min(n - 1, Number(i) || 0));
  }

  function filterRunsByModes(runs, modes) {
    var set = {};
    (modes || []).forEach(function (m) {
      set[normalizeMode(m)] = true;
    });
    return (runs || []).filter(function (r) {
      return !!set[normalizeMode(r && r.mode)];
    });
  }

  function filterArithmeticRuns(runs) {
    return filterRunsByModes(runs, ['survival', 'level', 'training']);
  }

  function filterDecimalRuns(runs) {
    return filterRunsByModes(runs, ['decimal']);
  }

  function getHeatmapCategories() {
    return HEATMAP_CATEGORIES.slice();
  }

  function getHeatmapCategory(id) {
    for (var i = 0; i < HEATMAP_CATEGORIES.length; i += 1) {
      if (HEATMAP_CATEGORIES[i].id === id) return HEATMAP_CATEGORIES[i];
    }
    return HEATMAP_CATEGORIES[0];
  }

  function categoryForMode(mode) {
    var m = normalizeMode(mode);
    for (var i = 0; i < HEATMAP_CATEGORIES.length; i += 1) {
      var cat = HEATMAP_CATEGORIES[i];
      for (var j = 0; j < cat.modes.length; j += 1) {
        if (normalizeMode(cat.modes[j]) === m) return cat;
      }
    }
    return null;
  }

  function isHeatmapRelatedRun(r) {
    if (!r || r.comboOnly === true) return false;
    return !!categoryForMode(r.mode);
  }

  /** 最近一局热图相关练习 → 默认展开分类 + 折线关卡 */
  function findLatestHeatmapRelatedSelection(runs) {
    var best = null;
    var bestCat = null;
    (runs || []).forEach(function (r) {
      if (!isHeatmapRelatedRun(r)) return;
      var cat = categoryForMode(r.mode);
      if (!cat) return;
      if (!best || (Number(r.ts) || 0) > (Number(best.ts) || 0)) {
        best = r;
        bestCat = cat;
      }
    });
    if (!best || !bestCat) {
      return { categoryId: 'arithmetic', levelIndex: 0, run: null };
    }
    var levelIndex = 0;
    if (typeof best.maxLevel === 'number' && Number.isFinite(best.maxLevel) && best.maxLevel >= 0) {
      levelIndex = clampLevel(best.maxLevel, bestCat.levelCount);
    } else if (Array.isArray(best.attempts) && best.attempts.length) {
      var last = best.attempts[best.attempts.length - 1];
      levelIndex = clampLevel(last && last.levelIndex, bestCat.levelCount);
    }
    return { categoryId: bestCat.id, levelIndex: levelIndex, run: best };
  }

  function levelLabel(prefix, levelIndex) {
    return String(prefix || 'L') + (Number(levelIndex) + 1);
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
  function personalWeightedByLevel(filteredRuns, maxTimeMs, nowMs, windowMax, halfLifeDays, levelCount) {
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
    var nLevels =
      levelCount > 0 && Number.isFinite(Number(levelCount)) ? Math.floor(Number(levelCount)) : LEVEL_COUNT;

    var cap = Number(maxTimeMs);
    if (!Number.isFinite(cap) || cap <= 0) cap = 60 * 1000;

    var buckets = Array.from({ length: nLevels }, function () {
      return [];
    });

    (filteredRuns || []).forEach(function (r) {
      if (!Array.isArray(r.attempts)) return;
      var runTs = Number(r.ts) || 0;
      r.attempts.forEach(function (a) {
        var k = clampLevel(a.levelIndex, nLevels);
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
    for (var k = 0; k < nLevels; k++) {
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
   * @param {Array} opts.runs
   * @param {object|null} ops.cohort
   * @param {number} [opts.levelCount] 默认 16
   * @param {string[]} [opts.modes] 默认 survival/level/training
   * @param {number} [opts.minAttempts]
   * @param {number} [opts.maxTimeSpentMs]
   * @param {number} [opts.nowTs]
   * @param {number} [opts.personalWindowAttempts]
   * @param {number} [opts.personalHalfLifeDays]
   */
  function buildHeatmapCells(opts) {
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var modes = opts.modes || ['survival', 'level', 'training'];
    var runs = filterRunsByModes(opts.runs, modes);
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

    var by = personalWeightedByLevel(runs, maxTimeMs, nowMs, windowAttempts, halfLifeDays, levelCount);
    var cohortLevels = cohort && Array.isArray(cohort.levels) ? cohort.levels : [];

    var cells = [];
    for (var k = 0; k < levelCount; k++) {
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
      levelCount: levelCount,
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
  var TRAINING_FLOW_STORAGE_PREFIX = 'jml_training_flow_v5:';
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

  /** 激活梯子顶 M：n≥10 的最高关；全无激活则 -1 */
  function computeActiveLadderTopM(cellsResult) {
    var M = -1;
    for (var i = 0; i < LEVEL_COUNT; i++) {
      var c = getCell(cellsResult, i);
      if (c.active) M = i;
    }
    return M;
  }

  /** 当日闯关起始关：稳 M 或开 M+1；全清则 enterBrush pool L1–L16 */
  function computeDailyFrontierStart(cellsResult) {
    var M = computeActiveLadderTopM(cellsResult);
    if (M < 0) {
      return {
        mode: 'daily',
        levelIndex: 0,
        reason: 'frontier_open_M1',
        enterBrush: false,
        brushPoolMax: null,
      };
    }
    var cM = getCell(cellsResult, M);
    if (cM.active && cM.p != null && cM.p < TRAINING_DAY_PASS_ACCURACY) {
      return {
        mode: 'daily',
        levelIndex: M,
        reason: 'frontier_stabilize_M',
        enterBrush: false,
        brushPoolMax: null,
      };
    }
    if (M < LEVEL_COUNT - 1) {
      var next = M + 1;
      var cNext = getCell(cellsResult, next);
      if (!cNext.active || cNext.p == null || cNext.p < TRAINING_DAY_PASS_ACCURACY) {
        return {
          mode: 'daily',
          levelIndex: next,
          reason: 'frontier_open_M1',
          enterBrush: false,
          brushPoolMax: null,
        };
      }
    }
    return {
      mode: 'brush',
      levelIndex: null,
      reason: 'daily_clear',
      enterBrush: true,
      brushPoolMax: LEVEL_COUNT - 1,
    };
  }

  /**
   * 刷热图 pool 内选关：先补 pool 内 active 且 p<95%（最低），再刷速度最慢。
   * @returns {{ levelIndex: number, reason: string }|null}
   */
  function recommendTrainingBrushInPool(cellsResult, brushPoolMax) {
    var maxIdx = clampLevel(brushPoolMax);
    if (maxIdx < 0) maxIdx = 0;

    var poolSet = {};
    for (var pi = 0; pi <= maxIdx; pi++) poolSet[pi] = true;

    var list = (cellsResult && cellsResult.cells) || [];
    var activeInPool = [];
    for (var j = 0; j < list.length; j++) {
      var c = list[j];
      if (c.active && poolSet[c.levelIndex]) activeInPool.push(c);
    }

    var belowPass = [];
    for (var b = 0; b < activeInPool.length; b++) {
      var p = activeInPool[b].p;
      if (p != null && p < TRAINING_BRUSH_PASS_ACCURACY) belowPass.push(activeInPool[b]);
    }
    if (belowPass.length) {
      var bestBelow = belowPass[0];
      for (var k = 1; k < belowPass.length; k++) {
        if (cmpMinWeightedP(belowPass[k], bestBelow) < 0) bestBelow = belowPass[k];
      }
      return { levelIndex: bestBelow.levelIndex, reason: 'brush_fix_red' };
    }

    var passCandidates = [];
    for (var t = 0; t < activeInPool.length; t++) {
      var pc = activeInPool[t];
      if (pc.p != null && pc.p >= TRAINING_BRUSH_PASS_ACCURACY) passCandidates.push(pc);
    }
    if (passCandidates.length) {
      var withPct = [];
      for (var u = 0; u < passCandidates.length; u++) {
        if (passCandidates[u].timePct != null) withPct.push(passCandidates[u]);
      }
      if (withPct.length) {
        var bt = withPct[0];
        for (var v = 1; v < withPct.length; v++) {
          var du = withPct[v].timePct - bt.timePct;
          if (du > 0 || (du === 0 && withPct[v].levelIndex < bt.levelIndex)) bt = withPct[v];
        }
        return { levelIndex: bt.levelIndex, reason: 'brush_pick_speed' };
      }
      var bestP = passCandidates[0];
      for (var w = 1; w < passCandidates.length; w++) {
        if (cmpMinWeightedP(passCandidates[w], bestP) < 0) bestP = passCandidates[w];
      }
      return { levelIndex: bestP.levelIndex, reason: 'brush_pick_speed' };
    }

    var withN = [];
    for (var x = 0; x <= maxIdx; x++) {
      if (!poolSet[x]) continue;
      var cell = getCell(cellsResult, x);
      if (cell.n > 0) withN.push(cell);
    }
    if (withN.length) {
      var bestN = withN[0];
      for (var y = 1; y < withN.length; y++) {
        if (cmpMinWeightedP(withN[y], bestN) < 0) bestN = withN[y];
      }
      return { levelIndex: bestN.levelIndex, reason: 'brush_fix_red' };
    }

    return { levelIndex: maxIdx, reason: 'brush_pick_speed' };
  }

  /**
   * 小数等：在已解锁 pool 内选关（不要求 active）。
   * 优先级：无 p（已解锁未练）→ p&lt;95% 最低 → ≥95% 中速度分位最慢。
   * 多个无 p 时取 levelIndex 最小（先补洞）。
   * @returns {{ levelIndex: number, reason: string }|null}
   */
  function recommendUnlockedWeightedBrush(cellsResult, poolMax) {
    var maxIdx = Math.max(0, Math.floor(Number(poolMax) || 0));
    var list = (cellsResult && cellsResult.cells) || [];
    var byIdx = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.levelIndex == null) continue;
      if (c.levelIndex > maxIdx) continue;
      byIdx[c.levelIndex] = c;
    }
    var pool = [];
    for (var li = 0; li <= maxIdx; li++) {
      pool.push(byIdx[li] || { levelIndex: li, p: null, timePct: null, n: 0 });
    }
    if (!pool.length) return null;

    var noP = [];
    for (var g = 0; g < pool.length; g++) {
      if (pool[g].p == null || !Number.isFinite(Number(pool[g].p))) noP.push(pool[g]);
    }
    if (noP.length) {
      var gap = noP[0];
      for (var h = 1; h < noP.length; h++) {
        if (noP[h].levelIndex < gap.levelIndex) gap = noP[h];
      }
      return { levelIndex: gap.levelIndex, reason: 'brush_fill_gap' };
    }

    var belowPass = [];
    for (var b = 0; b < pool.length; b++) {
      if (pool[b].p < TRAINING_BRUSH_PASS_ACCURACY) belowPass.push(pool[b]);
    }
    if (belowPass.length) {
      var bestBelow = belowPass[0];
      for (var k = 1; k < belowPass.length; k++) {
        if (cmpMinWeightedP(belowPass[k], bestBelow) < 0) bestBelow = belowPass[k];
      }
      return { levelIndex: bestBelow.levelIndex, reason: 'brush_fix_red' };
    }

    var withPct = [];
    for (var u = 0; u < pool.length; u++) {
      if (pool[u].timePct != null && Number.isFinite(Number(pool[u].timePct))) {
        withPct.push(pool[u]);
      }
    }
    if (withPct.length) {
      var bt = withPct[0];
      for (var v = 1; v < withPct.length; v++) {
        var du = withPct[v].timePct - bt.timePct;
        if (du > 0 || (du === 0 && withPct[v].levelIndex < bt.levelIndex)) bt = withPct[v];
      }
      return { levelIndex: bt.levelIndex, reason: 'brush_pick_speed' };
    }

    var bestP = pool[0];
    for (var w = 1; w < pool.length; w++) {
      if (cmpMinWeightedP(pool[w], bestP) < 0) bestP = pool[w];
    }
    return { levelIndex: bestP.levelIndex, reason: 'brush_pick_speed' };
  }

  function makeBrushPickResult(cellsResult, brushPoolMax, enterBrush, enterReason) {
    var poolMax = clampLevel(brushPoolMax != null ? brushPoolMax : LEVEL_COUNT - 1);
    var pick = recommendTrainingBrushInPool(cellsResult, poolMax);
    var levelIndex = pick ? pick.levelIndex : 0;
    return {
      mode: 'brush',
      levelIndex: levelIndex,
      reason: enterBrush && enterReason ? enterReason : pick ? pick.reason : 'brush_pick_speed',
      pickReason: pick ? pick.reason : 'brush_pick_speed',
      enterBrush: !!enterBrush,
      brushMode: true,
      brushPoolMax: poolMax,
    };
  }

  /** @deprecated 请用 recommendTrainingBrushInPool */
  function recommendTrainingBrushSlowAmongPass(cellsResult) {
    var pick = recommendTrainingBrushInPool(cellsResult, LEVEL_COUNT - 1);
    return pick ? pick.levelIndex : null;
  }

  function normalizeTrainingDayState(o, todayKey) {
    var prevTrack = null;
    if (o && typeof o === 'object') {
      if (o.lastCompletedTrack === 'daily' || o.lastCompletedTrack === 'brush') {
        prevTrack = o.lastCompletedTrack;
      }
    }
    var d = {
      dayKey: todayKey,
      brushMode: false,
      brushPoolMax: null,
      lastRun: null,
      lastCompletedTrack: prevTrack,
    };
    if (!o || typeof o !== 'object') return d;
    // 跨日：保留 lastCompletedTrack，清空当日推进链 / 刷热图会话
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
    var brushMode = !!(o.brushMode || o.forcedBrush);
    var brushPoolMax = null;
    if (brushMode) {
      brushPoolMax =
        o.brushPoolMax != null && Number.isFinite(Number(o.brushPoolMax))
          ? clampLevel(Number(o.brushPoolMax))
          : LEVEL_COUNT - 1;
    }
    return {
      dayKey: todayKey,
      brushMode: brushMode,
      brushPoolMax: brushPoolMax,
      lastRun: brushMode ? null : lastRun,
      lastCompletedTrack: prevTrack,
    };
  }

  /**
   * 训练 / Report 统一：根据热图 + 当日状态计算下一局关卡。
   * dayState: { dayKey, brushMode, brushPoolMax, lastRun|null, lastCompletedTrack:'daily'|'brush'|null }
   *
   * 推/刷 1:1：看「最近一次已完成训练局」类型——
   * 上次完成推进 → 下一次新开局（无当日 lastRun、未在刷热图会话）优先刷热图；
   * 上次完成刷热图 → 走推进 frontier。
   * 推进失败进入刷热图但未打完刷热图局：lastCompletedTrack 仍为 daily → 下次仍刷热图。
   */
  function computeTrainingNextLevel(cellsResult, dayState, todayKey) {
    var today = todayKey || '';
    var st = normalizeTrainingDayState(dayState, today);
    if (st.brushMode) {
      return makeBrushPickResult(cellsResult, st.brushPoolMax, false, null);
    }
    var lr = st.lastRun;
    if (!lr) {
      // 隔轨：上一完成局是推进 → 本局刷热图
      if (st.lastCompletedTrack === 'daily') {
        return makeBrushPickResult(cellsResult, LEVEL_COUNT - 1, true, 'alt_after_daily');
      }
      var start = computeDailyFrontierStart(cellsResult);
      if (start.enterBrush) {
        return makeBrushPickResult(cellsResult, start.brushPoolMax, true, start.reason);
      }
      return {
        mode: 'daily',
        levelIndex: start.levelIndex,
        reason: start.reason,
        enterBrush: false,
        brushMode: false,
        brushPoolMax: null,
      };
    }
    if (lr.passed) {
      var next = lr.levelIndex + 1;
      if (next >= LEVEL_COUNT) {
        return makeBrushPickResult(cellsResult, LEVEL_COUNT - 1, true, 'daily_pass_all_clear');
      }
      return {
        mode: 'daily',
        levelIndex: next,
        reason: 'daily_pass_next',
        enterBrush: false,
        brushMode: false,
        brushPoolMax: null,
      };
    }
    if (lr.failCount >= TRAINING_FAILS_BEFORE_BRUSH) {
      var poolMax = lr.levelIndex - 1;
      if (poolMax < 0) poolMax = 0;
      return makeBrushPickResult(cellsResult, poolMax, true, 'daily_fail_enter_brush');
    }
    return {
      mode: 'daily',
      levelIndex: lr.levelIndex,
      reason: 'retry_same',
      enterBrush: false,
      brushMode: false,
      brushPoolMax: null,
    };
  }

  /**
   * 不依赖热图 cells 的当日选关（与 computeTrainingNextLevel 中不需 heat 的分支一致）。
   * needsHeatmap=true 时 levelIndex 仅为占位，须等 buildHeatmapCells 后再算准。
   */
  function computeTrainingNextLevelSync(dayState, todayKey) {
    var today = todayKey || '';
    var st = normalizeTrainingDayState(dayState, today);
    if (st.brushMode) {
      var brushPool = st.brushPoolMax != null ? clampLevel(st.brushPoolMax) : LEVEL_COUNT - 1;
      return {
        mode: 'brush',
        levelIndex: brushPool,
        brushMode: true,
        brushPoolMax: brushPool,
        needsHeatmap: true,
        reason: 'brush_sync_pool_max',
      };
    }
    var lr = st.lastRun;
    if (!lr) {
      if (st.lastCompletedTrack === 'daily') {
        return {
          mode: 'brush',
          levelIndex: LEVEL_COUNT - 1,
          brushMode: true,
          brushPoolMax: LEVEL_COUNT - 1,
          needsHeatmap: true,
          reason: 'alt_after_daily',
          enterBrush: true,
        };
      }
      return {
        mode: 'daily',
        levelIndex: null,
        brushMode: false,
        brushPoolMax: null,
        needsHeatmap: true,
        reason: 'frontier_needs_heat',
      };
    }
    if (lr.passed) {
      var next = lr.levelIndex + 1;
      if (next >= LEVEL_COUNT) {
        return {
          mode: 'brush',
          levelIndex: LEVEL_COUNT - 1,
          brushMode: true,
          brushPoolMax: LEVEL_COUNT - 1,
          needsHeatmap: true,
          reason: 'daily_pass_all_clear',
        };
      }
      return {
        mode: 'daily',
        levelIndex: next,
        brushMode: false,
        brushPoolMax: null,
        needsHeatmap: false,
        reason: 'daily_pass_next',
      };
    }
    if (lr.failCount >= TRAINING_FAILS_BEFORE_BRUSH) {
      var poolMax = lr.levelIndex - 1;
      if (poolMax < 0) poolMax = 0;
      return {
        mode: 'brush',
        levelIndex: poolMax,
        brushMode: true,
        brushPoolMax: poolMax,
        needsHeatmap: true,
        reason: 'daily_fail_enter_brush',
      };
    }
    return {
      mode: 'daily',
      levelIndex: lr.levelIndex,
      brushMode: false,
      brushPoolMax: null,
      needsHeatmap: false,
      reason: 'retry_same',
    };
  }

  function trainingNextLevelReasonText(result, labels) {
    if (!result) return '';
    var L = labels || {};
    var code = result.pickReason || result.reason;
    if (code === 'brush_fix_red') return L.brushFixRed || '刷热图：补 pool 内加权<95%（最低）';
    if (code === 'brush_pick_speed') return L.brushPickSpeed || '刷热图：pool 内全绿，速度分位最慢';
    if (result.reason === 'frontier_stabilize_M') {
      return L.frontierStabilizeM || '当日闯关：稳梯子顶 M（加权<95%）';
    }
    if (result.reason === 'frontier_open_M1') return L.frontierOpenM1 || '当日闯关：开 M+1（顶已绿）';
    if (result.reason === 'daily_clear') return L.dailyClear || '当日闯关全清，进刷热图 L1–L16';
    if (result.reason === 'daily_pass_all_clear') {
      return L.dailyPassAllClear || '当日线性推完，进刷热图 L1–L16';
    }
    if (result.reason === 'daily_fail_enter_brush') {
      return L.dailyFailEnterBrush || '本关三败，进刷热图（不含本关及以上）';
    }
    if (result.reason === 'alt_after_daily') {
      return L.altAfterDaily || '隔轨：上一完成局为推进，本局刷热图';
    }
    if (result.reason === 'daily_pass_next') return L.dailyPassNext || '当日闯关：上局达标，下一关';
    if (result.reason === 'retry_same') return L.retrySame || '当日闯关：本关继续（未达单局95%）';
    if (result.reason === 'scan_below') return L.scanBelow || '当日闯关：第一个加权准确率<95%';
    if (result.reason === 'open_new') return L.openNew || '当日闯关：开新关（题数<10）';
    if (result.reason === 'after_fail_below') return L.afterFailBelow || '当日闯关：三败后下一弱关';
    return L.dailyDefault || '当日闯关';
  }

  /**
   * @deprecated 请用 recommendTrainingBrushInPool
   */
  function recommendTrainingBrushLevel(cellsResult, poolIndices) {
    var maxIdx = LEVEL_COUNT - 1;
    if (poolIndices && poolIndices.length) {
      maxIdx = poolIndices[poolIndices.length - 1];
      for (var i = 0; i < poolIndices.length; i++) {
        if (poolIndices[i] > maxIdx) maxIdx = poolIndices[i];
      }
    }
    var pick = recommendTrainingBrushInPool(cellsResult, maxIdx);
    return pick ? pick.levelIndex : null;
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
    var priorTrack = null;
    var allTraining = (runs || [])
      .filter(function (r) {
        return String(r && r.mode ? r.mode : '').toLowerCase() === 'training';
      })
      .filter(function (r) {
        return r && r.comboOnly !== true;
      })
      .slice()
      .sort(function (a, b) {
        return (a.ts || 0) - (b.ts || 0);
      });
    for (var pi = 0; pi < allTraining.length; pi++) {
      var pr = allTraining[pi];
      if (localDayKeyFromTs(pr.ts) === todayKey) break;
      priorTrack = pr.trainingMeta && pr.trainingMeta.runBrushMode ? 'brush' : 'daily';
    }

    var st = {
      dayKey: todayKey,
      brushMode: false,
      brushPoolMax: null,
      lastRun: null,
      lastCompletedTrack: priorTrack,
    };
    if (!todayKey) return normalizeTrainingDayState(st, todayKey);
    var trainingToday = allTraining.filter(function (r) {
      return localDayKeyFromTs(r.ts) === todayKey;
    });
    var arith = filterArithmeticRuns(runs || []);
    var capMs =
      buildHeatOpts && Number(buildHeatOpts.maxTimeSpentMs)
        ? Number(buildHeatOpts.maxTimeSpentMs)
        : 60 * 1000;
    var cohort = buildHeatOpts && buildHeatOpts.cohort ? buildHeatOpts.cohort : null;

    for (var i = 0; i < trainingToday.length; i++) {
      var run = trainingToday[i];
      var runBrush = !!(run.trainingMeta && run.trainingMeta.runBrushMode);
      st.lastCompletedTrack = runBrush ? 'brush' : 'daily';

      if (run.trainingMeta && run.trainingMeta.dayStateAfter) {
        var da = run.trainingMeta.dayStateAfter;
        var trackAfter =
          da.lastCompletedTrack === 'daily' || da.lastCompletedTrack === 'brush'
            ? da.lastCompletedTrack
            : st.lastCompletedTrack;
        st = {
          dayKey: todayKey,
          brushMode: !!da.brushMode,
          brushPoolMax:
            da.brushPoolMax != null && Number.isFinite(Number(da.brushPoolMax))
              ? clampLevel(Number(da.brushPoolMax))
              : da.brushMode
                ? LEVEL_COUNT - 1
                : null,
          lastRun: da.brushMode ? null : da.lastRun && typeof da.lastRun === 'object' ? da.lastRun : null,
          lastCompletedTrack: trackAfter,
        };
        continue;
      }
      var levelIndex = Math.min(15, Math.max(0, Math.floor(Number(run.maxLevel) || 0)));
      var runPass = run.cleared === true;

      if (runBrush) {
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
          st.brushPoolMax =
            result.brushPoolMax != null ? clampLevel(result.brushPoolMax) : LEVEL_COUNT - 1;
          st.lastRun = null;
        }
      }
    }
    return normalizeTrainingDayState(st, todayKey);
  }

  global.JmlStatsHeatmap = {
    LEVEL_COUNT: LEVEL_COUNT,
    DECIMAL_LEVEL_COUNT: DECIMAL_LEVEL_COUNT,
    HEATMAP_CATEGORIES: HEATMAP_CATEGORIES,
    getHeatmapCategories: getHeatmapCategories,
    getHeatmapCategory: getHeatmapCategory,
    categoryForMode: categoryForMode,
    isHeatmapRelatedRun: isHeatmapRelatedRun,
    findLatestHeatmapRelatedSelection: findLatestHeatmapRelatedSelection,
    levelLabel: levelLabel,
    fullLevelPoolIndices: fullLevelPoolIndices,
    MS_PER_DAY: MS_PER_DAY,
    PERSONAL_WINDOW_ATTEMPTS: PERSONAL_WINDOW_ATTEMPTS,
    PERSONAL_HALF_LIFE_DAYS: PERSONAL_HALF_LIFE_DAYS,
    normalizeMode: normalizeMode,
    filterRunsByModes: filterRunsByModes,
    filterArithmeticRuns: filterArithmeticRuns,
    filterDecimalRuns: filterDecimalRuns,
    buildHeatmapCells: buildHeatmapCells,
    recommendLevelIndex: recommendLevelIndex,
    recommendLevelIndexAccuracyBrush: recommendLevelIndexAccuracyBrush,
    recommendTrainingBrushLevel: recommendTrainingBrushLevel,
    recommendTrainingBrushSlowAmongPass: recommendTrainingBrushSlowAmongPass,
    recommendTrainingBrushInPool: recommendTrainingBrushInPool,
    recommendUnlockedWeightedBrush: recommendUnlockedWeightedBrush,
    computeActiveLadderTopM: computeActiveLadderTopM,
    computeDailyFrontierStart: computeDailyFrontierStart,
    computeTrainingNextLevel: computeTrainingNextLevel,
    computeTrainingNextLevelSync: computeTrainingNextLevelSync,
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
