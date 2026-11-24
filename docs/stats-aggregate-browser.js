/**
 * 与小程序端 stats 聚合一致（浏览器版）；canonical 位于 docs/，report 与主站共用。
 * 支持按模式分类：四则（L1–L16）/ 小数（D1–D6）等。
 *
 * 速度口径（填空/四则）：仅答对计入；几何均；timeSpentMs > cap 剔除。
 * 填空局正确率 < 50% 的整局不进准度/速度（与热图 / 常模同口径）。
 * 二选一（整除 Z1–Z4 / 质数 Y0 / 因倍 Y1–Y2）：≥10 题局（含放弃）；准度按题；
 * 速度=准≥90% 局的 duration/n，按题数 n 加权；无合格速度则该日均速为空。
 */
(function (global) {
  /** 与热图一致：L1–L20 */
  var LEVEL_COUNT = 20;
  var DECIMAL_LEVEL_COUNT = 6;
  /** 折线图：该难度下「够格入选」的最近多少个日历日（无则向前不填充） */
  var CHART_PRACTICE_DAYS = 14;
  /** 折线入选（按题模式）：当天该难度至少答这么多题，且能算出均速 */
  var CHART_MIN_ATTEMPTS = 5;
  /** 二选一折线：当天该档至少这么多题（来自 ≥10 题局）才入选；均速可缺 */
  var CHART_CHOICE_MIN_ATTEMPTS = 10;
  var DEFAULT_MAX_TIME_SPENT_MS = 60 * 1000;

  var CHOICE_RUN_MIN_ATTEMPTS = 10;
  var CHOICE_SPEED_MIN_ACCURACY = 0.9;
  var CHOICE_MS_PER_Q_CAP = 60 * 1000;
  var PRIME_RUN_MIN_ATTEMPTS = CHOICE_RUN_MIN_ATTEMPTS;
  var PRIME_MS_PER_Q_CAP = CHOICE_MS_PER_Q_CAP;
  var FACTORS_CHOICE_LEVEL_MAX = 1;
  /** 与 stats-heatmap-browser FILL_RUN_MIN_ACCURACY 对齐 */
  var FILL_RUN_MIN_ACCURACY = 0.5;

  function emptyLevelAgg() {
    return { total: 0, correct: 0, totalTimeMs: 0, sumLnMs: 0, nSpeed: 0, choiceRunCount: 0 };
  }

  function normalizeMode(mode) {
    return String(mode || 'survival')
      .toLowerCase()
      .replace(/[_-]/g, '');
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

  function resolveMaxTimeSpentMs(opts) {
    opts = opts || {};
    var cap = Number(opts.maxTimeSpentMs);
    return cap > 0 && Number.isFinite(cap) ? cap : DEFAULT_MAX_TIME_SPENT_MS;
  }

  /**
   * 仅答对、几何均、>cap 剔除。
   * @param {Array} attempts
   * @param {{ maxTimeSpentMs?: number, levelIndex?: number, levelCount?: number }} [opts]
   * @returns {{ meanLn: number|null, avgSec: number|null, n: number }}
   */
  function geoMeanSecFromAttempts(attempts, opts) {
    opts = opts || {};
    var cap = resolveMaxTimeSpentMs(opts);
    var filterLevel = opts.levelIndex != null && Number.isFinite(Number(opts.levelIndex));
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var lv = filterLevel
      ? Math.max(0, Math.min(levelCount - 1, Math.floor(Number(opts.levelIndex) || 0)))
      : null;
    var sum = 0;
    var n = 0;
    var list = Array.isArray(attempts) ? attempts : [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || a.correct !== true) continue;
      if (filterLevel) {
        var aLv = Math.max(0, Math.min(levelCount - 1, Math.floor(Number(a.levelIndex) || 0)));
        if (aLv !== lv) continue;
      }
      var ms = Number(a.timeSpentMs);
      if (!(ms > 0 && ms <= cap && Number.isFinite(ms))) continue;
      sum += Math.log(ms);
      n += 1;
    }
    if (n <= 0) return { meanLn: null, avgSec: null, n: 0 };
    var meanLn = sum / n;
    var sec = Math.exp(meanLn) / 1000;
    if (!(sec > 0 && sec < 600 && Number.isFinite(sec))) {
      return { meanLn: meanLn, avgSec: null, n: n };
    }
    return { meanLn: meanLn, avgSec: Math.round(sec * 10) / 10, n: n };
  }

  function avgSecFromAgg(L) {
    if (!L || !(L.nSpeed > 0) || !Number.isFinite(Number(L.sumLnMs))) return null;
    var sec = Math.exp(Number(L.sumLnMs) / Number(L.nSpeed)) / 1000;
    if (!(sec > 0 && sec < 600 && Number.isFinite(sec))) return null;
    return Math.round(sec * 10) / 10;
  }

  function resolveDivisibilityAttemptLevel(a) {
    var D = typeof window !== 'undefined' ? window.JmlDivisibility : null;
    if (D && typeof D.heatLevelIndexFromAttempt === 'function') {
      return D.heatLevelIndexFromAttempt(a);
    }
    var d = Math.floor(Number(a && a.divisor));
    var map = { 2: 0, 5: 0, 3: 1, 9: 1, 4: 2, 8: 2, 6: 3, 12: 3 };
    if (Number.isFinite(d) && Object.prototype.hasOwnProperty.call(map, d)) return map[d];
    var li = Math.floor(Number(a && a.levelIndex));
    if (Number.isFinite(li) && li >= 0 && li <= 3) return li;
    return null;
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

  function dateStrFromTs(ts) {
    var d = new Date(ts || 0);
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function ensureDayLevels(byDay, dateStr, levelCount) {
    if (!byDay[dateStr]) {
      byDay[dateStr] = Array.from({ length: levelCount }, function () {
        return emptyLevelAgg();
      });
    }
    return byDay[dateStr];
  }

  function resolveRunPickedLevel(r, levelCount) {
    if (!r) return null;
    var meta = r.trainingMeta && typeof r.trainingMeta === 'object' ? r.trainingMeta : null;
    var raw = meta && meta.pickedLevel != null ? meta.pickedLevel : r.maxLevel;
    var lv = Math.floor(Number(raw));
    if (!Number.isFinite(lv) || lv < 0) return null;
    if (levelCount > 0 && lv >= levelCount) return null;
    return lv;
  }

  /**
   * 二选一局：准度按题累加；速度仅准≥90% 时按题数 n 加权写入 ln(duration/n)。
   * @returns {boolean} 是否计入（≥minAtt 且有 attempts）
   */
  function absorbChoiceRunIntoAgg(r, bucketLevel, bucketDay, opts) {
    opts = opts || {};
    var minAtt =
      Number(opts.minAttemptsPerRun) > 0
        ? Math.floor(Number(opts.minAttemptsPerRun))
        : CHOICE_RUN_MIN_ATTEMPTS;
    var msCap = Number(opts.msPerQCap) > 0 ? Number(opts.msPerQCap) : CHOICE_MS_PER_Q_CAP;
    var speedMinP =
      Number(opts.speedMinAccuracy) > 0 ? Number(opts.speedMinAccuracy) : CHOICE_SPEED_MIN_ACCURACY;
    if (!r || r.comboOnly === true) return false;
    var n = runAttemptCount(r);
    if (!(n >= minAtt) || !Array.isArray(r.attempts) || !r.attempts.length) return false;

    var correct = runCorrectCount(r);
    var p = correct / n;
    var durSec = runDurationSec(r);
    var msPerQ = durSec != null && n > 0 ? (durSec * 1000) / n : null;
    var speedOk =
      p >= speedMinP &&
      msPerQ != null &&
      Number.isFinite(msPerQ) &&
      msPerQ > 0 &&
      msPerQ <= msCap;
    var ln = speedOk ? Math.log(msPerQ) : null;
    var wSpeed = speedOk ? n : 0;

    function addTo(bucket) {
      if (!bucket) return;
      bucket.choiceRunCount = (bucket.choiceRunCount || 0) + 1;
      for (var i = 0; i < r.attempts.length; i += 1) {
        var a = r.attempts[i];
        bucket.total += 1;
        if (a && a.correct) bucket.correct += 1;
      }
      if (ln != null && wSpeed > 0) {
        bucket.sumLnMs += ln * wSpeed;
        bucket.nSpeed += wSpeed;
      }
    }

    addTo(bucketLevel);
    addTo(bucketDay);
    return true;
  }

  /**
   * 质数合数折线：≥10 题局（含放弃）；准度按题；速度准≥90% 且按 n 加权 duration/n。
   */
  function aggregatePrimeCompositeFromRuns(runs, opts) {
    opts = opts || {};
    var levelCount = 1;
    var msCap =
      Number(opts.maxMsPerQuestion) > 0 ? Number(opts.maxMsPerQuestion) : PRIME_MS_PER_Q_CAP;
    var minAtt =
      Number(opts.minAttemptsPerRun) > 0
        ? Math.floor(Number(opts.minAttemptsPerRun))
        : PRIME_RUN_MIN_ATTEMPTS;
    var byLevel = [emptyLevelAgg()];
    var byDay = {};

    filterRunsByModes(runs, ['primeComposite']).forEach(function (r) {
      var dateStr = dateStrFromTs(r.ts || 0);
      ensureDayLevels(byDay, dateStr, levelCount);
      absorbChoiceRunIntoAgg(r, byLevel[0], byDay[dateStr][0], {
        minAttemptsPerRun: minAtt,
        msPerQCap: msCap,
      });
    });

    return {
      byLevel: byLevel,
      byDay: byDay,
      hasAny: byLevel[0].total > 0,
      levelCount: levelCount,
      maxTimeSpentMs: msCap,
      sampleUnit: 'runs',
      chartAllowMissingSpeed: true,
      chartMinAttempts: CHART_CHOICE_MIN_ATTEMPTS,
    };
  }

  function fillRunAttemptCount(r) {
    if (!r) return 0;
    if (Array.isArray(r.attempts) && r.attempts.length) return r.attempts.length;
    var n = Number(r.attemptCount);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function fillRunCorrectCount(r) {
    var list = r && Array.isArray(r.attempts) ? r.attempts : [];
    if (list.length) {
      var n = 0;
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] && list[i].correct === true) n += 1;
      }
      return n;
    }
    var total = Number(r && r.attemptCount);
    var wrong = Number(r && r.wrongCount);
    if (Number.isFinite(total) && total > 0 && Number.isFinite(wrong)) {
      return Math.max(0, Math.floor(total) - Math.max(0, Math.floor(wrong)));
    }
    return 0;
  }

  /** 填空局准 < 50% 整局排除；算不出则保留 */
  function isFillRunStatsEligible(r) {
    var n = fillRunAttemptCount(r);
    if (!(n > 0)) return true;
    var p = fillRunCorrectCount(r) / n;
    if (!Number.isFinite(p)) return true;
    return p >= FILL_RUN_MIN_ACCURACY;
  }

  function absorbAttemptRunIntoAgg(r, byLevel, byDay, dateStr, opts) {
    opts = opts || {};
    var levelCount = opts.levelCount;
    var maxTimeMs = opts.maxTimeMs;
    var resolveLevelIndex = opts.resolveLevelIndex;
    var levelFilter = typeof opts.levelFilter === 'function' ? opts.levelFilter : null;
    if (!Array.isArray(r.attempts)) return;
    if (!isFillRunStatsEligible(r)) return;
    ensureDayLevels(byDay, dateStr, levelCount);
    r.attempts.forEach(function (a) {
      var idx;
      if (typeof resolveLevelIndex === 'function') {
        idx = resolveLevelIndex(a);
        if (idx == null || !Number.isFinite(Number(idx))) return;
        idx = Math.max(0, Math.min(levelCount - 1, Math.floor(Number(idx))));
      } else {
        idx = Math.max(0, Math.min(levelCount - 1, Number(a.levelIndex) || 0));
      }
      if (levelFilter && !levelFilter(idx)) return;
      var ms = Number(a.timeSpentMs) || 0;
      byLevel[idx].total += 1;
      if (a.correct) byLevel[idx].correct += 1;
      byLevel[idx].totalTimeMs += ms;
      var dayAgg = byDay[dateStr][idx];
      dayAgg.total += 1;
      if (a.correct) dayAgg.correct += 1;
      dayAgg.totalTimeMs += ms;
      if (a.correct && ms > 0 && ms <= maxTimeMs && Number.isFinite(ms)) {
        var ln = Math.log(ms);
        byLevel[idx].sumLnMs += ln;
        byLevel[idx].nSpeed += 1;
        dayAgg.sumLnMs += ln;
        dayAgg.nSpeed += 1;
      }
    });
  }

  /**
   * @param {Array} runs
   * @param {{ levelCount?: number, modes?: string[], maxTimeSpentMs?: number, resolveAttemptLevelIndex?: function }} [opts]
   */
  function aggregateFromRuns(runs, opts) {
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var modes = opts.modes || ['survival', 'level', 'training'];
    var maxTimeMs = resolveMaxTimeSpentMs(opts);
    var modeKeys = (modes || []).map(function (m) {
      return normalizeMode(m);
    });
    var onlyDiv = modeKeys.length === 1 && modeKeys[0] === 'divisibility';
    var onlyExpand = modeKeys.length === 1 && modeKeys[0] === 'expandbrackets';
    var onlyFm = modeKeys.length === 1 && modeKeys[0] === 'factorsmultiples';

    if (onlyDiv) {
      return aggregateChoiceModeFromRuns(runs, {
        modes: ['divisibility'],
        levelCount: levelCount,
        maxTimeSpentMs: maxTimeMs,
      });
    }
    if (onlyExpand) {
      return aggregateChoiceModeFromRuns(runs, {
        modes: ['expandBrackets'],
        levelCount: levelCount,
        maxTimeSpentMs: maxTimeMs,
      });
    }
    if (onlyFm) {
      return aggregateFactorsMultiplesHybridFromRuns(runs, {
        levelCount: levelCount,
        maxTimeSpentMs: maxTimeMs,
      });
    }

    var resolveLevelIndex = opts.resolveAttemptLevelIndex;
    var byLevel = Array.from({ length: levelCount }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    filterRunsByModes(runs, modes).forEach(function (r) {
      var dateStr = dateStrFromTs(r.ts || 0);
      absorbAttemptRunIntoAgg(r, byLevel, byDay, dateStr, {
        levelCount: levelCount,
        maxTimeMs: maxTimeMs,
        resolveLevelIndex: resolveLevelIndex,
      });
    });

    var hasAny = byLevel.some(function (l) {
      return l.total > 0;
    });
    return {
      byLevel: byLevel,
      byDay: byDay,
      hasAny: hasAny,
      levelCount: levelCount,
      maxTimeSpentMs: maxTimeMs,
      sampleUnit: 'attempts',
    };
  }

  /** 选择题按局聚合（整除 / 拆括号等） */
  function aggregateChoiceModeFromRuns(runs, opts) {
    opts = opts || {};
    var modes = Array.isArray(opts.modes) && opts.modes.length ? opts.modes : ['divisibility'];
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : 4;
    var msCap = resolveMaxTimeSpentMs(opts);
    var byLevel = Array.from({ length: levelCount }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    filterRunsByModes(runs, modes).forEach(function (r) {
      var lv = resolveRunPickedLevel(r, levelCount);
      if (lv == null) return;
      var dateStr = dateStrFromTs(r.ts || 0);
      ensureDayLevels(byDay, dateStr, levelCount);
      absorbChoiceRunIntoAgg(r, byLevel[lv], byDay[dateStr][lv], {
        msPerQCap: msCap,
      });
    });

    return {
      byLevel: byLevel,
      byDay: byDay,
      hasAny: byLevel.some(function (l) {
        return l.total > 0;
      }),
      levelCount: levelCount,
      maxTimeSpentMs: msCap,
      sampleUnit: 'runs',
      chartAllowMissingSpeed: true,
      chartMinAttempts: CHART_CHOICE_MIN_ATTEMPTS,
    };
  }

  function aggregateDivisibilityChoiceFromRuns(runs, opts) {
    opts = opts || {};
    return aggregateChoiceModeFromRuns(runs, {
      modes: ['divisibility'],
      levelCount: opts.levelCount,
      maxTimeSpentMs: opts.maxTimeSpentMs,
    });
  }

  function aggregateFactorsMultiplesHybridFromRuns(runs, opts) {
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : 6;
    var msCap = resolveMaxTimeSpentMs(opts);
    var byLevel = Array.from({ length: levelCount }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    filterRunsByModes(runs, ['factorsMultiples']).forEach(function (r) {
      var lv = resolveRunPickedLevel(r, levelCount);
      var dateStr = dateStrFromTs(r.ts || 0);
      if (lv != null && lv <= FACTORS_CHOICE_LEVEL_MAX) {
        ensureDayLevels(byDay, dateStr, levelCount);
        absorbChoiceRunIntoAgg(r, byLevel[lv], byDay[dateStr][lv], {
          msPerQCap: msCap,
        });
        return;
      }
      absorbAttemptRunIntoAgg(r, byLevel, byDay, dateStr, {
        levelCount: levelCount,
        maxTimeMs: msCap,
        levelFilter: function (idx) {
          return idx > FACTORS_CHOICE_LEVEL_MAX;
        },
      });
    });

    return {
      byLevel: byLevel,
      byDay: byDay,
      hasAny: byLevel.some(function (l) {
        return l.total > 0;
      }),
      levelCount: levelCount,
      maxTimeSpentMs: msCap,
      sampleUnit: 'mixed',
      chartAllowMissingSpeedByLevel: function (li) {
        return li <= FACTORS_CHOICE_LEVEL_MAX;
      },
      chartMinAttemptsByLevel: function (li) {
        return li <= FACTORS_CHOICE_LEVEL_MAX ? CHART_CHOICE_MIN_ATTEMPTS : CHART_MIN_ATTEMPTS;
      },
    };
  }

  /**
   * @param {object} byDay
   * @param {number} levelIndex
   * @param {{ levelCount?: number, minAttempts?: number, allowMissingSpeed?: boolean }} [opts]
   */
  function buildChartSeries(byDay, levelIndex, opts) {
    if (!byDay || typeof byDay !== 'object') return null;
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var li = Math.max(0, Math.min(levelCount - 1, Number(levelIndex) || 0));
    var minAttempts =
      opts.minAttempts > 0 && Number.isFinite(Number(opts.minAttempts))
        ? Math.floor(Number(opts.minAttempts))
        : CHART_MIN_ATTEMPTS;
    var allowMissingSpeed = opts.allowMissingSpeed === true;
    var dates = Object.keys(byDay)
      .filter(function (d) {
        var L = byDay[d] && byDay[d][li];
        if (!L || (L.total || 0) < minAttempts) return false;
        if (allowMissingSpeed) return true;
        return avgSecFromAgg(L) != null;
      })
      .sort();
    if (dates.length === 0) return null;
    if (dates.length > CHART_PRACTICE_DAYS) {
      dates = dates.slice(dates.length - CHART_PRACTICE_DAYS);
    }

    var series = dates.map(function (d) {
      var L = byDay[d][li];
      var total = L ? L.total || 0 : 0;
      return {
        errorRate: Math.round((1 - L.correct / total) * 100),
        avgSec: avgSecFromAgg(L),
      };
    });

    var errRatesNumeric = series
      .map(function (x) {
        return x.errorRate;
      })
      .filter(function (v) {
        return v != null;
      });
    var yMaxErr = Math.max(20, errRatesNumeric.length ? Math.max.apply(null, errRatesNumeric) : 20);

    var secNumeric = series
      .map(function (x) {
        return x.avgSec;
      })
      .filter(function (v) {
        return v != null;
      });
    var yMaxSec = Math.max(5, secNumeric.length ? Math.max.apply(null, secNumeric) * 1.1 : 20);

    return {
      dates: dates,
      series: series,
      yMaxErr: yMaxErr,
      yMaxSec: Math.ceil(yMaxSec),
      practiceDayCount: dates.length,
    };
  }

  function buildTableRows(byLevel, levelNames) {
    return byLevel.map(function (l, i) {
      var errRate = l.total > 0 ? Math.round((1 - l.correct / l.total) * 100) : null;
      var avgSec = avgSecFromAgg(l);
      return {
        name: levelNames[i] || 'L' + (i + 1),
        total: l.total,
        errRateText: errRate != null ? errRate + '%' : '-',
        avgSecText: avgSec != null ? String(avgSec) : '-',
      };
    });
  }

  function firstLevelWithData(byLevel) {
    if (!Array.isArray(byLevel)) return 0;
    var i = byLevel.findIndex(function (l) {
      return l.total > 0;
    });
    return i >= 0 ? i : 0;
  }

  /** 从聚合结果取折线选项（二选一日可缺速度） */
  function chartSeriesOptsFromAgg(agg, levelIndex, extra) {
    extra = extra || {};
    var li = Math.floor(Number(levelIndex) || 0);
    var allowMissingSpeed = !!(agg && agg.chartAllowMissingSpeed);
    if (!allowMissingSpeed && agg && typeof agg.chartAllowMissingSpeedByLevel === 'function') {
      allowMissingSpeed = !!agg.chartAllowMissingSpeedByLevel(li);
    }
    var minAttempts = CHART_MIN_ATTEMPTS;
    if (agg && typeof agg.chartMinAttemptsByLevel === 'function') {
      minAttempts = agg.chartMinAttemptsByLevel(li);
    } else if (agg && Number(agg.chartMinAttempts) > 0) {
      minAttempts = Math.floor(Number(agg.chartMinAttempts));
    }
    return Object.assign(
      {
        levelCount: (agg && agg.levelCount) || extra.levelCount || LEVEL_COUNT,
        minAttempts: minAttempts,
        allowMissingSpeed: allowMissingSpeed,
      },
      extra
    );
  }

  global.JmlStatsAggregate = {
    LEVEL_COUNT: LEVEL_COUNT,
    DECIMAL_LEVEL_COUNT: DECIMAL_LEVEL_COUNT,
    CHART_PRACTICE_DAYS: CHART_PRACTICE_DAYS,
    CHART_MIN_ATTEMPTS: CHART_MIN_ATTEMPTS,
    CHART_CHOICE_MIN_ATTEMPTS: CHART_CHOICE_MIN_ATTEMPTS,
    DEFAULT_MAX_TIME_SPENT_MS: DEFAULT_MAX_TIME_SPENT_MS,
    CHOICE_RUN_MIN_ATTEMPTS: CHOICE_RUN_MIN_ATTEMPTS,
    CHOICE_SPEED_MIN_ACCURACY: CHOICE_SPEED_MIN_ACCURACY,
    PRIME_RUN_MIN_ATTEMPTS: PRIME_RUN_MIN_ATTEMPTS,
    PRIME_MS_PER_Q_CAP: PRIME_MS_PER_Q_CAP,
    normalizeMode: normalizeMode,
    filterRunsByModes: filterRunsByModes,
    filterArithmeticRuns: filterArithmeticRuns,
    filterDecimalRuns: filterDecimalRuns,
    geoMeanSecFromAttempts: geoMeanSecFromAttempts,
    aggregateFromRuns: aggregateFromRuns,
    aggregatePrimeCompositeFromRuns: aggregatePrimeCompositeFromRuns,
    buildChartSeries: buildChartSeries,
    chartSeriesOptsFromAgg: chartSeriesOptsFromAgg,
    buildTableRows: buildTableRows,
    firstLevelWithData: firstLevelWithData,
  };
})(typeof window !== 'undefined' ? window : this);
