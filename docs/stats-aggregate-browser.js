/**
 * 与小程序端 stats 聚合一致（浏览器版）；canonical 位于 docs/，report 与主站共用。
 * 支持按模式分类：四则（L1–L16）/ 小数（D1–D6）等。
 *
 * 速度口径：对+错均计入；几何均（exp(mean(ln(ms)))）；timeSpentMs > cap（默认 60s）剔除。
 */
(function (global) {
  var LEVEL_COUNT = 16;
  var DECIMAL_LEVEL_COUNT = 6;
  /** 折线图：该难度下「有答题」的最近多少个日历日（无则向前不填充） */
  var CHART_PRACTICE_DAYS = 14;
  var DEFAULT_MAX_TIME_SPENT_MS = 60 * 1000;

  function emptyLevelAgg() {
    return { total: 0, correct: 0, totalTimeMs: 0, sumLnMs: 0, nSpeed: 0 };
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
   * 对+错、几何均、>cap 剔除。
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
      if (!a) continue;
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

  /**
   * @param {Array} runs
   * @param {{ levelCount?: number, modes?: string[], maxTimeSpentMs?: number }} [opts]
   */
  function aggregateFromRuns(runs, opts) {
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var modes = opts.modes || ['survival', 'level', 'training'];
    var maxTimeMs = resolveMaxTimeSpentMs(opts);
    var byLevel = Array.from({ length: levelCount }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    filterRunsByModes(runs, modes).forEach(function (r) {
      var ts = r.ts || 0;
      var d = new Date(ts);
      var dateStr =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      if (!byDay[dateStr]) {
        byDay[dateStr] = Array.from({ length: levelCount }, function () {
          return emptyLevelAgg();
        });
      }
      if (!Array.isArray(r.attempts)) return;
      r.attempts.forEach(function (a) {
        var idx = Math.max(0, Math.min(levelCount - 1, Number(a.levelIndex) || 0));
        var ms = Number(a.timeSpentMs) || 0;
        byLevel[idx].total += 1;
        if (a.correct) byLevel[idx].correct += 1;
        byLevel[idx].totalTimeMs += ms;
        var dayAgg = byDay[dateStr][idx];
        dayAgg.total += 1;
        if (a.correct) dayAgg.correct += 1;
        dayAgg.totalTimeMs += ms;
        if (ms > 0 && ms <= maxTimeMs && Number.isFinite(ms)) {
          var ln = Math.log(ms);
          byLevel[idx].sumLnMs += ln;
          byLevel[idx].nSpeed += 1;
          dayAgg.sumLnMs += ln;
          dayAgg.nSpeed += 1;
        }
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
    };
  }

  /**
   * @param {object} byDay
   * @param {number} levelIndex
   * @param {{ levelCount?: number }} [opts]
   */
  function buildChartSeries(byDay, levelIndex, opts) {
    if (!byDay || typeof byDay !== 'object') return null;
    opts = opts || {};
    var levelCount =
      opts.levelCount > 0 && Number.isFinite(Number(opts.levelCount))
        ? Math.floor(Number(opts.levelCount))
        : LEVEL_COUNT;
    var li = Math.max(0, Math.min(levelCount - 1, Number(levelIndex) || 0));
    var dates = Object.keys(byDay)
      .filter(function (d) {
        var L = byDay[d] && byDay[d][li];
        return L && (L.total || 0) > 0;
      })
      .sort();
    if (dates.length === 0) return null;
    if (dates.length > CHART_PRACTICE_DAYS) {
      dates = dates.slice(dates.length - CHART_PRACTICE_DAYS);
    }

    var series = dates.map(function (d) {
      var L = byDay[d][li];
      var total = L ? L.total || 0 : 0;
      if (total <= 0) return { errorRate: null, avgSec: null };
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

  global.JmlStatsAggregate = {
    LEVEL_COUNT: LEVEL_COUNT,
    DECIMAL_LEVEL_COUNT: DECIMAL_LEVEL_COUNT,
    CHART_PRACTICE_DAYS: CHART_PRACTICE_DAYS,
    DEFAULT_MAX_TIME_SPENT_MS: DEFAULT_MAX_TIME_SPENT_MS,
    normalizeMode: normalizeMode,
    filterRunsByModes: filterRunsByModes,
    filterArithmeticRuns: filterArithmeticRuns,
    filterDecimalRuns: filterDecimalRuns,
    geoMeanSecFromAttempts: geoMeanSecFromAttempts,
    aggregateFromRuns: aggregateFromRuns,
    buildChartSeries: buildChartSeries,
    buildTableRows: buildTableRows,
    firstLevelWithData: firstLevelWithData,
  };
})(typeof window !== 'undefined' ? window : this);
