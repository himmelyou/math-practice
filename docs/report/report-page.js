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

  var DECIMAL_LEVEL_NAMES = [
    '第 1 级 · 一位小数与整数混合加减',
    '第 2 级 · 一位与两位小数混合加减',
    '第 3 级 · 乘或除以 10ⁿ',
    '第 4 级 · 单位分数与小数互化',
    '第 5 级 · 小数乘除一位整数',
  ];

  var MODE_LABEL = {
    survival: '生存模式',
    level: '闯关模式',
    training: '训练模式',
    decimal: '小数运算',
    perfectSquare: '平方数',
  };

  var WRONG_ANSWER_MODES = {
    survival: true,
    level: true,
    training: true,
    decimal: true,
    perfectSquare: true,
  };

  var WRONG_ANSWER_LEVEL_MAX = {
    survival: 15,
    level: 15,
    training: 15,
    decimal: 5,
    perfectSquare: 3,
  };

  function normalizeWrongAnswerMode(mode) {
    var m = String(mode || '').trim();
    return WRONG_ANSWER_MODES[m] ? m : 'level';
  }

  function clampWrongAnswerLevelIndex(mode, levelIndex) {
    var max = WRONG_ANSWER_LEVEL_MAX[normalizeWrongAnswerMode(mode)];
    if (typeof max !== 'number') max = 15;
    var lv = typeof levelIndex === 'number' && Number.isFinite(levelIndex) ? Math.floor(levelIndex) : 0;
    return Math.max(0, Math.min(max, lv));
  }

  function formatWrongAnswerLevelLabel(mode, levelIndex) {
    var m = normalizeWrongAnswerMode(mode);
    var n = clampWrongAnswerLevelIndex(m, levelIndex) + 1;
    if (m === 'decimal') return 'D' + n;
    return 'L' + n;
  }

  function formatWrongAnswerMeta(w) {
    if (!w || typeof w !== 'object') return '';
    var levelLabel = w.levelLabel;
    if (!levelLabel && w.levelIndex != null) {
      levelLabel = formatWrongAnswerLevelLabel(w.mode || 'level', w.levelIndex);
    }
    if (!levelLabel) return '';
    var modeLabel = MODE_LABEL[normalizeWrongAnswerMode(w.mode)];
    if (w.mode && modeLabel && w.mode !== 'level' && w.mode !== 'survival' && w.mode !== 'training') {
      return modeLabel + ' · ' + levelLabel;
    }
    return levelLabel;
  }

  var state = {
    usersAll: [],
    userScope: 'all',
    runs: [],
    userDetail: null,
    selectedUsername: '',
    loadedStudentUsername: '',
    agg: null,
    aggByCategory: {},
    chartModel: null,
    statsLevelIndex: 0,
    chartCategoryId: 'arithmetic',
    expandedCategoryId: 'arithmetic',
    loadError: '',
    cohort: null,
    cohortByCategory: {},
    cohortError: '',
    heat: null,
    heatByCategory: {},
    overviewRows: [],
    overviewLoading: false,
    overviewError: '',
    overviewBuiltAt: 0,
    overviewSortKey: 'daysOffline',
    overviewSortDir: 'desc',
  };

  var REPORT_LANG_KEY = 'jml_lang_v1';
  var REPORT_USER_SCOPE_KEY = 'jml_report_user_scope_v1';
  var REPORT_OVERVIEW_SORT_KEY = 'jml_report_overview_sort_v1';
  var OVERVIEW_SORTABLE_KEYS = {
    username: 'username',
    grade: 'gradeSort',
    daysOffline: 'daysOffline',
    levelProgress: 'levelProgressSort',
    trainingProgress: 'trainingProgressSort',
    survivalProgress: 'survivalProgressSort',
    primeProgress: 'primeProgressSec',
    perfectSquareProgress: 'perfectSquareProgressSort',
    decimalProgress: 'decimalProgressSort',
    expandProgress: 'expandProgressSort',
  };
  var reportI18nRuntime = { zhHant: {}, en: {} };

  function getReportLang() {
    try {
      var v = localStorage.getItem(REPORT_LANG_KEY) || '';
      return v === 'en' ? 'en' : 'zhHant';
    } catch (e) {
      return 'zhHant';
    }
  }

  function rt(key) {
    var lang = getReportLang();
    var pack = window.JmlStatsI18nPack || { zhHant: {}, en: {} };
    var cur = reportI18nRuntime[lang] && reportI18nRuntime[lang][key];
    if (cur) return cur;
    if (pack[lang] && pack[lang][key]) return pack[lang][key];
    if (pack.zhHant && pack.zhHant[key]) return pack.zhHant[key];
    return key;
  }

  function rtf(key, params) {
    var s = rt(key);
    if (!params) return s;
    return String(s).replace(/\{(\w+)\}/g, function (_, name) {
      return params[name] != null ? String(params[name]) : '';
    });
  }

  function getReportChartLabels() {
    return {
      axisErrorRate: rt('stats.chart.axisErrorRate'),
      axisAvgSec: rt('stats.chart.axisAvgSec'),
      cohortNoSample: rt('stats.chart.cohortNoSample'),
      cohortBoxLegend: rt('stats.chart.cohortBoxLegend'),
      cohortStudentLine: rt('stats.chart.cohortStudentLine'),
      cohortStudentPct: rt('stats.chart.cohortStudentPct'),
      cohortSampleN: rt('stats.chart.cohortSampleN'),
      histNoData: rt('stats.chart.histNoData'),
      histYAxis: rt('stats.chart.histYAxis'),
      histLegend: rt('stats.chart.histLegend'),
      histStudentPrefix: rt('stats.chart.histStudentPrefix'),
      histStudentPct: rt('stats.chart.histStudentPct'),
      histSampleBins: rt('stats.chart.histSampleBins'),
    };
  }

  function getReportTrainingReasonLabels() {
    return {
      brushFixRed: rt('stats.training.reason.brushFixRed'),
      brushPickSpeed: rt('stats.training.reason.brushPickSpeed'),
      frontierStabilizeM: rt('stats.training.reason.frontierStabilizeM'),
      frontierOpenM1: rt('stats.training.reason.frontierOpenM1'),
      dailyClear: rt('stats.training.reason.dailyClear'),
      dailyPassAllClear: rt('stats.training.reason.dailyPassAllClear'),
      dailyFailEnterBrush: rt('stats.training.reason.dailyFailEnterBrush'),
      altAfterDaily: rt('stats.training.reason.altAfterDaily'),
      dailyPassNext: rt('stats.training.reason.dailyPassNext'),
      brush: rt('stats.training.reason.brush'),
      scanBelow: rt('stats.training.reason.scanBelow'),
      openNew: rt('stats.training.reason.openNew'),
      retrySame: rt('stats.training.reason.retrySame'),
      afterFailBelow: rt('stats.training.reason.afterFailBelow'),
      dailyDefault: rt('stats.training.reason.dailyDefault'),
    };
  }

  function loadReportI18n() {
    return apiFetch('/api/i18n')
      .then(function (d) {
        if (d && d.ok && d.i18n) {
          reportI18nRuntime.zhHant = d.i18n.zhHant || {};
          reportI18nRuntime.en = d.i18n.en || {};
        }
      })
      .catch(function () {});
  }

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
    var n = Math.max(0, Math.round(Number(sec) || 0));
    if (!Number.isFinite(n)) return '-';
    if (n < 60) return n + 's';
    var m = Math.floor(n / 60);
    var s = n % 60;
    return s === 0 ? m + 'm' : m + 'm ' + s + 's';
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
    return btn ? btn.getAttribute('data-tab') : 'overview';
  }

  function readStoredOverviewSort() {
    try {
      var raw = localStorage.getItem(REPORT_OVERVIEW_SORT_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.key && OVERVIEW_SORTABLE_KEYS[o.key]) {
        state.overviewSortKey = o.key;
        state.overviewSortDir = o.dir === 'asc' ? 'asc' : 'desc';
      }
    } catch (e) {
      /* ignore */
    }
  }

  function storeOverviewSort() {
    try {
      localStorage.setItem(
        REPORT_OVERVIEW_SORT_KEY,
        JSON.stringify({ key: state.overviewSortKey, dir: state.overviewSortDir })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function isOverviewSortNull(val) {
    return val == null || val === '' || (typeof val === 'number' && !Number.isFinite(val));
  }

  function compareOverviewNullable(a, b, dir) {
    var aNull = isOverviewSortNull(a);
    var bNull = isOverviewSortNull(b);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    var diff = a < b ? -1 : a > b ? 1 : 0;
    return dir === 'desc' ? -diff : diff;
  }

  function sortOverviewRows(rows) {
    var list = rows.slice();
    var key = state.overviewSortKey || 'daysOffline';
    var dir = state.overviewSortDir === 'asc' ? 'asc' : 'desc';
    var field = OVERVIEW_SORTABLE_KEYS[key] || 'daysOffline';
    list.sort(function (a, b) {
      var cmp = 0;
      if (key === 'username') {
        cmp = String(a.username || '').localeCompare(String(b.username || ''), 'zh-CN');
        if (dir === 'desc') cmp = -cmp;
      } else {
        cmp = compareOverviewNullable(a[field], b[field], dir);
      }
      if (cmp !== 0) return cmp;
      return String(a.username || '').localeCompare(String(b.username || ''), 'zh-CN');
    });
    return list;
  }

  function overviewSortLabel(key, title, extraClass) {
    var active = state.overviewSortKey === key;
    var arrow = '';
    if (active) arrow = state.overviewSortDir === 'asc' ? ' ▲' : ' ▼';
    var cls = 'jml-ov-sort-th' + (active ? ' jml-ov-sort-active' : '') + (extraClass ? ' ' + extraClass : '');
    return (
      '<th scope="col" class="' +
      cls +
      '" data-sort-key="' +
      escapeHtml(key) +
      '" role="columnheader" aria-sort="' +
      (active ? (state.overviewSortDir === 'asc' ? 'ascending' : 'descending') : 'none') +
      '">' +
      escapeHtml(title) +
      arrow +
      '</th>'
    );
  }

  function toggleOverviewSort(key) {
    if (!OVERVIEW_SORTABLE_KEYS[key]) return;
    if (state.overviewSortKey === key) {
      state.overviewSortDir = state.overviewSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.overviewSortKey = key;
      state.overviewSortDir = key === 'username' || key === 'grade' ? 'asc' : 'desc';
    }
    storeOverviewSort();
    renderOverviewTable();
  }

  function dashCell(val) {
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  }

  function filterOverviewRows() {
    var rows = Array.isArray(state.overviewRows) ? state.overviewRows.slice() : [];
    if (state.selectedUsername) {
      return rows.filter(function (r) {
        return r && r.username === state.selectedUsername;
      });
    }
    var q = getFilterInput() ? getFilterInput().value.trim().toLowerCase() : '';
    return rows.filter(function (r) {
      if (!r || !r.username) return false;
      if (state.userScope === 'vip' && r.isVip !== true) return false;
      if (!q) return true;
      var hay = (r.username + ' ' + (r.adminNote || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function loadOverview(force) {
    if (state.overviewLoading) return Promise.resolve();
    if (!force && state.overviewRows.length > 0) {
      renderOverviewTable();
      return Promise.resolve();
    }
    state.overviewLoading = true;
    state.overviewError = '';
    renderOverviewTable();
    return apiFetch('/api/admin/student-overview')
      .then(function (data) {
        state.overviewRows = data && data.ok && Array.isArray(data.rows) ? data.rows : [];
        state.overviewBuiltAt = data && data.builtAt ? Number(data.builtAt) : Date.now();
        state.overviewError = '';
      })
      .catch(function (e) {
        state.overviewRows = [];
        state.overviewError = e.message || String(e);
      })
      .finally(function () {
        state.overviewLoading = false;
        renderOverviewTable();
        syncRefreshStudentBtn(false);
      });
  }

  function renderOverviewTable() {
    var wrap = document.getElementById('jml-report-overview-body');
    if (!wrap) return;
    if (state.overviewLoading) {
      wrap.innerHTML = '<div class="jml-report-empty">学员概览加载中…</div>';
      return;
    }
    if (state.overviewError) {
      wrap.innerHTML =
        '<div class="jml-report-error">' +
        escapeHtml(state.overviewError) +
        '</div>';
      return;
    }
    var list = sortOverviewRows(filterOverviewRows());
    if (!list.length) {
      wrap.innerHTML = '<div class="jml-report-empty">暂无匹配的学员</div>';
      return;
    }
    var builtHint = '';
    if (state.overviewBuiltAt) {
      builtHint =
        '<p class="jml-report-overview-meta muted">共 ' +
        list.length +
        ' 人 · 更新于 ' +
        escapeHtml(formatDateTime(state.overviewBuiltAt)) +
        '</p>';
    }
    var body = list
      .map(function (r) {
        var userCell =
          '<a class="jml-report-user-link" href="?user=' +
          encodeURIComponent(r.username) +
          '">' +
          escapeHtml(r.username) +
          '</a>';
        var trainTitle = r.trainingReason ? ' title="' + escapeHtml(String(r.trainingReason)) + '"' : '';
        return (
          '<tr>' +
          '<td class="jml-ov-col-user">' +
          userCell +
          '</td>' +
          '<td class="jml-ov-col-grade">' +
          escapeHtml(dashCell(r.gradeLabel)) +
          '</td>' +
          '<td class="jml-ov-col-note">' +
          escapeHtml(dashCell(r.adminNote)) +
          '</td>' +
          '<td class="jml-ov-col-nick">' +
          escapeHtml(dashCell(r.nickname)) +
          '</td>' +
          '<td class="jml-ov-col-offline num">' +
          escapeHtml(r.daysOffline != null ? String(r.daysOffline) : '—') +
          '</td>' +
          '<td class="jml-ov-col-prog">' +
          escapeHtml(dashCell(r.levelProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog"' +
          trainTitle +
          '>' +
          escapeHtml(dashCell(r.trainingProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog">' +
          escapeHtml(dashCell(r.survivalProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog num">' +
          escapeHtml(dashCell(r.primeProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog">' +
          escapeHtml(dashCell(r.perfectSquareProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog">' +
          escapeHtml(dashCell(r.decimalProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog">' +
          escapeHtml(dashCell(r.expandProgress)) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    wrap.innerHTML =
      builtHint +
      '<div class="jml-report-table-wrap jml-report-overview-wrap">' +
      '<table class="jml-report-table jml-report-overview-table">' +
      '<thead><tr>' +
      overviewSortLabel('username', '用户名') +
      overviewSortLabel('grade', '年级') +
      '<th scope="col">备注</th>' +
      '<th scope="col">昵称</th>' +
      overviewSortLabel('daysOffline', '未上线(天)', 'num') +
      overviewSortLabel('levelProgress', '闯关') +
      overviewSortLabel('trainingProgress', '训练') +
      overviewSortLabel('survivalProgress', '生存') +
      overviewSortLabel('primeProgress', '质数(用时)', 'num') +
      overviewSortLabel('perfectSquareProgress', '平方数') +
      overviewSortLabel('decimalProgress', '小数') +
      overviewSortLabel('expandProgress', '拆括号') +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table></div>';
  }

  function switchTab(id) {
    var next = id || 'overview';
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === next);
    });
    document.querySelectorAll('.jml-tab-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== next);
    });
    syncRefreshStudentBtn(false);
    if (next === 'overview') {
      void loadOverview(false);
    } else if (state.selectedUsername && state.loadedStudentUsername !== state.selectedUsername) {
      void loadStudentData();
    }
    if (next === 'stats') {
      redrawAllStatsCharts();
    }
  }

  function redrawAllStatsCharts() {
    requestAnimationFrame(function () {
      drawStatsChart();
      drawCohortDistributionCharts();
    });
  }

  function getFilterInput() {
    return document.getElementById('jml-report-user-filter');
  }

  function getUserSelect() {
    return document.getElementById('jml-report-user-select');
  }

  function readStoredUserScope() {
    try {
      var v = localStorage.getItem(REPORT_USER_SCOPE_KEY) || '';
      return v === 'vip' ? 'vip' : 'all';
    } catch (e) {
      return 'all';
    }
  }

  function storeUserScope(scope) {
    try {
      localStorage.setItem(REPORT_USER_SCOPE_KEY, scope === 'vip' ? 'vip' : 'all');
    } catch (e) {
      /* ignore */
    }
  }

  function normalizeUserRow(raw) {
    if (typeof raw === 'string') {
      return { username: raw, nickname: '', isVip: false };
    }
    return {
      username: String((raw && raw.username) || ''),
      nickname: String((raw && raw.nickname) || '').trim(),
      isVip: !!(raw && raw.isVip === true),
    };
  }

  function countVipUsers() {
    var n = 0;
    state.usersAll.forEach(function (u) {
      if (u.isVip === true) n += 1;
    });
    return n;
  }

  function formatUserSelectLabel(u) {
    var nick = u.nickname ? ' · ' + u.nickname : '';
    var vipMark = u.isVip ? '★ ' : '';
    return vipMark + u.username + nick;
  }

  function userInFilteredList(username, list) {
    if (!username) return false;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].username === username) return true;
    }
    return false;
  }

  function updateScopeButtons() {
    document.querySelectorAll('.jml-report-scope-btn').forEach(function (btn) {
      var scope = btn.getAttribute('data-scope');
      btn.classList.toggle('active', scope === state.userScope);
      btn.setAttribute('aria-pressed', scope === state.userScope ? 'true' : 'false');
    });
  }

  function updateScopeHint(visibleCount) {
    var el = document.getElementById('jml-report-user-scope-hint');
    if (!el) return;
    var total = state.usersAll.length;
    var vip = countVipUsers();
    el.textContent = '共 ' + total + ' 人 · VIP ' + vip + ' · 当前 ' + (visibleCount != null ? visibleCount : 0) + ' 人';
  }

  function setUserScope(scope, keepSelection) {
    var next = scope === 'vip' ? 'vip' : 'all';
    state.userScope = next;
    storeUserScope(next);
    updateScopeButtons();
    populateUserSelect(!!keepSelection);
  }

  function filterUsers(query) {
    var q = (query || '').trim().toLowerCase();
    return state.usersAll.filter(function (u) {
      if (state.userScope === 'vip' && u.isVip !== true) return false;
      if (!q) return true;
      var hay = (u.username + ' ' + (u.nickname || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function getRefreshStudentBtn() {
    return document.getElementById('jml-report-refresh-student-btn');
  }

  function syncRefreshStudentBtn(loading) {
    var btn = getRefreshStudentBtn();
    if (!btn) return;
    if (activeTabId() === 'overview') {
      btn.disabled = !!loading;
      btn.title = '重新拉取学员概览';
      return;
    }
    btn.title = '重新拉取当前学员最新记录';
    btn.disabled = !!loading || !state.selectedUsername;
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
    if (!list.length) {
      if (state.userScope === 'vip') {
        opt0.textContent = filterVal ? '无匹配 VIP 学员' : '无 VIP 学员';
      } else {
        opt0.textContent = filterVal ? '无匹配学员' : '请选择学员…';
      }
    } else {
      opt0.textContent = '请选择学员…';
    }
    sel.appendChild(opt0);
    list.forEach(function (u) {
      var o = document.createElement('option');
      o.value = u.username;
      o.textContent = formatUserSelectLabel(u);
      sel.appendChild(o);
    });
    updateScopeHint(list.length);
    if (prev && userInFilteredList(prev, list)) {
      sel.value = prev;
      state.selectedUsername = prev;
    } else {
      sel.value = '';
      state.selectedUsername = '';
      if (prev) clearPanels();
    }
    syncRefreshStudentBtn(false);
    if (activeTabId() === 'overview') renderOverviewTable();
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
    state.loadedStudentUsername = '';
    state.agg = null;
    state.aggByCategory = {};
    state.chartModel = null;
    state.heat = null;
    state.heatByCategory = {};
    renderRunsTable();
    renderWrongBook();
    renderExpandWrongBook();
    renderStatsPanel();
  }

  function loadLevelCohort() {
    state.cohortError = '';
    return Promise.all([
      apiFetch('/api/admin/stats/level-cohort').catch(function (e) {
        return { ok: false, error: e.message || String(e) };
      }),
      apiFetch('/api/admin/stats/decimal-cohort').catch(function (e) {
        return { ok: false, error: e.message || String(e) };
      }),
    ])
      .then(function (results) {
        var level = results[0];
        var decimal = results[1];
        state.cohortByCategory = {
          arithmetic: level && level.ok ? level : null,
          decimal: decimal && decimal.ok ? decimal : null,
        };
        state.cohort = state.cohortByCategory.arithmetic;
        var errs = [];
        if (!state.cohortByCategory.arithmetic) {
          errs.push('四则：' + ((level && level.error) || '常模接口返回异常'));
        }
        if (!state.cohortByCategory.decimal) {
          errs.push('小数：' + ((decimal && decimal.error) || '常模接口返回异常'));
        }
        state.cohortError = errs.length ? errs.join('；') : '';
      })
      .catch(function (e) {
        state.cohort = null;
        state.cohortByCategory = {};
        state.cohortError = e.message || String(e);
      })
      .then(function () {
        if (activeTabId() === 'stats' && state.selectedUsername) {
          renderStatsPanel();
        }
      });
  }

  function loadUserList() {
    showApiWarning();
    return apiFetch('/api/admin/user-list')
      .then(function (data) {
        state.usersAll = Array.isArray(data.users)
          ? data.users.map(normalizeUserRow).filter(function (u) { return !!u.username; })
          : [];
        state.loadError = '';
        var el = document.getElementById('jml-report-load-error');
        if (el) el.style.display = 'none';
        state.userScope = readStoredUserScope();
        updateScopeButtons();
        populateUserSelect(true);
        applyUserFromUrl();
      })
      .catch(function (e) {
        state.loadError = e.message || String(e);
        showGlobalError();
      });
  }

  function getUserFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      return (params.get('user') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function findUserMeta(username) {
    if (!username) return null;
    for (var i = 0; i < state.usersAll.length; i += 1) {
      if (state.usersAll[i].username === username) return state.usersAll[i];
    }
    return null;
  }

  function applyUserFromUrl() {
    var target = getUserFromUrl();
    if (!target) return;

    var meta = findUserMeta(target);
    var errEl = document.getElementById('jml-report-student-error');
    if (!meta) {
      if (errEl) {
        errEl.textContent = '链接中的学员不存在：' + target;
        errEl.style.display = 'block';
      }
      return;
    }

    if (state.userScope === 'vip' && meta.isVip !== true) {
      state.userScope = 'all';
      updateScopeButtons();
    }

    state.selectedUsername = target;
    populateUserSelect(true);
    var sel = getUserSelect();
    if (sel) sel.value = target;
    syncRefreshStudentBtn(true);
    var p = loadStudentData();
    if (p && typeof p.finally === 'function') {
      p.finally(function () {
        syncRefreshStudentBtn(false);
      });
    } else {
      syncRefreshStudentBtn(false);
    }
  }

  function loadStudentData() {
    var u = state.selectedUsername;
    if (!u) {
      clearPanels();
      syncRefreshStudentBtn(false);
      return;
    }
    var errEl = document.getElementById('jml-report-student-error');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    return Promise.all([
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
        var HM = window.JmlStatsHeatmap;
        state.aggByCategory = {};
        if (Agg && HM && HM.getHeatmapCategories) {
          HM.getHeatmapCategories().forEach(function (cat) {
            state.aggByCategory[cat.id] = Agg.aggregateFromRuns(runs, {
              modes: cat.modes,
              levelCount: cat.levelCount,
            });
          });
          var sel = HM.findLatestHeatmapRelatedSelection
            ? HM.findLatestHeatmapRelatedSelection(runs)
            : { categoryId: 'arithmetic', levelIndex: 0 };
          state.expandedCategoryId = sel.categoryId;
          state.chartCategoryId = sel.categoryId;
          var chartAgg = state.aggByCategory[sel.categoryId];
          var levelIdx = sel.levelIndex;
          if (chartAgg && chartAgg.hasAny) {
            if (!(chartAgg.byLevel[levelIdx] && chartAgg.byLevel[levelIdx].total > 0)) {
              levelIdx = Agg.firstLevelWithData(chartAgg.byLevel);
            }
          } else {
            var cats = HM.getHeatmapCategories();
            for (var ci = 0; ci < cats.length; ci += 1) {
              var a = state.aggByCategory[cats[ci].id];
              if (a && a.hasAny) {
                state.expandedCategoryId = cats[ci].id;
                state.chartCategoryId = cats[ci].id;
                levelIdx = Agg.firstLevelWithData(a.byLevel);
                chartAgg = a;
                break;
              }
            }
          }
          state.statsLevelIndex = levelIdx;
          state.agg = chartAgg || null;
          var chartCat = HM.getHeatmapCategory(state.chartCategoryId) || {};
          state.chartModel =
            chartAgg && chartAgg.hasAny
              ? Agg.buildChartSeries(chartAgg.byDay, levelIdx, {
                  levelCount: chartCat.levelCount || 16,
                })
              : null;
        } else if (Agg) {
          var agg = Agg.aggregateFromRuns(runs);
          state.agg = agg;
          state.aggByCategory = { arithmetic: agg };
          var levelIdx2 = Agg.firstLevelWithData(agg.byLevel);
          state.statsLevelIndex = levelIdx2;
          state.chartCategoryId = 'arithmetic';
          state.expandedCategoryId = 'arithmetic';
          state.chartModel = agg.hasAny ? Agg.buildChartSeries(agg.byDay, levelIdx2) : null;
        } else {
          state.agg = null;
          state.chartModel = null;
        }

        renderRunsTable();
        renderWrongBook();
        renderExpandWrongBook();
        renderStatsPanel();
        state.loadedStudentUsername = u;
        if (activeTabId() === 'stats') {
          redrawAllStatsCharts();
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

  function formatTrainingSpeedSec(v) {
    if (v == null || !Number.isFinite(Number(v))) {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    return escapeHtml(String(Number(v)) + 's');
  }

  function formatTrainingRunHeatSpeedCell(r) {
    if (String(r && r.mode ? r.mode : '').toLowerCase() !== 'training') {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    var m = r.trainingMeta;
    if (!m || typeof m !== 'object') {
      return '<span class="jml-runs-pick-muted" title="旧记录无速度快照">—</span>';
    }
    return formatTrainingSpeedSec(m.heatAvgSecAtStart);
  }

  function formatTrainingRunAvgSpeedCell(r) {
    if (String(r && r.mode ? r.mode : '').toLowerCase() !== 'training') {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    var m = r.trainingMeta;
    if (!m || typeof m !== 'object') {
      return '<span class="jml-runs-pick-muted" title="旧记录无速度快照">—</span>';
    }
    return formatTrainingSpeedSec(m.runAvgSec);
  }

  function formatTrainingRunPickCell(r) {
    if (String(r && r.mode ? r.mode : '').toLowerCase() !== 'training') {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    var m = r.trainingMeta;
    if (!m || typeof m !== 'object') {
      return '<span class="jml-runs-pick-muted" title="旧记录无选关诊断">—</span>';
    }
    var parts = [];
    var lv = Number(m.pickedLevel);
    if (Number.isFinite(lv) && lv >= 0) parts.push('L' + (lv + 1));
    parts.push(m.runBrushMode ? '刷热图' : '闯关');
    if (m.pickReason) parts.push(String(m.pickReason));
    if (m.entrySource) parts.push(String(m.entrySource));
    var title = JSON.stringify(m, null, 2);
    return (
      '<span class="jml-runs-pick" title="' +
      escapeHtml(title) +
      '">' +
      escapeHtml(parts.join(' · ')) +
      '</span>'
    );
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
          '<td class="jml-runs-col-pick">' +
          formatTrainingRunPickCell(r) +
          '</td>' +
          '<td class="num jml-runs-col-heat-spd" title="开局时该关热图加权均时">' +
          formatTrainingRunHeatSpeedCell(r) +
          '</td>' +
          '<td class="num jml-runs-col-run-spd" title="本局答对题几何均时">' +
          formatTrainingRunAvgSpeedCell(r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    wrap.innerHTML =
      '<div class="jml-report-table-wrap"><table class="jml-report-table jml-report-runs-table">' +
      '<thead><tr><th>日期时间</th><th>挑战类型</th><th class="num">用时</th><th class="num">得分</th><th class="num">错误题数</th><th class="num">最高难度</th><th>选关诊断</th><th class="num">开局加权速</th><th class="num">本局均速</th></tr></thead>' +
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
          var meta = formatDateTime(w.ts);
          var levelMeta = formatWrongAnswerMeta(w);
          if (levelMeta) meta += ' · ' + levelMeta;
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

  function buildHeatmapCellsHtmlForCategory(heat, categoryId, levelPrefix) {
    if (!heat || !Array.isArray(heat.cells)) return '';
    var lblAcc = rt('stats.heat.accuracy');
    var lblTime = rt('stats.heat.avgTimeCorrect');
    var lblW = rt('stats.heat.weighted');
    var prefix = levelPrefix || 'L';
    var chartCat = state.chartCategoryId;
    return heat.cells
      .map(function (c) {
        var label = prefix + (c.levelIndex + 1);
        var cls = 'jml-heatmap-cell' + (c.active ? '' : ' inactive');
        var st = heatmapCellInlineStyle(c);
        var timeT =
          c.timePct != null
            ? rtf('stats.heat.speedPct', { pct: Math.round(c.timePct) })
            : c.active
              ? rt('stats.heat.speedPctDash')
              : '—';
        var nEffT =
          c.nEff != null && c.active ? rtf('stats.heat.nEff', { n: c.nEff }) : '';
        var ageT =
          c.active && c.ageDaysMin != null && c.ageDaysMax != null
            ? rtf('stats.heat.ageDays', { min: c.ageDaysMin, max: c.ageDaysMax })
            : '';
        var selCls =
          categoryId === chartCat && c.levelIndex === state.statsLevelIndex
            ? ' jml-heatmap-cell-selected'
            : '';
        var title = rtf('stats.heat.cellTitle', {
          label: label,
          p: c.pText != null ? String(c.pText) : '-',
          avg: c.avgSecText != null ? String(c.avgSecText) : '-',
        });
        return (
          '<div class="' +
          cls +
          selCls +
          '"' +
          ' data-category-id="' +
          escapeHtml(categoryId) +
          '"' +
          ' data-level-index="' +
          c.levelIndex +
          '"' +
          ' role="button" tabindex="0"' +
          (st ? ' style="' + st + '"' : '') +
          ' title="' +
          escapeHtml(title) +
          '">' +
          '<div class="jml-heatmap-cell-label">' +
          escapeHtml(label) +
          '</div>' +
          '<div class="jml-heatmap-cell-metric"><span class="jml-heatmap-metric-label">' +
          escapeHtml(lblAcc) +
          '</span> ' +
          escapeHtml(c.pText != null ? String(c.pText) : '-') +
          ' <span class="jml-heatmap-cell-sub">' +
          escapeHtml(lblW) +
          '</span></div>' +
          '<div class="jml-heatmap-cell-metric"><span class="jml-heatmap-metric-label">' +
          escapeHtml(lblTime) +
          '</span> ' +
          escapeHtml(c.avgSecText != null ? c.avgSecText : '-') +
          ' <span class="jml-heatmap-cell-sub">' +
          escapeHtml(lblW) +
          '</span></div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(
            rtf('stats.heat.windowN', {
              n: c.n != null && Number.isFinite(c.n) ? c.n : 0,
              min: heat.minAttempts != null ? heat.minAttempts : 10,
            })
          ) +
          '</div>' +
          '<div class="jml-heatmap-cell-meta">' +
          escapeHtml(timeT) +
          '</div>' +
          (nEffT ? '<div class="jml-heatmap-cell-meta">' + escapeHtml(nEffT) + '</div>' : '') +
          (ageT ? '<div class="jml-heatmap-cell-meta">' + escapeHtml(ageT) + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  function buildHeatmapSectionHtml() {
    var HM = window.JmlStatsHeatmap;
    if (!HM || !HM.buildHeatmapCells || !HM.getHeatmapCategories) {
      return '<p class="jml-stats-cohort-warn">' + escapeHtml(rt('stats.heat.scriptMissing')) + '</p>';
    }

    var cats = HM.getHeatmapCategories();
    state.heatByCategory = {};
    var anyLegendHeat = null;
    var trainingRecHtml = '';

    cats.forEach(function (cat) {
      var cohort = (state.cohortByCategory && state.cohortByCategory[cat.id]) || null;
      if (cat.id === 'arithmetic' && !cohort) cohort = state.cohort;
      var capMs = cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : 60 * 1000;
      var heat = HM.buildHeatmapCells({
        runs: state.runs,
        cohort: cohort && cohort.ok ? cohort : null,
        modes: cat.modes,
        levelCount: cat.levelCount,
        maxTimeSpentMs: capMs,
      });
      state.heatByCategory[cat.id] = heat;
      if (!anyLegendHeat) anyLegendHeat = heat;

      if (cat.id === 'arithmetic' && HM.reconstructTrainingDayStateFromRuns && HM.computeTrainingNextLevel) {
        var todayKey = (function () {
          var now = new Date();
          return (
            now.getFullYear() +
            '-' +
            String(now.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(now.getDate()).padStart(2, '0')
          );
        })();
        var dayState = HM.reconstructTrainingDayStateFromRuns(state.runs, todayKey, {
          cohort: cohort && cohort.ok ? cohort : null,
          maxTimeSpentMs: capMs,
        });
        var trainingNext = HM.computeTrainingNextLevel(heat, dayState, todayKey);
        var recK = trainingNext != null ? trainingNext.levelIndex : null;
        var recMode = trainingNext ? trainingNext.mode : '';
        var recReason =
          trainingNext && HM.trainingNextLevelReasonText
            ? HM.trainingNextLevelReasonText(trainingNext, getReportTrainingReasonLabels())
            : '';
        if (recK != null) {
          trainingRecHtml =
            '<br /><strong>' +
            escapeHtml(rt('stats.heat.legend.recommend')) +
            '</strong>' +
            escapeHtml(
              rtf('stats.heat.legend.recommendDetail', {
                level: recK + 1,
                mode: recMode === 'brush' ? rt('stats.heat.mode.brush') : rt('stats.heat.mode.daily'),
                reason: recReason || (trainingNext && trainingNext.reason) || '',
                brush: String(!!(trainingNext.brushMode || (dayState && dayState.brushMode))),
              })
            );
        }
      }
    });

    state.heat = state.heatByCategory[state.chartCategoryId] || anyLegendHeat;

    var cohortWarn = '';
    if (state.cohortError) {
      cohortWarn =
        '<div class="jml-stats-cohort-warn"><strong>' +
        escapeHtml(rt('stats.heat.cohortWarn')) +
        '</strong> ' +
        escapeHtml(state.cohortError) +
        ' ' +
        escapeHtml(rt('stats.heat.cohortWarnTail')) +
        '</div>';
    }

    var heat = anyLegendHeat || { personalWindowAttempts: 200, personalHalfLifeDays: 14, minAttempts: 10 };
    var chartCohort =
      (state.cohortByCategory && state.cohortByCategory[state.chartCategoryId]) || state.cohort;
    var capMs =
      chartCohort && Number(chartCohort.timeSpentMsCap) ? Number(chartCohort.timeSpentMsCap) : 60 * 1000;
    var capStr = capMs >= 60000 ? Math.round(capMs / 60000) + 'm' : Math.round(capMs / 1000) + 's';
    var capNote =
      chartCohort && chartCohort.timeSpentMsCapNote
        ? chartCohort.timeSpentMsCapNote
        : rtf('stats.heat.capNote', { cap: capStr });

    var legendBody = rtf('stats.heat.legend.body', {
      window: heat.personalWindowAttempts || 200,
      halfLife: heat.personalHalfLifeDays || 14,
      minAttempts: heat.minAttempts,
    });
    var legend =
      '<div class="jml-heatmap-legend">' +
      '<strong>' +
      escapeHtml(rt('stats.heat.legend.title')) +
      '</strong>' +
      escapeHtml(legendBody) +
      '<br /><strong>' +
      escapeHtml(rt('stats.heat.legend.speedCap')) +
      '</strong>' +
      escapeHtml(capNote) +
      (chartCohort && chartCohort.builtAt
        ? '<br /><strong>' +
          escapeHtml(rt('stats.heat.legend.cohortSnap')) +
          '</strong>' +
          escapeHtml(
            rtf('stats.heat.legend.cohortBuilt', {
              built: formatDateTime(chartCohort.builtAt),
              expires: formatDateTime(chartCohort.expiresAt),
            })
          ) +
          (chartCohort.servedFromCache
            ? ' ' + escapeHtml(rt('stats.heat.legend.cohortCache'))
            : ' ' + escapeHtml(rt('stats.heat.legend.cohortRebuilt')))
        : '') +
      trainingRecHtml +
      '</div>';

    var catsHtml = cats
      .map(function (cat) {
        var cHeat = state.heatByCategory[cat.id];
        var open = state.expandedCategoryId === cat.id;
        var label = rt(cat.labelKey);
        if (!label || label === cat.labelKey) label = cat.labelFallback || cat.id;
        return (
          '<div class="jml-heat-cat' +
          (open ? ' open' : '') +
          '" data-category-id="' +
          escapeHtml(cat.id) +
          '">' +
          '<button type="button" class="jml-heat-cat-toggle" data-category-id="' +
          escapeHtml(cat.id) +
          '" aria-expanded="' +
          (open ? 'true' : 'false') +
          '">' +
          '<span>' +
          escapeHtml(label) +
          '</span>' +
          '<span class="jml-heat-cat-chevron" aria-hidden="true">▶</span>' +
          '</button>' +
          '<div class="jml-heat-cat-body">' +
          '<div class="jml-heatmap-grid">' +
          buildHeatmapCellsHtmlForCategory(cHeat, cat.id, cat.levelPrefix) +
          '</div></div></div>'
        );
      })
      .join('');

    var debugPayload = {
      cohortByCategory: state.cohortByCategory,
      heatmapByCategory: state.heatByCategory,
      chartCategoryId: state.chartCategoryId,
      expandedCategoryId: state.expandedCategoryId,
      runsCount: state.runs.length,
    };
    var debugJson = '';
    try {
      debugJson = JSON.stringify(debugPayload, null, 2);
    } catch (e) {
      debugJson = String(e);
    }
    var debugBlock =
      '<details class="jml-stats-debug">' +
      '<summary>' +
      escapeHtml(rt('stats.report.debugSummary')) +
      '</summary>' +
      '<pre>' +
      escapeHtml(debugJson) +
      '</pre>' +
      '</details>';

    return (
      cohortWarn +
      '<div class="jml-heatmap-section">' +
      legend +
      '<div class="jml-heatmap-categories" id="jml-heatmap-categories">' +
      catsHtml +
      '</div>' +
      debugBlock +
      '</div>'
    );
  }

  function anyStatsCategoryHasData() {
    var cats = Object.keys(state.aggByCategory || {});
    for (var i = 0; i < cats.length; i += 1) {
      var a = state.aggByCategory[cats[i]];
      if (a && a.hasAny) return true;
    }
    return !!(state.agg && state.agg.hasAny);
  }

  function renderStatsPanel() {
    var wrap = document.getElementById('jml-report-stats-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    if (!anyStatsCategoryHasData()) {
      wrap.innerHTML =
        '<div class="jml-report-empty">暂无热图相关 attempts（四则：survival / level / training；小数：decimal）</div>';
      return;
    }

    var heatmapBlock = buildHeatmapSectionHtml();

    wrap.innerHTML =
      '<p class="jml-stats-intro">' + escapeHtml(rt('stats.report.intro')) + '</p>' +
      heatmapBlock +
      '<h3 class="jml-report-h3" id="jml-stats-chart-heading"></h3>' +
      '<div class="jml-stats-chart-wrap"><canvas id="jml-stats-canvas"></canvas></div>' +
      '<h3 class="jml-report-h3" id="jml-cohort-box-heading"></h3>' +
      '<div class="jml-stats-chart-wrap jml-cohort-chart-wrap"><canvas id="jml-cohort-box-canvas"></canvas></div>' +
      '<h3 class="jml-report-h3" id="jml-cohort-hist-heading"></h3>' +
      '<div class="jml-stats-chart-wrap jml-cohort-chart-wrap"><canvas id="jml-cohort-hist-canvas"></canvas></div>';

    updateStatsChartHeadings();
    redrawAllStatsCharts();
  }

  function getHeatCellForLevel(levelIndex) {
    var heat =
      (state.heatByCategory && state.heatByCategory[state.chartCategoryId]) || state.heat;
    if (!heat || !Array.isArray(heat.cells)) return null;
    for (var i = 0; i < heat.cells.length; i += 1) {
      if (heat.cells[i].levelIndex === levelIndex) return heat.cells[i];
    }
    return null;
  }

  function getCohortRowForLevel(levelIndex) {
    var cohort =
      (state.cohortByCategory && state.cohortByCategory[state.chartCategoryId]) || state.cohort;
    if (!cohort || !Array.isArray(cohort.levels)) return null;
    for (var i = 0; i < cohort.levels.length; i += 1) {
      if (cohort.levels[i].levelIndex === levelIndex) return cohort.levels[i];
    }
    return cohort.levels[levelIndex] || null;
  }

  function reportChartLevelName() {
    var HM = window.JmlStatsHeatmap;
    var cat = HM && HM.getHeatmapCategory ? HM.getHeatmapCategory(state.chartCategoryId) : null;
    var li = state.statsLevelIndex;
    if (cat && cat.id === 'decimal') {
      return DECIMAL_LEVEL_NAMES[li] || 'D' + (li + 1);
    }
    return LEVEL_NAMES[li] || 'L' + (li + 1);
  }

  function updateStatsChartHeadings() {
    var name = reportChartLevelName();
    var chartHeading = document.getElementById('jml-stats-chart-heading');
    if (chartHeading) {
      chartHeading.textContent = rtf('stats.report.chartHeading', { name: name });
    }
    var boxH = document.getElementById('jml-cohort-box-heading');
    if (boxH) {
      boxH.textContent = rtf('stats.report.boxHeading', { name: name });
    }
    var histH = document.getElementById('jml-cohort-hist-heading');
    if (histH) {
      histH.textContent = rtf('stats.report.histHeading', { name: name });
    }
  }

  function drawCohortDistributionCharts() {
    var Chart = window.JmlStatsChart;
    var HM = window.JmlStatsHeatmap;
    if (!Chart) return;
    var li = state.statsLevelIndex;
    var row = getCohortRowForLevel(li);
    var cell = getHeatCellForLevel(li);
    var lnQ = row && row.cohortLnTimeCorrect ? row.cohortLnTimeCorrect : null;
    var hist = row && row.cohortLnTimeHistogram ? row.cohortLnTimeHistogram : null;
    var studentSec = null;
    var studentPct = cell ? cell.timePct : null;
    if (cell && cell.meanLnCorrect != null && Number.isFinite(cell.meanLnCorrect)) {
      studentSec = Chart.lnToSec ? Chart.lnToSec(cell.meanLnCorrect) : Math.exp(cell.meanLnCorrect) / 1000;
    }
    if (
      studentPct == null &&
      HM &&
      typeof HM.percentileFromQuantileSummary === 'function' &&
      cell &&
      cell.meanLnCorrect != null &&
      lnQ
    ) {
      studentPct = HM.percentileFromQuantileSummary(cell.meanLnCorrect, lnQ);
    }

    var boxCanvas = document.getElementById('jml-cohort-box-canvas');
    if (boxCanvas && Chart.drawCohortQuantileBoxChart) {
      var bctx = boxCanvas.getContext('2d');
      if (bctx) {
        var bw = boxCanvas.parentElement ? boxCanvas.parentElement.clientWidth : 600;
        var bh = boxCanvas.parentElement ? boxCanvas.parentElement.clientHeight : 200;
        var bdpr = window.devicePixelRatio || 1;
        boxCanvas.width = Math.max(10, Math.floor(bw * bdpr));
        boxCanvas.height = Math.max(10, Math.floor(bh * bdpr));
        boxCanvas.style.width = bw + 'px';
        boxCanvas.style.height = bh + 'px';
        bctx.setTransform(bdpr, 0, 0, bdpr, 0, 0);
        Chart.drawCohortQuantileBoxChart(bctx, bw, bh, {
          quantiles: lnQ,
          studentSec: studentSec,
          studentPct: studentPct,
          sampleN: lnQ ? lnQ.n : null,
          labels: getReportChartLabels(),
        });
      }
    }

    var histCanvas = document.getElementById('jml-cohort-hist-canvas');
    if (histCanvas && Chart.drawCohortHistogramChart) {
      var hctx = histCanvas.getContext('2d');
      if (hctx) {
        var hw = histCanvas.parentElement ? histCanvas.parentElement.clientWidth : 600;
        var hh = histCanvas.parentElement ? histCanvas.parentElement.clientHeight : 200;
        var hdpr = window.devicePixelRatio || 1;
        histCanvas.width = Math.max(10, Math.floor(hw * hdpr));
        histCanvas.height = Math.max(10, Math.floor(hh * hdpr));
        histCanvas.style.width = hw + 'px';
        histCanvas.style.height = hh + 'px';
        hctx.setTransform(hdpr, 0, 0, hdpr, 0, 0);
        Chart.drawCohortHistogramChart(hctx, hw, hh, {
          histogram: hist,
          studentSec: studentSec,
          studentPct: studentPct,
          labels: getReportChartLabels(),
        });
      }
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
      ctx.fillText(rt('stats.chart.noSeries'), cssW / 2, cssH / 2);
      return;
    }
    var payload = {
      dates: model.dates,
      errorRates: model.series.map(function (x) { return x.errorRate; }),
      avgSecs: model.series.map(function (x) { return x.avgSec; }),
      yMaxErr: model.yMaxErr,
      yMaxSec: model.yMaxSec,
      labels: getReportChartLabels(),
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
    var overviewBody = document.getElementById('jml-report-overview-body');
    if (overviewBody && !overviewBody.dataset.sortBound) {
      overviewBody.dataset.sortBound = '1';
      overviewBody.addEventListener('click', function (ev) {
        var th = ev.target.closest('.jml-ov-sort-th');
        if (!th || !overviewBody.contains(th)) return;
        var key = th.getAttribute('data-sort-key');
        if (key) toggleOverviewSort(key);
      });
    }
    var filter = getFilterInput();
    if (filter) {
      filter.addEventListener('input', function () {
        populateUserSelect(true);
        if (activeTabId() === 'overview') renderOverviewTable();
      });
    }
    document.querySelectorAll('.jml-report-scope-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var scope = btn.getAttribute('data-scope') || 'all';
        if (scope === state.userScope) return;
        setUserScope(scope, true);
      });
    });
    var sel = getUserSelect();
    if (sel) {
      sel.addEventListener('change', function () {
        state.selectedUsername = sel.value || '';
        syncRefreshStudentBtn(true);
        if (activeTabId() === 'overview') {
          renderOverviewTable();
          syncRefreshStudentBtn(false);
          return;
        }
        var p = loadStudentData();
        if (p && typeof p.finally === 'function') {
          p.finally(function () {
            syncRefreshStudentBtn(false);
          });
        } else {
          syncRefreshStudentBtn(false);
        }
      });
    }
    var refreshStudent = getRefreshStudentBtn();
    if (refreshStudent) {
      refreshStudent.addEventListener('click', function () {
        if (refreshStudent.disabled) return;
        var prevLabel = refreshStudent.textContent;
        refreshStudent.textContent = '刷新中…';
        syncRefreshStudentBtn(true);
        if (activeTabId() === 'overview') {
          var pOv = loadOverview(true);
          if (!pOv || typeof pOv.finally !== 'function') {
            refreshStudent.textContent = prevLabel;
            syncRefreshStudentBtn(false);
            return;
          }
          pOv.finally(function () {
            refreshStudent.textContent = prevLabel;
            syncRefreshStudentBtn(false);
          });
          return;
        }
        var p = loadStudentData();
        if (!p || typeof p.finally !== 'function') {
          refreshStudent.textContent = prevLabel;
          syncRefreshStudentBtn(false);
          return;
        }
        p.finally(function () {
          refreshStudent.textContent = prevLabel;
          syncRefreshStudentBtn(false);
        });
      });
    }
    var statsBody = document.getElementById('jml-report-stats-body');
    if (statsBody) {
      statsBody.addEventListener('click', function (ev) {
        var toggle = ev.target.closest('.jml-heat-cat-toggle');
        if (toggle && statsBody.contains(toggle)) {
          var cid = toggle.getAttribute('data-category-id');
          if (!cid) return;
          if (state.expandedCategoryId === cid) {
            state.expandedCategoryId = null;
          } else {
            state.expandedCategoryId = cid;
          }
          statsBody.querySelectorAll('.jml-heat-cat').forEach(function (el) {
            var open = el.getAttribute('data-category-id') === state.expandedCategoryId;
            el.classList.toggle('open', open);
            var btn = el.querySelector('.jml-heat-cat-toggle');
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
          return;
        }
        var cell = ev.target.closest('.jml-heatmap-cell');
        if (!cell || !statsBody.contains(cell)) return;
        var AggInner = window.JmlStatsAggregate;
        var HM = window.JmlStatsHeatmap;
        if (!AggInner || !state.selectedUsername) return;
        var catId = cell.getAttribute('data-category-id') || 'arithmetic';
        var idx = parseInt(cell.getAttribute('data-level-index'), 10);
        var cat = HM && HM.getHeatmapCategory ? HM.getHeatmapCategory(catId) : null;
        var maxIdx = cat ? cat.levelCount - 1 : 15;
        if (!Number.isFinite(idx) || idx < 0 || idx > maxIdx) return;
        state.chartCategoryId = catId;
        state.statsLevelIndex = idx;
        state.heat = (state.heatByCategory && state.heatByCategory[catId]) || state.heat;
        state.agg = (state.aggByCategory && state.aggByCategory[catId]) || state.agg;
        state.cohort = (state.cohortByCategory && state.cohortByCategory[catId]) || state.cohort;
        if (state.agg && state.agg.hasAny) {
          state.chartModel = AggInner.buildChartSeries(state.agg.byDay, state.statsLevelIndex, {
            levelCount: cat ? cat.levelCount : 16,
          });
        } else {
          state.chartModel = null;
        }
        statsBody.querySelectorAll('.jml-heatmap-cell').forEach(function (el) {
          var elCat = el.getAttribute('data-category-id');
          var i = parseInt(el.getAttribute('data-level-index'), 10);
          el.classList.toggle(
            'jml-heatmap-cell-selected',
            elCat === state.chartCategoryId && i === state.statsLevelIndex
          );
        });
        updateStatsChartHeadings();
        redrawAllStatsCharts();
      });
    }
    window.addEventListener('resize', function () {
      if (activeTabId() !== 'stats') return;
      redrawAllStatsCharts();
    });
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
            state.cohortByCategory = {
              arithmetic: state.cohort,
              decimal: d && d.decimal && d.decimal.ok ? d.decimal : null,
            };
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
      readStoredOverviewSort();
      state.userScope = readStoredUserScope();
      updateScopeButtons();
      loadReportI18n().finally(function () {
        bindEvents();
        loadLevelCohort();
        loadUserList().then(function () {
          switchTab('overview');
        });
      });
    },
  };
})();

