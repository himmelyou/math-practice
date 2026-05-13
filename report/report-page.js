/**
 * 学员数据页：挑战记录 / 错题本 / 数据分析
 */
(function () {
  var LEVEL_NAMES = [
    '第 1 级 · 一位数加法入门',
    '第 2 级 · 一位数加法进阶',
    '第 3 级 · 一位数加减混合',
    '第 4 级 · 两位数加减基础',
    '第 5 级 · 两位数加一位数/整十数',
    '第 6 级 · 两位数减一位数/整十数',
    '第 7 级 · 两位数加两位数（进位）',
    '第 8 级 · 两位数减两位数（退位）',
    '第 9 级 · 两位数加减混合',
    '第 10 级 · 乘法口诀基础',
    '第 11 级 · 两位除一位整除',
    '第 12 级 · 两位数加两位数（结果超100）',
    '第 13 级 · 两位乘一位',
    '第 14 级 · 两位乘一位的逆运算',
    '第 15 级 · 不带括号的四则运算',
    '第 16 级 · 带括号的四则运算',
  ];

  var MODE_LABEL = {
    survival: '生存模式',
    level: '闯关模式',
    training: '训练模式',
  };

  var state = {
    usersAll: [],
    runs: [],
    userDetail: null,
    selectedUsername: '',
    agg: null,
    chartModel: null,
    statsLevelIndex: 0,
    loadError: '',
    cohort: null,
    cohortError: '',
  };

  function apiBase() {
    var base = (window.__JML_API_BASE__ || window.API_BASE_URL || '').trim();
    return base.replace(/\/+$/, '');
  }

  function adminPin() {
    return (window.__JML_ADMIN_PIN__ || '').trim();
  }

  function showApiWarning() {
    var w = document.getElementById('jml-api-warning');
    if (!w) return;
    w.hidden = !!apiBase();
  }

  function apiFetch(path, options) {
    var base = apiBase();
    if (!base) return Promise.reject(new Error('未配置 API 地址'));
    var url = base + path;
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    var pin = adminPin();
    if (pin) headers['X-Admin-Pin'] = pin;
    return fetch(url, Object.assign({}, opts, { headers: headers })).then(function (res) {
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

  function formatMode(m) {
    return MODE_LABEL[m] || m || '-';
  }

  function formatDuration(sec) {
    var n = Number(sec);
    if (!Number.isFinite(n) || n < 0) return '-';
    var m = Math.floor(n / 60);
    var s = Math.floor(n % 60);
    return m > 0 ? m + '分' + s + '秒' : s + '秒';
  }

  function formatDateTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '-';
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + mo + '-' + day + ' ' + h + ':' + mi;
  }

  function activeTabId() {
    var btn = document.querySelector('.jml-tab.active');
    return btn ? btn.getAttribute('data-tab') : 'runs';
  }

  function switchTab(id) {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === id);
    });
    document.querySelectorAll('.jml-tab-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== id);
    });
    if (id === 'stats') {
      requestAnimationFrame(drawStatsChart);
    }
  }

  function getFilterInput() {
    return document.getElementById('jml-report-user-filter');
  }

  function getUserSelect() {
    return document.getElementById('jml-report-user-select');
  }

  function filterUsers(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return state.usersAll.slice();
    return state.usersAll.filter(function (u) {
      return String(u).toLowerCase().indexOf(q) >= 0;
    });
  }

  function populateUserSelect(keepSelection) {
    var sel = getUserSelect();
    if (!sel) return;
    var filterVal = getFilterInput() ? getFilterInput().value : '';
    var list = filterUsers(filterVal);
    var prev = keepSelection ? state.selectedUsername : '';
    sel.innerHTML = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = list.length ? '请选择学员…' : '无匹配学员';
    sel.appendChild(opt0);
    list.forEach(function (u) {
      var o = document.createElement('option');
      o.value = u;
      o.textContent = u;
      sel.appendChild(o);
    });
    if (prev && list.indexOf(prev) >= 0) {
      sel.value = prev;
      state.selectedUsername = prev;
    } else {
      sel.value = '';
      state.selectedUsername = '';
    }
  }

  function showGlobalError() {
    var el = document.getElementById('jml-report-load-error');
    if (el && state.loadError) {
      el.textContent = state.loadError;
      el.style.display = 'block';
    }
  }

  function clearPanels() {
    state.runs = [];
    state.userDetail = null;
    state.agg = null;
    state.chartModel = null;
    renderRunsTable();
    renderWrongBook();
    renderStatsPanel();
  }

  function loadLevelCohort() {
    state.cohortError = '';
    return apiFetch('/api/admin/stats/level-cohort')
      .then(function (d) {
        state.cohort = d && d.ok ? d : null;
        if (!d || !d.ok) state.cohortError = '常模接口返回异常';
      })
      .catch(function (e) {
        state.cohort = null;
        state.cohortError = e.message || String(e);
      })
      .then(function () {
        if (activeTabId() === 'stats' && state.selectedUsername) {
          renderStatsPanel();
          requestAnimationFrame(drawStatsChart);
        }
      });
  }

  function loadUserList() {
    showApiWarning();
    return apiFetch('/api/admin/user-list')
      .then(function (data) {
        state.usersAll = Array.isArray(data.users) ? data.users.slice() : [];
        state.usersAll.sort();
        state.loadError = '';
        var el = document.getElementById('jml-report-load-error');
        if (el) el.style.display = 'none';
        populateUserSelect(true);
      })
      .catch(function (e) {
        state.loadError = e.message || String(e);
        showGlobalError();
      });
  }

  function loadStudentData() {
    var u = state.selectedUsername;
    if (!u) {
      clearPanels();
      return;
    }
    var errEl = document.getElementById('jml-report-student-error');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    Promise.all([
      apiFetch('/api/admin/records/' + encodeURIComponent(u)),
      apiFetch('/api/admin/user/' + encodeURIComponent(u)),
    ])
      .then(function (results) {
        var rec = results[0];
        var userData = results[1];
        var runs = Array.isArray(rec.runs) ? rec.runs.slice() : [];
        runs.sort(function (a, b) {
          return (b.ts || 0) - (a.ts || 0);
        });
        state.runs = runs;
        state.userDetail = userData && userData.user ? userData.user : userData;

        var Agg = window.JmlStatsAggregate;
        if (Agg) {
          var agg = Agg.aggregateFromRuns(runs);
          state.agg = agg;
          var levelIdx = Agg.firstLevelWithData(agg.byLevel);
          state.statsLevelIndex = levelIdx;
          state.chartModel = agg.hasAny ? Agg.buildChartSeries(agg.byDay, levelIdx) : null;
        } else {
          state.agg = null;
          state.chartModel = null;
        }

        renderRunsTable();
        renderWrongBook();
        renderStatsPanel();
        if (activeTabId() === 'stats') {
          requestAnimationFrame(drawStatsChart);
        }
      })
      .catch(function (e) {
        if (errEl) {
          errEl.textContent = e.message || String(e);
          errEl.style.display = 'block';
        }
        clearPanels();
      });
  }

  function renderRunsTable() {
    var wrap = document.getElementById('jml-report-runs-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    var runs = state.runs;
    if (!runs.length) {
      wrap.innerHTML = '<div class="jml-report-empty">暂无挑战记录</div>';
      return;
    }
    var rows = runs
      .map(function (r) {
        var wrong =
          typeof r.wrongCount === 'number' && Number.isFinite(r.wrongCount)
            ? r.wrongCount
            : Array.isArray(r.wrongQuestionIds)
              ? r.wrongQuestionIds.length
              : 0;
        var durationSec =
          r.durationSec != null && Number.isFinite(Number(r.durationSec))
            ? Number(r.durationSec)
            : r.survivalTimeSec != null && Number.isFinite(Number(r.survivalTimeSec))
              ? Number(r.survivalTimeSec)
              : NaN;
        var maxL = r.maxLevel != null ? Number(r.maxLevel) : -1;
        var maxDisplay = maxL >= 0 ? 'L' + (maxL + 1) : '-';
        return (
          '<tr>' +
          '<td class="jml-runs-col-time">' +
          escapeHtml(formatDateTime(r.ts)) +
          '</td>' +
          '<td class="jml-runs-col-mode">' +
          escapeHtml(formatMode(r.mode)) +
          '</td>' +
          '<td class="num jml-runs-col-dur">' +
          escapeHtml(formatDuration(durationSec)) +
          '</td>' +
          '<td class="num jml-runs-col-score">' +
          escapeHtml(String(r.score != null ? r.score : 0)) +
          '</td>' +
          '<td class="num jml-runs-col-wrong">' +
          escapeHtml(String(wrong)) +
          '</td>' +
          '<td class="num jml-runs-col-level">' +
          escapeHtml(maxDisplay) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    wrap.innerHTML =
      '<div class="jml-report-table-wrap"><table class="jml-report-table jml-report-runs-table">' +
      '<thead><tr><th>日期时间</th><th>挑战类型</th><th class="num">用时</th><th class="num">得分</th><th class="num">错误题数</th><th class="num">最高难度</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>';
  }

  function renderWrongBook() {
    var wrap = document.getElementById('jml-report-wrong-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    var user = state.userDetail || {};
    var wrongs = Array.isArray(user.wrongAnswers) ? user.wrongAnswers.slice() : [];
    if (!wrongs.length) {
      wrap.innerHTML = '<div class="jml-report-empty">暂无错题</div>';
      return;
    }
    wrongs.sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    wrap.innerHTML =
      '<div class="jml-report-summary">当前错题本共 ' + escapeHtml(String(wrongs.length)) + ' 条（最多展示 200 条）</div>' +
      '<ul class="jml-wrong-list">' +
      wrongs
        .slice(0, 200)
        .map(function (w) {
          // 兼容小程序/H5 不同历史字段：question/q/text，userAnswer/wrongAnswer/studentAnswer
          var expr = w.question || w.q || w.text || '';
          var wrongAns = w.userAnswer != null
            ? w.userAnswer
            : (w.wrongAnswer != null
              ? w.wrongAnswer
              : (w.studentAnswer != null ? w.studentAnswer : ''));
          var rightAns = w.correctAnswer != null ? w.correctAnswer : (w.answer != null ? w.answer : '');
          if (!expr && rightAns !== '') {
            expr = '（旧记录缺少题干）';
          }
          var wrongAnsText = wrongAns === '' ? '（空）' : String(wrongAns);
          var rightAnsText = rightAns === '' ? '（空）' : String(rightAns);
          var meta = formatDateTime(w.ts) + (w.levelIndex != null ? (' · L' + (Number(w.levelIndex) + 1)) : '');
          return (
            '<li class="jml-wrong-item">' +
            '<div class="expr">' +
            escapeHtml(expr) +
            '</div>' +
            '<div>错误：<span style="color:#c62828;font-weight:600;">' +
            escapeHtml(wrongAnsText) +
            '</span>；正确：<span style="color:#2e7d32;font-weight:600;">' +
            escapeHtml(rightAnsText) +
            '</span></div>' +
            '<div class="meta">' +
            escapeHtml(meta) +
            '</div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>';
  }

  function heatmapCellInlineStyle(c) {
    if (!c.active) return '';
    var acc = c.accPct != null ? c.accPct : 50;
    var hue = acc * 1.2;
    var sat = 50 + (c.timePct != null ? Math.min(40, c.timePct * 0.4) : 0);
    var light = 52;
    var bw = 1 + (c.timePct != null ? (c.timePct / 100) * 4 : 0);
    return (
      'background:hsl(' +
      Math.round(hue) +
      ',' +
      Math.round(sat) +
      '%,' +
      light +
      '%);border:' +
      bw.toFixed(1) +
      'px solid #37474f'
    );
  }

  function buildHeatmapSectionHtml() {
    var HM = window.JmlStatsHeatmap;
    if (!HM || !HM.buildHeatmapCells) {
      return '<p class="jml-stats-cohort-warn">热图脚本未加载（stats-heatmap-browser.js）</p>';
    }
    var cohort = state.cohort;
    var capMs = cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : 60 * 1000;
    var capNote =
      cohort && cohort.timeSpentMsCapNote
        ? cohort.timeSpentMsCapNote
        : '答对题单题耗时超过 ' +
          (capMs >= 60000 ? Math.round(capMs / 60000) + ' 分钟' : Math.round(capMs / 1000) + ' 秒') +
          ' 的记录不纳入个人/全体速度侧统计（排除挂机、长时间切屏等异常偏慢）。';

    var heat = HM.buildHeatmapCells({
      runs: state.runs,
      cohort: cohort,
      maxTimeSpentMs: capMs,
    });
    var recK = HM.recommendLevelIndex ? HM.recommendLevelIndex(heat) : null;

    var cohortWarn = '';
    if (state.cohortError) {
      cohortWarn =
        '<div class="jml-stats-cohort-warn"><strong>全体常模未加载。</strong> ' +
        escapeHtml(state.cohortError) +
        ' 热图仍可显示本学员四则数据，但无百分位对比。</div>';
    }

    var legend =
      '<div class="jml-heatmap-legend">' +
      '<strong>图例：</strong>仅统计 <code>survival</code> / <code>level</code> / <code>training</code>；每档答题数 ≥ ' +
      escapeHtml(String(heat.minAttempts)) +
      ' 时激活着色。主色：准确率相对全体（绿=好于多数人）；边框越粗表示答对题耗时相对全体越慢。' +
      '<br /><strong>速度上限：</strong>' +
      escapeHtml(capNote) +
      (cohort && cohort.minUsersForAccuracyRef != null
        ? ' 准确率常模需每档至少 ' + escapeHtml(String(cohort.minUsersForAccuracyRef)) + ' 名「该档 ≥30 题」的学员。'
        : '') +
      (recK != null
        ? '<br /><strong>推荐下一练（调试用）：</strong>L' + (recK + 1) + '（准确率分位低优先，其次偏慢）。'
        : '') +
      '</div>';

    var cellsHtml = heat.cells
      .map(function (c) {
        var label = 'L' + (c.levelIndex + 1);
        var cls = 'jml-heatmap-cell' + (c.active ? '' : ' inactive');
        var st = heatmapCellInlineStyle(c);
        var accT =
          c.accPct != null ? '准·分位 ' + Math.round(c.accPct) : c.active ? '准·分位 —' : '—';
        var timeT =
          c.timePct != null ? '速·分位 ' + Math.round(c.timePct) : c.active ? '速·分位 —' : '—';
        var note = c.accRefNote ? '<div class="jml-heatmap-cell-meta">' + escapeHtml(c.accRefNote) + '</div>' : '';
        return (
          '<div class="' +
          cls +
          '"' +
          (st ? ' style="' + st + '"' : '') +
          ' title="' +
          escapeHtml(label + ' n=' + c.n + ' ' + c.pText) +
          '">' +
          '<div class="jml-heatmap-cell-label">' +
          escapeHtml(label) +
          '</div>' +
          '<div class="jml-heatmap-cell-meta">n=' +
          escapeHtml(String(c.n)) +
          '</div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(c.pText) +
          '</div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(accT) +
          '</div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(timeT) +
          '</div>' +
          note +
          '</div>'
        );
      })
      .join('');

    var debugPayload = {
      cohortResponse: cohort,
      heatmapBuild: heat,
      recommendLevelIndex: recK,
      runsCount: state.runs.length,
      arithmeticRunsCount: HM.filterArithmeticRuns(state.runs).length,
    };
    var debugJson = '';
    try {
      debugJson = JSON.stringify(debugPayload, null, 2);
    } catch (e) {
      debugJson = String(e);
    }

    var debugBlock =
      '<details class="jml-stats-debug">' +
      '<summary>调试：完整 JSON（常模 + 热图计算结果）</summary>' +
      '<pre>' +
      escapeHtml(debugJson) +
      '</pre>' +
      '</details>';

    return (
      cohortWarn +
      '<div class="jml-heatmap-section">' +
      legend +
      '<div class="jml-heatmap-grid">' +
      cellsHtml +
      '</div>' +
      debugBlock +
      '</div>'
    );
  }

  function renderStatsPanel() {
    var wrap = document.getElementById('jml-report-stats-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    var agg = state.agg;
    if (!agg || !agg.hasAny) {
      wrap.innerHTML =
        '<div class="jml-report-empty">暂无四则相关 attempts（仅 survival / level / training；学员多玩几局后再看）</div>';
      return;
    }
    var Agg = window.JmlStatsAggregate;
    var options = LEVEL_NAMES.map(function (n, i) {
      var sel = i === state.statsLevelIndex ? ' selected' : '';
      return '<option value="' + i + '"' + sel + '>' + escapeHtml(n) + '</option>';
    }).join('');

    var heatmapBlock = buildHeatmapSectionHtml();

    wrap.innerHTML =
      '<p class="jml-stats-intro">本页统计与热图<strong>仅</strong>聚合生存 / 闯关 / 训练三种模式的 <code>runs.attempts</code>（与后续训练选关口径一致）。下方折线图仍按所选难度展示按日错误率与均耗时。</p>' +
      heatmapBlock +
      '<h3 class="jml-report-h3">按日曲线（所选难度）</h3>' +
      '<div class="jml-stats-level-row"><label for="jml-stats-level-select">选择难度</label>' +
      '<select id="jml-stats-level-select" class="jml-stats-level-select">' +
      options +
      '</select></div>' +
      '<div class="jml-stats-chart-wrap"><canvas id="jml-stats-canvas"></canvas></div>';

    var sel = document.getElementById('jml-stats-level-select');
    if (sel) {
      sel.addEventListener('change', function () {
        state.statsLevelIndex = Math.max(0, Math.min(15, Number(sel.value) || 0));
        state.chartModel = Agg.buildChartSeries(agg.byDay, state.statsLevelIndex);
        drawStatsChart();
      });
    }
  }

  function drawStatsChart() {
    var canvas = document.getElementById('jml-stats-canvas');
    if (!canvas) return;
    var model = state.chartModel;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var cssW = canvas.parentElement ? canvas.parentElement.clientWidth : 600;
    var cssH = canvas.parentElement ? canvas.parentElement.clientHeight : 220;
    canvas.width = Math.max(10, Math.floor(cssW * (window.devicePixelRatio || 1)));
    canvas.height = Math.max(10, Math.floor(cssH * (window.devicePixelRatio || 1)));
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    if (!model) {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#90a4ae';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无曲线数据', cssW / 2, cssH / 2);
      return;
    }
    var payload = {
      dates: model.dates,
      errorRates: model.series.map(function (x) { return x.errorRate; }),
      avgSecs: model.series.map(function (x) { return x.avgSec; }),
      yMaxErr: model.yMaxErr,
      yMaxSec: model.yMaxSec,
    };
    if (window.JmlStatsChart && window.JmlStatsChart.drawStatsDualAxisChart) {
      window.JmlStatsChart.drawStatsDualAxisChart(ctx, cssW, cssH, payload);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });
    var filter = getFilterInput();
    if (filter) {
      filter.addEventListener('input', function () {
        populateUserSelect(false);
      });
    }
    var sel = getUserSelect();
    if (sel) {
      sel.addEventListener('change', function () {
        state.selectedUsername = sel.value || '';
        loadStudentData();
      });
    }
  }

  window.JmlReportPage = {
    init: function () {
      showApiWarning();
      bindEvents();
      loadLevelCohort();
      loadUserList().then(function () {
        // no-op
      });
    },
  };
})();

