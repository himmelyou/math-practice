/**
 * 与小程序端 stats 聚合一致（浏览器版）；与 report/stats-aggregate-browser.js 同步，供 docs 独立部署。
 */
(function (global) {
  var LEVEL_COUNT = 16;
  /** 折线图：该难度下「有答题」的最近多少个日历日（无则向前不填充） */
  var CHART_PRACTICE_DAYS = 14;

  function emptyLevelAgg() {
    return { total: 0, correct: 0, totalTimeMs: 0 };
  }

  function filterArithmeticRuns(runs) {
    return (runs || []).filter(function (r) {
      var m = String(r && r.mode ? r.mode : 'survival').toLowerCase();
      return m === 'survival' || m === 'level' || m === 'training';
    });
  }

  function aggregateFromRuns(runs) {
    var byLevel = Array.from({ length: LEVEL_COUNT }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    filterArithmeticRuns(runs).forEach(function (r) {
      var ts = r.ts || 0;
      var d = new Date(ts);
      var dateStr =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      if (!byDay[dateStr]) {
        byDay[dateStr] = Array.from({ length: LEVEL_COUNT }, function () {
          return emptyLevelAgg();
        });
      }
      if (!Array.isArray(r.attempts)) return;
      r.attempts.forEach(function (a) {
        var idx = Math.max(0, Math.min(LEVEL_COUNT - 1, Number(a.levelIndex) || 0));
        byLevel[idx].total += 1;
        if (a.correct) byLevel[idx].correct += 1;
        byLevel[idx].totalTimeMs += Number(a.timeSpentMs) || 0;
        var dayAgg = byDay[dateStr][idx];
        dayAgg.total += 1;
        if (a.correct) dayAgg.correct += 1;
        dayAgg.totalTimeMs += Number(a.timeSpentMs) || 0;
      });
    });

    var hasAny = byLevel.some(function (l) {
      return l.total > 0;
    });
    return { byLevel: byLevel, byDay: byDay, hasAny: hasAny };
  }

  function buildChartSeries(byDay, levelIndex) {
    if (!byDay || typeof byDay !== 'object') return null;
    var li = Math.max(0, Math.min(LEVEL_COUNT - 1, Number(levelIndex) || 0));
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
        avgSec: Math.round(((L.totalTimeMs / total) / 1000) * 10) / 10,
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
      var avgSec = l.total > 0 ? Math.round(((l.totalTimeMs / l.total) / 1000) * 10) / 10 : null;
      return {
        name: levelNames[i] || 'L' + (i + 1),
        total: l.total,
        errRateText: errRate != null ? errRate + '%' : '-',
        avgSecText: avgSec != null ? String(avgSec) : '-',
      };
    });
  }

  function firstLevelWithData(byLevel) {
    var i = byLevel.findIndex(function (l) {
      return l.total > 0;
    });
    return i >= 0 ? i : 0;
  }

  global.JmlStatsAggregate = {
    LEVEL_COUNT: LEVEL_COUNT,
    CHART_PRACTICE_DAYS: CHART_PRACTICE_DAYS,
    filterArithmeticRuns: filterArithmeticRuns,
    aggregateFromRuns: aggregateFromRuns,
    buildChartSeries: buildChartSeries,
    buildTableRows: buildTableRows,
    firstLevelWithData: firstLevelWithData,
  };
})(typeof window !== 'undefined' ? window : this);
