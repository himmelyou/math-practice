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
    renderExpandWrongBook();
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
        renderExpandWrongBook();
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

  function renderExpandWrongBook() {
    var wrap = document.getElementById('jml-report-expand-wrong-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    var user = state.userDetail || {};
    var wrongs = Array.isArray(user.expandBracketsWrongAnswers) ? user.expandBracketsWrongAnswers.slice() : [];
    if (!wrongs.length) {
      wrap.innerHTML = '<div class="jml-report-empty">暂无拆括号错题</div>';
      return;
    }
    wrongs.sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    wrap.innerHTML =
      '<div class="jml-report-summary">拆括号错题本共 ' +
      escapeHtml(String(wrongs.length)) +
      ' 条（每人最多保留 20 条，新错题顶替最旧）</' + 'div>' +
      '<ul class="jml-wrong-list">' +
      wrongs
        .slice(0, 20)
        .map(function (w) {
          var prompt = w.prompt || w.question || w.text || '';
          var studentAns = w.studentAnswer != null ? String(w.studentAnswer) : '';
          var rightAns = w.correctAnswer != null ? String(w.correctAnswer) : '';
          var meta =
            formatDateTime(w.ts) +
            (w.levelIndex != null && Number.isFinite(Number(w.levelIndex))
              ? ' · L' + (Number(w.levelIndex) + 1)
              : '');
          return (
            '<li class="jml-wrong-item">' +
            '<div class="expr">' +
            escapeHtml(prompt || '（无题干）') +
            '</div>' +
            '<' + 'div' + '>学员选项：<span style="color:#c62828;font-weight:600;">' +
            escapeHtml(studentAns || '（空）') +
            '</span></div>' +
            '<div>正确选项：<span style="color:#2e7d32;font-weight:600;">' +
            escapeHtml(rightAns || '（空）') +
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
    var p = c.p != null ? Math.max(0, Math.min(1, c.p)) : 0.5;
    var tp = c.timePct;
    var t = tp != null && Number.isFinite(tp) ? Math.max(0, Math.min(1, tp / 100)) : 0.5;

    var hue;
    var sat;
    var light;

    if (p < 0.95) {
      if (p < 0.9) {
        hue = 18 + (38 - 18) * (p / 0.9);
      } else {
        hue = 38 + (88 - 38) * ((p - 0.9) / 0.05);
      }
      sat = Math.min(95, 55 + 25 * p);
      light = Math.max(36, 58 - 12 * p);
    } else {
      hue = 108 + 8 * (1 - t);
      sat = Math.max(48, Math.min(92, 72 - 18 * t));
      light = Math.max(34, Math.min(62, 38 + 22 * t));
    }

    var bw = 1 + (tp != null ? (tp / 100) * 4 : 0);
    return (
      'background:hsl(' +
      Math.round(hue) +
      ',' +
      Math.round(sat) +
      '%,' +
      Math.round(light) +
      '%);border:' +
      bw.toFixed(1) +
      'px solid #37474f'
    );
  }

  function buildHeatmapSectionHtml() {
    var HM = window.JmlStatsHeatmap;
    if (!HM || !HM.buildHeatmapCells) {
      return '<p class="jml-stats-cohort-warn">热图脚本未加载（请确认已加载 docs/stats-heatmap-browser.js）</p>';
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
      '<strong>图例：</strong>仅统计 <code>survival</code> / <code>level</code> / <code>training</code>。个人：每档取时间上最近的 ' +
      escapeHtml(String(heat.personalWindowAttempts || 200)) +
      ' 题，按 <code>run.ts</code> 与「今天」相差的<strong>整天数</strong>做指数权重（半衰期 ' +
      escapeHtml(String(heat.personalHalfLifeDays || 14)) +
      ' 天，λ=ln2/H）。格内<strong>准确率</strong>、<strong>答对均时</strong>均为加权值（均时由加权 ln(耗时) 还原为秒，仅含答对且单题≤1 分钟）。每档窗口内题数 ≥ ' +
      escapeHtml(String(heat.minAttempts)) +
      ' 时激活着色。主色：<strong>准确率 &lt;95%</strong> 时由加权准确率定色相（约 90% 橙黄交界、95% 黄绿交界）；<strong>≥95%</strong> 时进入绿色带，<strong>深浅主要由速度分位</strong>（快偏深绿、慢偏浅绿；无常模速度时深浅取中位）。边框粗：速度分位偏慢。' +
      '<br /><strong>速度上限：</strong>' +
      escapeHtml(capNote) +
      (cohort && cohort.builtAt
        ? '<br /><strong>常模快照：</strong>生成 ' +
          escapeHtml(formatDateTime(cohort.builtAt)) +
          '，过期 ' +
          escapeHtml(formatDateTime(cohort.expiresAt)) +
          '（默认 TTL 24h，环境变量 <code>COHORT_STATS_TTL_MS</code> 可改）。' +
          (cohort.servedFromCache ? ' 本次<strong>读缓存</strong>。' : ' 本次<strong>已重算并写盘</strong>。')
        : '') +
      (recK != null
        ? '<br /><strong>推荐下一练（调试用）：</strong>L' + (recK + 1) + '（速度分位偏慢优先；无常模速度时取加权准确率较低）。'
        : '') +
      '</div>';

    var cellsHtml = heat.cells
      .map(function (c) {
        var label = 'L' + (c.levelIndex + 1);
        var cls = 'jml-heatmap-cell' + (c.active ? '' : ' inactive');
        var st = heatmapCellInlineStyle(c);
        var timeT =
          c.timePct != null ? '速·分位 ' + Math.round(c.timePct) : c.active ? '速·分位 —' : '—';
        var nEffT =
          c.nEff != null && c.active ? 'n_eff≈' + escapeHtml(String(c.nEff)) : '';
        var ageT =
          c.active && c.ageDaysMin != null && c.ageDaysMax != null
            ? '天龄 ' + escapeHtml(String(c.ageDaysMin)) + '–' + escapeHtml(String(c.ageDaysMax))
            : '';
        var selCls = c.levelIndex === state.statsLevelIndex ? ' jml-heatmap-cell-selected' : '';
        return (
          '<div class="' +
          cls +
          selCls +
          '"' +
          ' data-level-index="' +
          c.levelIndex +
          '"' +
          ' role="button" tabindex="0"' +
          (st ? ' style="' + st + '"' : '') +
          ' title="' +
          escapeHtml(label + ' 准确率(加权) ' + c.pText + ' 答对均时(加权) ' + (c.avgSecText || '-')) +
          '">' +
          '<div class="jml-heatmap-cell-label">' +
          escapeHtml(label) +
          '</div>' +
          '<div class="jml-heatmap-cell-metric"><span class="jml-heatmap-metric-label">准确率</span> ' +
          escapeHtml(c.pText) +
          ' <span class="jml-heatmap-cell-sub">加权</span></div>' +
          '<div class="jml-heatmap-cell-metric"><span class="jml-heatmap-metric-label">答对均时</span> ' +
          escapeHtml(c.avgSecText != null ? c.avgSecText : '-') +
          ' <span class="jml-heatmap-cell-sub">加权</span></div>' +
          '<div class="jml-heatmap-cell-meta">窗口题数 n=' +
          escapeHtml(String(c.n != null && Number.isFinite(c.n) ? c.n : 0)) +
          '（激活≥' +
          escapeHtml(String(heat.minAttempts != null ? heat.minAttempts : 10)) +
          '）</div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(timeT) +
          '</div>' +
          (nEffT ? '<div class="jml-heatmap-cell-meta">' + nEffT + '</div>' : '') +
          (ageT ? '<div class="jml-heatmap-cell-meta">' + ageT + '</div>' : '') +
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
      '<div class="jml-heatmap-grid" id="jml-heatmap-grid">' +
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

    var heatmapBlock = buildHeatmapSectionHtml();

    wrap.innerHTML =
      '<p class="jml-stats-intro">本页统计与热图<strong>仅</strong>聚合生存 / 闯关 / 训练三种模式的 <code>runs.attempts</code>。热图个人侧为「每档最近 200 题 + 按天龄指数权重（半衰期 14 天）」。点击下方某一难度格，折线图展示该难度「最近最多 14 个有答题的日历日」（中间无练习日不插值填充）。</p>' +
      heatmapBlock +
      '<h3 class="jml-report-h3" id="jml-stats-chart-heading"></h3>' +
      '<div class="jml-stats-chart-wrap"><canvas id="jml-stats-canvas"></canvas></div>';

    var chartHeading = document.getElementById('jml-stats-chart-heading');
    if (chartHeading) {
      chartHeading.textContent =
        '按日曲线（L' + (state.statsLevelIndex + 1) + '）';
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
    var dpr = window.devicePixelRatio || 1;
    var bufW = Math.max(10, Math.floor(cssW * dpr));
    var bufH = Math.max(10, Math.floor(cssH * dpr));
    canvas.width = bufW;
    canvas.height = bufH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    var statsBody = document.getElementById('jml-report-stats-body');
    if (statsBody) {
      statsBody.addEventListener('click', function (ev) {
        var cell = ev.target.closest('.jml-heatmap-cell');
        if (!cell || !statsBody.contains(cell)) return;
        var AggInner = window.JmlStatsAggregate;
        if (!AggInner || !state.agg || !state.selectedUsername) return;
        var idx = parseInt(cell.getAttribute('data-level-index'), 10);
        if (!Number.isFinite(idx) || idx < 0 || idx > 15) return;
        state.statsLevelIndex = idx;
        state.chartModel = AggInner.buildChartSeries(state.agg.byDay, state.statsLevelIndex);
        statsBody.querySelectorAll('.jml-heatmap-cell').forEach(function (el) {
          var i = parseInt(el.getAttribute('data-level-index'), 10);
          el.classList.toggle('jml-heatmap-cell-selected', i === state.statsLevelIndex);
        });
        var h3 = statsBody.querySelector('#jml-stats-chart-heading');
        if (h3) {
          h3.textContent =
            '按日曲线（' +
            (LEVEL_NAMES[state.statsLevelIndex] || 'L' + (state.statsLevelIndex + 1)) +
            ' · 最近最多 14 个有练习日）';
        }
        requestAnimationFrame(drawStatsChart);
      });
    }
    var cohortRebuild = document.getElementById('jml-cohort-rebuild-btn');
    if (cohortRebuild) {
      cohortRebuild.addEventListener('click', function () {
        if (cohortRebuild.disabled) return;
        cohortRebuild.disabled = true;
        var prevLabel = cohortRebuild.textContent;
        cohortRebuild.textContent = '刷新中…';
        apiFetch('/api/admin/stats/level-cohort/rebuild', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then(function (d) {
            state.cohort = d && d.ok ? d : null;
            state.cohortError = d && d.ok ? '' : '常模重建返回异常';
            if (state.selectedUsername) renderStatsPanel();
          })
          .catch(function (e) {
            state.cohortError = e.message || String(e);
            if (state.selectedUsername) renderStatsPanel();
          })
          .finally(function () {
            cohortRebuild.disabled = false;
            cohortRebuild.textContent = prevLabel;
          });
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

