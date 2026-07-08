/**
 * 后台管理：账号 / 等级 / 头像 / 备份（调用 server/server.js 的 /api/admin/*）
 * 迁入自小程序版管理端，按当前 H5 后端接口做了适配。
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

  /** 管理端年级下拉：0=学前，1–12 为年级 */
  var GRADE_OPTIONS = [{ value: 0, label: '学前' }];
  for (var _g = 1; _g <= 12; _g++) {
    GRADE_OPTIONS.push({ value: _g, label: String(_g) });
  }

  var LEVEL_DESC_ZH = LEVEL_NAMES.map(function (n) {
    return String(n || '').replace(/^第\s*\d+\s*级\s*·\s*/, '').trim();
  });

  var LEVEL_DESC_EN = [
    'Single-digit addition intro',
    'Single-digit addition with carrying',
    'Single-digit mixed addition and subtraction',
    'Two-digit addition and subtraction basics',
    'Two-digit plus one-digit or tens',
    'Two-digit minus one-digit or tens',
    'Two-digit plus two-digit (with carrying)',
    'Two-digit minus two-digit (with borrowing)',
    'Two-digit mixed addition and subtraction',
    'Multiplication table basics',
    'Two-digit divided by one-digit (exact)',
    'Two-digit plus two-digit (sum over 100)',
    'Two-digit times one-digit',
    'Inverse of two-digit times one-digit',
    'Four operations without parentheses',
    'Four operations with parentheses',
  ];

  var state = {
    users: [],
    sortKey: 'lastGameTs',
    sortDir: -1,
    levels: null,
    avatars: [],
    selectedAvatarId: '',
    avatarDragFrom: -1,
    i18n: null,
    feedback: [],
    feedbackUnreadOnly: false,
  };

  var FEEDBACK_CATEGORY_LABELS = {
    bug: 'Bug',
    suggestion: '建议',
    account: '账号',
    other: '其他',
  };

  function apiBase() {
    var base = (window.__JML_API_BASE__ || window.API_BASE_URL || '').trim();
    return base.replace(/\/+$/, '');
  }

  function adminPin() {
    return (window.__JML_ADMIN_PIN__ || '').trim();
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('jml-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'jml-status' + (kind ? ' ' + kind : '');
  }

  function showApiWarning() {
    var w = document.getElementById('jml-api-warning');
    if (!w) return;
    w.hidden = !!apiBase();
  }

  async function apiFetch(path, options) {
    var base = apiBase();
    if (!base) throw new Error('未配置 API 地址');
    var headers = Object.assign(
      {
        'X-Admin-Pin': adminPin(),
      },
      (options && options.headers) || {},
    );
    if (options && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    var opts = Object.assign({}, options || {}, { headers: headers });
    var res = await fetch(base + path, opts);
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = { ok: false, error: '响应不是 JSON' };
    }
    if (!res.ok) {
      throw new Error((data && data.error) || ('请求失败：' + res.status));
    }
    if (data && data.ok === false) {
      throw new Error(data.error || '操作失败');
    }
    return data;
  }

  function formatDateTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '-';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
  }

  function sortUsers() {
    var list = state.users.slice();
    var key = state.sortKey;
    var dir = state.sortDir;
    list.sort(function (a, b) {
      var va;
      var vb;
      if (key === 'username') {
        va = (a.username || '').toLowerCase();
        vb = (b.username || '').toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      }
      va = key === 'lastGameTs' ? (a.lastGameTs || 0) : (a.totalScore != null ? a.totalScore : 0);
      vb = key === 'lastGameTs' ? (b.lastGameTs || 0) : (b.totalScore != null ? b.totalScore : 0);
      return (va - vb) * dir;
    });
    return list;
  }

  function updateSortHeaders() {
    document.querySelectorAll('.jml-user-table th.sortable').forEach(function (th) {
      var k = th.getAttribute('data-sort');
      var icon = '';
      if (k === state.sortKey) icon = state.sortDir < 0 ? ' ↓' : ' ↑';
      th.textContent = th.getAttribute('data-label') + icon;
    });
  }

  async function setUserTester(username, isTester) {
    if (!username) return;
    setStatus('更新测试员标记…', '');
    try {
      await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTester: !!isTester }),
      });
      var u = state.users.find(function (x) {
        return x.username === username;
      });
      if (u) u.isTester = !!isTester;
      setStatus((isTester ? '已设为测试员：' : '已取消测试员：') + username, 'ok');
      renderUsersTable();
    } catch (e) {
      setStatus(e.message || '更新失败', 'err');
      renderUsersTable();
    }
  }

  async function setUserVip(username, isVip) {
    if (!username) return;
    setStatus('更新 VIP 标记…', '');
    try {
      await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVip: !!isVip }),
      });
      var u = state.users.find(function (x) {
        return x.username === username;
      });
      if (u) u.isVip = !!isVip;
      setStatus((isVip ? '已设为 VIP：' : '已取消 VIP：') + username, 'ok');
      renderUsersTable();
    } catch (e) {
      setStatus(e.message || '更新失败', 'err');
      renderUsersTable();
    }
  }

  async function setUserGrade(username, grade) {
    if (!username) return;
    setStatus('更新年级…', '');
    try {
      await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: grade }),
      });
      var u = state.users.find(function (x) {
        return x.username === username;
      });
      if (u) u.grade = grade;
      setStatus('已更新年级：' + username, 'ok');
    } catch (e) {
      setStatus(e.message || '更新年级失败', 'err');
      renderUsersTable();
    }
  }

  async function setUserAdminNote(username, adminNote) {
    if (!username) return;
    setStatus('更新备注…', '');
    try {
      await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: adminNote }),
      });
      var u = state.users.find(function (x) {
        return x.username === username;
      });
      if (u) u.adminNote = adminNote;
      setStatus('已更新备注：' + username, 'ok');
    } catch (e) {
      setStatus(e.message || '更新备注失败', 'err');
      renderUsersTable();
    }
  }

  function renderUsersTable() {
    var tbody = document.getElementById('jml-users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    updateSortHeaders();
    var list = sortUsers();
    if (!list.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 10;
      td.style.textAlign = 'center';
      td.style.color = '#64748b';
      td.style.padding = '24px';
      td.textContent = '暂无学员，请点击「创建账户」添加。';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    list.forEach(function (u) {
      var username = u.username || '';
      var tr = document.createElement('tr');
      function tdText(text, cls) {
        var td = document.createElement('td');
        if (cls) td.className = cls;
        td.textContent = text;
        return td;
      }
      var tdUser = document.createElement('td');
      var userLink = document.createElement('a');
      userLink.className = 'jml-user-report-link';
      userLink.href = '../report/index.html?user=' + encodeURIComponent(username);
      userLink.textContent = username || '';
      userLink.title = '查看学员数据';
      tdUser.appendChild(userLink);
      tr.appendChild(tdUser);

      var tdGrade = document.createElement('td');
      tdGrade.className = 'jml-col-grade';
      var gradeSelect = document.createElement('select');
      gradeSelect.setAttribute('aria-label', '年级：' + username);
      var gradeEmpty = document.createElement('option');
      gradeEmpty.value = '';
      gradeEmpty.textContent = '—';
      gradeSelect.appendChild(gradeEmpty);
      GRADE_OPTIONS.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
        gradeSelect.appendChild(o);
      });
      var currentGrade = u.grade;
      if (currentGrade === 0 || (typeof currentGrade === 'number' && currentGrade >= 1 && currentGrade <= 12)) {
        gradeSelect.value = String(currentGrade);
      } else {
        gradeSelect.value = '';
      }
      gradeSelect.addEventListener('change', function () {
        var raw = gradeSelect.value;
        var nextGrade = raw === '' ? null : Number(raw);
        gradeSelect.disabled = true;
        setUserGrade(username, nextGrade).finally(function () {
          gradeSelect.disabled = false;
        });
      });
      tdGrade.appendChild(gradeSelect);
      tr.appendChild(tdGrade);

      var tdNote = document.createElement('td');
      tdNote.className = 'jml-col-admin-note';
      var noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.maxLength = 20;
      noteInput.placeholder = '备注';
      noteInput.value = typeof u.adminNote === 'string' ? u.adminNote : '';
      noteInput.setAttribute('aria-label', '备注：' + username);
      noteInput.addEventListener('blur', function () {
        var next = noteInput.value.trim();
        var prev = typeof u.adminNote === 'string' ? u.adminNote.trim() : '';
        if (next === prev) return;
        noteInput.disabled = true;
        setUserAdminNote(username, next).finally(function () {
          noteInput.disabled = false;
        });
      });
      tdNote.appendChild(noteInput);
      tr.appendChild(tdNote);

      var tdPwd = document.createElement('td');
      tdPwd.className = 'pwd-mask';
      tdPwd.textContent = '****';
      tr.appendChild(tdPwd);
      tr.appendChild(tdText((u.nickname && String(u.nickname).trim()) || '-', ''));
      tr.appendChild(tdText(formatDateTime(u.lastGameTs), ''));
      tr.appendChild(tdText(u.totalScore != null ? String(u.totalScore) : '0', 'num'));

      var tdTester = document.createElement('td');
      tdTester.className = 'jml-col-tester';
      var testerLabel = document.createElement('label');
      testerLabel.className = 'jml-tester-switch';
      testerLabel.title = '开启后，该账号在拆括号内测时可看到错误选项后的错因编号；排行榜可查看完整榜单';
      var testerInput = document.createElement('input');
      testerInput.type = 'checkbox';
      testerInput.checked = u.isTester === true;
      testerInput.setAttribute('aria-label', '测试员：' + (u.username || ''));
      var testerUi = document.createElement('span');
      testerUi.className = 'jml-tester-switch-ui';
      testerUi.setAttribute('aria-hidden', 'true');
      testerLabel.appendChild(testerInput);
      testerLabel.appendChild(testerUi);
      testerInput.addEventListener('change', function () {
        var want = testerInput.checked;
        testerInput.disabled = true;
        setUserTester(username, want).finally(function () {
          testerInput.disabled = false;
        });
      });
      tdTester.appendChild(testerLabel);
      tr.appendChild(tdTester);

      var tdVip = document.createElement('td');
      tdVip.className = 'jml-col-vip';
      var vipLabel = document.createElement('label');
      vipLabel.className = 'jml-vip-switch';
      vipLabel.title = 'VIP 用户标记，仅管理端可见';
      var vipInput = document.createElement('input');
      vipInput.type = 'checkbox';
      vipInput.checked = u.isVip === true;
      vipInput.setAttribute('aria-label', 'VIP：' + (u.username || ''));
      var vipUi = document.createElement('span');
      vipUi.className = 'jml-vip-switch-ui';
      vipUi.setAttribute('aria-hidden', 'true');
      vipLabel.appendChild(vipInput);
      vipLabel.appendChild(vipUi);
      vipInput.addEventListener('change', function () {
        var want = vipInput.checked;
        vipInput.disabled = true;
        setUserVip(username, want).finally(function () {
          vipInput.disabled = false;
        });
      });
      tdVip.appendChild(vipLabel);
      tr.appendChild(tdVip);

      var tdAct = document.createElement('td');
      tdAct.className = 'jml-actions-wrap';
      var wrap = document.createElement('div');
      wrap.className = 'jml-actions';
      var det = document.createElement('details');
      var sum = document.createElement('summary');
      sum.textContent = '操作 ▾';
      det.appendChild(sum);
      var menu = document.createElement('div');
      menu.className = 'jml-menu';

      function menuBtn(label, onClick, danger) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (danger) b.className = 'danger';
        b.addEventListener('click', function (e) {
          e.preventDefault();
          det.removeAttribute('open');
          onClick();
        });
        return b;
      }

      menu.appendChild(menuBtn('重置密码', function () { openResetPasswordModal(username); }));
      menu.appendChild(menuBtn('修改积分', function () { openScoreModal(username, u.totalScore != null ? u.totalScore : 0); }));
      menu.appendChild(menuBtn('删除账户', function () { openDeleteModal(username); }, true));

      det.appendChild(menu);
      det.addEventListener('toggle', function () {
        if (det.open) {
          document.querySelectorAll('.jml-actions details').forEach(function (other) {
            if (other !== det) other.removeAttribute('open');
          });
        }
      });
      wrap.appendChild(det);
      tdAct.appendChild(wrap);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  async function loadUsers() {
    showApiWarning();
    if (!apiBase()) {
      setStatus('请先配置 API 地址（docs/config.js）。', 'err');
      return;
    }
    setStatus('加载学员中…', '');
    try {
      var data = await apiFetch('/api/admin/users', { method: 'GET' });
      state.users = Array.isArray(data.users) ? data.users : [];
      setStatus('已加载 ' + state.users.length + ' 个账户', 'ok');
      renderUsersTable();
    } catch (e) {
      setStatus(e.message || '加载失败', 'err');
    }
  }

  function feedbackCategoryLabel(cat) {
    return FEEDBACK_CATEGORY_LABELS[cat] || cat || '-';
  }

  function truncateFeedbackMessage(msg, maxLen) {
    var s = String(msg || '');
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '…';
  }

  function renderFeedbackTable() {
    var tbody = document.getElementById('jml-feedback-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var list = (state.feedback || []).slice();
    if (state.feedbackUnreadOnly) {
      list = list.filter(function (x) { return !x.read; });
    }
    if (!list.length) {
      var trEmpty = document.createElement('tr');
      var tdEmpty = document.createElement('td');
      tdEmpty.colSpan = 7;
      tdEmpty.textContent = state.feedbackUnreadOnly ? '暂无未读反馈。' : '暂无用户反馈。';
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      return;
    }
    list.forEach(function (item) {
      var tr = document.createElement('tr');
      if (!item.read) tr.className = 'jml-feedback-unread';
      var tdTime = document.createElement('td');
      tdTime.textContent = formatDateTime(item.createdAt);
      tr.appendChild(tdTime);
      var tdUser = document.createElement('td');
      tdUser.textContent = item.username || '-';
      tr.appendChild(tdUser);
      var tdCat = document.createElement('td');
      tdCat.textContent = feedbackCategoryLabel(item.category);
      tr.appendChild(tdCat);
      var tdMsg = document.createElement('td');
      tdMsg.className = 'jml-feedback-message';
      tdMsg.title = item.message || '';
      tdMsg.textContent = truncateFeedbackMessage(item.message, 120);
      tr.appendChild(tdMsg);
      var tdEmail = document.createElement('td');
      var email = String(item.contactEmail || '').trim();
      if (email) {
        var mailLink = document.createElement('a');
        mailLink.href = 'mailto:' + encodeURIComponent(email)
          + '?subject=' + encodeURIComponent('Re: Jarvis Math Lab 用户反馈')
          + '&body=' + encodeURIComponent('您好，\n\n关于您提交的反馈：\n\n');
        mailLink.textContent = email;
        mailLink.className = 'jml-feedback-mail';
        tdEmail.appendChild(mailLink);
      } else {
        tdEmail.textContent = '-';
      }
      tr.appendChild(tdEmail);
      var tdRead = document.createElement('td');
      tdRead.textContent = item.read ? '已读' : '未读';
      tr.appendChild(tdRead);
      var tdAct = document.createElement('td');
      var actWrap = document.createElement('div');
      actWrap.className = 'jml-feedback-actions';
      if (email) {
        var replyBtn = document.createElement('a');
        replyBtn.href = 'mailto:' + encodeURIComponent(email)
          + '?subject=' + encodeURIComponent('Re: Jarvis Math Lab 用户反馈')
          + '&body=' + encodeURIComponent('您好，\n\n关于您提交的反馈：\n\n');
        replyBtn.className = 'jml-btn jml-btn-sm';
        replyBtn.textContent = '回复';
        actWrap.appendChild(replyBtn);
      }
      if (!item.read) {
        var readBtn = document.createElement('button');
        readBtn.type = 'button';
        readBtn.className = 'jml-btn jml-btn-sm';
        readBtn.textContent = '标已读';
        readBtn.addEventListener('click', function () {
          markFeedbackRead(item.id, true);
        });
        actWrap.appendChild(readBtn);
      } else {
        var unreadBtn = document.createElement('button');
        unreadBtn.type = 'button';
        unreadBtn.className = 'jml-btn jml-btn-sm';
        unreadBtn.textContent = '标未读';
        unreadBtn.addEventListener('click', function () {
          markFeedbackRead(item.id, false);
        });
        actWrap.appendChild(unreadBtn);
      }
      tdAct.appendChild(actWrap);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function countFeedbackUnread(list) {
    return (list || []).filter(function (x) { return !x.read; }).length;
  }

  function updateFeedbackTabBadge(unread) {
    var badge = document.getElementById('jml-feedback-tab-badge');
    if (!badge) return;
    var n = Number(unread) || 0;
    if (n <= 0) {
      badge.hidden = true;
      badge.textContent = '';
      badge.removeAttribute('aria-label');
      return;
    }
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.setAttribute('aria-label', '未读反馈 ' + n + ' 条');
  }

  async function refreshFeedbackUnreadBadge() {
    if (!apiBase()) return;
    try {
      var data = await apiFetch('/api/admin/feedback', { method: 'GET' });
      state.feedback = Array.isArray(data.items) ? data.items : [];
      updateFeedbackTabBadge(countFeedbackUnread(state.feedback));
    } catch (e) {
      /* 角标加载失败时静默，不影响其它 Tab */
    }
  }

  async function loadFeedback() {
    showApiWarning();
    if (!apiBase()) {
      setStatus('请先配置 API 地址（docs/config.js）。', 'err');
      return;
    }
    setStatus('加载反馈中…', '');
    try {
      var data = await apiFetch('/api/admin/feedback', { method: 'GET' });
      state.feedback = Array.isArray(data.items) ? data.items : [];
      var unread = countFeedbackUnread(state.feedback);
      updateFeedbackTabBadge(unread);
      setStatus('已加载 ' + state.feedback.length + ' 条反馈（未读 ' + unread + '）', 'ok');
      renderFeedbackTable();
    } catch (e) {
      setStatus(e.message || '加载失败', 'err');
    }
  }

  async function markFeedbackRead(id, read) {
    if (!id) return;
    try {
      await apiFetch('/api/admin/feedback/' + encodeURIComponent(id), {
        method: 'PUT',
        body: JSON.stringify({ read: !!read }),
      });
      state.feedback = (state.feedback || []).map(function (x) {
        if (x.id === id) return Object.assign({}, x, { read: !!read });
        return x;
      });
      renderFeedbackTable();
      var unread = countFeedbackUnread(state.feedback);
      updateFeedbackTabBadge(unread);
      setStatus(read ? '已标记为已读（未读 ' + unread + '）' : '已标记为未读', 'ok');
    } catch (e) {
      setStatus(e.message || '更新失败', 'err');
    }
  }

  function activeTabId() {
    var btn = document.querySelector('.jml-tab.active');
    return btn ? btn.getAttribute('data-tab') : 'accounts';
  }

  function switchTab(id) {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === id);
    });
    document.querySelectorAll('.jml-tab-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== id);
    });
    if (id === 'achievements' && typeof JmlAdminAchievements !== 'undefined') {
      JmlAdminAchievements.onTabShow();
    }
  }

  var modal = document.getElementById('jml-modal-overlay');
  var modalTitle = document.getElementById('jml-modal-title');
  var modalBody = document.getElementById('jml-modal-body');
  var modalActions = document.getElementById('jml-modal-actions');

  function closeModal() {
    if (modal) modal.hidden = true;
    if (modalBody) modalBody.innerHTML = '';
    if (modalActions) modalActions.innerHTML = '';
  }

  function openModal(title, bodyHtml, actions) {
    if (!modal || !modalTitle || !modalBody || !modalActions) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalActions.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jml-btn' + (a.primary ? ' jml-btn-primary' : '') + (a.danger ? ' jml-btn-danger' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.onClick) a.onClick();
      });
      modalActions.appendChild(b);
    });
    modal.hidden = false;
  }

  function fieldHtml(id, label, inputHtml) {
    return '<div class="jml-field"><label for="' + id + '">' + label + '</label>' + inputHtml + '</div>';
  }

  function isValidAdminUsername(s) {
    if (typeof s !== 'string' || s.length < 2 || s.length > 20) return false;
    return /^[a-zA-Z0-9_]+$/.test(s);
  }

  function openCreateUserModal() {
    openModal(
      '创建账户',
      fieldHtml('jml-new-user', '用户名', '<input id="jml-new-user" type="text" autocomplete="off" placeholder="2-20位，字母数字下划线" />') +
        fieldHtml('jml-new-pass', '密码', '<input id="jml-new-pass" type="text" autocomplete="new-password" />'),
      [
        { label: '取消', onClick: closeModal },
        {
          label: '创建',
          primary: true,
          onClick: async function () {
            var u = (document.getElementById('jml-new-user').value || '').trim();
            var p = (document.getElementById('jml-new-pass').value || '').trim();
            if (!u || !p) return;
            if (!isValidAdminUsername(u)) {
              setStatus('用户名 2-20 位，仅支持字母、数字、下划线', 'err');
              return;
            }
            try {
              setStatus('创建中…', '');
              await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
              closeModal();
              await loadUsers();
            } catch (e) {
              setStatus(e.message || '创建失败', 'err');
            }
          },
        },
      ],
    );
  }

  function openResetPasswordModal(username) {
    openModal(
      '重置密码',
      '<div class="muted" style="margin:0 0 10px;">用户：<code>' + username + '</code></div>' +
        fieldHtml('jml-reset-pass', '新密码', '<input id="jml-reset-pass" type="text" autocomplete="new-password" />'),
      [
        { label: '取消', onClick: closeModal },
        {
          label: '保存',
          primary: true,
          onClick: async function () {
            var p = (document.getElementById('jml-reset-pass').value || '').trim();
            if (!p) return;
            try {
              setStatus('保存中…', '');
              await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
                method: 'PUT',
                body: JSON.stringify({ password: p }),
              });
              closeModal();
              await loadUsers();
            } catch (e) {
              setStatus(e.message || '保存失败', 'err');
            }
          },
        },
      ],
    );
  }

  function openScoreModal(username, curScore) {
    openModal(
      '修改积分',
      '<div class="muted" style="margin:0 0 10px;">用户：<code>' + username + '</code></div>' +
        fieldHtml('jml-score', '总积分', '<input id="jml-score" type="number" value="' + String(curScore || 0) + '" />'),
      [
        { label: '取消', onClick: closeModal },
        {
          label: '保存',
          primary: true,
          onClick: async function () {
            var v = Number(document.getElementById('jml-score').value);
            if (!Number.isFinite(v)) return;
            try {
              setStatus('保存中…', '');
              await apiFetch('/api/admin/users/' + encodeURIComponent(username), {
                method: 'PUT',
                body: JSON.stringify({ totalScore: Math.max(0, Math.floor(v)) }),
              });
              closeModal();
              await loadUsers();
            } catch (e) {
              setStatus(e.message || '保存失败', 'err');
            }
          },
        },
      ],
    );
  }

  function openDeleteModal(username) {
    openModal(
      '删除账户',
      '<div class="muted" style="margin:0;line-height:1.55;">' +
        '确认删除 <code>' + username + '</code>？此操作<strong>不可撤销</strong>。' +
        '</div>' +
        '<ul class="muted" style="margin:10px 0 0;padding-left:1.2em;line-height:1.5;font-size:0.9rem;">' +
        '<li>学员档案（积分、成就、进度、错题等）</li>' +
        '<li>完整练习记录（runs）</li>' +
        '<li>生存榜 / 闯关达人榜 / 质数达人榜中的该用户条目</li>' +
        '<li>该用户提交的反馈</li>' +
        '</ul>' +
        '<p class="muted" style="margin:10px 0 0;font-size:0.85rem;">建议先在「系统备份」中下载全部备份。</p>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '删除',
          danger: true,
          onClick: async function () {
            try {
              setStatus('删除中…', '');
              var data = await apiFetch('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' });
              closeModal();
              await loadUsers();
              var p = data && data.purged ? data.purged : {};
              var parts = ['账户已删除：' + username];
              if (p.runs != null) parts.push('runs ' + p.runs + ' 条');
              if (p.feedback != null && p.feedback > 0) parts.push('反馈 ' + p.feedback + ' 条');
              if ((p.survivalRanking || 0) + (p.levelRanking || 0) + (p.primeRanking || 0) > 0) {
                parts.push('榜单 ' + ((p.survivalRanking || 0) + (p.levelRanking || 0) + (p.primeRanking || 0)) + ' 条');
              }
              setStatus(parts.join('；'), 'ok');
            } catch (e) {
              setStatus(e.message || '删除失败', 'err');
            }
          },
        },
      ],
    );
  }

  function renderLevelsTable(levels) {
    var tbody = document.getElementById('jml-levels-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (levels || []).forEach(function (row, i) {
      var tr = document.createElement('tr');
      function td(el) {
        var cell = document.createElement('td');
        if (typeof el === 'string') {
          cell.textContent = el;
        } else {
          cell.appendChild(el);
        }
        tr.appendChild(cell);
      }
      td('L' + (i + 1));
      function descInput(val, k) {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = val != null ? String(val) : '';
        inp.setAttribute('data-k', k);
        inp.style.width = '100%';
        return inp;
      }
      td(descInput(row.descZhHant, 'descZhHant'));
      td(descInput(row.descEn, 'descEn'));

      function numInput(val, k) {
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(val != null ? val : '');
        inp.setAttribute('data-k', k);
        return inp;
      }
      td(numInput(Math.round((row.upgradeAccuracy || 0) * 100), 'upgradeAccuracy'));
      tbody.appendChild(tr);
    });
  }

  function normalizeLevelsFromServer(levels) {
    var arr = Array.isArray(levels) ? levels : [];
    return Array.from({ length: 16 }, function (_, i) {
      var src = arr[i] || {};
      var legacyDesc = typeof src.desc === 'string' ? src.desc.trim() : '';
      var descZh =
        typeof src.descZhHant === 'string' && src.descZhHant.trim()
          ? src.descZhHant.trim()
          : legacyDesc || LEVEL_DESC_ZH[i] || '';
      var descEn =
        typeof src.descEn === 'string' && src.descEn.trim()
          ? src.descEn.trim()
          : LEVEL_DESC_EN[i] || '';
      return {
        descZhHant: descZh,
        descEn: descEn,
        upgradeAccuracy: Number.isFinite(Number(src.upgradeAccuracy)) ? Number(src.upgradeAccuracy) : 0.95,
      };
    });
  }

  async function loadLevels() {
    setStatus('加载等级设置中…', '');
    try {
      var data = await apiFetch('/api/admin/settings', { method: 'GET' });
      var levels = normalizeLevelsFromServer(data.settings && data.settings.levels);
      state.levels = levels;
      renderLevelsTable(levels);
      setStatus('等级设置已加载', 'ok');
    } catch (e) {
      setStatus(e.message || '加载失败', 'err');
    }
  }

  async function saveLevels() {
    var tbody = document.getElementById('jml-levels-tbody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    var levels = rows.map(function (tr, i) {
      var inputs = tr.querySelectorAll('input[data-k]');
      var out = normalizeLevelsFromServer([])[i];
      inputs.forEach(function (inp) {
        var k = inp.getAttribute('data-k');
        var v = inp.value;
        if (k === 'descZhHant') out.descZhHant = String(v || '').trim();
        if (k === 'descEn') out.descEn = String(v || '').trim();
        if (k === 'upgradeAccuracy') out.upgradeAccuracy = Math.max(0, Math.min(1, (Number(v) || 0) / 100));
      });
      return out;
    });
    setStatus('保存中…', '');
    try {
      await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ levels: levels }) });
      setStatus('已保存', 'ok');
    } catch (e) {
      setStatus(e.message || '保存失败', 'err');
    }
  }

  function avatarRowHtml(a, idx) {
    var checked = state.selectedAvatarId && a.id === state.selectedAvatarId ? ' checked' : '';
    var img = a.imageUrl ? String(a.imageUrl) : '';
    var thumb = img ? '<img class="jml-avatar-thumb" src="' + img + '" />' : '<div class="jml-avatar-thumb"></div>';
    var enabledText = a.enabled !== false ? '启用' : '停用';
    var enabledCls = a.enabled !== false ? 'ok' : 'off';
    return (
      '<tr class="jml-avatar-row" draggable="true" data-id="' +
      escapeHtml(a.id) +
      '">' +
      '<td><input class="jml-avatar-select" type="radio" name="jml-avatar-selected" value="' +
      escapeHtml(a.id) +
      '"' +
      checked +
      ' /></td>' +
      '<td class="num">' +
      String(idx + 1) +
      '<span class="jml-avatar-drag-handle" title="拖拽排序">⠿</span></td>' +
      '<td>' +
      thumb +
      '</td>' +
      '<td><div class="jml-avatar-name-text">' + escapeHtml(a.name || '') + '</div></td>' +
      '<td class="num">' + escapeHtml(String(a.unlockLevel != null ? a.unlockLevel : 1)) + '</td>' +
      '<td><span class="jml-badge ' + enabledCls + '">' + enabledText + '</span></td>' +
      '</tr>'
    );
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function enforceAvatarOrdering() {
    // 规则：启用在前；按解锁等级升序；同等级保持当前相对顺序（可通过拖拽改变）
    var list = state.avatars || [];
    var seq = new Map();
    list.forEach(function (x, i) {
      seq.set(x && x.id, i);
    });
    list.sort(function (a, b) {
      var ea = a && a.enabled !== false ? 1 : 0;
      var eb = b && b.enabled !== false ? 1 : 0;
      if (ea !== eb) return eb - ea;
      var sa = Number(a && a.unlockLevel) || 1;
      var sb = Number(b && b.unlockLevel) || 1;
      if (sa !== sb) return sa - sb;
      var ia = seq.get(a && a.id);
      var ib = seq.get(b && b.id);
      ia = typeof ia === 'number' ? ia : 0;
      ib = typeof ib === 'number' ? ib : 0;
      return ia - ib;
    });
  }

  function wireAvatarRowDnD(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr.jml-avatar-row').forEach(function (tr) {
      tr.addEventListener('dragstart', function () {
        state.avatarDragFrom = Array.from(tbody.children).indexOf(tr);
        tr.classList.add('dragging');
      });
      tr.addEventListener('dragend', function () {
        tr.classList.remove('dragging');
        tbody.querySelectorAll('tr').forEach(function (x) {
          x.classList.remove('drag-over-top');
          x.classList.remove('drag-over-bottom');
        });
      });
      tr.addEventListener('dragover', function (e) {
        e.preventDefault();
        var rect = tr.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        tr.classList.toggle('drag-over-top', before);
        tr.classList.toggle('drag-over-bottom', !before);
      });
      tr.addEventListener('dragleave', function () {
        tr.classList.remove('drag-over-top');
        tr.classList.remove('drag-over-bottom');
      });
      tr.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = state.avatarDragFrom;
        if (from < 0) return;
        var rows = Array.from(tbody.children);
        var to = rows.indexOf(tr);
        if (to < 0 || to === from) return;
        var rect = tr.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        var item = state.avatars.splice(from, 1)[0];
        var insertAt = before ? to : to + 1;
        if (insertAt > state.avatars.length) insertAt = state.avatars.length;
        state.avatars.splice(insertAt, 0, item);
        // 若跨等级组拖拽，会被自动重排回规则顺序
        var targetId = tr.getAttribute('data-id') || '';
        var targetItem = state.avatars.find(function (x) { return x && x.id === targetId; });
        var srcLevel = Number(item && item.unlockLevel) || 1;
        var tgtLevel = Number(targetItem && targetItem.unlockLevel) || 1;
        if (srcLevel !== tgtLevel) {
          setStatus('拖拽仅用于同等级内排序；已自动重排', 'err');
        }
        enforceAvatarOrdering();
        renderAvatarsTable();
        openModal(
          '保存排序',
          '<div class="muted" style="margin:0;line-height:1.55;">你刚调整了头像顺序。是否立即保存到服务器？</div>',
          [
            { label: '取消', onClick: closeModal },
            {
              label: '保存',
              primary: true,
              onClick: async function () {
                closeModal();
                await saveAvatars();
              },
            },
          ],
        );
      });
    });
  }

  function syncSelectedAvatarIdFromDom() {
    var sel = document.querySelector('input[name="jml-avatar-selected"]:checked');
    state.selectedAvatarId = sel ? sel.value : state.selectedAvatarId;
  }

  function renderAvatarsTable() {
    var tbody = document.getElementById('jml-avatars-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.avatars.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px;">暂无头像。可以点击「上传头像」或「批量导入」。</td></tr>';
      return;
    }
    tbody.innerHTML = state.avatars.map(function (a, i) { return avatarRowHtml(a, i); }).join('');
    tbody.querySelectorAll('input.jml-avatar-select').forEach(function (r) {
      r.addEventListener('change', function () {
        state.selectedAvatarId = r.value;
      });
    });
    wireAvatarRowDnD(tbody);
  }

  async function loadAvatars() {
    setStatus('加载头像中…', '');
    try {
      var data = await apiFetch('/api/admin/avatars', { method: 'GET' });
      state.avatars = Array.isArray(data.avatars) ? data.avatars : [];
      enforceAvatarOrdering();
      setStatus('头像已加载', 'ok');
      renderAvatarsTable();
    } catch (e) {
      setStatus(e.message || '加载失败', 'err');
    }
  }

  async function saveAvatars() {
    syncSelectedAvatarIdFromDom();
    enforceAvatarOrdering();
    setStatus('保存头像中…', '');
    try {
      // order 字段仅用于“同等级内的手动排序”
      var orderWithin = {};
      state.avatars.forEach(function (a) {
        var key = (a && a.enabled !== false ? '1' : '0') + '_' + String(Number(a && a.unlockLevel) || 1);
        orderWithin[key] = orderWithin[key] || 0;
        a.__orderWithin = orderWithin[key];
        orderWithin[key] += 1;
      });
      var payload = {
        avatars: state.avatars.map(function (a, i) {
          return {
            id: a.id,
            name: a.name || '',
            unlockLevel: Math.max(1, Math.floor(Number(a.unlockLevel) || 1)),
            order: Number.isFinite(Number(a.__orderWithin)) ? Number(a.__orderWithin) : 0,
            enabled: a.enabled !== false,
          };
        }),
      };
      var data = await apiFetch('/api/admin/avatars', { method: 'PUT', body: JSON.stringify(payload) });
      state.avatars = Array.isArray(data.avatars) ? data.avatars : state.avatars;
      state.avatars.forEach(function (a) { delete a.__orderWithin; });
      enforceAvatarOrdering();
      setStatus('头像已保存', 'ok');
      renderAvatarsTable();
    } catch (e) {
      setStatus(e.message || '保存失败', 'err');
    }
  }

  function openAvatarUploadModal() {
    openModal(
      '上传头像',
      '<div class="muted" style="margin:0 0 10px;">选择图片后自动压缩为 256×256 再上传（png/jpg/webp）。</div>' +
        '<div class="jml-field"><input id="jml-avatar-file" type="file" accept="image/*" /></div>' +
        fieldHtml('jml-avatar-name', '头像名', '<input id="jml-avatar-name" type="text" />') +
        fieldHtml('jml-avatar-unlock', '解锁等级', '<input id="jml-avatar-unlock" type="number" min="1" step="1" value="1" />'),
      [
        { label: '取消', onClick: closeModal },
        {
          label: '上传',
          primary: true,
          onClick: async function () {
            var fileInput = document.getElementById('jml-avatar-file');
            var f = fileInput && fileInput.files && fileInput.files[0];
            if (!f) return;
            var name = (document.getElementById('jml-avatar-name').value || '').trim();
            var unlock = Math.max(1, Math.floor(Number(document.getElementById('jml-avatar-unlock').value) || 1));
            try {
              setStatus('第 1/2 步：正在读取并压缩图片（256×256）…', '');
              var normalized = await normalizeUploadFile(f);
              var kb = Math.max(1, Math.round((normalized.bytes || 0) / 1024));
              setStatus('第 2/2 步：压缩完成（约 ' + kb + 'KB），正在上传到服务器…', '');
              await apiFetch('/api/admin/avatars/upload', {
                method: 'POST',
                body: JSON.stringify({ name: name, unlockLevel: unlock, dataUrl: normalized.dataUrl }),
              });
              closeModal();
              await loadAvatars();
              setStatus(
                '上传完成 · ' +
                  (window.JmlAdminImageNormalize
                    ? window.JmlAdminImageNormalize.formatNormalizeStatus(normalized)
                    : '上传成功'),
                'ok',
              );
            } catch (e) {
              setStatus(e.message || '上传失败', 'err');
            }
          },
        },
      ],
    );
  }

  function normalizeUploadFile(file) {
    if (!window.JmlAdminImageNormalize || typeof window.JmlAdminImageNormalize.normalizeImageFile !== 'function') {
      return Promise.reject(new Error('图片处理模块未加载'));
    }
    return window.JmlAdminImageNormalize.normalizeImageFile(file, { size: 256, maxBytes: 80000 });
  }

  function openAvatarEditSelectedModal() {
    syncSelectedAvatarIdFromDom();
    var id = state.selectedAvatarId;
    if (!id) {
      setStatus('请先选择一个头像', 'err');
      return;
    }
    var item = state.avatars.find(function (x) { return x.id === id; });
    if (!item) return;
    openModal(
      '修改头像图片',
      '<div class="muted" style="margin:0 0 10px;">所选：<code>' + escapeHtml(item.name || item.id) + '</code></div>' +
        '<div class="jml-field"><input id="jml-avatar-replace-file" type="file" accept="image/*" /></div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '替换',
          primary: true,
          onClick: async function () {
            var fileInput = document.getElementById('jml-avatar-replace-file');
            var f = fileInput && fileInput.files && fileInput.files[0];
            if (!f) return;
            try {
              setStatus('第 1/2 步：正在读取并压缩图片（256×256）…', '');
              var normalized = await normalizeUploadFile(f);
              var kb = Math.max(1, Math.round((normalized.bytes || 0) / 1024));
              setStatus('第 2/2 步：压缩完成（约 ' + kb + 'KB），正在上传到服务器…', '');
              await apiFetch('/api/admin/avatars/' + encodeURIComponent(id) + '/replace-image', {
                method: 'POST',
                body: JSON.stringify({ dataUrl: normalized.dataUrl }),
              });
              closeModal();
              await loadAvatars();
              setStatus(
                '替换完成 · ' +
                  (window.JmlAdminImageNormalize
                    ? window.JmlAdminImageNormalize.formatNormalizeStatus(normalized)
                    : '替换成功'),
                'ok',
              );
            } catch (e) {
              setStatus(e.message || '替换失败', 'err');
            }
          },
        },
      ],
    );
  }

  function openAvatarMetaEditModal() {
    syncSelectedAvatarIdFromDom();
    var id = state.selectedAvatarId;
    if (!id) {
      setStatus('请先选择一个头像', 'err');
      return;
    }
    var item = state.avatars.find(function (x) { return x.id === id; });
    if (!item) return;
    openModal(
      '修改所选头像',
      fieldHtml('jml-avatar-meta-name', '头像名', '<input id="jml-avatar-meta-name" type="text" value="' + escapeHtml(item.name || '') + '" />') +
        fieldHtml('jml-avatar-meta-unlock', '解锁等级', '<input id="jml-avatar-meta-unlock" type="number" min="1" step="1" value="' + String(item.unlockLevel != null ? item.unlockLevel : 1) + '" />') +
        '<div class="jml-field"><label><input id="jml-avatar-meta-enabled" type="checkbox"' + (item.enabled !== false ? ' checked' : '') + ' /> 启用</label></div>' +
        '<div class="muted" style="margin-top:6px;">提示：保存后将立即写入服务器。</div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '保存',
          primary: true,
          onClick: async function () {
            var name = (document.getElementById('jml-avatar-meta-name').value || '').trim();
            var unlock = Math.max(1, Math.floor(Number(document.getElementById('jml-avatar-meta-unlock').value) || 1));
            var enabled = !!document.getElementById('jml-avatar-meta-enabled').checked;
            item.name = name || item.name;
            item.unlockLevel = unlock;
            item.enabled = enabled;
            closeModal();
            await saveAvatars();
          },
        },
      ],
    );
  }

  async function deleteSelectedAvatar() {
    syncSelectedAvatarIdFromDom();
    var id = state.selectedAvatarId;
    if (!id) {
      setStatus('请先选择一个头像', 'err');
      return;
    }
    var item = state.avatars.find(function (x) { return x.id === id; });
    openModal(
      '删除头像',
      '<div class="muted" style="margin:0;">确认删除 <code>' + escapeHtml((item && (item.name || item.id)) || id) + '</code>？</div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '删除',
          danger: true,
          onClick: async function () {
            try {
              setStatus('删除中…', '');
              await apiFetch('/api/admin/avatars/' + encodeURIComponent(id), { method: 'DELETE' });
              closeModal();
              state.selectedAvatarId = '';
              await loadAvatars();
            } catch (e) {
              setStatus(e.message || '删除失败', 'err');
            }
          },
        },
      ],
    );
  }

  function confirmInitAvatarsFromProfile() {
    openModal(
      '批量导入头像',
      '<div class="muted" style="margin:0 0 10px;line-height:1.55;">' +
        '请先把要导入的头像图片放到项目根目录的：<br/>' +
        '<code>pictures/profile/</code><br/>' +
        '支持 <code>png/jpg/jpeg/webp</code>。<br/>' +
        '<br/>' +
        '确认后系统会扫描该目录并把新图片导入到头像库（写入 <code>avatars.json</code> 并复制到 <code>avatar-assets</code>）。' +
      '</div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '确认导入',
          primary: true,
          onClick: async function () {
            closeModal();
            setStatus('导入中…', '');
            try {
              await apiFetch('/api/admin/avatars/init-legacy', { method: 'POST' });
              await loadAvatars();
              setStatus('导入完成', 'ok');
            } catch (e) {
              setStatus(e.message || '导入失败', 'err');
            }
          },
        },
      ],
    );
  }

  async function doBackup() {
    try {
      var base = apiBase();
      if (!base) throw new Error('未配置 API');
      var url = base + '/api/admin/backup';
      var res = await fetch(url, { headers: { 'X-Admin-Pin': adminPin() } });
      if (!res.ok) throw new Error('备份失败：' + res.status);
      var blob = await res.blob();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'jarvis-math-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('已下载备份', 'ok');
    } catch (e) {
      setStatus(e.message || '备份失败', 'err');
    }
  }

  async function doRestore(file) {
    try {
      if (!file) return;
      setStatus('读取备份文件中…', '');
      var text = await file.text();
      var json = JSON.parse(text);
      setStatus('恢复中…', '');
      await apiFetch('/api/admin/restore', { method: 'POST', body: JSON.stringify(json) });
      setStatus('已恢复（请刷新各 Tab）', 'ok');
    } catch (e) {
      setStatus(e.message || '恢复失败', 'err');
    }
  }

  async function backfillLevelRanking() {
    try {
      var msg = '将从 runs.json 扫描闯关全通（mode=level, cleared=true）记录，'
        + '重建 level-ranking.json，并同步 hasClearedLevel。\n\n'
        + '请确认已在「系统备份」Tab 下载过备份。是否继续？';
      if (!confirm(msg)) return;
      setStatus('回填闯关达人榜中…', '');
      var data = await apiFetch('/api/admin/maintenance/backfill-level-ranking', { method: 'POST' });
      var entries = Number(data && data.entries) || 0;
      var scanned = Number(data && data.clearedRunsScanned) || 0;
      var flags = Number(data && data.usersFlagUpdated) || 0;
      setStatus(
        '回填完成：榜内 ' + entries + ' 人，扫描全通局 ' + scanned + ' 条，更新 hasClearedLevel ' + flags + ' 人',
        'ok'
      );
      loadUsers();
    } catch (e) {
      setStatus(e.message || '回填失败', 'err');
    }
  }

  async function backfillPrimePerfectRanking() {
    try {
      var msg = '将从 runs.json 扫描掌握 50 题且错题 ≤5 的质数局，重建 prime-perfect-ranking.json。\n\n'
        + '榜文件丢失、恢复备份或改榜规则后使用。\n\n'
        + '不影响成就（成就仍为无错通关）。是否继续？';
      if (!confirm(msg)) return;
      setStatus('重建质数达人榜中…', '');
      var data = await apiFetch('/api/admin/maintenance/backfill-prime-perfect-ranking', { method: 'POST' });
      var entries = Number(data && data.entries) || 0;
      var scanned = Number(data && data.masteredRunsScanned) || 0;
      setStatus('重建完成：榜内 ' + entries + ' 人，扫描掌握局 ' + scanned + ' 条', 'ok');
    } catch (e) {
      setStatus(e.message || '重建失败', 'err');
    }
  }

  function i18nTextareaValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "") : "";
  }

  function setI18nTextareaValue(id, obj) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = JSON.stringify(obj || {}, null, 2);
  }

  async function loadI18n() {
    setStatus('加载文案中…', '');
    try {
      var data = await apiFetch('/api/admin/i18n', { method: 'GET' });
      state.i18n = data && data.i18n ? data.i18n : { zhHant: {}, en: {} };
      setI18nTextareaValue('jml-i18n-zhhant', state.i18n.zhHant || {});
      setI18nTextareaValue('jml-i18n-en', state.i18n.en || {});
      setStatus('文案已加载', 'ok');
    } catch (e) {
      setStatus(e.message || '加载失败', 'err');
    }
  }

  async function saveI18n() {
    var zhRaw = i18nTextareaValue('jml-i18n-zhhant');
    var enRaw = i18nTextareaValue('jml-i18n-en');
    var zhObj;
    var enObj;
    try {
      zhObj = zhRaw ? JSON.parse(zhRaw) : {};
      enObj = enRaw ? JSON.parse(enRaw) : {};
    } catch (e) {
      setStatus('JSON 格式错误，请先修正文案内容', 'err');
      return;
    }
    setStatus('保存文案中…', '');
    try {
      var payload = { i18n: { zhHant: zhObj || {}, en: enObj || {} } };
      var data = await apiFetch('/api/admin/i18n', { method: 'PUT', body: JSON.stringify(payload) });
      state.i18n = data && data.i18n ? data.i18n : payload.i18n;
      setI18nTextareaValue('jml-i18n-zhhant', state.i18n.zhHant || {});
      setI18nTextareaValue('jml-i18n-en', state.i18n.en || {});
      setStatus('文案已保存', 'ok');
    } catch (e) {
      setStatus(e.message || '保存失败', 'err');
    }
  }

  function renderAdminVersion() {
    var el = document.getElementById('jml-admin-version');
    if (!el) return;
    var rev =
      typeof window.JML_ADMIN_STATIC_REV === 'string' && window.JML_ADMIN_STATIC_REV
        ? window.JML_ADMIN_STATIC_REV
        : '?';
    var ver =
      typeof window.JML_APP_VERSION === 'string' && window.JML_APP_VERSION
        ? window.JML_APP_VERSION
        : 'v?';
    var build =
      typeof window.JML_BUILD_ID === 'string' && window.JML_BUILD_ID
        ? window.JML_BUILD_ID
        : '';
    el.textContent = '管理端 static-' + rev + ' · ' + ver + (build ? ' · ' + build : '');
  }

  function bindEvents() {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-tab');
        switchTab(id);
        if (id === 'accounts') loadUsers();
        if (id === 'levels') loadLevels();
        if (id === 'avatars') loadAvatars();
        if (id === 'i18n') loadI18n();
        if (id === 'feedback') loadFeedback();
        if (id === 'worksheet' && typeof JmlAdminWorksheet !== 'undefined') JmlAdminWorksheet.init();
      });
    });

    var createBtn = document.getElementById('jml-btn-create-user');
    if (createBtn) createBtn.addEventListener('click', openCreateUserModal);
    var refreshBtn = document.getElementById('jml-btn-refresh-users');
    if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);
    var refreshFeedbackBtn = document.getElementById('jml-btn-refresh-feedback');
    if (refreshFeedbackBtn) refreshFeedbackBtn.addEventListener('click', loadFeedback);
    var feedbackUnreadOnly = document.getElementById('jml-feedback-unread-only');
    if (feedbackUnreadOnly) {
      feedbackUnreadOnly.addEventListener('change', function () {
        state.feedbackUnreadOnly = !!feedbackUnreadOnly.checked;
        renderFeedbackTable();
      });
    }

    document.querySelectorAll('.jml-user-table th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (!k) return;
        if (state.sortKey === k) {
          state.sortDir *= -1;
        } else {
          state.sortKey = k;
          state.sortDir = -1;
        }
        renderUsersTable();
      });
    });

    var saveLevelsBtn = document.getElementById('jml-btn-save-levels');
    if (saveLevelsBtn) saveLevelsBtn.addEventListener('click', saveLevels);
    var resetLevelsBtn = document.getElementById('jml-btn-reset-levels');
    if (resetLevelsBtn) resetLevelsBtn.addEventListener('click', loadLevels);

    var avatarInitBtn = document.getElementById('jml-btn-avatar-init');
    if (avatarInitBtn) avatarInitBtn.addEventListener('click', confirmInitAvatarsFromProfile);
    var avatarUploadBtn = document.getElementById('jml-btn-avatar-upload');
    if (avatarUploadBtn) avatarUploadBtn.addEventListener('click', openAvatarUploadModal);
    var avatarEditBtn = document.getElementById('jml-btn-avatar-edit-selected');
    if (avatarEditBtn) avatarEditBtn.addEventListener('click', openAvatarMetaEditModal);
    var avatarReplaceBtn = document.getElementById('jml-btn-avatar-replace-selected');
    if (avatarReplaceBtn) avatarReplaceBtn.addEventListener('click', openAvatarEditSelectedModal);
    var avatarDeleteBtn = document.getElementById('jml-btn-avatar-delete-selected');
    if (avatarDeleteBtn) avatarDeleteBtn.addEventListener('click', deleteSelectedAvatar);

    // 头像变更只通过命令保存（避免误操作/忘记保存）

    var backupBtn = document.getElementById('jml-btn-backup');
    if (backupBtn) backupBtn.addEventListener('click', doBackup);
    var restoreBtn = document.getElementById('jml-btn-restore');
    var restoreInput = document.getElementById('jml-restore-file');
    if (restoreBtn && restoreInput) {
      restoreBtn.addEventListener('click', function () { restoreInput.click(); });
      restoreInput.addEventListener('change', function () {
        var f = restoreInput.files && restoreInput.files[0];
        restoreInput.value = '';
        doRestore(f);
      });
    }

    var backfillLevelRankingBtn = document.getElementById('jml-btn-backfill-level-ranking');
    if (backfillLevelRankingBtn) backfillLevelRankingBtn.addEventListener('click', backfillLevelRanking);
    var backfillPrimePerfectRankingBtn = document.getElementById('jml-btn-backfill-prime-perfect-ranking');
    if (backfillPrimePerfectRankingBtn) backfillPrimePerfectRankingBtn.addEventListener('click', backfillPrimePerfectRanking);
    var loadI18nBtn = document.getElementById('jml-btn-load-i18n');
    if (loadI18nBtn) loadI18nBtn.addEventListener('click', loadI18n);
    var saveI18nBtn = document.getElementById('jml-btn-save-i18n');
    if (saveI18nBtn) saveI18nBtn.addEventListener('click', saveI18n);

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  window.JmlAdminPanel = {
    init: function () {
      renderAdminVersion();
      showApiWarning();
      bindEvents();
      if (typeof JmlAdminWorksheet !== 'undefined') JmlAdminWorksheet.init();
      if (typeof JmlAdminAchievements !== 'undefined') JmlAdminAchievements.init();
      // 默认加载账号列表；并行拉取反馈未读角标
      loadUsers();
      refreshFeedbackUnreadBadge();
    },
  };
})();

