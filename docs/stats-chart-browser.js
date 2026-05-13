/**
 * 浏览器 Canvas 2D 画双轴折线图；canonical 位于 docs/，report 与主站共用。
 */
(function (global) {
  function drawStatsDualAxisChart(ctx, cssWidth, cssHeight, payload) {
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
    ctx.fillText('错误率(%)', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(cssWidth - 14, top + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('平均每题(秒)', 0, 0);
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
    ctx.fillText('错误率(%)', lx, ly);
    lx += 72;
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(lx, ly + 3, 12, 3);
    lx += 16;
    ctx.fillStyle = '#37474f';
    ctx.fillText('平均每题(秒)', lx, ly);
  }

  global.JmlStatsChart = {
    drawStatsDualAxisChart: drawStatsDualAxisChart,
  };
})(typeof window !== 'undefined' ? window : this);
