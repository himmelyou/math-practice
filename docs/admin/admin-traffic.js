/**
 * 管理端 · 流量/使用发展概览
 */
(function () {
  var state = {
    loading: false,
    error: '',
    data: null,
    seriesMetric: 'dau', // dau | runs | newUsers
    bound: false,
  };

  function apiBase() {
    var base = (window.__JML_API_BASE__ || window.API_BASE_URL || '').trim();
    return base.replace(/\/+$/, '');
  }

  function adminPin() {
    return (window.__JML_ADMIN_PIN__ || '').trim();
  }

  function apiFetch(path, options) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error('未配置 API 地址'));
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    var pin = adminPin();
    if (pin) headers['X-Admin-Pin'] = pin;
    return fetch(base + path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || res.statusText || String(res.status));
        });
      }
      return res.json();
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDelta(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    var v = Math.floor(Number(n));
    if (v > 0) return '+' + v;
    return String(v);
  }

  function formatDateTime(ts) {
    var n = Number(ts) || 0;
    if (!n) return '—';
    try {
      return new Date(n).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return '—';
    }
  }

  function shortDate(key) {
    var s = String(key || '');
    if (s.length >= 10) return s.slice(5);
    return s;
  }

  function reportUserUrl(username) {
    return '../report/index.html?user=' + encodeURIComponent(username || '');
  }

  function readFilters() {
    var rangeEl = document.getElementById('jml-traffic-range');
    var scopeEl = document.getElementById('jml-traffic-scope');
    var excludeEl = document.getElementById('jml-traffic-exclude-testers');
    var range = rangeEl ? Number(rangeEl.value) : 30;
    if (range !== 7 && range !== 90) range = 30;
    return {
      range: range,
      scope: scopeEl && scopeEl.value === 'vip' ? 'vip' : 'all',
      excludeTesters: !excludeEl || !!excludeEl.checked,
    };
  }

  function loadTraffic(force) {
    if (state.loading && !force) return Promise.resolve();
    if (!force && state.data) {
      render();
      return Promise.resolve();
    }
    var f = readFilters();
    state.loading = true;
    state.error = '';
    render();
    var q =
      '?range=' +
      encodeURIComponent(String(f.range)) +
      '&scope=' +
      encodeURIComponent(f.scope) +
      '&excludeTesters=' +
      (f.excludeTesters ? '1' : '0');
    return apiFetch('/api/admin/traffic-stats' + q)
      .then(function (data) {
        if (!data || data.ok === false) {
          throw new Error((data && data.error) || '加载失败');
        }
        state.data = data;
        state.error = '';
      })
      .catch(function (e) {
        state.error = e.message || String(e);
      })
      .then(function () {
        state.loading = false;
        render();
      });
  }

  function kpiCard(label, value, sub) {
    return (
      '<div class="jml-traffic-kpi">' +
      '<div class="jml-traffic-kpi-label">' +
      escapeHtml(label) +
      '</div>' +
      '<div class="jml-traffic-kpi-value">' +
      escapeHtml(String(value)) +
      '</div>' +
      (sub
        ? '<div class="jml-traffic-kpi-sub">' + escapeHtml(sub) + '</div>'
        : '') +
      '</div>'
    );
  }

  function metricToggleHtml() {
    var items = [
      { id: 'dau', label: '日活跃' },
      { id: 'runs', label: '日对局' },
      { id: 'newUsers', label: '日新增' },
    ];
    return (
      '<div class="jml-traffic-metric-toggle" role="group" aria-label="趋势指标">' +
      items
        .map(function (it) {
          var active = state.seriesMetric === it.id ? ' active' : '';
          return (
            '<button type="button" class="jml-btn jml-traffic-metric-btn' +
            active +
            '" data-metric="' +
            it.id +
            '">' +
            it.label +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function barRowsHtml(items, valueKey) {
    var max = 0;
    (items || []).forEach(function (it) {
      var v = Number(it[valueKey]) || 0;
      if (v > max) max = v;
    });
    if (!max) max = 1;
    return (items || [])
      .map(function (it) {
        var v = Number(it[valueKey]) || 0;
        var pct = Math.round((v / max) * 100);
        return (
          '<div class="jml-traffic-bar-row">' +
          '<div class="jml-traffic-bar-label">' +
          escapeHtml(it.label || it.id || '') +
          '</div>' +
          '<div class="jml-traffic-bar-track"><div class="jml-traffic-bar-fill" style="width:' +
          pct +
          '%"></div></div>' +
          '<div class="jml-traffic-bar-value">' +
          escapeHtml(String(v)) +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function userTableHtml(rows, kind) {
    if (!rows || !rows.length) {
      return '<div class="jml-traffic-empty">暂无数据</div>';
    }
    var head =
      kind === 'churn'
        ? '<tr><th>用户名</th><th>备注</th><th class="num">未上线(天)</th><th>最后对局</th></tr>'
        : '<tr><th>用户名</th><th class="num">局数</th><th class="num">活跃天</th><th>最后对局</th></tr>';
    var body = rows
      .map(function (r) {
        var name =
          '<a class="jml-traffic-user-link" href="' +
          escapeHtml(reportUserUrl(r.username)) +
          '" target="_blank" rel="noopener">' +
          escapeHtml(r.username) +
          (r.isVip ? ' ★' : '') +
          '</a>';
        if (kind === 'churn') {
          return (
            '<tr><td>' +
            name +
            '</td><td>' +
            escapeHtml(r.adminNote || '—') +
            '</td><td class="num">' +
            escapeHtml(String(r.daysOffline != null ? r.daysOffline : '—')) +
            '</td><td>' +
            escapeHtml(formatDateTime(r.lastGameTs)) +
            '</td></tr>'
          );
        }
        return (
          '<tr><td>' +
          name +
          '</td><td class="num">' +
          escapeHtml(String(r.runs != null ? r.runs : '—')) +
          '</td><td class="num">' +
          escapeHtml(String(r.activeDays != null ? r.activeDays : '—')) +
          '</td><td>' +
          escapeHtml(formatDateTime(r.lastGameTs)) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="jml-table-wrap jml-traffic-table-wrap"><table class="jml-user-table jml-traffic-table"><thead>' +
      head +
      '</thead><tbody>' +
      body +
      '</tbody></table></div>'
    );
  }

  function drawSeriesChart() {
    var canvas = document.getElementById('jml-traffic-canvas');
    if (!canvas || !state.data || !Array.isArray(state.data.series)) return;
    var series = state.data.series;
    var metric = state.seriesMetric;
    var values = series.map(function (d) {
      return Number(d[metric]) || 0;
    });
    var vipValues =
      metric === 'dau'
        ? series.map(function (d) {
            return Number(d.vipDau) || 0;
          })
        : null;

    var wrap = canvas.parentElement;
    var cssW = Math.max(320, (wrap && wrap.clientWidth) || 640);
    var cssH = 220;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);

    var margin = { left: 40, right: 16, top: 16, bottom: 32 };
    var plotW = Math.max(10, cssW - margin.left - margin.right);
    var plotH = Math.max(10, cssH - margin.top - margin.bottom);
    var n = values.length;
    if (!n) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无趋势数据', cssW / 2, cssH / 2);
      return;
    }

    var maxV = 0;
    values.forEach(function (v) {
      if (v > maxV) maxV = v;
    });
    if (vipValues) {
      vipValues.forEach(function (v) {
        if (v > maxV) maxV = v;
      });
    }
    if (maxV < 1) maxV = 1;

    ctx.strokeStyle = 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = margin.top + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(margin.left, gy);
      ctx.lineTo(margin.left + plotW, gy);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(maxV * (1 - g / 4))), margin.left - 6, gy);
    }

    function xAt(i) {
      if (n === 1) return margin.left + plotW / 2;
      return margin.left + (plotW * i) / (n - 1);
    }
    function yAt(v) {
      return margin.top + plotH * (1 - v / maxV);
    }

    function strokeLine(arr, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (var i = 0; i < arr.length; i += 1) {
        var x = xAt(i);
        var y = yAt(arr[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (vipValues && metric === 'dau') {
      strokeLine(vipValues, '#f59e0b', 1.5);
    }
    strokeLine(values, '#2563eb', 2);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var labelStep = n > 40 ? 7 : n > 20 ? 4 : n > 10 ? 2 : 1;
    for (var li = 0; li < n; li += labelStep) {
      ctx.fillText(shortDate(series[li].date), xAt(li), margin.top + plotH + 8);
    }
    if ((n - 1) % labelStep !== 0) {
      ctx.fillText(shortDate(series[n - 1].date), xAt(n - 1), margin.top + plotH + 8);
    }
  }

  function render() {
    var body = document.getElementById('jml-traffic-body');
    var noteEl = document.getElementById('jml-traffic-note');
    if (!body) return;

    if (state.loading && !state.data) {
      body.innerHTML = '<div class="jml-traffic-empty">统计加载中…</div>';
      return;
    }
    if (state.error && !state.data) {
      body.innerHTML =
        '<div class="jml-traffic-error">' + escapeHtml(state.error) + '</div>';
      return;
    }
    if (!state.data) {
      body.innerHTML = '<div class="jml-traffic-empty">暂无数据</div>';
      return;
    }

    var d = state.data;
    var k = d.kpi || {};
    var metric = state.seriesMetric;
    if (noteEl) {
      noteEl.textContent =
        (d.note || '活跃 = 当天至少完成 1 局（中国时区）。') +
        (d.builtAt ? ' 更新于 ' + formatDateTime(d.builtAt) + '。' : '');
    }

    var deltaDay = formatDelta(k.dauDeltaDay);
    var deltaWeek = k.dauDeltaWeek == null ? '—' : formatDelta(k.dauDeltaWeek);

    var hint = '';
    if (metric === 'newUsers') {
      hint =
        '<p class="muted jml-traffic-hint">新增优先用 createdAt；旧账号可能回退为首次对局日（已知 ' +
        (k.createdAtKnown || 0) +
        ' / 推断 ' +
        (k.createdAtInferred || 0) +
        '）。</p>';
    } else if (metric === 'dau') {
      hint = '<p class="muted jml-traffic-hint">蓝线：日活跃；黄线：VIP 日活跃。</p>';
    }

    body.innerHTML =
      '<div class="jml-traffic-kpi-grid">' +
      kpiCard('今日活跃', k.dau != null ? k.dau : '—', '较昨日 ' + deltaDay + ' · 较上周同日 ' + deltaWeek) +
      kpiCard('近 7 日活跃', k.active7 != null ? k.active7 : '—', '') +
      kpiCard('近 30 日活跃', k.active30 != null ? k.active30 : '—', '') +
      kpiCard(
        '今日对局',
        k.runsToday != null ? k.runsToday : '—',
        '窗口内 ' + (k.runsInRange != null ? k.runsInRange : '—') + ' 局'
      ) +
      kpiCard('总账号', k.totalUsers != null ? k.totalUsers : '—', 'VIP ' + (k.vipUsers != null ? k.vipUsers : '—')) +
      kpiCard(
        '沉寂 ≥' + (d.churnDays || 14) + ' 天',
        k.churnCount != null ? k.churnCount : '—',
        '曾有对局、近期未练'
      ) +
      '</div>' +
      '<div class="jml-traffic-section">' +
      '<div class="jml-traffic-section-head">' +
      '<h3 class="jml-traffic-h3">趋势</h3>' +
      metricToggleHtml() +
      '</div>' +
      hint +
      '<div class="jml-traffic-chart-wrap"><canvas id="jml-traffic-canvas"></canvas></div>' +
      '</div>' +
      '<div class="jml-traffic-split">' +
      '<div class="jml-traffic-section">' +
      '<h3 class="jml-traffic-h3">模式对局占比（窗口内）</h3>' +
      '<div class="jml-traffic-bars">' +
      barRowsHtml(d.modeBreakdown, 'runs') +
      '</div></div>' +
      '<div class="jml-traffic-section">' +
      '<h3 class="jml-traffic-h3">近 30 日活跃深度</h3>' +
      '<div class="jml-traffic-bars">' +
      barRowsHtml(d.depthDistribution, 'users') +
      '</div></div>' +
      '</div>' +
      '<div class="jml-traffic-split">' +
      '<div class="jml-traffic-section">' +
      '<h3 class="jml-traffic-h3">窗口内最活跃 Top 10</h3>' +
      userTableHtml(d.topActive, 'active') +
      '</div>' +
      '<div class="jml-traffic-section">' +
      '<h3 class="jml-traffic-h3">沉寂预警（≥' +
      (d.churnDays || 14) +
      ' 天未练）</h3>' +
      userTableHtml(d.churnList, 'churn') +
      '</div>' +
      '</div>';

    if (state.error) {
      body.insertAdjacentHTML(
        'afterbegin',
        '<div class="jml-traffic-error">' + escapeHtml(state.error) + '（仍显示上次结果）</div>'
      );
    }

    requestAnimationFrame(function () {
      drawSeriesChart();
    });
  }

  function bindOnce() {
    if (state.bound) return;
    state.bound = true;
    var refresh = document.getElementById('jml-btn-refresh-traffic');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void loadTraffic(true);
      });
    }
    ['jml-traffic-range', 'jml-traffic-scope'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          void loadTraffic(true);
        });
      }
    });
    var exclude = document.getElementById('jml-traffic-exclude-testers');
    if (exclude) {
      exclude.addEventListener('change', function () {
        void loadTraffic(true);
      });
    }
    var body = document.getElementById('jml-traffic-body');
    if (body) {
      body.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-metric]') : null;
        if (!btn || !body.contains(btn)) return;
        var m = btn.getAttribute('data-metric');
        if (!m || m === state.seriesMetric) return;
        state.seriesMetric = m;
        render();
      });
    }
    window.addEventListener('resize', function () {
      if (document.getElementById('jml-traffic-canvas')) drawSeriesChart();
    });
  }

  function onTabShow() {
    bindOnce();
    void loadTraffic(false);
  }

  function init() {
    bindOnce();
  }

  window.JmlAdminTraffic = {
    init: init,
    onTabShow: onTabShow,
    load: loadTraffic,
  };
})();
