/**
 * 浏览器 Canvas 2D 画双轴折线图；canonical 位于 docs/，report 与主站共用。
 * payload.labels 由调用方传入（见 shared/stats-i18n-pack.js）。
 */
(function (global) {
  function resolveLabels(payload) {
    var L = (payload && payload.labels) || {};
    return {
      axisErrorRate: L.axisErrorRate || '错误率(%)',
      axisAvgSec: L.axisAvgSec || '平均每题(秒)',
      cohortNoSample: L.cohortNoSample || '该等级暂无全体常模样本',
      cohortBoxLegend: L.cohortBoxLegend || '箱体 P25–P75 · 中线 P50 · 须 P10–P90',
      cohortStudentLine: L.cohortStudentLine || '学员加权均时 {sec}s',
      cohortStudentPct: L.cohortStudentPct || '速分位≈{pct}',
      cohortSampleN: L.cohortSampleN || '常模样本（答对题）n={n}',
      histNoData: L.histNoData || '暂无直方图数据（请点「刷新全体常模」重算）',
      histYAxis: L.histYAxis || '答对题次数',
      histLegend: L.histLegend || '全体答对单题耗时（直方图）',
      histStudentPrefix: L.histStudentPrefix || '学员',
      histStudentPct: L.histStudentPct || '分位≈{pct}',
      histSampleBins: L.histSampleBins || '样本 n={n} · {bins} 档',
    };
  }

  function fillTpl(s, params) {
    if (!params) return s;
    return String(s).replace(/\{(\w+)\}/g, function (_, name) {
      return params[name] != null ? String(params[name]) : '';
    });
  }

  function drawStatsDualAxisChart(ctx, cssWidth, cssHeight, payload) {
    var lab = resolveLabels(payload);
    var dates = payload.dates;
    var errorRates = payload.errorRates;
    var avgSecs = payload.avgSecs;
    var yMaxErr = payload.yMaxErr;
    var yMaxSec = payload.yMaxSec;
    if (!dates || dates.length === 0) return;

    var margin = { left: 56, right: 56, top: 28, bottom: 36 };
    var plotW = Math.max(10, cssWidth - margin.left - margin.right);
    var plotH = Math.max(10, cssHeight - margin.top - margin.bottom);
    var left = margin.left;
    var top = margin.top;

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    var axisTitle = '11px sans-serif';
    ctx.font = axisTitle;
    ctx.fillStyle = '#546e7a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(14, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(lab.axisErrorRate, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(cssWidth - 14, top + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(lab.axisAvgSec, 0, 0);
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    var gridLines = 4;
    for (var g = 0; g <= gridLines; g += 1) {
      var gy = top + (plotH * g) / gridLines;
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(left + plotW, gy);
      ctx.stroke();
    }

    var n = dates.length;
    function xAt(i) {
      return left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    }

    ctx.fillStyle = '#607d8b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var g2 = 0; g2 <= gridLines; g2 += 1) {
      var v = Math.round((yMaxErr * (gridLines - g2)) / gridLines);
      var yy = top + (plotH * g2) / gridLines;
      ctx.fillText(String(v), left - 6, yy);
    }

    ctx.textAlign = 'left';
    for (var g3 = 0; g3 <= gridLines; g3 += 1) {
      v = ((yMaxSec * (gridLines - g3)) / gridLines).toFixed(1);
      yy = top + (plotH * g3) / gridLines;
      ctx.fillText(String(v), left + plotW + 6, yy);
    }

    ctx.fillStyle = '#78909c';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var step = Math.max(1, Math.floor(n / 6));
    for (var i = 0; i < n; i += step) {
      var short = dates[i].slice(5);
      ctx.fillText(short, xAt(i), top + plotH + 6);
    }
    if ((n - 1) % step !== 0 && n > 1) {
      var shortLast = dates[n - 1].slice(5);
      ctx.fillText(shortLast, xAt(n - 1), top + plotH + 6);
    }

    function yErr(val) {
      return top + plotH - (val / yMaxErr) * plotH;
    }
    function ySec(val) {
      return top + plotH - (val / yMaxSec) * plotH;
    }

    function strokeLine(getY, values, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      var started = false;
      for (var i2 = 0; i2 < n; i2 += 1) {
        var val = values[i2];
        if (val == null || Number.isNaN(val)) {
          started = false;
          continue;
        }
        var x = xAt(i2);
        var y = getY(val);
        if (!started) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    function drawDots(getY, values, color) {
      ctx.fillStyle = color;
      for (var id = 0; id < n; id += 1) {
        var dv = values[id];
        if (dv == null || Number.isNaN(dv)) continue;
        ctx.beginPath();
        ctx.arc(xAt(id), getY(dv), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    strokeLine(yErr, errorRates, '#1976d2');
    strokeLine(ySec, avgSecs, '#2e7d32');
    drawDots(yErr, errorRates, '#1976d2');
    drawDots(ySec, avgSecs, '#2e7d32');

    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var lx = left;
    var ly = 6;
    ctx.fillStyle = '#1976d2';
    ctx.fillRect(lx, ly + 3, 12, 3);
    lx += 16;
    ctx.fillStyle = '#37474f';
    ctx.fillText(lab.axisErrorRate, lx, ly);
    lx += Math.max(72, lab.axisErrorRate.length * 7);
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(lx, ly + 3, 12, 3);
    lx += 16;
    ctx.fillStyle = '#37474f';
    ctx.fillText(lab.axisAvgSec, lx, ly);
  }

  function lnToSec(ln) {
    if (ln == null || !Number.isFinite(ln)) return null;
    var ms = Math.exp(ln);
    return ms > 0 && Number.isFinite(ms) ? ms / 1000 : null;
  }

  function formatSecShort(sec) {
    if (sec == null || !Number.isFinite(sec)) return '—';
    if (sec >= 10) return String(Math.round(sec * 10) / 10);
    return String(Math.round(sec * 100) / 100);
  }

  function drawCohortQuantileBoxChart(ctx, cssWidth, cssHeight, payload) {
    var lab = resolveLabels(payload);
    var q = payload.quantiles;
    var studentSec = payload.studentSec;
    var studentPct = payload.studentPct;
    var sampleN = payload.sampleN;
    if (!q || !q.n) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = '#90a4ae';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lab.cohortNoSample, cssWidth / 2, cssHeight / 2);
      return;
    }
    var margin = { left: 52, right: 16, top: 36, bottom: 40 };
    var plotW = Math.max(40, cssWidth - margin.left - margin.right);
    var plotH = Math.max(30, cssHeight - margin.top - margin.bottom);
    var left = margin.left;
    var top = margin.top;

    var q10 = lnToSec(q.q10);
    var q25 = lnToSec(q.q25);
    var q50 = lnToSec(q.q50);
    var q75 = lnToSec(q.q75);
    var q90 = lnToSec(q.q90);
    var vals = [q10, q25, q50, q75, q90].filter(function (x) {
      return x != null && Number.isFinite(x);
    });
    if (studentSec != null && Number.isFinite(studentSec)) vals.push(studentSec);
    var xMin = Math.min.apply(null, vals);
    var xMax = Math.max.apply(null, vals);
    var pad = Math.max(0.15, (xMax - xMin) * 0.08);
    xMin = Math.max(0, xMin - pad);
    xMax = xMax + pad;
    if (xMax <= xMin) xMax = xMin + 1;

    function xAt(sec) {
      return left + ((sec - xMin) / (xMax - xMin)) * plotW;
    }
    var midY = top + plotH * 0.52;

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    var gridN = 5;
    for (var g = 0; g <= gridN; g += 1) {
      var gx = left + (plotW * g) / gridN;
      ctx.beginPath();
      ctx.moveTo(gx, top);
      ctx.lineTo(gx, top + plotH);
      ctx.stroke();
      var tick = xMin + ((xMax - xMin) * g) / gridN;
      ctx.fillStyle = '#78909c';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatSecShort(tick) + 's', gx, top + plotH + 6);
    }

    if (q10 != null && q90 != null) {
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xAt(q10), midY);
      ctx.lineTo(xAt(q90), midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xAt(q10), midY - 14);
      ctx.lineTo(xAt(q10), midY + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xAt(q90), midY - 14);
      ctx.lineTo(xAt(q90), midY + 14);
      ctx.stroke();
    }
    if (q25 != null && q75 != null) {
      var bx = xAt(q25);
      var bw = Math.max(4, xAt(q75) - bx);
      ctx.fillStyle = 'rgba(25, 118, 210, 0.22)';
      ctx.fillRect(bx, midY - 18, bw, 36);
      ctx.strokeStyle = '#1976d2';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, midY - 18, bw, 36);
    }
    if (q50 != null) {
      ctx.strokeStyle = '#1565c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xAt(q50), midY - 20);
      ctx.lineTo(xAt(q50), midY + 20);
      ctx.stroke();
    }

    if (studentSec != null && Number.isFinite(studentSec)) {
      ctx.strokeStyle = '#c62828';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xAt(studentSec), top);
      ctx.lineTo(xAt(studentSec), top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1976d2';
    ctx.fillRect(left, 8, 12, 3);
    ctx.fillStyle = '#37474f';
    ctx.fillText(lab.cohortBoxLegend, left + 16, 6);
    if (studentSec != null) {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(left + 220, 8, 12, 3);
      ctx.fillStyle = '#37474f';
      var leg2 = fillTpl(lab.cohortStudentLine, { sec: formatSecShort(studentSec) });
      if (studentPct != null) {
        leg2 += ' · ' + fillTpl(lab.cohortStudentPct, { pct: Math.round(studentPct) });
      }
      ctx.fillText(leg2, left + 236, 6);
    }
    ctx.fillStyle = '#607d8b';
    ctx.font = '10px sans-serif';
    ctx.fillText(
      fillTpl(lab.cohortSampleN, { n: sampleN != null ? sampleN : q.n }),
      left,
      top + plotH + 22
    );
  }

  function drawCohortHistogramChart(ctx, cssWidth, cssHeight, payload) {
    var lab = resolveLabels(payload);
    var hist = payload.histogram;
    var studentSec = payload.studentSec;
    var studentPct = payload.studentPct;
    if (!hist || !hist.counts || !hist.counts.length || !hist.edgesLn) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = '#90a4ae';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lab.histNoData, cssWidth / 2, cssHeight / 2);
      return;
    }
    var counts = hist.counts;
    var edgesLn = hist.edgesLn;
    var nBins = counts.length;
    var margin = { left: 48, right: 16, top: 32, bottom: 44 };
    var plotW = Math.max(40, cssWidth - margin.left - margin.right);
    var plotH = Math.max(30, cssHeight - margin.top - margin.bottom);
    var left = margin.left;
    var top = margin.top;

    var maxCount = 1;
    for (var i = 0; i < nBins; i += 1) {
      if (counts[i] > maxCount) maxCount = counts[i];
    }

    var xMin = lnToSec(edgesLn[0]);
    var xMax = lnToSec(edgesLn[edgesLn.length - 1]);
    if (xMin == null || xMax == null) return;
    if (xMax <= xMin) xMax = xMin + 0.5;

    function xAt(sec) {
      return left + ((sec - xMin) / (xMax - xMin)) * plotW;
    }

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    for (var g = 0; g <= 4; g += 1) {
      var gy = top + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(left + plotW, gy);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(46, 125, 50, 0.55)';
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 1;
    for (var b = 0; b < nBins; b += 1) {
      var lo = lnToSec(edgesLn[b]);
      var hi = lnToSec(edgesLn[b + 1]);
      if (lo == null || hi == null) continue;
      var x0 = xAt(lo);
      var x1 = xAt(hi);
      var barW = Math.max(1, x1 - x0 - 1);
      var barH = (counts[b] / maxCount) * plotH;
      var y0 = top + plotH - barH;
      ctx.fillRect(x0, y0, barW, barH);
      ctx.strokeRect(x0, y0, barW, barH);
    }

    if (studentSec != null && Number.isFinite(studentSec) && studentSec >= xMin && studentSec <= xMax) {
      ctx.strokeStyle = '#c62828';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xAt(studentSec), top);
      ctx.lineTo(xAt(studentSec), top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#546e7a';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tickStep = Math.max(1, Math.floor(nBins / 6));
    for (var t = 0; t < nBins; t += tickStep) {
      var cx = (xAt(lnToSec(edgesLn[t])) + xAt(lnToSec(edgesLn[t + 1]))) / 2;
      ctx.fillText(formatSecShort(lnToSec(edgesLn[t])) + 's', cx, top + plotH + 6);
    }

    ctx.save();
    ctx.translate(12, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#607d8b';
    ctx.font = '11px sans-serif';
    ctx.fillText(lab.histYAxis, 0, 0);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#37474f';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(left, 8, 12, 10);
    ctx.fillStyle = '#37474f';
    ctx.fillText(lab.histLegend, left + 16, 6);
    if (studentSec != null) {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(left + 200, 12, 12, 3);
      ctx.fillStyle = '#37474f';
      var leg2 =
        lab.histStudentPrefix +
        ' ' +
        formatSecShort(studentSec) +
        's';
      if (studentPct != null) {
        leg2 += ' · ' + fillTpl(lab.histStudentPct, { pct: Math.round(studentPct) });
      }
      ctx.fillText(leg2, left + 216, 6);
    }
    ctx.fillStyle = '#607d8b';
    ctx.font = '10px sans-serif';
    ctx.fillText(
      fillTpl(lab.histSampleBins, { n: hist.n != null ? hist.n : '—', bins: nBins }),
      left,
      top + plotH + 22
    );
  }

  global.JmlStatsChart = {
    drawStatsDualAxisChart: drawStatsDualAxisChart,
    drawCohortQuantileBoxChart: drawCohortQuantileBoxChart,
    drawCohortHistogramChart: drawCohortHistogramChart,
    lnToSec: lnToSec,
    resolveLabels: resolveLabels,
    fillTpl: fillTpl,
  };
})(typeof window !== 'undefined' ? window : this);
