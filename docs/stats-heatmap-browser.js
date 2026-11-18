/**
 * 【Pages 发布副本】算法真源：server/stats-heatmap-browser.js
 * 勿在此直接改算法；改 server 后于 server/ 执行 npm run sync-heatmap。
 *
 * 难度热图：个人加权指标 × 全体速度常模；主站/报表展示与分类元数据用。
 * 训练选关与热图格子数据以服务器 API 为准。
 */
(function (global) {
  /**
   * 四则热图格数 = L1–L20（含隐藏档）。
   * 可玩/学员显隐由 JmlArithmetic.CONTENT_MAX_INDEX + 解锁控制；本模块只负责格子算法。
   */
  var LEVEL_COUNT = 20;
  var DECIMAL_LEVEL_COUNT = 6;
  var PERFECT_SQUARE_LEVEL_COUNT = 4;
  var DIVISIBILITY_LEVEL_COUNT = 4; // 热图仅 Z1–Z4；Z5 冲记录，不进热图
  var FACTORS_MULTIPLES_LEVEL_COUNT = 6;
  /** 因倍 Y1–Y2 二选一走「按局」口径；Y3–Y6 填空仍按题 */
  var FACTORS_MULTIPLES_CHOICE_LEVEL_MAX = 1; // inclusive
  var MS_PER_DAY = 86400000;
  var PERSONAL_WINDOW_ATTEMPTS = 200;
  var PERSONAL_HALF_LIFE_DAYS = 14;

  /** 热图分类注册表（拆括号仅补 attempt，暂不进热图）；质数合数以虚拟 Y0 挂在因倍栏前。顺序：四则→平方数→整除→因数倍数→小数 */
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
      id: 'perfectSquare',
      modes: ['perfectSquare'],
      levelCount: PERFECT_SQUARE_LEVEL_COUNT,
      levelPrefix: 'L',
      labelKey: 'stats.cat.perfectSquare',
      labelFallback: '平方数',
      cohortKind: 'perfectSquare',
    },
    {
      id: 'divisibility',
      modes: ['divisibility'],
      levelCount: DIVISIBILITY_LEVEL_COUNT,
      levelPrefix: 'Z',
      labelKey: 'stats.cat.divisibility',
      labelFallback: '整除',
      cohortKind: 'divisibility',
    },
    {
      id: 'factorsMultiples',
      modes: ['factorsMultiples'],
      levelCount: FACTORS_MULTIPLES_LEVEL_COUNT,
      levelPrefix: 'Y',
      labelKey: 'stats.cat.factorsMultiples',
      labelFallback: '因数倍数',
      cohortKind: 'factorsMultiples',
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

  /** 质数合数 Y0 / 二选一档：按局统计；≥10 题计入（含放弃）；窗 10 局；题数加权 + 天衰减 */
  var PRIME_RUN_MIN_ATTEMPTS = 10;
  var PRIME_WINDOW_RUNS = 10;
  /** 题均耗时上限（排除挂机）；超过则该局不进速度侧 */
  var PRIME_MS_PER_Q_CAP = 60 * 1000;
  /** 二选一（整除 Z1–Z4 / 因倍 Y1–Y2 / 质数）：与质数同窗 */
  var CHOICE_RUN_MIN_ATTEMPTS = 10;
  var CHOICE_WINDOW_RUNS = 10;
  /** 速度入选：局正确率下限（准度进窗不过此筛） */
  var CHOICE_SPEED_MIN_ACCURACY = 0.9;
  var CHOICE_MS_PER_Q_CAP = 60 * 1000;
  /** 窗内无合格速度局时，比分/上色用的速度分位（越大越慢） */
  var MISSING_SPEED_TIME_PCT = 100;

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
    if (normalizeMode(r.mode) === 'primecomposite') return true;
    return !!categoryForMode(r.mode);
  }

  function runAttemptCount(r) {
    if (!r) return 0;
    if (Array.isArray(r.attempts)) return r.attempts.length;
    var n = Number(r.attemptCount);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function runDurationSec(r) {
    if (!r) return null;
    var a = Number(r.survivalTimeSec);
    if (Number.isFinite(a) && a > 0) return a;
    var b = Number(r.durationSec);
    if (Number.isFinite(b) && b > 0) return b;
    return null;
  }

  function runCorrectCount(r) {
    var n = 0;
    var list = r && Array.isArray(r.attempts) ? r.attempts : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].correct === true) n += 1;
    }
    return n;
  }

  function runAccuracy(r) {
    var n = runAttemptCount(r);
    if (!(n > 0)) return null;
    return runCorrectCount(r) / n;
  }

  function isChoiceSpeedEligible(p, msPerQ, msCap) {
    var cap = Number(msCap) > 0 ? Number(msCap) : CHOICE_MS_PER_Q_CAP;
    if (p == null || !Number.isFinite(Number(p)) || Number(p) < CHOICE_SPEED_MIN_ACCURACY) return false;
    if (msPerQ == null || !Number.isFinite(Number(msPerQ)) || !(Number(msPerQ) > 0)) return false;
    if (Number(msPerQ) > cap) return false;
    return true;
  }

  /** 整除局 → 热图档；Z5（index≥4）返回 null（不进热图） */
  function resolveDivisibilityRunHeatLevel(r) {
    if (!r) return null;
    var meta = r.trainingMeta && typeof r.trainingMeta === 'object' ? r.trainingMeta : null;
    var raw = meta && meta.pickedLevel != null ? meta.pickedLevel : r.maxLevel;
    var lv = Math.floor(Number(raw));
    if (!Number.isFinite(lv) || lv < 0) return null;
    if (lv >= DIVISIBILITY_LEVEL_COUNT) return null;
    return lv;
  }

  function resolveFactorsMultiplesRunHeatLevel(r) {
    if (!r) return null;
    var meta = r.trainingMeta && typeof r.trainingMeta === 'object' ? r.trainingMeta : null;
    var raw = meta && meta.pickedLevel != null ? meta.pickedLevel : r.maxLevel;
    var lv = Math.floor(Number(raw));
    if (!Number.isFinite(lv) || lv < 0) return null;
    if (lv >= FACTORS_MULTIPLES_LEVEL_COUNT) return null;
    return lv;
  }

  /**
   * 速度缺失时分位按 100；有 meanLn 则正常算分位/过慢。
   * @returns {{ timePct: number|null, tooSlow: boolean|null }}
   */
  function applyChoiceSpeedPercentile(active, meanLn, lnQ) {
    if (!active) return { timePct: null, tooSlow: null };
    if (meanLn != null && Number.isFinite(Number(meanLn))) {
      return {
        timePct: lnQ ? percentileFromQuantileSummary(meanLn, lnQ) : null,
        tooSlow: isTooSlowMeanLn(meanLn, lnQ),
      };
    }
    return { timePct: MISSING_SPEED_TIME_PCT, tooSlow: true };
  }

  /** 质数合数合格局：mode 匹配且 attempt≥10（含放弃；&lt;10 不计，避免一错即退） */
  function isPrimeQualifyingRun(r) {
    if (!r || r.comboOnly === true) return false;
    if (normalizeMode(r.mode) !== 'primecomposite') return false;
    return runAttemptCount(r) >= PRIME_RUN_MIN_ATTEMPTS;
  }

  function hasPrimeQualifyingHistory(runs) {
    var list = runs || [];
    for (var i = 0; i < list.length; i += 1) {
      if (isPrimeQualifyingRun(list[i])) return true;
    }
    return false;
  }

  function emptyPrimeY0Cell() {
    return {
      levelIndex: -1,
      active: false,
      n: 0,
      p: null,
      pText: '-',
      meanLnCorrect: null,
      medianLnCorrect: null,
      timePct: null,
      tooSlow: null,
      accurate: false,
      fluent: false,
      nEff: null,
      ageDaysMin: null,
      ageDaysMax: null,
      avgSecText: '-',
      isPrimeY0: true,
      sampleUnit: 'runs',
      labelOverride: 'Y0',
    };
  }

  /**
   * 质数合数虚拟 Y0：按局正确率 ×（天衰减×题数）加权；速度用题均耗时 ln(ms/题)。
   * @returns {{ cell: object, hasHistory: boolean }}
   */
  function buildPrimeY0Cell(opts) {
    opts = opts || {};
    var nowMs = Number(opts.nowTs) && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var halfLife =
      Number(opts.personalHalfLifeDays) > 0 ? Number(opts.personalHalfLifeDays) : PERSONAL_HALF_LIFE_DAYS;
    var lambda = Math.LN2 / halfLife;
    var windowMax =
      Number(opts.personalWindowRuns) > 0
        ? Math.min(50, Math.floor(Number(opts.personalWindowRuns)))
        : PRIME_WINDOW_RUNS;
    var msCap =
      Number(opts.maxMsPerQuestion) > 0
        ? Number(opts.maxMsPerQuestion)
        : PRIME_MS_PER_Q_CAP;
    var cohort = opts.cohort && opts.cohort.ok !== false ? opts.cohort : null;
    var cohortRow =
      cohort && Array.isArray(cohort.levels) && cohort.levels[0] ? cohort.levels[0] : {};
    var lnQ = cohortRow.cohortLnTimeCorrect || null;

    var allQual = [];
    (opts.runs || []).forEach(function (r) {
      if (!isPrimeQualifyingRun(r)) return;
      var n = runAttemptCount(r);
      if (!(n >= PRIME_RUN_MIN_ATTEMPTS)) return;
      var correct = 0;
      if (Array.isArray(r.attempts)) {
        for (var i = 0; i < r.attempts.length; i += 1) {
          if (r.attempts[i] && r.attempts[i].correct) correct += 1;
        }
      } else {
        return;
      }
      var durSec = runDurationSec(r);
      var msPerQ = durSec != null && n > 0 ? (durSec * 1000) / n : null;
      allQual.push({
        runTs: Number(r.ts) || 0,
        n: n,
        p: correct / n,
        msPerQ: msPerQ,
      });
    });
    allQual.sort(function (a, b) {
      return a.runTs - b.runTs;
    });
    var hasHistory = allQual.length > 0;
    var slice = allQual.length > windowMax ? allQual.slice(allQual.length - windowMax) : allQual;
    if (!slice.length) {
      return { cell: emptyPrimeY0Cell(), hasHistory: hasHistory };
    }

    var sumW = 0;
    var sumWP = 0;
    var sumWLn = 0;
    var sumWLnDen = 0;
    var sumW2 = 0;
    var minAge = null;
    var maxAge = null;
    for (var j = 0; j < slice.length; j += 1) {
      var it = slice[j];
      var ageDays = it.runTs > 0 ? Math.max(0, Math.floor((nowMs - it.runTs) / MS_PER_DAY)) : 0;
      var w = Math.exp(-lambda * ageDays) * it.n;
      if (!(w > 0) || !Number.isFinite(w)) continue;
      sumW += w;
      sumWP += w * it.p;
      sumW2 += w * w;
      if (minAge === null || ageDays < minAge) minAge = ageDays;
      if (maxAge === null || ageDays > maxAge) maxAge = ageDays;
      // 速度：仅局准≥90% 且题均耗时≤cap
      if (isChoiceSpeedEligible(it.p, it.msPerQ, msCap)) {
        sumWLnDen += w;
        sumWLn += w * Math.log(it.msPerQ);
      }
    }

    var p = sumW > 0 ? sumWP / sumW : null;
    var meanLn = sumWLnDen > 0 ? sumWLn / sumWLnDen : null;
    var active = slice.length >= 1;
    var speedGate = applyChoiceSpeedPercentile(active, meanLn, lnQ);
    var timePct = speedGate.timePct;
    var tooSlow = speedGate.tooSlow;
    var accurate = !!(active && p != null && Number.isFinite(p) && p >= TRAINING_BRUSH_PASS_ACCURACY);
    var fluent = accurate && tooSlow !== true;
    var avgSecText = '-';
    if (meanLn != null && Number.isFinite(meanLn)) {
      var geoMeanMs = Math.exp(meanLn);
      var secDisplay = geoMeanMs / 1000;
      if (secDisplay > 0 && secDisplay < 600 && Number.isFinite(secDisplay)) {
        avgSecText = String(Math.round(secDisplay * 10) / 10) + 's';
      }
    }

    return {
      cell: {
        levelIndex: -1,
        active: active,
        n: slice.length,
        p: p,
        pText: p != null ? (Math.round(p * 1000) / 10).toFixed(1) + '%' : '-',
        meanLnCorrect: meanLn,
        medianLnCorrect: meanLn,
        timePct: timePct,
        tooSlow: tooSlow,
        accurate: accurate,
        fluent: fluent,
        nEff: sumW2 > 0 && sumW > 0 ? Math.round(((sumW * sumW) / sumW2) * 10) / 10 : slice.length,
        ageDaysMin: minAge,
        ageDaysMax: maxAge,
        avgSecText: avgSecText,
        isPrimeY0: true,
        sampleUnit: 'runs',
        labelOverride: 'Y0',
      },
      hasHistory: hasHistory,
    };
  }

  /** 把 Y0 挂到因倍 heat 上（不改 cells 长度 / Y1–Y6 index） */
  function attachPrimeY0ToFactorsHeat(heat, runs, primeCohort, nowMs) {
    var base = heat && typeof heat === 'object' ? heat : { cells: [] };
    var built = buildPrimeY0Cell({
      runs: runs,
      cohort: primeCohort,
      nowTs: nowMs,
    });
    var style =
      typeof heatmapCellInlineStyle === 'function' ? heatmapCellInlineStyle(built.cell) || '' : '';
    base.y0 = Object.assign({}, built.cell, { cellStyle: style });
    base.y0HasHistory = !!built.hasHistory;
    return base;
  }

  /** 展示用格子：因倍在可见时前置 Y0 */
  function heatCellsForDisplay(heat, categoryId, opts) {
    opts = opts || {};
    var cells = heat && Array.isArray(heat.cells) ? heat.cells.slice() : [];
    if (categoryId !== 'factorsMultiples' || !heat || !heat.y0) return cells;
    var show = opts.forceY0 === true || heat.y0HasHistory === true;
    if (!show) return cells;
    return [heat.y0].concat(cells);
  }

  /** 最近一局热图相关练习 → 默认展开分类 + 折线关卡 */
  function findLatestHeatmapRelatedSelection(runs) {
    var best = null;
    var bestCat = null;
    var bestIsPrime = false;
    (runs || []).forEach(function (r) {
      if (!isHeatmapRelatedRun(r)) return;
      var isPrime = normalizeMode(r.mode) === 'primecomposite';
      var cat = isPrime ? getHeatmapCategory('factorsMultiples') : categoryForMode(r.mode);
      if (!cat) return;
      if (!best || (Number(r.ts) || 0) > (Number(best.ts) || 0)) {
        best = r;
        bestCat = cat;
        bestIsPrime = isPrime;
      }
    });
    if (!best || !bestCat) {
      return { categoryId: 'arithmetic', levelIndex: 0, run: null };
    }
    if (bestIsPrime) {
      return { categoryId: 'factorsMultiples', levelIndex: -1, run: best };
    }
    var levelIndex = 0;
    if (bestCat.id === 'divisibility' && Array.isArray(best.attempts) && best.attempts.length) {
      var lastA = best.attempts[best.attempts.length - 1];
      var mapped =
        typeof resolveDivisibilityAttemptLevel === 'function'
          ? resolveDivisibilityAttemptLevel(lastA)
          : null;
      if (mapped == null && lastA) {
        var li0 = Math.floor(Number(lastA.levelIndex));
        if (Number.isFinite(li0) && li0 >= 0 && li0 < bestCat.levelCount) mapped = li0;
      }
      levelIndex = clampLevel(mapped != null ? mapped : 0, bestCat.levelCount);
    } else if (typeof best.maxLevel === 'number' && Number.isFinite(best.maxLevel) && best.maxLevel >= 0) {
      levelIndex = clampLevel(best.maxLevel, bestCat.levelCount);
    } else if (Array.isArray(best.attempts) && best.attempts.length) {
      var last = best.attempts[best.attempts.length - 1];
      levelIndex = clampLevel(last && last.levelIndex, bestCat.levelCount);
    }
    return { categoryId: bestCat.id, levelIndex: levelIndex, run: best };
  }

  function resolveDivisibilityAttemptLevel(a) {
    var D = global.JmlDivisibility;
    if (D && typeof D.heatLevelIndexFromAttempt === 'function') {
      return D.heatLevelIndexFromAttempt(a);
    }
    // report 页可能未加载出题脚本：内联同一映射
    var d = Math.floor(Number(a && a.divisor));
    var map = { 2: 0, 5: 0, 3: 1, 9: 1, 4: 2, 8: 2, 6: 3, 12: 3 };
    if (Number.isFinite(d) && Object.prototype.hasOwnProperty.call(map, d)) return map[d];
    var li = Math.floor(Number(a && a.levelIndex));
    if (Number.isFinite(li) && li >= 0 && li < DIVISIBILITY_LEVEL_COUNT) return li;
    return null;
  }

  function levelLabel(prefix, levelIndex) {
    return String(prefix || 'L') + (Number(levelIndex) + 1);
  }

  /** 标准正态 CDF Φ(z)，Abramowitz & Stegun 26.2.17 */
  function standardNormalCdf(z) {
    var x = Number(z);
    if (!Number.isFinite(x)) return null;
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804014327;
    var p = d * Math.exp(-0.5 * x * x);
    var poly =
      t *
      (0.31938153 +
        t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    var cdf = x >= 0 ? 1 - p * poly : p * poly;
    return Math.max(0, Math.min(1, cdf));
  }

  /**
   * ln 空间：假定人级 meanLn ~ N(mean, sd²)（原始用时 lognormal）。
   * 返回 0–100，越大越慢；value===mean → 50；mean+1σ → ≈84。
   */
  function percentileFromMeanSd(value, mean, sd) {
    if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(mean))) return null;
    var m = Number(mean);
    var s = Number(sd);
    if (!Number.isFinite(s) || s < 0) return null;
    if (s < 1e-12) return 50;
    var z = (Number(value) - m) / s;
    var cdf = standardNormalCdf(z);
    if (cdf == null) return null;
    return Math.max(0, Math.min(100, cdf * 100));
  }

  /** 分位点摘要 → 百分位 0–100（优先 mean/sd 正态；否则 q10…q90 插值）。越大越慢。 */
  function percentileFromQuantileSummary(value, q) {
    if (value == null || !q) return null;
    var fromMeanSd = percentileFromMeanSd(Number(value), Number(q.mean), Number(q.sd));
    if (fromMeanSd != null) return fromMeanSd;

    if (!q.n) return null;
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
  function personalWeightedByLevel(filteredRuns, maxTimeMs, nowMs, windowMax, halfLifeDays, levelCount, resolveLevelIndex) {
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
        var k;
        if (typeof resolveLevelIndex === 'function') {
          k = resolveLevelIndex(a);
          if (k == null || !Number.isFinite(Number(k))) return;
          k = clampLevel(k, nLevels);
        } else {
          k = clampLevel(a.levelIndex, nLevels);
        }
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
   * 二选一按局近窗：准度=窗内全部局；速度=窗内准≥90% 局的整局时长/题数。
   * @returns {Array<{ n, weightedP, meanLnCorrect, sumW, nEff, minAgeDays, maxAgeDays, sampleUnit }>}
   */
  function personalWeightedByChoiceRuns(filteredRuns, opts) {
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : 1;
    var nowMs = Number(opts.nowTs) && Number.isFinite(Number(opts.nowTs)) ? Number(opts.nowTs) : Date.now();
    var halfLife =
      Number(opts.halfLifeDays) > 0 && Number.isFinite(Number(opts.halfLifeDays))
        ? Number(opts.halfLifeDays)
        : PERSONAL_HALF_LIFE_DAYS;
    var lambda = Math.LN2 / halfLife;
    var windowMax =
      Number(opts.windowRuns) > 0
        ? Math.min(50, Math.floor(Number(opts.windowRuns)))
        : CHOICE_WINDOW_RUNS;
    var msCap = Number(opts.msPerQCap) > 0 ? Number(opts.msPerQCap) : CHOICE_MS_PER_Q_CAP;
    var resolveRunLevel = typeof opts.resolveRunLevel === 'function' ? opts.resolveRunLevel : null;
    var levelFilter = typeof opts.levelFilter === 'function' ? opts.levelFilter : null;

    var byLevelLists = [];
    var li;
    for (li = 0; li < levelCount; li += 1) byLevelLists.push([]);

    (filteredRuns || []).forEach(function (r) {
      if (!r || r.comboOnly === true) return;
      var n = runAttemptCount(r);
      if (!(n >= CHOICE_RUN_MIN_ATTEMPTS)) return;
      if (!Array.isArray(r.attempts) || !r.attempts.length) return;
      var lv = resolveRunLevel ? resolveRunLevel(r) : Math.floor(Number(r.maxLevel) || 0);
      if (lv == null || !Number.isFinite(lv) || lv < 0 || lv >= levelCount) return;
      if (levelFilter && !levelFilter(lv)) return;
      var correct = runCorrectCount(r);
      var p = correct / n;
      var durSec = runDurationSec(r);
      var msPerQ = durSec != null && n > 0 ? (durSec * 1000) / n : null;
      byLevelLists[lv].push({
        runTs: Number(r.ts) || 0,
        n: n,
        p: p,
        msPerQ: msPerQ,
      });
    });

    var by = [];
    for (var k = 0; k < levelCount; k += 1) {
      if (levelFilter && !levelFilter(k)) {
        by.push({
          n: 0,
          weightedP: null,
          meanLnCorrect: null,
          sumW: 0,
          nEff: 0,
          minAgeDays: null,
          maxAgeDays: null,
          sampleUnit: 'runs',
        });
        continue;
      }
      var allQual = byLevelLists[k];
      allQual.sort(function (a, b) {
        return a.runTs - b.runTs;
      });
      var slice = allQual.length > windowMax ? allQual.slice(allQual.length - windowMax) : allQual;
      var sumW = 0;
      var sumWP = 0;
      var sumWLn = 0;
      var sumWLnDen = 0;
      var sumW2 = 0;
      var minAge = null;
      var maxAge = null;
      for (var j = 0; j < slice.length; j += 1) {
        var it = slice[j];
        var ageDays = it.runTs > 0 ? Math.max(0, Math.floor((nowMs - it.runTs) / MS_PER_DAY)) : 0;
        var w = Math.exp(-lambda * ageDays) * it.n;
        if (!(w > 0) || !Number.isFinite(w)) continue;
        sumW += w;
        sumWP += w * it.p;
        sumW2 += w * w;
        if (minAge === null || ageDays < minAge) minAge = ageDays;
        if (maxAge === null || ageDays > maxAge) maxAge = ageDays;
        if (isChoiceSpeedEligible(it.p, it.msPerQ, msCap)) {
          sumWLnDen += w;
          sumWLn += w * Math.log(it.msPerQ);
        }
      }
      by.push({
        n: slice.length,
        weightedP: sumW > 0 ? sumWP / sumW : null,
        meanLnCorrect: sumWLnDen > 0 ? sumWLn / sumWLnDen : null,
        sumW: sumW,
        nEff: sumW2 > 0 && sumW > 0 ? (sumW * sumW) / sumW2 : slice.length,
        minAgeDays: minAge,
        maxAgeDays: maxAge,
        sampleUnit: 'runs',
      });
    }
    return by;
  }

  function cellFromWeightedBucket(k, b, cohortRow, minActiveN, useChoiceSpeedGate) {
    var p = b.weightedP;
    var pText = p != null ? (Math.round(p * 1000) / 10).toFixed(1) + '%' : '-';
    var meanLn = b.meanLnCorrect;
    var active = b.n >= minActiveN;
    var lnQ = cohortRow && cohortRow.cohortLnTimeCorrect ? cohortRow.cohortLnTimeCorrect : null;
    var timePct;
    var tooSlow;
    if (useChoiceSpeedGate) {
      var gate = applyChoiceSpeedPercentile(active, meanLn, lnQ);
      timePct = gate.timePct;
      tooSlow = gate.tooSlow;
    } else {
      timePct = active && meanLn != null && lnQ ? percentileFromQuantileSummary(meanLn, lnQ) : null;
      tooSlow = active && meanLn != null ? isTooSlowMeanLn(meanLn, lnQ) : null;
    }
    var accurate = !!(active && p != null && Number.isFinite(p) && p >= TRAINING_BRUSH_PASS_ACCURACY);
    var fluent = accurate && tooSlow !== true;
    var avgSecText = '-';
    if (meanLn != null && Number.isFinite(meanLn)) {
      var geoMeanMs = Math.exp(meanLn);
      var secDisplay = geoMeanMs / 1000;
      if (secDisplay > 0 && secDisplay < 600 && Number.isFinite(secDisplay)) {
        avgSecText = String(Math.round(secDisplay * 10) / 10) + 's';
      }
    }
    return {
      levelIndex: k,
      active: active,
      n: b.n,
      p: p,
      pText: pText,
      meanLnCorrect: meanLn,
      medianLnCorrect: meanLn,
      timePct: timePct,
      tooSlow: tooSlow,
      accurate: accurate,
      fluent: fluent,
      nEff: b.nEff != null ? Math.round(b.nEff * 10) / 10 : null,
      ageDaysMin: b.minAgeDays,
      ageDaysMax: b.maxAgeDays,
      avgSecText: avgSecText,
      sampleUnit: b.sampleUnit || 'attempts',
    };
  }

  /**
   * @param {object} opts
   * @param {Array} opts.runs
   * @param {object|null} opts.cohort
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
    var modeKey =
      modes.length === 1
        ? String(modes[0] || '')
            .toLowerCase()
            .replace(/[_-]/g, '')
        : '';
    var isDivisibility = modeKey === 'divisibility';
    var isFactorsMultiples = modeKey === 'factorsmultiples';
    var resolveLevelIndex = opts.resolveAttemptLevelIndex;
    if (typeof resolveLevelIndex !== 'function') {
      if (isDivisibility) resolveLevelIndex = resolveDivisibilityAttemptLevel;
    }
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
    var cohortLevels = cohort && Array.isArray(cohort.levels) ? cohort.levels : [];

    var cells = [];
    var personalWindowRuns = null;

    if (isDivisibility) {
      // 整除：近 10 局；Z5 不进；速度准≥90%；缺失分位=100。active≥1 局
      personalWindowRuns = CHOICE_WINDOW_RUNS;
      var divBy = personalWeightedByChoiceRuns(runs, {
        levelCount: levelCount,
        nowTs: nowMs,
        halfLifeDays: halfLifeDays,
        windowRuns: CHOICE_WINDOW_RUNS,
        msPerQCap: maxTimeMs,
        resolveRunLevel: resolveDivisibilityRunHeatLevel,
      });
      for (var dk = 0; dk < levelCount; dk += 1) {
        cells.push(cellFromWeightedBucket(dk, divBy[dk], cohortLevels[dk] || {}, 1, true));
      }
    } else if (isFactorsMultiples) {
      // Y1–Y2 按局；Y3–Y6 按题（近 200）
      personalWindowRuns = CHOICE_WINDOW_RUNS;
      var fmChoiceBy = personalWeightedByChoiceRuns(runs, {
        levelCount: levelCount,
        nowTs: nowMs,
        halfLifeDays: halfLifeDays,
        windowRuns: CHOICE_WINDOW_RUNS,
        msPerQCap: maxTimeMs,
        resolveRunLevel: resolveFactorsMultiplesRunHeatLevel,
        levelFilter: function (lv) {
          return lv >= 0 && lv <= FACTORS_MULTIPLES_CHOICE_LEVEL_MAX;
        },
      });
      var fmAttemptResolve = function (a) {
        var li = Math.floor(Number(a && a.levelIndex));
        if (!Number.isFinite(li) || li <= FACTORS_MULTIPLES_CHOICE_LEVEL_MAX) return null;
        if (li >= levelCount) return null;
        return li;
      };
      var fmAttemptBy = personalWeightedByLevel(
        runs,
        maxTimeMs,
        nowMs,
        windowAttempts,
        halfLifeDays,
        levelCount,
        fmAttemptResolve
      );
      for (var fk = 0; fk < levelCount; fk += 1) {
        if (fk <= FACTORS_MULTIPLES_CHOICE_LEVEL_MAX) {
          cells.push(cellFromWeightedBucket(fk, fmChoiceBy[fk], cohortLevels[fk] || {}, 1, true));
        } else {
          cells.push(cellFromWeightedBucket(fk, fmAttemptBy[fk], cohortLevels[fk] || {}, minAttempts, false));
        }
      }
    } else {
      var by = personalWeightedByLevel(
        runs,
        maxTimeMs,
        nowMs,
        windowAttempts,
        halfLifeDays,
        levelCount,
        resolveLevelIndex
      );
      for (var k = 0; k < levelCount; k++) {
        cells.push(cellFromWeightedBucket(k, by[k], cohortLevels[k] || {}, minAttempts, false));
      }
    }

    return {
      cells: cells,
      minAttempts: isDivisibility ? 1 : isFactorsMultiples ? minAttempts : minAttempts,
      maxTimeSpentMs: maxTimeMs,
      cohortLoaded: !!cohort,
      personalWindowAttempts: windowAttempts,
      personalWindowRuns: personalWindowRuns,
      personalHalfLifeDays: halfLifeDays,
      personalNowTs: nowMs,
      levelCount: levelCount,
      sampleUnit: isDivisibility ? 'runs' : isFactorsMultiples ? 'mixed' : 'attempts',
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
  /** 相对常模：meanLn ≥ mean + k·sd 视为过慢（未流畅）；k=1 先不苛刻 */
  var TRAINING_SPEED_SLOW_SD = 1;

  function cmpMinWeightedP(a, b) {
    var pa = a.p != null ? a.p : 1;
    var pb = b.p != null ? b.p : 1;
    if (pa !== pb) return pa - pb;
    return a.levelIndex - b.levelIndex;
  }

  function cmpSlowestFirst(a, b) {
    var at = a.timePct;
    var bt = b.timePct;
    if (at != null && bt != null && Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
      return bt - at;
    }
    var am = a.meanLnCorrect;
    var bm = b.meanLnCorrect;
    if (am != null && bm != null && Number.isFinite(am) && Number.isFinite(bm) && am !== bm) {
      return bm - am;
    }
    return (a.levelIndex || 0) - (b.levelIndex || 0);
  }

  /**
   * @returns {boolean|null} true=过慢；false=未过慢；null=无法判断（无常模 mean/sd）
   */
  function isTooSlowMeanLn(meanLn, lnQ) {
    if (meanLn == null || !Number.isFinite(Number(meanLn)) || !lnQ) return null;
    var mean = Number(lnQ.mean);
    var sd = Number(lnQ.sd);
    if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd < 0) return null;
    return Number(meanLn) >= mean + TRAINING_SPEED_SLOW_SD * sd;
  }

  function isCellAccurate(cell) {
    return !!(
      cell &&
      cell.active &&
      cell.p != null &&
      Number.isFinite(cell.p) &&
      cell.p >= TRAINING_DAY_PASS_ACCURACY
    );
  }

  /** 准确且未判定过慢；无速度常模时准确即流畅（旧口径，仍用于部分兼容） */
  function isCellFluent(cell) {
    if (!isCellAccurate(cell)) return false;
    return cell.tooSlow !== true;
  }

  /** 与热图上色同一套短板分 0–1；橙区记 0 */
  function heatMasteryScore(cell) {
    if (!cell) return 0;
    var p = cell.p != null && Number.isFinite(Number(cell.p)) ? Math.max(0, Math.min(1, Number(cell.p))) : null;
    if (p == null) return 0;
    var pct =
      cell.timePct != null && Number.isFinite(Number(cell.timePct))
        ? Math.max(0, Math.min(100, Number(cell.timePct)))
        : null;
    if (p < HEAT_P_ORANGE || cell.tooSlow === true || (pct != null && pct >= HEAT_PCT_PLUS1)) {
      return 0;
    }
    return Math.min(heatAccuracyScore(p), heatSpeedScore(pct));
  }

  /** 达热图熟练顶：q≈1（≥98% 且速分位≤mean−1σ）；仅刷热图补洞用 */
  function isCellHeatMastered(cell) {
    return heatMasteryScore(cell) >= 1 - 1e-9;
  }

  /** 已激活但未流畅（不准，或准但过慢）——开顶/稳梯子用此旧口径 */
  function cellNeedsMasteryWork(cell) {
    if (!cell || !cell.active) return false;
    return !isCellFluent(cell);
  }

  /** 生存解锁等：某关是否达到准度门槛（优先 fluent 字段） */
  function isHeatmapLevelPassed(cellsResult, levelIndex, minP) {
    var cells = (cellsResult && cellsResult.cells) || [];
    var k = clampLevel(levelIndex);
    var cell = null;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] && cells[i].levelIndex === k) {
        cell = cells[i];
        break;
      }
    }
    if (!cell) cell = cells[k];
    if (!cell || !cell.active) return false;
    if (cell.fluent === true) return true;
    if (cell.fluent === false) return false;
    var p = cell.p;
    if (p == null || !Number.isFinite(p)) return false;
    return p >= (Number(minP) || 0.95);
  }

  /** 热图上色阈值（二维短板） */
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_GATE = 0.95;
  var HEAT_P_FLUENT = 0.98;
  var HEAT_PCT_MEAN = 50;
  var HEAT_PCT_PLUS1 = 84;
  var HEAT_PCT_MINUS1 = 16;
  var HEAT_GATE_Q = 0.5;
  var HEAT_HSL_YELLOW = { h: 48, s: 78, l: 52 };
  var HEAT_HSL_LIME = { h: 78, s: 66, l: 49 };
  var HEAT_HSL_FLUENT = { h: 116, s: 72, l: 38 };
  var HEAT_HSL_ORANGE_HOT = { h: 12, s: 85, l: 40 };
  var HEAT_HSL_ORANGE_MILD = { h: 38, s: 70, l: 48 };

  function heatLerp(a, b, t) {
    return a + (b - a) * t;
  }

  function heatLerpHsl(from, to, t) {
    var u = Math.max(0, Math.min(1, t));
    return {
      h: heatLerp(from.h, to.h, u),
      s: heatLerp(from.s, to.s, u),
      l: heatLerp(from.l, to.l, u),
    };
  }

  function heatHslToCss(hsl, borderPx) {
    return (
      'background:hsl(' +
      Math.round(hsl.h) +
      ',' +
      Math.round(hsl.s) +
      '%,' +
      Math.round(hsl.l) +
      '%);border:' +
      Number(borderPx).toFixed(1) +
      'px solid #37474f'
    );
  }

  /** 准分 0–1：90%→0，95%→GATE_Q，≥98%→1（封顶） */
  function heatAccuracyScore(p) {
    var G = HEAT_GATE_Q;
    if (p < HEAT_P_GATE) {
      return ((p - HEAT_P_ORANGE) / (HEAT_P_GATE - HEAT_P_ORANGE)) * G;
    }
    if (p >= HEAT_P_FLUENT) return 1;
    return G + ((p - HEAT_P_GATE) / (HEAT_P_FLUENT - HEAT_P_GATE)) * (1 - G);
  }

  /** 速分 0–1：+1σ→0，mean→GATE_Q，≤−1σ→1（封顶）；无分位不拖后腿 */
  function heatSpeedScore(pct) {
    var G = HEAT_GATE_Q;
    if (pct == null || !Number.isFinite(pct)) return 1;
    if (pct >= HEAT_PCT_MEAN) {
      return Math.max(
        0,
        Math.min(G, ((HEAT_PCT_PLUS1 - pct) / (HEAT_PCT_PLUS1 - HEAT_PCT_MEAN)) * G)
      );
    }
    if (pct <= HEAT_PCT_MINUS1) return 1;
    return G + ((HEAT_PCT_MEAN - pct) / (HEAT_PCT_MEAN - HEAT_PCT_MINUS1)) * (1 - G);
  }

  /**
   * 热图格 CSS：二维短板 min(准分, 速分)
   * - 正确率&lt;90% 或 速度≥mean+1σ → 同一橙族（越差越偏红）
   * - 否则黄→柠绿门槛（95%+mean）→ 熟练绿（≥98% 且 ≤mean−1σ 封顶）
   */
  function heatmapCellInlineStyle(c) {
    if (!c || !c.active) return '';
    var p = c.p != null ? Math.max(0, Math.min(1, Number(c.p))) : 0.5;
    var tp = c.timePct;
    var pct =
      tp != null && Number.isFinite(Number(tp)) ? Math.max(0, Math.min(100, Number(tp))) : null;
    var tooSlow = c.tooSlow === true || (pct != null && pct >= HEAT_PCT_PLUS1);

    if (p < HEAT_P_ORANGE || tooSlow) {
      var badAcc = p < HEAT_P_ORANGE ? 1 - p / HEAT_P_ORANGE : 0;
      var badSpd =
        tooSlow && pct != null
          ? Math.max(0, Math.min(1, (pct - HEAT_PCT_PLUS1) / 16))
          : tooSlow
            ? 0.5
            : 0;
      var bad = Math.max(badAcc, badSpd);
      var orange = heatLerpHsl(HEAT_HSL_ORANGE_MILD, HEAT_HSL_ORANGE_HOT, bad);
      return heatHslToCss(orange, 2 + bad);
    }

    var q = Math.min(heatAccuracyScore(p), heatSpeedScore(pct));
    var G = HEAT_GATE_Q;
    if (q <= G) {
      var t = G > 0 ? q / G : 1;
      return heatHslToCss(heatLerpHsl(HEAT_HSL_YELLOW, HEAT_HSL_LIME, t), 1.5);
    }
    var t2 = (q - G) / (1 - G);
    return heatHslToCss(heatLerpHsl(HEAT_HSL_LIME, HEAT_HSL_FLUENT, t2), 1);
  }

  var TRAINING_DAY_PASS_ACCURACY = 0.95;
  var TRAINING_FLOW_STORAGE_PREFIX = 'jml_training_flow_v5:';
  var TRAINING_FAILS_BEFORE_BRUSH = 3;

  function isWeightedBelowPass(cell) {
    return cellNeedsMasteryWork(cell);
  }

  function getCell(cellsResult, levelIndex) {
    var list = (cellsResult && cellsResult.cells) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].levelIndex === levelIndex) return list[i];
    }
    return {
      levelIndex: levelIndex,
      active: false,
      n: 0,
      p: null,
      timePct: null,
      tooSlow: null,
      accurate: false,
      fluent: false,
    };
  }

  function isNewLevelCell(cell) {
    return !!(cell && !cell.active);
  }

  /**
   * 刷热图 pool 内选关（与热图色带对齐）：
   * ①橙区（p&lt;90% 或 ≥mean+1σ）最差 → ②黄区（90%≤p&lt;95% 且未过慢）最低准 →
   * ③未达熟练顶 q 最低 → ④已封顶则相对最慢。
   * @returns {{ levelIndex: number, reason: string }|null}
   */
  function isHeatOrangeCell(c) {
    if (!c || c.p == null || !Number.isFinite(Number(c.p))) return false;
    var p = Number(c.p);
    var pct =
      c.timePct != null && Number.isFinite(Number(c.timePct)) ? Number(c.timePct) : null;
    var tooSlow = c.tooSlow === true || (pct != null && pct >= HEAT_PCT_PLUS1);
    return p < HEAT_P_ORANGE || tooSlow;
  }

  function heatOrangeBadness(c) {
    var p = Math.max(0, Math.min(1, Number(c.p)));
    var pct =
      c.timePct != null && Number.isFinite(Number(c.timePct)) ? Number(c.timePct) : null;
    var tooSlow = c.tooSlow === true || (pct != null && pct >= HEAT_PCT_PLUS1);
    var badAcc = p < HEAT_P_ORANGE ? 1 - p / HEAT_P_ORANGE : 0;
    var badSpd =
      tooSlow && pct != null
        ? Math.max(0, Math.min(1, (pct - HEAT_PCT_PLUS1) / 16))
        : tooSlow
          ? 0.5
          : 0;
    return Math.max(badAcc, badSpd);
  }

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

    var orange = [];
    for (var o = 0; o < activeInPool.length; o++) {
      if (isHeatOrangeCell(activeInPool[o])) orange.push(activeInPool[o]);
    }
    if (orange.length) {
      var worstOrange = orange[0];
      for (var ok = 1; ok < orange.length; ok++) {
        var bo = heatOrangeBadness(orange[ok]);
        var bw = heatOrangeBadness(worstOrange);
        if (bo > bw + 1e-9) worstOrange = orange[ok];
        else if (Math.abs(bo - bw) <= 1e-9 && cmpSlowestFirst(orange[ok], worstOrange) < 0) {
          worstOrange = orange[ok];
        }
      }
      return {
        levelIndex: worstOrange.levelIndex,
        reason:
          worstOrange.p != null && Number(worstOrange.p) < HEAT_P_ORANGE
            ? 'brush_fix_orange_acc'
            : 'brush_fix_orange_slow',
      };
    }

    var yellow = [];
    for (var y = 0; y < activeInPool.length; y++) {
      var cy = activeInPool[y];
      var py = cy.p;
      if (py == null || !Number.isFinite(py)) continue;
      if (py >= HEAT_P_ORANGE && py < TRAINING_BRUSH_PASS_ACCURACY && !isHeatOrangeCell(cy)) {
        yellow.push(cy);
      }
    }
    if (yellow.length) {
      var bestYellow = yellow[0];
      for (var yk = 1; yk < yellow.length; yk++) {
        if (cmpMinWeightedP(yellow[yk], bestYellow) < 0) bestYellow = yellow[yk];
      }
      return { levelIndex: bestYellow.levelIndex, reason: 'brush_fix_yellow' };
    }

    var needPolish = [];
    for (var t = 0; t < activeInPool.length; t++) {
      if (isCellFluent(activeInPool[t]) && !isCellHeatMastered(activeInPool[t])) {
        needPolish.push(activeInPool[t]);
      }
    }
    if (needPolish.length) {
      var bestQ = needPolish[0];
      for (var u = 1; u < needPolish.length; u++) {
        var qa = heatMasteryScore(needPolish[u]);
        var qb = heatMasteryScore(bestQ);
        if (qa < qb - 1e-9) bestQ = needPolish[u];
        else if (Math.abs(qa - qb) <= 1e-9 && cmpSlowestFirst(needPolish[u], bestQ) < 0) {
          bestQ = needPolish[u];
        }
      }
      return { levelIndex: bestQ.levelIndex, reason: 'brush_pick_mastery' };
    }

    var passCandidates = [];
    for (var t2 = 0; t2 < activeInPool.length; t2++) {
      if (isCellFluent(activeInPool[t2])) passCandidates.push(activeInPool[t2]);
    }
    if (passCandidates.length) {
      var withPct = [];
      for (var v = 0; v < passCandidates.length; v++) {
        if (passCandidates[v].timePct != null) withPct.push(passCandidates[v]);
      }
      if (withPct.length) {
        var bt = withPct[0];
        for (var w = 1; w < withPct.length; w++) {
          if (cmpSlowestFirst(withPct[w], bt) < 0) bt = withPct[w];
        }
        return { levelIndex: bt.levelIndex, reason: 'brush_pick_speed' };
      }
      var bestP = passCandidates[0];
      for (var x = 1; x < passCandidates.length; x++) {
        if (cmpMinWeightedP(passCandidates[x], bestP) < 0) bestP = passCandidates[x];
      }
      return { levelIndex: bestP.levelIndex, reason: 'brush_pick_speed' };
    }

    var withN = [];
    for (var n = 0; n <= maxIdx; n++) {
      if (!poolSet[n]) continue;
      var cell = getCell(cellsResult, n);
      if (cell.n > 0) withN.push(cell);
    }
    if (withN.length) {
      var bestN = withN[0];
      for (var z = 1; z < withN.length; z++) {
        if (cmpMinWeightedP(withN[z], bestN) < 0) bestN = withN[z];
      }
      return { levelIndex: bestN.levelIndex, reason: 'brush_fix_yellow' };
    }

    return { levelIndex: maxIdx, reason: 'brush_pick_speed' };
  }

  /**
   * 小数等：在已解锁 pool 内选关（不要求 active）。
   * 优先级：无 p（补洞）→ 橙区最差 → 黄区最低准 → 未达熟练顶 → 相对最慢。
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

    var orange = [];
    for (var o = 0; o < pool.length; o++) {
      if (isHeatOrangeCell(pool[o])) orange.push(pool[o]);
    }
    if (orange.length) {
      var worstOrange = orange[0];
      for (var ok = 1; ok < orange.length; ok++) {
        var bo = heatOrangeBadness(orange[ok]);
        var bw = heatOrangeBadness(worstOrange);
        if (bo > bw + 1e-9) worstOrange = orange[ok];
        else if (Math.abs(bo - bw) <= 1e-9 && cmpSlowestFirst(orange[ok], worstOrange) < 0) {
          worstOrange = orange[ok];
        }
      }
      return {
        levelIndex: worstOrange.levelIndex,
        reason:
          worstOrange.p != null && Number(worstOrange.p) < HEAT_P_ORANGE
            ? 'brush_fix_orange_acc'
            : 'brush_fix_orange_slow',
      };
    }

    var yellow = [];
    for (var y = 0; y < pool.length; y++) {
      var cy = pool[y];
      var py = cy.p;
      if (py == null || !Number.isFinite(py)) continue;
      if (py >= HEAT_P_ORANGE && py < TRAINING_BRUSH_PASS_ACCURACY && !isHeatOrangeCell(cy)) {
        yellow.push(cy);
      }
    }
    if (yellow.length) {
      var bestYellow = yellow[0];
      for (var yk = 1; yk < yellow.length; yk++) {
        if (cmpMinWeightedP(yellow[yk], bestYellow) < 0) bestYellow = yellow[yk];
      }
      return { levelIndex: bestYellow.levelIndex, reason: 'brush_fix_yellow' };
    }

    var needPolish = [];
    for (var np = 0; np < pool.length; np++) {
      if (isCellFluent(pool[np]) && !isCellHeatMastered(pool[np])) {
        needPolish.push(pool[np]);
      }
    }
    if (needPolish.length) {
      var bestQ = needPolish[0];
      for (var uq = 1; uq < needPolish.length; uq++) {
        var qa = heatMasteryScore(needPolish[uq]);
        var qb = heatMasteryScore(bestQ);
        if (qa < qb - 1e-9) bestQ = needPolish[uq];
        else if (Math.abs(qa - qb) <= 1e-9 && cmpSlowestFirst(needPolish[uq], bestQ) < 0) {
          bestQ = needPolish[uq];
        }
      }
      return { levelIndex: bestQ.levelIndex, reason: 'brush_pick_mastery' };
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
        if (cmpSlowestFirst(withPct[v], bt) < 0) bt = withPct[v];
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
      dayMode: 'heat',
      frontierLevel: null,
      heatLevel: levelIndex,
    };
  }

  /** @deprecated 请用 recommendTrainingBrushInPool */
  function recommendTrainingBrushSlowAmongPass(cellsResult) {
    var pick = recommendTrainingBrushInPool(cellsResult, LEVEL_COUNT - 1);
    return pick ? pick.levelIndex : null;
  }

  function oppositeTrainingDayMode(mode) {
    return mode === 'heat' ? 'frontier' : 'heat';
  }

  function trackFromDayMode(dayMode) {
    return dayMode === 'heat' ? 'brush' : 'daily';
  }

  /** 从旧/新字段解析 dayMode；无法判断则 null */
  function resolveDayModeFromObject(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.dayMode === 'frontier' || o.dayMode === 'heat') return o.dayMode;
    if (o.brushMode || o.forcedBrush) return 'heat';
    if (o.lastCompletedTrack === 'brush') return 'heat';
    if (o.lastCompletedTrack === 'daily') return 'frontier';
    return null;
  }

  function decorateDayState(dayKey, dayMode, prevDayMode) {
    var mode = dayMode === 'heat' ? 'heat' : 'frontier';
    return {
      dayKey: dayKey || '',
      dayMode: mode,
      prevDayMode: prevDayMode === 'frontier' || prevDayMode === 'heat' ? prevDayMode : null,
      brushMode: mode === 'heat',
      brushPoolMax: mode === 'heat' ? LEVEL_COUNT - 1 : null,
      lastRun: null,
      lastCompletedTrack: trackFromDayMode(mode),
    };
  }

  /**
   * dayState: { dayKey, dayMode:'frontier'|'heat', prevDayMode, brushMode, brushPoolMax, lastCompletedTrack }
   * 跨自然日：今天默认 = 上一练习日最终模式的反面（隔日切换）；无历史则前沿日。
   */
  function normalizeTrainingDayState(o, todayKey) {
    var today = todayKey || '';
    if (!o || typeof o !== 'object') {
      return decorateDayState(today, 'frontier', null);
    }
    var storedPrev =
      o.prevDayMode === 'frontier' || o.prevDayMode === 'heat' ? o.prevDayMode : null;
    if (!storedPrev) {
      if (o.lastCompletedTrack === 'daily') storedPrev = 'frontier';
      else if (o.lastCompletedTrack === 'brush') storedPrev = 'heat';
    }

    if (o.dayKey !== today) {
      var settled = null;
      if (o.dayKey) {
        settled = resolveDayModeFromObject(o);
        if (!settled) settled = storedPrev;
      } else {
        settled = storedPrev;
      }
      var nextMode = settled ? oppositeTrainingDayMode(settled) : 'frontier';
      return decorateDayState(today, nextMode, settled || null);
    }

    var mode = resolveDayModeFromObject(o) || 'frontier';
    return decorateDayState(today, mode, storedPrev);
  }

  function trainingNextLevelReasonText(result, labels) {
    if (!result) return '';
    var L = labels || {};
    var code = result.pickReason || result.reason;
    var frontierPrefix = L.frontierDayPrefix || '前沿日';
    var heatPrefix = L.heatDayPrefix || '热图日';
    if (code === 'brush_fix_orange_acc') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushFixOrangeAccPlain || '补橙区（准<90%，最差）')
        : L.brushFixOrangeAcc || '刷热图：补橙区（准<90%，最差）';
    }
    if (code === 'brush_fix_orange_slow') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushFixOrangeSlowPlain || '补橙区（过慢≥mean+1σ，最差）')
        : L.brushFixOrangeSlow || '刷热图：补橙区（过慢≥mean+1σ，最差）';
    }
    if (code === 'brush_fix_yellow') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushFixYellowPlain || '补黄区（90%≤准<95%，最低）')
        : L.brushFixYellow || '刷热图：补黄区（90%≤准<95%，最低）';
    }
    if (code === 'brush_fix_red') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushFixRedPlain || '补加权<95%')
        : L.brushFixRed || '刷热图：补 pool 内加权<95%（最低）';
    }
    if (code === 'brush_fix_slow') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushFixSlowPlain || '补准但过慢')
        : L.brushFixSlow || '刷热图：补 pool 内准但过慢（≥mean+1σ）';
    }
    if (code === 'brush_pick_mastery') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushPickMasteryPlain || '补未达熟练顶')
        : L.brushPickMastery || '刷热图：补未达熟练顶（热图短板最低）';
    }
    if (code === 'brush_pick_speed') {
      return result.dayMode === 'heat'
        ? heatPrefix + '：' + (L.brushPickSpeedPlain || '已熟练，相对最慢')
        : L.brushPickSpeed || '刷热图：pool 内已熟练，相对最慢';
    }
    if (result.reason === 'frontier_stabilize_M') {
      return frontierPrefix + '：' + (L.frontierStabilizeMPlain || '稳梯子顶 M（加权<95%）');
    }
    if (result.reason === 'frontier_stabilize_slow') {
      return frontierPrefix + '：' + (L.frontierStabilizeSlowPlain || '稳梯子顶 M（准但过慢）');
    }
    if (result.reason === 'frontier_open_M1') {
      return frontierPrefix + '：' + (L.frontierOpenM1Plain || '开 M+1（顶已流畅）');
    }
    if (result.reason === 'daily_clear' || result.reason === 'daily_pass_all_clear') {
      return frontierPrefix + '：' + (L.dailyClearPlain || '顶已全清，本局按热图关');
    }
    if (result.reason === 'heat_day_needs_heat') return L.heatDayNeedsHeat || '热图日：待热图选关';
    if (result.reason === 'frontier_needs_heat') return L.frontierNeedsHeat || '前沿日：待热图选关';
    if (result.reason === 'daily_fail_enter_brush') {
      return L.dailyFailEnterBrush || '本关三败，进刷热图（不含本关及以上）';
    }
    if (result.reason === 'alt_after_daily') {
      return L.altAfterDaily || '隔轨：上一完成局为推进，本局刷热图';
    }
    if (result.reason === 'daily_pass_next') {
      return L.dailyPassNext || '当日闯关：上局达标且本关已流畅，下一关';
    }
    if (result.reason === 'daily_pass_stay_not_fluent') {
      return L.dailyPassStayNotFluent || '当日闯关：上局达标但热图未流畅，继续本关';
    }
    if (result.reason === 'daily_pass_needs_heat') {
      return L.dailyPassNeedsHeat || '当日闯关：上局达标，待热图判定是否开下一关';
    }
    if (result.reason === 'retry_same') return L.retrySame || '当日闯关：本关继续（未达单局95%）';
    if (result.reason === 'scan_below') return L.scanBelow || '当日闯关：第一个加权准确率<95%';
    if (result.reason === 'open_new') return L.openNew || '当日闯关：开新关（题数<10）';
    if (result.reason === 'after_fail_below') return L.afterFailBelow || '当日闯关：三败后下一弱关';
    return L.dailyDefault || '训练选关';
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

  /**
   * 特殊模式通关前选关（解锁与选关分离）：
   * 梯子顶 M = 已解锁且「已玩过」的最高关（不含解锁了但 0 题的那一档）。
   * M 未流畅 → 练 M；M 流畅且还有更高已解锁 → 开 M+1；否则继续 M。
   * 「玩过」优先看 runs 的 maxLevel；否则看热图格 n>0。
   *
   * @param {object} opts
   * @param {object} opts.cellsResult
   * @param {number} opts.unlockedMax 已解锁上限（可含通关位；选关时会 clamp 到 playableMax）
   * @param {number} opts.playableMax 可玩最高 index
   * @param {Array} [opts.runs]
   * @param {string} [opts.mode] run.mode，如 decimal / perfectSquare / divisibility
   * @returns {{ levelIndex: number, reason: string, ladderTop: number, unlockedPlayable: number }}
   */
  function recommendSpecialModeLadderLevel(opts) {
    opts = opts || {};
    var cellsResult = opts.cellsResult;
    var playableMax = Math.max(0, Math.floor(Number(opts.playableMax) || 0));
    var unlockedRaw = Math.max(0, Math.floor(Number(opts.unlockedMax) || 0));
    var U = Math.min(unlockedRaw, playableMax);
    var runs = Array.isArray(opts.runs) ? opts.runs : [];
    var modeNorm = String(opts.mode || '')
      .toLowerCase()
      .replace(/[_-]/g, '');

    function levelPlayed(li) {
      var cell = getCell(cellsResult, li);
      if (cell && Number(cell.n) > 0) return true;
      if (!modeNorm) return false;
      for (var ri = 0; ri < runs.length; ri++) {
        var r = runs[ri];
        if (!r || r.comboOnly === true) continue;
        var rm = String(r.mode || '')
          .toLowerCase()
          .replace(/[_-]/g, '');
        if (rm !== modeNorm) continue;
        if (Math.floor(Number(r.maxLevel)) === li) return true;
      }
      return false;
    }

    var M = -1;
    for (var li = 0; li <= U; li++) {
      if (levelPlayed(li)) M = li;
    }
    if (M < 0) {
      return {
        levelIndex: 0,
        reason: 'ladder_start',
        ladderTop: -1,
        unlockedPlayable: U,
      };
    }

    // 热图档外（如整除 Z5）：无法判流畅 → 稳住该关，靠 0/1 错解锁通关位后再走通关后刷选
    var heatCount =
      cellsResult && Array.isArray(cellsResult.cells) ? cellsResult.cells.length : 0;
    var fluent = false;
    if (M < heatCount) {
      fluent = isCellFluent(getCell(cellsResult, M));
    }

    if (fluent && U > M) {
      return {
        levelIndex: Math.min(playableMax, M + 1),
        reason: 'ladder_open',
        ladderTop: M,
        unlockedPlayable: U,
      };
    }
    return {
      levelIndex: M,
      reason: fluent ? 'ladder_hold_fluent' : 'ladder_stabilize',
      ladderTop: M,
      unlockedPlayable: U,
    };
  }

  /**
   * 整除通关后选关：Z1–Z4 未全部流畅（准≥95% 且未过慢）→ 刷选型；否则打 Z5。
   * @returns {{ levelIndex: number, reason: string }|null}
   */
  function recommendDivisibilityPostClearLevel(cellsResult) {
    var heatMax = Math.max(0, DIVISIBILITY_LEVEL_COUNT - 1);
    var playableZ5 = DIVISIBILITY_LEVEL_COUNT; // 热图 4 档时 Z5 index=4
    var allFluent = true;
    for (var li = 0; li <= heatMax; li++) {
      if (!isCellFluent(getCell(cellsResult, li))) {
        allFluent = false;
        break;
      }
    }
    if (allFluent) {
      return { levelIndex: playableZ5, reason: 'div_post_clear_z5' };
    }
    var pick =
      typeof recommendUnlockedWeightedBrush === 'function'
        ? recommendUnlockedWeightedBrush(cellsResult, heatMax)
        : recommendTrainingBrushInPool(cellsResult, heatMax);
    if (!pick || pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) {
      return { levelIndex: 0, reason: 'div_post_clear_fallback' };
    }
    return {
      levelIndex: clampLevel(pick.levelIndex, DIVISIBILITY_LEVEL_COUNT),
      reason: pick.reason || 'div_post_clear_brush',
    };
  }

  global.JmlStatsHeatmap = {
    LEVEL_COUNT: LEVEL_COUNT,
    DECIMAL_LEVEL_COUNT: DECIMAL_LEVEL_COUNT,
    PERFECT_SQUARE_LEVEL_COUNT: PERFECT_SQUARE_LEVEL_COUNT,
    DIVISIBILITY_LEVEL_COUNT: DIVISIBILITY_LEVEL_COUNT,
    FACTORS_MULTIPLES_LEVEL_COUNT: FACTORS_MULTIPLES_LEVEL_COUNT,
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
    PRIME_RUN_MIN_ATTEMPTS: PRIME_RUN_MIN_ATTEMPTS,
    PRIME_WINDOW_RUNS: PRIME_WINDOW_RUNS,
    PRIME_MS_PER_Q_CAP: PRIME_MS_PER_Q_CAP,
    CHOICE_RUN_MIN_ATTEMPTS: CHOICE_RUN_MIN_ATTEMPTS,
    CHOICE_WINDOW_RUNS: CHOICE_WINDOW_RUNS,
    CHOICE_SPEED_MIN_ACCURACY: CHOICE_SPEED_MIN_ACCURACY,
    CHOICE_MS_PER_Q_CAP: CHOICE_MS_PER_Q_CAP,
    MISSING_SPEED_TIME_PCT: MISSING_SPEED_TIME_PCT,
    FACTORS_MULTIPLES_CHOICE_LEVEL_MAX: FACTORS_MULTIPLES_CHOICE_LEVEL_MAX,
    normalizeMode: normalizeMode,
    filterRunsByModes: filterRunsByModes,
    filterArithmeticRuns: filterArithmeticRuns,
    filterDecimalRuns: filterDecimalRuns,
    runAttemptCount: runAttemptCount,
    runCorrectCount: runCorrectCount,
    runAccuracy: runAccuracy,
    runDurationSec: runDurationSec,
    resolveDivisibilityRunHeatLevel: resolveDivisibilityRunHeatLevel,
    resolveFactorsMultiplesRunHeatLevel: resolveFactorsMultiplesRunHeatLevel,
    isPrimeQualifyingRun: isPrimeQualifyingRun,
    hasPrimeQualifyingHistory: hasPrimeQualifyingHistory,
    buildPrimeY0Cell: buildPrimeY0Cell,
    attachPrimeY0ToFactorsHeat: attachPrimeY0ToFactorsHeat,
    personalWeightedByChoiceRuns: personalWeightedByChoiceRuns,
    heatCellsForDisplay: heatCellsForDisplay,
    buildHeatmapCells: buildHeatmapCells,
    recommendLevelIndex: recommendLevelIndex,
    recommendLevelIndexAccuracyBrush: recommendLevelIndexAccuracyBrush,
    recommendTrainingBrushLevel: recommendTrainingBrushLevel,
    recommendTrainingBrushSlowAmongPass: recommendTrainingBrushSlowAmongPass,
    recommendTrainingBrushInPool: recommendTrainingBrushInPool,
    recommendUnlockedWeightedBrush: recommendUnlockedWeightedBrush,
    recommendSpecialModeLadderLevel: recommendSpecialModeLadderLevel,
    recommendDivisibilityPostClearLevel: recommendDivisibilityPostClearLevel,
    normalizeTrainingDayState: normalizeTrainingDayState,
    trainingNextLevelReasonText: trainingNextLevelReasonText,
    heatmapCellInlineStyle: heatmapCellInlineStyle,
    isTooSlowMeanLn: isTooSlowMeanLn,
    isCellAccurate: isCellAccurate,
    isCellFluent: isCellFluent,
    isCellHeatMastered: isCellHeatMastered,
    heatMasteryScore: heatMasteryScore,
    cellNeedsMasteryWork: cellNeedsMasteryWork,
    isHeatmapLevelPassed: isHeatmapLevelPassed,
    TRAINING_BRUSH_PASS_ACCURACY: TRAINING_BRUSH_PASS_ACCURACY,
    TRAINING_DAY_PASS_ACCURACY: TRAINING_DAY_PASS_ACCURACY,
    TRAINING_SPEED_SLOW_SD: TRAINING_SPEED_SLOW_SD,
    TRAINING_FLOW_STORAGE_PREFIX: TRAINING_FLOW_STORAGE_PREFIX,
    TRAINING_FAILS_BEFORE_BRUSH: TRAINING_FAILS_BEFORE_BRUSH,
    percentileFromQuantileSummary: percentileFromQuantileSummary,
    percentileFromMeanSd: percentileFromMeanSd,
    standardNormalCdf: standardNormalCdf,
    personalWeightedByLevel: personalWeightedByLevel,
  };
})(typeof window !== 'undefined' ? window : this);
