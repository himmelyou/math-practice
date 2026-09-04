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
    '第 6 级 · 小数乘除小数',
  ];

  var PERFECT_SQUARE_LEVEL_NAMES = [
    '第 1 级 · 2～11 的平方',
    '第 2 级 · 2～20 的平方',
    '第 3 级 · 2～30 的平方',
    '第 4 级 · 2/3/5 质因数的幂',
  ];

  var DIVISIBILITY_LEVEL_NAMES = [
    '第 1 级 · 2 与 5 的整除',
    '第 2 级 · 3 与 9 的整除',
    '第 3 级 · 4 与 8 的整除',
    '第 4 级 · 6 与 12 的整除',
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
    statsBuiltFor: '',
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
    heatmapFromServer: false,
    practiceAdvice: null,
    practiceAdviceError: '',
    practiceAdviceLoading: false,
    overviewRows: [],
    /** true = 已拉过全员概览；false = 仅有零散单人行（深链/切换补齐） */
    overviewComplete: false,
    overviewLoading: false,
    overviewError: '',
    overviewBuiltAt: 0,
    overviewSortKey: 'daysOffline',
    overviewSortDir: 'desc',
    /** 训练选关 Debug 最近一次完整 JSON（供复制） */
    trainDebugPayload: null,
    serverTrainingPick: null,
    /** 小数/平方数/整除下一关（admin category-next-levels） */
    serverCategoryNext: null,
  };

  var REPORT_LANG_KEY = 'jml_report_lang_v1';
  var REPORT_USER_SCOPE_KEY = 'jml_report_user_scope_v1';
  var REPORT_OVERVIEW_SORT_KEY = 'jml_report_overview_sort_v1';
  var OVERVIEW_SORTABLE_KEYS = {
    username: 'username',
    grade: 'gradeSort',
    daysOffline: 'daysOffline',
    daysActiveLast30: 'daysActiveLast30',
    levelProgress: 'levelProgressSort',
    trainingProgress: 'trainingProgressSort',
    survivalProgress: 'survivalProgressSort',
    primeProgress: 'primeProgressSec',
    divisibilityProgress: 'divisibilityProgressSort',
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

  function setReportLang(lang) {
    var next = lang === 'en' ? 'en' : 'zhHant';
    try {
      localStorage.setItem(REPORT_LANG_KEY, next);
    } catch (e) {}
    return next;
  }

  function syncReportDocumentLang() {
    var root = document.documentElement;
    if (!root) return;
    root.lang = getReportLang() === 'en' ? 'en' : 'zh-Hant';
  }

  function syncReportLangBtn() {
    var btn = document.getElementById('jml-report-lang-btn');
    if (!btn) return;
    var isEn = getReportLang() === 'en';
    btn.textContent = isEn ? '繁體中文' : 'English';
    btn.setAttribute('aria-label', isEn ? 'Switch to 繁體中文' : '切換到 English');
  }

  function refreshReportAfterLangChange() {
    syncReportDocumentLang();
    syncReportLangBtn();
    var tab = activeTabId();
    if (tab === 'stats') {
      if (state.selectedUsername && state.loadedStudentUsername === state.selectedUsername) {
        renderStatsPanel();
      }
      return;
    }
    if (tab === 'train-debug') {
      if (state.selectedUsername) void loadTrainDebug(false);
      return;
    }
    if (tab === 'overview') {
      renderOverviewTable();
    }
  }

  function toggleReportLang() {
    setReportLang(getReportLang() === 'en' ? 'zhHant' : 'en');
    refreshReportAfterLangChange();
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
      histMean: rt('stats.chart.histMean'),
      histSd1: rt('stats.chart.histSd1'),
      histSd2: rt('stats.chart.histSd2'),
      histMomentsHint: rt('stats.chart.histMomentsHint'),
      histMomentsNeedRebuild: rt('stats.chart.histMomentsNeedRebuild'),
    };
  }

  function getReportTrainingReasonLabels() {
    return {
      brushFixOrangeAcc: rt('stats.training.reason.brushFixOrangeAcc'),
      brushFixOrangeSlow: rt('stats.training.reason.brushFixOrangeSlow'),
      brushFixYellow: rt('stats.training.reason.brushFixYellow'),
      brushFixRed: rt('stats.training.reason.brushFixRed'),
      brushFixSlow: rt('stats.training.reason.brushFixSlow'),
      brushPickSpeed: rt('stats.training.reason.brushPickSpeed'),
      brushPickMastery: rt('stats.training.reason.brushPickMastery'),
      frontierStabilizeM: rt('stats.training.reason.frontierStabilizeM'),
      frontierStabilizeSlow: rt('stats.training.reason.frontierStabilizeSlow'),
      frontierOpenM1: rt('stats.training.reason.frontierOpenM1'),
      dailyClear: rt('stats.training.reason.dailyClear'),
      dailyPassAllClear: rt('stats.training.reason.dailyPassAllClear'),
      dailyFailEnterBrush: rt('stats.training.reason.dailyFailEnterBrush'),
      altAfterDaily: rt('stats.training.reason.altAfterDaily'),
      dailyPassNext: rt('stats.training.reason.dailyPassNext'),
      dailyPassStayNotFluent: rt('stats.training.reason.dailyPassStayNotFluent'),
      dailyPassNeedsHeat: rt('stats.training.reason.dailyPassNeedsHeat'),
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

  function findOverviewRow(username) {
    if (!username) return null;
    var rows = state.overviewRows || [];
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i] && rows[i].username === username) return rows[i];
    }
    return null;
  }

  function mergeOverviewRow(row) {
    if (!row || !row.username) return;
    var next = [];
    var replaced = false;
    (state.overviewRows || []).forEach(function (r) {
      if (r && r.username === row.username) {
        next.push(row);
        replaced = true;
      } else if (r) {
        next.push(r);
      }
    });
    if (!replaced) next.push(row);
    state.overviewRows = next;
  }

  function syncUserQueryInUrl(username) {
    try {
      var url = new URL(window.location.href);
      if (username) url.searchParams.set('user', username);
      else url.searchParams.delete('user');
      var qs = url.searchParams.toString();
      history.replaceState(null, '', url.pathname + (qs ? '?' + qs : '') + url.hash);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * 拉取概览。
   * - 无 username（或显式 all）：全员；缓存完整且非 force 则直接渲染
   * - 有 username：只算该人；已有该行或已有全员缓存且非 force 则直接渲染
   */
  function loadOverview(opts) {
    opts = typeof opts === 'object' && opts ? opts : { force: !!opts };
    var force = !!opts.force;
    var wantUser =
      opts.username !== undefined && opts.username !== null
        ? String(opts.username || '').trim()
        : '';
    var fetchAll = !wantUser;

    if (state.overviewLoading) return Promise.resolve();

    if (!force) {
      if (fetchAll && state.overviewComplete && state.overviewRows.length > 0) {
        renderOverviewTable();
        return Promise.resolve();
      }
      if (!fetchAll && (state.overviewComplete || findOverviewRow(wantUser))) {
        renderOverviewTable();
        return Promise.resolve();
      }
    }

    var hadRows = Array.isArray(state.overviewRows) && state.overviewRows.length > 0;
    state.overviewLoading = true;
    state.overviewError = '';
    // 已有表格时不要拆成「加载中」，避免切换/补拉时整表闪白
    if (!hadRows) renderOverviewTable();

    var path = '/api/admin/student-overview';
    if (!fetchAll) path += '?username=' + encodeURIComponent(wantUser);

    return apiFetch(path)
      .then(function (data) {
        var rows = data && data.ok && Array.isArray(data.rows) ? data.rows : [];
        state.overviewBuiltAt = data && data.builtAt ? Number(data.builtAt) : Date.now();
        state.overviewError = '';
        if (fetchAll) {
          state.overviewRows = rows;
          state.overviewComplete = true;
        } else if (rows[0]) {
          mergeOverviewRow(rows[0]);
        } else {
          state.overviewError = '未找到该学员的概览';
        }
      })
      .catch(function (e) {
        if (fetchAll) {
          state.overviewRows = [];
          state.overviewComplete = false;
        }
        state.overviewError = e.message || String(e);
      })
      .finally(function () {
        state.overviewLoading = false;
        renderOverviewTable();
        syncRefreshStudentBtn(false);
      });
  }

  /** 按当前下拉选中：全员或缺人时补拉 */
  function ensureOverviewForCurrentSelection(force) {
    var u = state.selectedUsername || '';
    if (!u) return loadOverview({ force: !!force });
    return loadOverview({ username: u, force: !!force });
  }

  function renderOverviewTable() {
    var wrap = document.getElementById('jml-report-overview-body');
    if (!wrap) return;
    // 仅在真正空表首次加载时显示加载文案；已有内容时保持不动
    if (state.overviewLoading && !(state.overviewRows && state.overviewRows.length)) {
      wrap.innerHTML = '<div class="jml-report-empty">学员概览加载中…</div>';
      return;
    }
    if (state.overviewError && !(state.overviewRows && state.overviewRows.length)) {
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
          '<input type="text" class="jml-ov-note-input" maxlength="20" data-username="' +
          escapeHtml(r.username) +
          '" value="' +
          escapeHtml(r.adminNote || '') +
          '" placeholder="备注" aria-label="备注：' +
          escapeHtml(r.username) +
          '" />' +
          '</td>' +
          '<td class="jml-ov-col-nick">' +
          escapeHtml(dashCell(r.nickname)) +
          '</td>' +
          '<td class="jml-ov-col-active30 num">' +
          escapeHtml(r.daysActiveLast30 != null ? String(r.daysActiveLast30) : '—') +
          '</td>' +
          '<td class="jml-ov-col-offline num">' +
          escapeHtml(r.daysOffline != null ? String(r.daysOffline) : '—') +
          '</td>' +
          '<td class="jml-ov-col-prog num">' +
          escapeHtml(dashCell(r.levelProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog num"' +
          trainTitle +
          '>' +
          escapeHtml(dashCell(r.trainingProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog num">' +
          escapeHtml(dashCell(r.survivalProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog num">' +
          escapeHtml(dashCell(r.primeProgress)) +
          '</td>' +
          '<td class="jml-ov-col-prog num">' +
          escapeHtml(dashCell(r.divisibilityProgress)) +
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
      '<div class="jml-report-table-wrap jml-report-overview-wrap">' +
      '<table class="jml-report-table jml-report-overview-table">' +
      '<thead><tr>' +
      overviewSortLabel('username', '用户名') +
      overviewSortLabel('grade', '年级') +
      '<th scope="col" title="管理员自用备注，最多 20 字">备注</th>' +
      '<th scope="col">昵称</th>' +
      overviewSortLabel('daysActiveLast30', '最近30天上线天数', 'num') +
      overviewSortLabel('daysOffline', '未上线(天)', 'num') +
      overviewSortLabel('levelProgress', '闯关', 'num') +
      overviewSortLabel('trainingProgress', '训练流畅', 'num') +
      overviewSortLabel('survivalProgress', '生存', 'num') +
      overviewSortLabel('primeProgress', '质数(用时)', 'num') +
      overviewSortLabel('divisibilityProgress', '整除', 'num') +
      overviewSortLabel('perfectSquareProgress', '平方数') +
      overviewSortLabel('decimalProgress', '小数') +
      overviewSortLabel('expandProgress', '拆括号') +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table></div>';
  }

  function applyLocalAdminNote(username, adminNote) {
    var note = String(adminNote || '').trim();
    var row = findOverviewRow(username);
    if (row) row.adminNote = note;
    var matchedUser = null;
    for (var i = 0; i < state.usersAll.length; i += 1) {
      if (state.usersAll[i] && state.usersAll[i].username === username) {
        state.usersAll[i].adminNote = note;
        matchedUser = state.usersAll[i];
        break;
      }
    }
    var sel = getUserSelect();
    if (sel && matchedUser) {
      for (var j = 0; j < sel.options.length; j += 1) {
        if (sel.options[j].value === username) {
          sel.options[j].textContent = formatUserSelectLabel(matchedUser);
          break;
        }
      }
    }
  }

  function setOverviewAdminNote(username, adminNote, inputEl) {
    if (!username) return Promise.resolve();
    var next = String(adminNote || '').trim();
    if (next.length > 20) next = next.slice(0, 20);
    var row = findOverviewRow(username);
    var prev = row && typeof row.adminNote === 'string' ? row.adminNote.trim() : '';
    if (next === prev) {
      if (inputEl) inputEl.value = next;
      return Promise.resolve();
    }
    if (inputEl) inputEl.disabled = true;
    return apiFetch('/api/admin/users/' + encodeURIComponent(username), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNote: next }),
    })
      .then(function () {
        applyLocalAdminNote(username, next);
        if (inputEl) inputEl.value = next;
      })
      .catch(function (e) {
        if (inputEl) inputEl.value = prev;
        window.alert(e.message || '更新备注失败');
      })
      .then(function () {
        if (inputEl) inputEl.disabled = false;
      });
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
      void ensureOverviewForCurrentSelection(false);
      return;
    }
    if (!state.selectedUsername) return;
    if (state.loadedStudentUsername !== state.selectedUsername) {
      void loadStudentData();
      return;
    }
    if (next === 'stats') {
      ensureStudentStatsBuilt();
      renderStatsPanel();
      redrawAllStatsCharts();
    }
    if (next === 'train-debug') {
      void loadTrainDebug(false);
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
      return { username: raw, nickname: '', adminNote: '', isVip: false };
    }
    return {
      username: String((raw && raw.username) || ''),
      nickname: String((raw && raw.nickname) || '').trim(),
      adminNote: String((raw && raw.adminNote) || '').trim(),
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
    var note = u.adminNote ? ' · ' + u.adminNote : '';
    var vipMark = u.isVip ? '★ ' : '';
    return vipMark + u.username + note;
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

  function updateTitleCount() {
    var el = document.getElementById('jml-report-title-count');
    if (!el) return;
    if (state.userScope === 'vip') {
      el.textContent = '（VIP ' + countVipUsers() + ' 人）';
    } else {
      el.textContent = '（' + state.usersAll.length + ' 人）';
    }
  }

  function updateScopeHint() {
    // 人数改到标题旁；保留空函数以免旧调用报错
    updateTitleCount();
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
      var hay = (u.username + ' ' + (u.adminNote || '')).toLowerCase();
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
    updateScopeHint();
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

  function renderTrainDebugPlaceholder(msg) {
    var el = document.getElementById('jml-report-train-debug-body');
    if (!el) return;
    el.innerHTML = '<div class="jml-report-empty">' + escapeHtml(msg || '—') + '</div>';
  }

  function summarizeServerPick(server) {
    if (!server) {
      return { ok: false, error: 'no_server_block' };
    }
    if (server.ok === false) {
      return {
        ok: false,
        error: server.error || 'failed',
        todayKey: server.todayKey || '',
        dayState: server.dayState || null,
      };
    }
    var li =
      server.levelIndex != null && Number.isFinite(Number(server.levelIndex))
        ? Math.min(15, Math.max(0, Math.floor(Number(server.levelIndex))))
        : null;
    if (li == null) {
      return { ok: false, error: 'no_pick', todayKey: server.todayKey || '' };
    }
    var dayMode =
      server.dayMode === 'heat' || server.dayMode === 'frontier'
        ? server.dayMode
        : server.brushMode
          ? 'heat'
          : 'frontier';
    return {
      ok: true,
      todayKey: server.todayKey || '',
      levelIndex: li,
      pickedL: li + 1,
      dayMode: dayMode,
      frontierLevel: server.frontierLevel != null ? server.frontierLevel : null,
      frontierL:
        server.frontierL != null
          ? server.frontierL
          : server.frontierLevel != null
            ? server.frontierLevel + 1
            : null,
      heatLevel: server.heatLevel != null ? server.heatLevel : null,
      heatL:
        server.heatL != null ? server.heatL : server.heatLevel != null ? server.heatLevel + 1 : null,
      brushMode: dayMode === 'heat' || !!server.brushMode,
      mode: server.mode || '',
      reason: server.reason || '',
      pickReason: server.pickReason || server.reason || '',
      reasonText: server.reasonText || '',
      enterBrush: !!server.enterBrush,
      brushPoolMax: server.brushPoolMax != null ? server.brushPoolMax : null,
      dayState: server.dayState || null,
      heatAvgSecAtStart: server.heatAvgSecAtStart,
      cohortLoaded: server.cohortLoaded,
      cellsSummary: server.cellsSummary || null,
      result: server.result || null,
    };
  }

  function pickCardHtml(title, block) {
    if (!block) {
      return (
        '<div class="jml-train-debug-card">' +
        '<h3>' +
        escapeHtml(title) +
        '</h3><div class="meta">无数据</div></div>'
      );
    }
    if (block.ok === false) {
      return (
        '<div class="jml-train-debug-card mismatch">' +
        '<h3>' +
        escapeHtml(title) +
        '</h3><div class="big">—</div><div class="meta">' +
        escapeHtml(block.error || 'failed') +
        '<br/>todayKey=' +
        escapeHtml(block.todayKey || '') +
        '</div></div>'
      );
    }
    var dayMode = block.dayMode || (block.dayState && block.dayState.dayMode) || '';
    var fL = block.frontierL != null ? block.frontierL : block.frontierLevel != null ? block.frontierLevel + 1 : null;
    var hL = block.heatL != null ? block.heatL : block.heatLevel != null ? block.heatLevel + 1 : null;
    var pool =
      block.brushPoolMax != null && Number.isFinite(Number(block.brushPoolMax))
        ? 'L1–L' + (Number(block.brushPoolMax) + 1)
        : '—';
    return (
      '<div class="jml-train-debug-card">' +
      '<h3>' +
      escapeHtml(title) +
      '</h3><div class="big">L' +
      escapeHtml(String(block.pickedL)) +
      '</div><div class="meta">' +
      escapeHtml(dayMode || block.mode || '') +
      ' · brush=' +
      escapeHtml(String(!!block.brushMode)) +
      '<br/>F=' +
      escapeHtml(fL != null ? 'L' + fL : '—') +
      ' · H=' +
      escapeHtml(hL != null ? 'L' + hL : '—') +
      ' · pool=' +
      escapeHtml(pool) +
      '<br/>' +
      escapeHtml(block.reasonText || block.pickReason || block.reason || '') +
      '<br/>todayKey=' +
      escapeHtml(block.todayKey || '') +
      '</div></div>'
    );
  }

  function recentTrainingTableHtml(list) {
    if (!list || !list.length) {
      return '<div class="jml-report-empty">近期无 training 局</div>';
    }
    var rows = list
      .map(function (r) {
        var da = r.dayStateAfter ? JSON.stringify(r.dayStateAfter) : '—';
        return (
          '<tr>' +
          '<td>' +
          escapeHtml(r.iso || formatDateTime(r.ts)) +
          '</td>' +
          '<td>L' +
          escapeHtml(String(r.L)) +
          '</td>' +
          '<td>' +
          escapeHtml(r.cleared ? 'Y' : 'N') +
          (r.abandoned ? ' /弃' : '') +
          '</td>' +
          '<td>' +
          escapeHtml(String(!!r.runBrushMode)) +
          '</td>' +
          '<td>' +
          escapeHtml(r.autoPickL != null ? 'L' + r.autoPickL : '—') +
          ' → ' +
          escapeHtml(r.pickedL != null ? 'L' + r.pickedL : '—') +
          (r.manualOverride ? ' (手改)' : '') +
          '</td>' +
          '<td>' +
          escapeHtml(r.pickReason || r.pickMode || '') +
          '</td>' +
          '<td>' +
          escapeHtml(r.entrySource || '') +
          '</td>' +
          '<td><code style="font-size:10px;word-break:break-all;">' +
          escapeHtml(da) +
          '</code></td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="jml-train-debug-table-wrap"><table>' +
      '<thead><tr>' +
      '<th>时间</th><th>关</th><th>过</th><th>刷</th><th>自动→实打</th><th>reason</th><th>entrySource</th><th>dayStateAfter</th>' +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table></div>'
    );
  }

  function renderTrainDebugPanel(payload) {
    var el = document.getElementById('jml-report-train-debug-body');
    if (!el) return;
    if (!payload) {
      renderTrainDebugPlaceholder('无 Debug 数据');
      return;
    }
    var server = summarizeServerPick(payload.server);

    el.innerHTML =
      '<div class="jml-train-debug">' +
      '<p class="jml-train-debug-hint">训练选关以服务器为准（与学员端 <code>/api/user/…/training/next-level</code> 同口径）。</p>' +
      '<div class="jml-train-debug-toolbar">' +
      '<button type="button" class="jml-btn" id="jml-train-debug-refresh">重新拉取</button>' +
      '<button type="button" class="jml-btn" id="jml-train-debug-copy">复制 JSON</button>' +
      '<span class="jml-train-debug-copy-ok" id="jml-train-debug-copy-status" hidden>已复制</span>' +
      '</div>' +
      '<div class="jml-train-debug-cards">' +
      pickCardHtml('服务器选关（学员端同口径）', server) +
      '<div class="jml-train-debug-card"><h3>档案</h3><div class="meta">levelTrainingCurrentL=' +
      escapeHtml(String(payload.levelTrainingCurrentL)) +
      '<br/>trainingDayMode=' +
      escapeHtml(JSON.stringify(payload.trainingDayMode || null)) +
      '</div></div>' +
      '</div>' +
      '<h3 class="jml-report-h3" style="margin:8px 0 4px;font-size:14px;">近期 training 局</h3>' +
      recentTrainingTableHtml(payload.recentTraining) +
      '<h3 class="jml-report-h3" style="margin:8px 0 4px;font-size:14px;">完整 JSON</h3>' +
      '<pre class="jml-train-debug-pre" id="jml-train-debug-json">' +
      escapeHtml(JSON.stringify(payload, null, 2)) +
      '</pre>' +
      '</div>';
  }

  function fetchAndRenderTrainDebug() {
    var el = document.getElementById('jml-report-train-debug-body');
    if (!state.selectedUsername) {
      renderTrainDebugPlaceholder('请先选择学员');
      return Promise.resolve();
    }
    if (el) {
      el.innerHTML = '<div class="jml-report-empty">正在拉取训练选关…</div>';
    }
    return apiFetch(
      '/api/admin/user/' +
        encodeURIComponent(state.selectedUsername) +
        '/training/next-level-debug'
    )
      .then(function (apiData) {
        var server = apiData && apiData.server ? apiData.server : null;
        if (
          server &&
          server.ok !== false &&
          !server.reasonText &&
          window.JmlStatsHeatmap &&
          window.JmlStatsHeatmap.trainingNextLevelReasonText
        ) {
          server.reasonText = window.JmlStatsHeatmap.trainingNextLevelReasonText(
            server.result || server,
            getReportTrainingReasonLabels()
          );
        }
        state.serverTrainingPick = server;
        var payload = {
          ok: true,
          username: state.selectedUsername,
          at: new Date().toISOString(),
          apiAt: apiData && apiData.at,
          note: apiData && apiData.note,
          trainingDayMode: apiData && apiData.trainingDayMode,
          levelTrainingCurrentLevel: apiData && apiData.levelTrainingCurrentLevel,
          levelTrainingCurrentL: apiData && apiData.levelTrainingCurrentL,
          server: server,
          recentTraining: (apiData && apiData.recentTraining) || [],
        };
        state.trainDebugPayload = payload;
        renderTrainDebugPanel(payload);
        if (activeTabId() === 'stats') renderStatsPanel();
      })
      .catch(function (e) {
        state.trainDebugPayload = null;
        renderTrainDebugPlaceholder('拉取失败：' + (e.message || String(e)));
      });
  }

  function loadTrainDebug(forceReloadStudent) {
    if (!state.selectedUsername) {
      renderTrainDebugPlaceholder('请先选择学员');
      return Promise.resolve();
    }
    if (forceReloadStudent || state.loadedStudentUsername !== state.selectedUsername) {
      var el = document.getElementById('jml-report-train-debug-body');
      if (el) {
        el.innerHTML = '<div class="jml-report-empty">正在加载学员数据…</div>';
      }
      // loadStudentData 成功后若仍在本 Tab 会调用 fetchAndRenderTrainDebug
      return Promise.resolve(loadStudentData());
    }
    return fetchAndRenderTrainDebug();
  }

  function clearPanels() {
    state.runs = [];
    state.userDetail = null;
    state.loadedStudentUsername = '';
    state.statsBuiltFor = '';
    state.agg = null;
    state.aggByCategory = {};
    state.chartModel = null;
    state.heat = null;
    state.heatByCategory = {};
    state.heatmapFromServer = false;
    state.trainDebugPayload = null;
    state.serverTrainingPick = null;
    state.serverCategoryNext = null;
    renderRunsTable();
    renderWrongBook();
    renderExpandWrongBook();
    renderDivisibilityWrongBook();
    renderStatsPanel();
    renderTrainDebugPlaceholder('请先选择学员');
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
      apiFetch('/api/admin/stats/perfect-square-cohort').catch(function (e) {
        return { ok: false, error: e.message || String(e) };
      }),
      apiFetch('/api/admin/stats/divisibility-cohort').catch(function (e) {
        return { ok: false, error: e.message || String(e) };
      }),
    ])
      .then(function (results) {
        var level = results[0];
        var decimal = results[1];
        var perfectSquare = results[2];
        var divisibility = results[3];
        state.cohortByCategory = {
          arithmetic: level && level.ok ? level : null,
          decimal: decimal && decimal.ok ? decimal : null,
          perfectSquare: perfectSquare && perfectSquare.ok ? perfectSquare : null,
          divisibility: divisibility && divisibility.ok ? divisibility : null,
        };
        state.cohort = state.cohortByCategory.arithmetic;
        var errs = [];
        if (!state.cohortByCategory.arithmetic) {
          errs.push('四则：' + ((level && level.error) || '常模接口返回异常'));
        }
        if (!state.cohortByCategory.decimal) {
          errs.push('小数：' + ((decimal && decimal.error) || '常模接口返回异常'));
        }
        if (!state.cohortByCategory.perfectSquare) {
          errs.push('平方数：' + ((perfectSquare && perfectSquare.error) || '常模接口返回异常'));
        }
        if (!state.cohortByCategory.divisibility) {
          errs.push('整除：' + ((divisibility && divisibility.error) || '常模接口返回异常'));
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

  function showOverviewTabChrome() {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === 'overview');
    });
    document.querySelectorAll('.jml-tab-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== 'overview');
    });
  }

  function seedSelectWithUsername(username) {
    var sel = getUserSelect();
    if (!sel || !username) return;
    var found = false;
    for (var i = 0; i < sel.options.length; i += 1) {
      if (sel.options[i].value === username) {
        found = true;
        break;
      }
    }
    if (!found) {
      var o = document.createElement('option');
      o.value = username;
      o.textContent = username;
      sel.appendChild(o);
    }
    sel.value = username;
  }

  /** 深链首屏：不依赖 user-list / i18n，立刻拉单人概览并上屏 */
  function bootstrapDeepLinkOverview(username) {
    if (!username) return Promise.resolve();
    state.selectedUsername = username;
    syncUserQueryInUrl(username);
    seedSelectWithUsername(username);
    syncRefreshStudentBtn(false);
    showOverviewTabChrome();
    return loadOverview({ username: username, force: false });
  }

  /** user-list 回来后：校验学员、补全下拉；detail 放到空闲时再拉 */
  function finalizeDeepLinkAfterUserList(username) {
    if (!username) return;
    var meta = findUserMeta(username);
    var errEl = document.getElementById('jml-report-student-error');
    if (!meta) {
      if (errEl) {
        errEl.textContent = '链接中的学员不存在：' + username;
        errEl.style.display = 'block';
      }
      return;
    }
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    if (state.userScope === 'vip' && meta.isVip !== true) {
      state.userScope = 'all';
      updateScopeButtons();
    }
    state.selectedUsername = username;
    populateUserSelect(true);
    var sel = getUserSelect();
    if (sel) sel.value = username;
    syncUserQueryInUrl(username);
    updateTitleCount();
    scheduleIdleStudentDetail();
  }

  function scheduleIdleStudentDetail() {
    if (!state.selectedUsername) return;
    if (state.loadedStudentUsername === state.selectedUsername) return;
    var run = function () {
      if (!state.selectedUsername) return;
      if (state.loadedStudentUsername === state.selectedUsername) return;
      void loadStudentData();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 100);
    }
  }

  function applyUserFromUrl() {
    var target = getUserFromUrl();
    if (!target) return;
    void bootstrapDeepLinkOverview(target);
    if (state.usersAll && state.usersAll.length) {
      finalizeDeepLinkAfterUserList(target);
    }
  }

  function ensureStudentStatsBuilt() {
    var u = state.loadedStudentUsername || state.selectedUsername;
    if (!u || !state.runs) return;
    if (state.statsBuiltFor === u && state.aggByCategory && Object.keys(state.aggByCategory).length) {
      return;
    }
    var runs = state.runs;
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
    state.statsBuiltFor = u;
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
    return apiFetch('/api/admin/student-detail/' + encodeURIComponent(u))
      .then(function (data) {
        var runs = Array.isArray(data.runs) ? data.runs.slice() : [];
        // 服务端已按 ts 降序；仅在偶发乱序时再排
        if (runs.length > 1) {
          var needSort = false;
          for (var i = 1; i < runs.length; i += 1) {
            if ((runs[i - 1].ts || 0) < (runs[i].ts || 0)) {
              needSort = true;
              break;
            }
          }
          if (needSort) {
            runs.sort(function (a, b) {
              return (b.ts || 0) - (a.ts || 0);
            });
          }
        }
        state.runs = runs;
        state.userDetail = data && data.user ? data.user : null;
        state.statsBuiltFor = '';
        state.agg = null;
        state.aggByCategory = {};
        state.chartModel = null;
        state.heat = null;
        state.heatByCategory = {};

        renderRunsTable();
        renderWrongBook();
        renderExpandWrongBook();
        renderDivisibilityWrongBook();
        state.loadedStudentUsername = u;
        state.serverTrainingPick = null;
        state.serverCategoryNext = null;
        state.trainDebugPayload = null;
        state.heatmapFromServer = false;
        state.heatByCategory = {};
        state.practiceAdvice = null;
        state.practiceAdviceError = '';
        state.practiceAdviceLoading = true;
        void fetchPracticeAdviceForSelectedUser();
        // 后台拉服务器热图格子（权威）
        void fetchServerHeatmapForSelectedUser()
          .then(function (ok) {
            if (state.selectedUsername !== u) return;
            if (activeTabId() === 'stats') {
              ensureStudentStatsBuilt();
              renderStatsPanel();
              redrawAllStatsCharts();
            }
            return ok;
          })
          .catch(function () {});
        // 后台拉服务器选关，供热图图例与 Debug 共用
        void apiFetch(
          '/api/admin/user/' + encodeURIComponent(u) + '/training/next-level-debug'
        )
          .then(function (apiData) {
            if (state.selectedUsername !== u) return;
            var server = apiData && apiData.server ? apiData.server : null;
            if (
              server &&
              server.ok !== false &&
              !server.reasonText &&
              window.JmlStatsHeatmap &&
              window.JmlStatsHeatmap.trainingNextLevelReasonText
            ) {
              server.reasonText = window.JmlStatsHeatmap.trainingNextLevelReasonText(
                server.result || server,
                getReportTrainingReasonLabels()
              );
            }
            state.serverTrainingPick = server;
            if (activeTabId() === 'stats') renderStatsPanel();
          })
          .catch(function () {
            /* 图例可稍后在 Debug Tab 拉取 */
          });
        void apiFetch(
          '/api/admin/user/' + encodeURIComponent(u) + '/category-next-levels'
        )
          .then(function (apiData) {
            if (state.selectedUsername !== u) return;
            state.serverCategoryNext =
              apiData && apiData.ok && apiData.byCategory ? apiData.byCategory : null;
            if (activeTabId() === 'stats') renderStatsPanel();
          })
          .catch(function () {
            if (state.selectedUsername !== u) return;
            state.serverCategoryNext = null;
          });

        if (activeTabId() === 'stats') {
          ensureStudentStatsBuilt();
          renderStatsPanel();
          redrawAllStatsCharts();
        } else if (activeTabId() === 'train-debug') {
          void fetchAndRenderTrainDebug();
        } else {
          var statsWrap = document.getElementById('jml-report-stats-body');
          if (statsWrap) {
            statsWrap.innerHTML =
              '<div class="jml-report-empty">切换到「数据分析」时再计算热图与图表</div>';
          }
          renderTrainDebugPlaceholder('切换到「训练选关Debug」时再拉取服务器选关');
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

  /** 训练 / 小数 / 平方数 / 整除 Z1–Z4 展示开局加权速与本局均速；闯关·生存·整除 Z5 为 — */
  function normalizeRunModeKey(mode) {
    return String(mode || '')
      .toLowerCase()
      .replace(/[_-]/g, '');
  }

  function runShowsHeatRunSpeed(r) {
    var m = normalizeRunModeKey(r && r.mode);
    if (m === 'training' || m === 'decimal' || m === 'perfectsquare') return true;
    if (m === 'divisibility') {
      var lv =
        r.trainingMeta && Number.isFinite(Number(r.trainingMeta.pickedLevel))
          ? Number(r.trainingMeta.pickedLevel)
          : r.maxLevel != null && Number.isFinite(Number(r.maxLevel))
            ? Number(r.maxLevel)
            : null;
      // Z5 = levelIndex 4
      return !(lv != null && Math.floor(lv) >= 4);
    }
    return false;
  }

  function heatLevelCountForRun(r) {
    var m = normalizeRunModeKey(r && r.mode);
    if (m === 'decimal') return 6;
    if (m === 'perfectsquare') return 4;
    if (m === 'divisibility') return 4;
    return 16;
  }

  function formatTrainingRunHeatSpeedCell(r) {
    if (!runShowsHeatRunSpeed(r)) {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    var m = r.trainingMeta;
    if (!m || typeof m !== 'object') {
      return '<span class="jml-runs-pick-muted" title="旧记录无速度快照">—</span>';
    }
    return formatTrainingSpeedSec(m.heatAvgSecAtStart);
  }

  function formatTrainingRunAvgSpeedCell(r) {
    if (!runShowsHeatRunSpeed(r)) {
      return '<span class="jml-runs-pick-muted">—</span>';
    }
    var m = r.trainingMeta;
    if (m && typeof m === 'object' && m.runAvgSec != null && Number.isFinite(Number(m.runAvgSec))) {
      return formatTrainingSpeedSec(m.runAvgSec);
    }
    var Agg = window.JmlStatsAggregate;
    var picked =
      m && Number.isFinite(Number(m.pickedLevel))
        ? Number(m.pickedLevel)
        : r.maxLevel != null && Number.isFinite(Number(r.maxLevel))
          ? Number(r.maxLevel)
          : null;
    if (Agg && typeof Agg.geoMeanSecFromAttempts === 'function' && Array.isArray(r.attempts)) {
      var g = Agg.geoMeanSecFromAttempts(r.attempts, {
        levelIndex: picked != null ? picked : undefined,
        maxTimeSpentMs: Agg.DEFAULT_MAX_TIME_SPENT_MS || 60 * 1000,
        levelCount: heatLevelCountForRun(r),
      });
      if (g && g.avgSec != null) return formatTrainingSpeedSec(g.avgSec);
    }
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
          '<td class="num jml-runs-col-heat-spd" title="开局时该关热图加权均时">' +
          formatTrainingRunHeatSpeedCell(r) +
          '</td>' +
          '<td class="num jml-runs-col-run-spd" title="本局几何均时（仅答对，≤60s）">' +
          formatTrainingRunAvgSpeedCell(r) +
          '</td>' +
          '<td class="jml-runs-col-pick">' +
          formatTrainingRunPickCell(r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    wrap.innerHTML =
      '<div class="jml-report-table-wrap"><table class="jml-report-table jml-report-runs-table">' +
      '<thead><tr><th>日期时间</th><th>挑战类型</th><th class="num">用时</th><th class="num">得分</th><th class="num">错误题数</th><th class="num">最高难度</th><th class="num">开局加权速</th><th class="num" title="仅答对几何均，剔除&gt;60s">本局均速</th><th>选关诊断</th></tr></thead>' +
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
      '<div class="jml-report-summary">当前错题库存 ' +
      escapeHtml(String(wrongs.length)) +
      ' 条（最多 100；含学员端已清空的历史' +
      (user.wrongAnswersClearedBeforeTs
        ? '；清空游标 ts=' + escapeHtml(String(user.wrongAnswersClearedBeforeTs))
        : '') +
      '）</div>' +
      '<ul class="jml-wrong-list">' +
      wrongs
        .slice(0, 100)
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

  function renderDivisibilityWrongBook() {
    var wrap = document.getElementById('jml-report-div-wrong-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    var user = state.userDetail || {};
    var wrongs = Array.isArray(user.divisibilityWrongAnswers)
      ? user.divisibilityWrongAnswers.slice()
      : [];
    if (!wrongs.length) {
      wrap.innerHTML =
      '<div class="jml-report-empty">暂无整除错题（仅记录部署后新错题）</div>';
      return;
    }
    wrongs.sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    wrap.innerHTML =
      '<div class="jml-report-summary">整除错题本共 ' +
      escapeHtml(String(wrongs.length)) +
      ' 条（每人最多保留 20 条，新错题顶替最旧）</div>' +
      '<ul class="jml-wrong-list">' +
      wrongs
        .slice(0, 20)
        .map(function (w) {
          var prompt = w.prompt || w.question || w.text || '';
          var studentAns = w.studentAnswer != null ? String(w.studentAnswer) : '';
          var rightAns = w.correctAnswer != null ? String(w.correctAnswer) : '';
          var meta = formatDateTime(w.ts);
          if (w.levelIndex != null && Number.isFinite(Number(w.levelIndex))) {
            meta += ' · Z' + (Number(w.levelIndex) + 1);
          }
          if (w.divisor != null && Number.isFinite(Number(w.divisor))) {
            meta += ' · ÷' + Number(w.divisor);
          }
          return (
            '<li class="jml-wrong-item">' +
            '<div class="expr">' +
            escapeHtml(prompt || '（无题干）') +
            '</div>' +
            '<div>学员选项：<span style="color:#c62828;font-weight:600;">' +
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
    if (c && typeof c.cellStyle === 'string' && c.cellStyle) return c.cellStyle;
    var HM = window.JmlStatsHeatmap;
    if (HM && typeof HM.heatmapCellInlineStyle === 'function') {
      return HM.heatmapCellInlineStyle(c) || '';
    }
    return '';
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
            (getReportLang() === 'en' ? 'Window n=' : '窗口題數 n=') +
              (c.n != null && Number.isFinite(c.n) ? c.n : 0)
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

  function applyServerHeatmapPayload(payload) {
    state.heatByCategory = {};
    state.heatmapFromServer = false;
    if (!payload || !payload.ok || !payload.byCategory) return false;
    Object.keys(payload.byCategory).forEach(function (id) {
      var block = payload.byCategory[id];
      if (block && block.heat) state.heatByCategory[id] = block.heat;
    });
    state.heatmapFromServer = Object.keys(state.heatByCategory).length > 0;
    state.heat = state.heatByCategory[state.chartCategoryId] || null;
    return state.heatmapFromServer;
  }

  function fetchServerHeatmapForSelectedUser() {
    if (!state.selectedUsername) return Promise.resolve(false);
    return apiFetch(
      '/api/admin/user/' + encodeURIComponent(state.selectedUsername) + '/heatmap'
    ).then(function (payload) {
      return applyServerHeatmapPayload(payload);
    });
  }

  function formatArithmeticNextBadgeHtml() {
    var sp = state.serverTrainingPick;
    if (sp && sp.ok !== false && sp.levelIndex != null && Number.isFinite(Number(sp.levelIndex))) {
      var recK = Math.min(15, Math.max(0, Math.floor(Number(sp.levelIndex))));
      var isBrush = !!(sp.brushMode || sp.dayMode === 'heat' || sp.mode === 'brush');
      var modeLabel = isBrush ? rt('stats.heat.mode.brush') : rt('stats.heat.mode.daily');
      return formatCategoryNextBadgeHtml('L' + (recK + 1), modeLabel, rt('stats.heat.legend.recommend'));
    }
    return formatCategoryNextPendingHtml('见「训练选关 Debug」');
  }

  function formatCategoryNextBadgeHtml(levelLabel, modeLabel, title) {
    return (
      '<span class="jml-heat-cat-next" title="' +
      escapeHtml(title || '') +
      '">' +
      escapeHtml(
        rtf('stats.heat.catNext', {
          label: levelLabel,
          mode: modeLabel,
        })
      ) +
      '</span>'
    );
  }

  function formatCategoryNextPendingHtml(title) {
    return (
      '<span class="jml-heat-cat-next jml-heat-cat-next-muted" title="' +
      escapeHtml(title || '') +
      '">' +
      escapeHtml(rt('stats.heat.catNextPending')) +
      '</span>'
    );
  }

  function formatSpecialCategoryNextBadgeHtml(categoryId, levelPrefix) {
    var map = state.serverCategoryNext;
    var pick = map && map[categoryId] ? map[categoryId] : null;
    if (!pick || pick.ok === false) {
      return formatCategoryNextPendingHtml(rt('stats.heat.catNextSpecialHint'));
    }
    if (pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) {
      return formatCategoryNextPendingHtml(String(pick.reason || ''));
    }
    var prefix = levelPrefix || 'L';
    var n = Math.max(0, Math.floor(Number(pick.levelIndex))) + 1;
    var isBrush = pick.mode === 'brush' || pick.cleared === true;
    var modeLabel = isBrush ? rt('stats.heat.mode.brush') : rt('stats.heat.mode.frontier');
    var title = isBrush
      ? rt('stats.heat.legend.recommendCleared')
      : rt('stats.heat.legend.recommendFrontier');
    return formatCategoryNextBadgeHtml(prefix + n, modeLabel, title);
  }

  function formatHeatCategoryNextBadgeHtml(cat) {
    if (!cat || !cat.id) return '';
    if (cat.id === 'arithmetic') return formatArithmeticNextBadgeHtml();
    if (cat.id === 'decimal' || cat.id === 'perfectSquare' || cat.id === 'divisibility') {
      return formatSpecialCategoryNextBadgeHtml(cat.id, cat.levelPrefix || 'L');
    }
    return '';
  }

  function buildStatsHelpDetailsHtml() {
    var anyLegendHeat = null;
    var cats =
      window.JmlStatsHeatmap && window.JmlStatsHeatmap.getHeatmapCategories
        ? window.JmlStatsHeatmap.getHeatmapCategories()
        : [];
    cats.forEach(function (cat) {
      var heat = state.heatByCategory && state.heatByCategory[cat.id];
      if (heat && !anyLegendHeat) anyLegendHeat = heat;
    });
    var heat = anyLegendHeat || {
      personalWindowAttempts: 200,
      personalHalfLifeDays: 14,
      minAttempts: 10,
    };
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

    var body =
      '<p class="jml-stats-help-p">' +
      escapeHtml(rt('stats.report.intro')) +
      '</p>' +
      '<p class="jml-stats-help-p">' +
      '<strong>' +
      escapeHtml(rt('stats.heat.legend.title')) +
      '</strong>' +
      escapeHtml(legendBody) +
      '</p>' +
      '<p class="jml-stats-help-p">' +
      '<strong>' +
      escapeHtml(rt('stats.heat.legend.speedCap')) +
      '</strong>' +
      escapeHtml(capNote) +
      '</p>';

    if (chartCohort && chartCohort.builtAt) {
      body +=
        '<p class="jml-stats-help-p">' +
        '<strong>' +
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
          : ' ' + escapeHtml(rt('stats.heat.legend.cohortRebuilt'))) +
        '</p>';
    }

    var summaryMeta = '';
    if (chartCohort && chartCohort.builtAt) {
      summaryMeta =
        '<span class="jml-stats-help-meta">' +
        escapeHtml(
          rtf('stats.report.helpCohortBuilt', {
            built: formatDateTime(chartCohort.builtAt),
          })
        ) +
        '</span>';
    }

    return (
      '<details class="jml-stats-help">' +
      '<summary>' +
      '<span class="jml-stats-help-summary-main">' +
      escapeHtml(rt('stats.report.helpSummary')) +
      '</span>' +
      summaryMeta +
      '</summary>' +
      '<div class="jml-stats-help-body">' +
      body +
      '</div></details>'
    );
  }

  function buildHeatmapSectionHtml() {
    var HM = window.JmlStatsHeatmap;
    if (!HM || !HM.getHeatmapCategories) {
      return '<p class="jml-stats-cohort-warn">' + escapeHtml(rt('stats.heat.scriptMissing')) + '</p>';
    }
    if (!state.heatmapFromServer || !Object.keys(state.heatByCategory || {}).length) {
      return (
        '<p class="jml-stats-cohort-warn">热图格子由服务器计算；正在等待拉取或拉取失败。请刷新学员数据。</p>'
      );
    }

    var cats = HM.getHeatmapCategories();
    var anyLegendHeat = null;
    cats.forEach(function (cat) {
      var heat = state.heatByCategory[cat.id];
      if (heat && !anyLegendHeat) anyLegendHeat = heat;
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

    var catsHtml = cats
      .map(function (cat) {
        var cHeat = state.heatByCategory[cat.id];
        var open = state.expandedCategoryId === cat.id;
        var label = rt(cat.labelKey);
        if (!label || label === cat.labelKey) label = cat.labelFallback || cat.id;
        var nextBadge = formatHeatCategoryNextBadgeHtml(cat);
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
          '<span class="jml-heat-cat-title-row">' +
          '<span class="jml-heat-cat-name">' +
          escapeHtml(label) +
          '</span>' +
          nextBadge +
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

  function fetchPracticeAdviceForSelectedUser(resetIncomplete) {
    var u = state.selectedUsername;
    if (!u) return Promise.resolve();
    state.practiceAdviceLoading = true;
    state.practiceAdviceError = '';
    var path = '/api/admin/user/' + encodeURIComponent(u) + '/practice-plan';
    var req = resetIncomplete
      ? apiFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetIncomplete: true }),
        })
      : apiFetch(path);
    return req
      .then(function (data) {
        if (state.selectedUsername !== u) return;
        state.practiceAdviceLoading = false;
        if (data && data.ok) {
          state.practiceAdvice = data;
          state.practiceAdviceError = '';
        } else {
          state.practiceAdvice = null;
          state.practiceAdviceError = (data && data.error) || '任务单加载失败';
        }
        if (activeTabId() === 'stats') renderStatsPanel();
      })
      .catch(function (e) {
        if (state.selectedUsername !== u) return;
        state.practiceAdviceLoading = false;
        state.practiceAdvice = null;
        state.practiceAdviceError = (e && e.message) || '任务单加载失败';
        if (activeTabId() === 'stats') renderStatsPanel();
      });
  }

  function formatAdviceSystemPickLine(sp) {
    if (!sp || (sp.ok === false && sp.levelIndex == null && sp.pickedL == null)) {
      return '旧训练选关：暂无';
    }
    var lv =
      sp.pickedL != null && Number.isFinite(Number(sp.pickedL))
        ? 'L' + Number(sp.pickedL)
        : sp.levelIndex != null && Number.isFinite(Number(sp.levelIndex))
          ? 'L' + (Number(sp.levelIndex) + 1)
          : '—';
    var day = sp.dayMode === 'heat' ? '热图日' : sp.dayMode === 'frontier' ? '前沿日' : sp.dayMode || '—';
    var why = sp.pickReason || sp.reason || '';
    return '旧训练选关：' + day + ' ' + lv + (why ? '（' + why + '）' : '');
  }

  function buildPracticeAdviceBannerHtml() {
    if (state.practiceAdviceLoading && !state.practiceAdvice) {
      return (
        '<section class="jml-advice-banner jml-advice-banner--muted">' +
        '<h3 class="jml-advice-title">助手练习建议</h3>' +
        '<p>任务单加载中…</p></section>'
      );
    }
    if (state.practiceAdviceError && !state.practiceAdvice) {
      return (
        '<section class="jml-advice-banner jml-advice-banner--muted">' +
        '<h3 class="jml-advice-title">助手练习建议</h3>' +
        '<p>' +
        escapeHtml(state.practiceAdviceError) +
        '</p></section>'
      );
    }
    var advice = state.practiceAdvice;
    if (!advice) {
      return (
        '<section class="jml-advice-banner jml-advice-banner--muted">' +
        '<h3 class="jml-advice-title">助手练习建议</h3>' +
        '<p>等待任务单…</p></section>'
      );
    }
    var p = advice.primary || {};
    var diverge = advice.divergesFromSystemPick
      ? '<span class="jml-advice-badge jml-advice-badge--diff">与旧选关不一致</span>'
      : '<span class="jml-advice-badge">与旧选关一致</span>';
    var reasons = (advice.reasons || [])
      .map(function (r) {
        return (
          '<li><code>' +
          escapeHtml(r.ruleId || '') +
          '</code> ' +
          escapeHtml(r.evidence || '') +
          (r.note ? '<span class="jml-advice-note"> · ' + escapeHtml(r.note) + '</span>' : '') +
          '</li>'
        );
      })
      .join('');
    var openSteps = (advice.queue || []).filter(function (s) {
      return s.status !== 'success';
    });
    var doneSteps = (advice.queue || []).filter(function (s) {
      return s.status === 'success';
    }).reverse();
    function adviceTileHtml(step, empty) {
      if (empty) {
        return '<div class="jml-advice-tile jml-advice-tile--empty"></div>';
      }
      var st = step.status || 'pending';
      var lab = step.tileLabel || step.levelLabel || '';
      var goal = step.tileGoal || '';
      var prog = step.tileProgress || '';
      var why = step.tileWhy || step.detail || '';
      return (
        '<div class="jml-advice-tile jml-advice-tile--' +
        escapeHtml(st) +
        '"' +
        (why ? ' title="' + escapeHtml(why) + '"' : '') +
        '>' +
        '<span class="jml-advice-tile-lab">' +
        escapeHtml(lab) +
        '</span>' +
        (goal ? '<span class="jml-advice-tile-goal">' + escapeHtml(goal) + '</span>' : '') +
        (prog ? '<span class="jml-advice-tile-prog">' + escapeHtml(prog) + '</span>' : '') +
        '</div>'
      );
    }
    function adviceTileRow(items) {
      var html = '';
      var i;
      for (i = 0; i < 5; i += 1) {
        html += items[i] ? adviceTileHtml(items[i], false) : adviceTileHtml(null, true);
      }
      return '<div class="jml-advice-tile-row">' + html + '</div>';
    }
    var queueHtml =
      '<p class="jml-advice-subh">未完成</p>' +
      adviceTileRow(openSteps) +
      '<p class="jml-advice-subh">已完成</p>' +
      adviceTileRow(doneSteps);
    var profileLine = advice.profile
      ? '<p class="jml-advice-profile">' +
        escapeHtml(advice.profile.label || '') +
        ' · 底板 ' +
        escapeHtml(advice.profile.floorLabel || '') +
        (advice.plan && advice.plan.issuedAt
          ? ' · 开单 ' + escapeHtml(formatDateTime(advice.plan.issuedAt))
          : '') +
        '</p>'
      : '';
    var clearLine =
      advice.clearEstimate && advice.clearEstimate.copy
        ? '<p class="jml-advice-clear">' + escapeHtml(advice.clearEstimate.copy) + '</p>'
        : '';
    var dont =
      advice.dontOpenLabel
        ? '<p class="jml-advice-dont">不要开：' + escapeHtml(advice.dontOpenLabel) + '</p>'
        : advice.dontOpen && advice.dontOpen.length
          ? '<p class="jml-advice-dont">不要开：' + escapeHtml(advice.dontOpen.join('、')) + '</p>'
          : '';
    var unresolved = (advice.unresolved || [])
      .map(function (u) {
        return '<li>' + escapeHtml(u) + '</li>';
      })
      .join('');
    var events = (advice.planEvents || [])
      .slice()
      .reverse()
      .slice(0, 12)
      .map(function (ev) {
        return (
          '<li>' +
          escapeHtml(formatDateTime(ev.ts)) +
          ' · ' +
          escapeHtml(ev.type || '') +
          ' · ' +
          escapeHtml(ev.text || '') +
          '</li>'
        );
      })
      .join('');
    var gradeVal = advice.grade;
    var gradeText =
      gradeVal === 0 ? '学前' : gradeVal != null && gradeVal !== '' ? gradeVal + '年级' : '未填';
    var sp = advice.systemPick || state.serverTrainingPick;

    return (
      '<section class="jml-advice-banner' +
      (advice.divergesFromSystemPick ? ' jml-advice-banner--diff' : '') +
      '">' +
      '<div class="jml-advice-head">' +
      '<h3 class="jml-advice-title">助手练习建议</h3>' +
      diverge +
      '<span class="jml-advice-ver">' +
      escapeHtml(advice.ruleVersion || '') +
      ' · 年级 ' +
      escapeHtml(gradeText) +
      ' · 队头计失败 · 2～5 可碰巧完成</span>' +
      '<button type="button" class="jml-btn jml-advice-reset" id="jml-advice-reset" title="只重算未完成，已完成窗口保留">重新开单</button>' +
      '</div>' +
      '<p class="jml-advice-primary">' +
      escapeHtml(p.title || '') +
      '</p>' +
      profileLine +
      clearLine +
      queueHtml +
      '<p class="jml-advice-copy">' +
      escapeHtml(p.parentCopy || '') +
      '</p>' +
      dont +
      '<p class="jml-advice-system">' +
      escapeHtml(formatAdviceSystemPickLine(sp)) +
      '</p>' +
      '<details class="jml-advice-details"><summary>详细原因（对照用）</summary>' +
      '<ul class="jml-advice-reasons">' +
      reasons +
      '</ul>' +
      (events ? '<p class="jml-advice-subh">任务单事件</p><ul>' + events + '</ul>' : '') +
      '<p class="jml-advice-subh">暂定、待主管判断矛盾再调</p><ul>' +
      unresolved +
      '</ul>' +
      '</details>' +
      '</section>'
    );
  }

  function renderStatsPanel() {
    var wrap = document.getElementById('jml-report-stats-body');
    if (!wrap) return;
    if (!state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">请先选择学员</div>';
      return;
    }
    if (state.loadedStudentUsername !== state.selectedUsername) {
      wrap.innerHTML = '<div class="jml-report-empty">学员数据加载中…</div>';
      return;
    }
    ensureStudentStatsBuilt();
    if (!anyStatsCategoryHasData()) {
      wrap.innerHTML =
        '<div class="jml-report-empty">暂无热图相关 attempts（四则 / 小数 / 平方数 / 整除）</div>';
      return;
    }

    var heatmapBlock = buildHeatmapSectionHtml();
    var helpBlock = buildStatsHelpDetailsHtml();
    var adviceBlock = buildPracticeAdviceBannerHtml();

    wrap.innerHTML =
      adviceBlock +
      helpBlock +
      '<div class="jml-stats-layout">' +
      '<div class="jml-stats-col-heat">' +
      heatmapBlock +
      '</div>' +
      '<div class="jml-stats-col-charts">' +
      '<h3 class="jml-report-h3" id="jml-stats-chart-heading"></h3>' +
      '<div class="jml-stats-chart-wrap"><canvas id="jml-stats-canvas"></canvas></div>' +
      '<h3 class="jml-report-h3" id="jml-cohort-box-heading"></h3>' +
      '<div class="jml-stats-chart-wrap jml-cohort-chart-wrap"><canvas id="jml-cohort-box-canvas"></canvas></div>' +
      '<h3 class="jml-report-h3" id="jml-cohort-hist-heading"></h3>' +
      '<div class="jml-stats-chart-wrap jml-cohort-chart-wrap"><canvas id="jml-cohort-hist-canvas"></canvas></div>' +
      '</div>' +
      '</div>';

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
    var catId = cat && cat.id ? cat.id : state.chartCategoryId;
    var prefix = (cat && cat.levelPrefix) || 'L';
    if (catId === 'decimal') {
      return DECIMAL_LEVEL_NAMES[li] || 'D' + (li + 1);
    }
    if (catId === 'perfectSquare') {
      return PERFECT_SQUARE_LEVEL_NAMES[li] || prefix + (li + 1);
    }
    if (catId === 'divisibility') {
      return DIVISIBILITY_LEVEL_NAMES[li] || 'Z' + (li + 1);
    }
    return LEVEL_NAMES[li] || prefix + (li + 1);
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
          quantiles: lnQ,
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
    var reportLangBtn = document.getElementById('jml-report-lang-btn');
    if (reportLangBtn && !reportLangBtn.dataset.bound) {
      reportLangBtn.dataset.bound = '1';
      reportLangBtn.addEventListener('click', function () {
        toggleReportLang();
      });
    }
    var trainDebugBody = document.getElementById('jml-report-train-debug-body');
    if (trainDebugBody && !trainDebugBody.dataset.debugBound) {
      trainDebugBody.dataset.debugBound = '1';
      trainDebugBody.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.id) return;
        if (t.id === 'jml-train-debug-refresh') {
          void loadTrainDebug(true);
          return;
        }
        if (t.id === 'jml-train-debug-copy') {
          var text = state.trainDebugPayload
            ? JSON.stringify(state.trainDebugPayload, null, 2)
            : '';
          var status = document.getElementById('jml-train-debug-copy-status');
          function showOk() {
            if (!status) return;
            status.hidden = false;
            setTimeout(function () {
              status.hidden = true;
            }, 1600);
          }
          if (!text) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(showOk).catch(function () {
              window.prompt('复制以下 JSON', text);
            });
          } else {
            window.prompt('复制以下 JSON', text);
          }
        }
      });
    }
    var overviewBody = document.getElementById('jml-report-overview-body');
    if (overviewBody && !overviewBody.dataset.sortBound) {
      overviewBody.dataset.sortBound = '1';
      overviewBody.addEventListener('click', function (ev) {
        var th = ev.target.closest('.jml-ov-sort-th');
        if (!th || !overviewBody.contains(th)) return;
        var key = th.getAttribute('data-sort-key');
        if (key) toggleOverviewSort(key);
      });
      overviewBody.addEventListener('focusout', function (ev) {
        var input = ev.target;
        if (!input || !input.classList || !input.classList.contains('jml-ov-note-input')) return;
        if (!overviewBody.contains(input)) return;
        var username = input.getAttribute('data-username') || '';
        void setOverviewAdminNote(username, input.value, input);
      });
      overviewBody.addEventListener('keydown', function (ev) {
        var input = ev.target;
        if (!input || !input.classList || !input.classList.contains('jml-ov-note-input')) return;
        if (ev.key === 'Enter') {
          ev.preventDefault();
          input.blur();
        }
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
        syncUserQueryInUrl(state.selectedUsername);
        syncRefreshStudentBtn(true);
        if (!state.selectedUsername) {
          // 回到全员：缺全员缓存时再拉
          var pAll = ensureOverviewForCurrentSelection(false);
          if (pAll && typeof pAll.finally === 'function') {
            pAll.finally(function () {
              syncRefreshStudentBtn(false);
            });
          } else {
            syncRefreshStudentBtn(false);
          }
          return;
        }
        if (activeTabId() === 'overview') {
          var pOv = ensureOverviewForCurrentSelection(false);
          if (pOv && typeof pOv.finally === 'function') {
            pOv.finally(function () {
              syncRefreshStudentBtn(false);
            });
          } else {
            syncRefreshStudentBtn(false);
          }
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
          var pOv = ensureOverviewForCurrentSelection(true);
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
        var resetAdvice = ev.target.closest('#jml-advice-reset');
        if (resetAdvice && statsBody.contains(resetAdvice)) {
          ev.preventDefault();
          void fetchPracticeAdviceForSelectedUser(true);
          return;
        }
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
              perfectSquare: d && d.perfectSquare && d.perfectSquare.ok ? d.perfectSquare : null,
              divisibility: d && d.divisibility && d.divisibility.ok ? d.divisibility : null,
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
    var backfillRunSpeed = document.getElementById('jml-backfill-run-speed-btn');
    if (backfillRunSpeed) {
      backfillRunSpeed.addEventListener('click', function () {
        if (backfillRunSpeed.disabled) return;
        if (
          !window.confirm(
            '临时维护：全库扫描训练 / 小数 / 平方数 / 整除 Z1–Z4 局，按 attempts 写回 runAvgSec（仅答对几何均，不含开局加权速）。\n\n确认执行？（Render 需已部署对应 API）'
          )
        ) {
          return;
        }
        backfillRunSpeed.disabled = true;
        var prevLabel = backfillRunSpeed.textContent;
        backfillRunSpeed.textContent = '回填中…';
        apiFetch('/api/admin/maintenance/backfill-training-run-speed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then(function (d) {
            if (!d || d.ok !== true) {
              window.alert('回填失败：' + ((d && d.error) || '返回异常'));
              return;
            }
            window.alert(
              '回填完成\n' +
                '学员数：' +
                d.usersScanned +
                '\n扫描局数：' +
                (d.runsScanned != null ? d.runsScanned : d.trainingRunsScanned) +
                '\n  训练：' +
                (d.trainingRunsScanned || 0) +
                '\n  小数：' +
                (d.decimalRunsScanned || 0) +
                '\n  平方：' +
                (d.perfectSquareRunsScanned || 0) +
                '\n  整除Z1–4：' +
                (d.divisibilityRunsScanned || 0) +
                '\n已更新：' +
                d.updated +
                '\n写入磁盘：' +
                (d.written ? '是' : '否（无变更）') +
                (d.skippedNoAttempts ? '\n无 attempts 跳过：' + d.skippedNoAttempts : '') +
                (d.skippedZ5 ? '\n整除Z5 跳过：' + d.skippedZ5 : '')
            );
            if (state.selectedUsername) {
              return loadStudentData();
            }
          })
          .catch(function (e) {
            window.alert('回填失败：' + (e.message || String(e)));
          })
          .finally(function () {
            backfillRunSpeed.disabled = false;
            backfillRunSpeed.textContent = prevLabel;
          });
      });
    }
  }

  window.JmlReportPage = {
    init: function () {
      showApiWarning();
      syncReportDocumentLang();
      syncReportLangBtn();
      readStoredOverviewSort();
      state.userScope = readStoredUserScope();
      updateScopeButtons();
      bindEvents();

      var urlUser = getUserFromUrl();
      // 深链：立刻拉单人概览上屏，不挡在 i18n / user-list 后面
      if (urlUser) {
        void bootstrapDeepLinkOverview(urlUser);
      } else {
        showOverviewTabChrome();
      }

      // 其余冷启动并行后台做
      void loadReportI18n();
      void loadLevelCohort();
      loadUserList()
        .then(function () {
          updateTitleCount();
          if (urlUser) {
            finalizeDeepLinkAfterUserList(urlUser);
          } else {
            void ensureOverviewForCurrentSelection(false);
          }
        })
        .catch(function () {
          /* loadUserList 已 showGlobalError */
        });
    },
  };
})();

