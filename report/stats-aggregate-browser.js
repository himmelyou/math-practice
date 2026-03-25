/**
 * 与小程序端 stats 聚合一致（浏览器版）
 */
(function (global) {
  var LEVEL_COUNT = 16;

  function emptyLevelAgg() {
    return { total: 0, correct: 0, totalTimeMs: 0 };
  }

  function padDate(y, m, day) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function enumerateDates(firstStr, lastStr) {
    var allDates = [];
    var first = new Date(firstStr.replace(/-/g, '/'));
    var last = new Date(lastStr.replace(/-/g, '/'));
    for (var d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      allDates.push(padDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    }
    return allDates;
  }

  function aggregateFromRuns(runs) {
    var byLevel = Array.from({ length: LEVEL_COUNT }, function () {
      return emptyLevelAgg();
    });
    var byDay = {};

    (runs || []).forEach(function (r) {
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
    var datesRaw = Object.keys(byDay).sort();
    if (datesRaw.length === 0) return null;

    var allDates = enumerateDates(datesRaw[0], datesRaw[datesRaw.length - 1]);

    var lastErrorRate = null;
    var lastAvgSec = null;
    var series = allDates.map(function (d) {
      var L = byDay[d] ? byDay[d][levelIndex] : null;
      var total = L ? L.total || 0 : 0;
      if (total > 0) {
        lastErrorRate = Math.round((1 - L.correct / total) * 100);
        lastAvgSec = Math.round(((L.totalTimeMs / total) / 1000) * 10) / 10;
      }
      return { errorRate: lastErrorRate, avgSec: lastAvgSec };
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
      dates: allDates,
      series: series,
      yMaxErr: yMaxErr,
      yMaxSec: Math.ceil(yMaxSec),
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
    aggregateFromRuns: aggregateFromRuns,
    buildChartSeries: buildChartSeries,
    buildTableRows: buildTableRows,
    firstLevelWithData: firstLevelWithData,
  };
})(typeof window !== 'undefined' ? window : this);

