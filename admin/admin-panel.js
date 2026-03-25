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

  var state = {
    users: [],
    sortKey: 'totalScore',
    sortDir: -1,
    levels: null,
    avatars: [],
    selectedAvatarId: '',
    avatarDragFrom: -1,
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

  function renderUsersTable() {
    var tbody = document.getElementById('jml-users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    updateSortHeaders();
    var list = sortUsers();
    if (!list.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 6;
      td.style.textAlign = 'center';
      td.style.color = '#64748b';
      td.style.padding = '24px';
      td.textContent = '暂无学员，请点击「创建账户」添加。';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    list.forEach(function (u) {
      var tr = document.createElement('tr');
      function tdText(text, cls) {
        var td = document.createElement('td');
        if (cls) td.className = cls;
        td.textContent = text;
        return td;
      }
      tr.appendChild(tdText(u.username || ''));
      var tdPwd = document.createElement('td');
      tdPwd.className = 'pwd-mask';
      tdPwd.textContent = '****';
      tr.appendChild(tdPwd);
      tr.appendChild(tdText((u.nickname && String(u.nickname).trim()) || '-', ''));
      tr.appendChild(tdText(formatDateTime(u.lastGameTs), ''));
      tr.appendChild(tdText(u.totalScore != null ? String(u.totalScore) : '0', 'num'));

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

      var username = u.username || '';
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

  function openCreateUserModal() {
    openModal(
      '创建账户',
      fieldHtml('jml-new-user', '用户名', '<input id="jml-new-user" type="text" autocomplete="off" />') +
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
      '<div class="muted" style="margin:0;">确认删除 <code>' + username + '</code>？此操作不可撤销。</div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '删除',
          danger: true,
          onClick: async function () {
            try {
              setStatus('删除中…', '');
              await apiFetch('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' });
              closeModal();
              await loadUsers();
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
      var desc = document.createElement('input');
      desc.type = 'text';
      desc.value = row.desc || '';
      desc.setAttribute('data-k', 'desc');
      td(desc);

      function numInput(val, k) {
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(val != null ? val : '');
        inp.setAttribute('data-k', k);
        return inp;
      }
      td(numInput(Math.round((row.passAccuracy || 0) * 100), 'passAccuracy'));
      td(numInput(Math.round((row.upgradeAccuracy || 0) * 100), 'upgradeAccuracy'));
      td(numInput(row.upgradeTimeLimit || 0, 'upgradeTimeLimit'));
      tbody.appendChild(tr);
    });
  }

  function normalizeLevelsFromServer(levels) {
    var arr = Array.isArray(levels) ? levels : [];
    return Array.from({ length: 16 }, function (_, i) {
      var src = arr[i] || {};
      return {
        desc: typeof src.desc === 'string' ? src.desc : (LEVEL_NAMES[i] || '').replace(/^第\s*\d+\s*级\s*·\s*/, ''),
        passAccuracy: Number.isFinite(Number(src.passAccuracy)) ? Number(src.passAccuracy) : 0.8,
        upgradeAccuracy: Number.isFinite(Number(src.upgradeAccuracy)) ? Number(src.upgradeAccuracy) : 0.95,
        upgradeTimeLimit: Number.isFinite(Number(src.upgradeTimeLimit)) ? Number(src.upgradeTimeLimit) : 300,
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
        if (k === 'desc') out.desc = String(v || '').trim();
        if (k === 'passAccuracy') out.passAccuracy = Math.max(0, Math.min(1, (Number(v) || 0) / 100));
        if (k === 'upgradeAccuracy') out.upgradeAccuracy = Math.max(0, Math.min(1, (Number(v) || 0) / 100));
        if (k === 'upgradeTimeLimit') out.upgradeTimeLimit = Math.max(10, Math.floor(Number(v) || 0));
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
      '<td class="num">' + escapeHtml(String(a.unlockScore || 0)) + '</td>' +
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
    // 规则：启用在前；按解锁积分升序；同积分保持当前相对顺序（可通过拖拽改变）
    var list = state.avatars || [];
    var seq = new Map();
    list.forEach(function (x, i) {
      seq.set(x && x.id, i);
    });
    list.sort(function (a, b) {
      var ea = a && a.enabled !== false ? 1 : 0;
      var eb = b && b.enabled !== false ? 1 : 0;
      if (ea !== eb) return eb - ea;
      var sa = Number(a && a.unlockScore) || 0;
      var sb = Number(b && b.unlockScore) || 0;
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
        // 若跨积分组拖拽，会被自动重排回规则顺序
        var targetId = tr.getAttribute('data-id') || '';
        var targetItem = state.avatars.find(function (x) { return x && x.id === targetId; });
        var srcScore = Number(item && item.unlockScore) || 0;
        var tgtScore = Number(targetItem && targetItem.unlockScore) || 0;
        if (srcScore !== tgtScore) {
          setStatus('拖拽仅用于同积分内排序；已自动重排', 'err');
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
      // order 字段仅用于“同积分内的手动排序”
      var orderWithin = {};
      state.avatars.forEach(function (a) {
        var key = (a && a.enabled !== false ? '1' : '0') + '_' + String(Number(a && a.unlockScore) || 0);
        orderWithin[key] = orderWithin[key] || 0;
        a.__orderWithin = orderWithin[key];
        orderWithin[key] += 1;
      });
      var payload = {
        avatars: state.avatars.map(function (a, i) {
          return {
            id: a.id,
            name: a.name || '',
            unlockScore: Number(a.unlockScore) || 0,
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
      '<div class="muted" style="margin:0 0 10px;">选择图片后上传（png/jpg/webp）。</div>' +
        '<div class="jml-field"><input id="jml-avatar-file" type="file" accept="image/*" /></div>' +
        fieldHtml('jml-avatar-name', '头像名', '<input id="jml-avatar-name" type="text" />') +
        fieldHtml('jml-avatar-unlock', '解锁积分', '<input id="jml-avatar-unlock" type="number" value="0" />'),
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
            var unlock = Math.max(0, Math.floor(Number(document.getElementById('jml-avatar-unlock').value) || 0));
            try {
              setStatus('上传中…', '');
              var dataUrl = await fileToDataUrl(f);
              await apiFetch('/api/admin/avatars/upload', {
                method: 'POST',
                body: JSON.stringify({ name: name, unlockScore: unlock, dataUrl: dataUrl }),
              });
              closeModal();
              await loadAvatars();
            } catch (e) {
              setStatus(e.message || '上传失败', 'err');
            }
          },
        },
      ],
    );
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('读取文件失败')); };
      r.onload = function () { resolve(String(r.result || '')); };
      r.readAsDataURL(file);
    });
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
              setStatus('替换中…', '');
              var dataUrl = await fileToDataUrl(f);
              await apiFetch('/api/admin/avatars/' + encodeURIComponent(id) + '/replace-image', {
                method: 'POST',
                body: JSON.stringify({ dataUrl: dataUrl }),
              });
              closeModal();
              await loadAvatars();
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
        fieldHtml('jml-avatar-meta-unlock', '解锁积分', '<input id="jml-avatar-meta-unlock" type="number" value="' + String(item.unlockScore || 0) + '" />') +
        '<div class="jml-field"><label><input id="jml-avatar-meta-enabled" type="checkbox"' + (item.enabled !== false ? ' checked' : '') + ' /> 启用</label></div>' +
        '<div class="muted" style="margin-top:6px;">提示：保存后将立即写入服务器。</div>',
      [
        { label: '取消', onClick: closeModal },
        {
          label: '保存',
          primary: true,
          onClick: async function () {
            var name = (document.getElementById('jml-avatar-meta-name').value || '').trim();
            var unlock = Math.max(0, Math.floor(Number(document.getElementById('jml-avatar-meta-unlock').value) || 0));
            var enabled = !!document.getElementById('jml-avatar-meta-enabled').checked;
            item.name = name || item.name;
            item.unlockScore = unlock;
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

  function bindEvents() {
    document.querySelectorAll('.jml-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-tab');
        switchTab(id);
        if (id === 'accounts') loadUsers();
        if (id === 'levels') loadLevels();
        if (id === 'avatars') loadAvatars();
      });
    });

    var createBtn = document.getElementById('jml-btn-create-user');
    if (createBtn) createBtn.addEventListener('click', openCreateUserModal);
    var refreshBtn = document.getElementById('jml-btn-refresh-users');
    if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);

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
      showApiWarning();
      bindEvents();
      // 默认加载账号列表
      loadUsers();
    },
  };
})();

