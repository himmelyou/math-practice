/**
 * 管理端 · 成就 catalog 编辑
 */
(function () {
  var state = {
    catalog: null,
    ruleTypes: [],
    dirty: false,
  };

  function apiBase() {
    var base = (window.__JML_API_BASE__ || window.API_BASE_URL || '').trim();
    return base.replace(/\/+$/, '');
  }

  function adminPin() {
    return (window.__JML_ADMIN_PIN__ || '').trim();
  }

  function apiFetch(path, opts) {
    var url = apiBase() + path;
    var headers = Object.assign({ 'X-Admin-Pin': adminPin() }, (opts && opts.headers) || {});
    return fetch(url, Object.assign({}, opts || {}, { headers: headers })).then(function (res) {
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') >= 0) {
        return res.json().then(function (data) {
          if (!res.ok || (data && data.ok === false)) {
            throw new Error((data && data.error) || ('HTTP ' + res.status));
          }
          return data;
        });
      }
      return res.text().then(function (text) {
        var snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
        throw new Error('HTTP ' + res.status + (snippet ? ('：' + snippet) : ''));
      });
    });
  }

  function setStatus(msg, kind) {
    if (window.JmlAdminPanel && typeof window.JmlAdminPanel.setStatus === 'function') {
      window.JmlAdminPanel.setStatus(msg, kind);
      return;
    }
    var el = document.getElementById('jml-status');
    if (el) el.textContent = msg || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeUploadFile(file) {
    if (!window.JmlAdminImageNormalize || typeof window.JmlAdminImageNormalize.normalizeImageFile !== 'function') {
      return Promise.reject(new Error('图片处理模块未加载，请刷新页面后重试'));
    }
    return window.JmlAdminImageNormalize.normalizeImageFile(file, { size: 256, maxBytes: 80000 });
  }

  function formatNormalizeStatus(result) {
    if (window.JmlAdminImageNormalize && typeof window.JmlAdminImageNormalize.formatNormalizeStatus === 'function') {
      return window.JmlAdminImageNormalize.formatNormalizeStatus(result);
    }
    return '图片已上传';
  }

  function resolveImagePreview(item) {
    if (!item) return '';
    if (item.imageUrl) return item.imageUrl;
    var path = item.imagePath || '';
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return apiBase() + path;
  }

  function renderTable() {
    var wrap = document.getElementById('jml-achievements-table-wrap');
    if (!wrap) return;
    var items = state.catalog && Array.isArray(state.catalog.items) ? state.catalog.items.slice() : [];
    if (!items.length) {
      wrap.innerHTML = '<p class="muted">暂无成就条目。</p>';
      return;
    }
    items.sort(function (a, b) {
      return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id));
    });
    var rows = items
      .map(function (item) {
        var preview = resolveImagePreview(item);
        var thumb = preview
          ? '<img class="jml-ach-thumb" src="' + escapeHtml(preview) + '" alt="" />'
          : '<span class="jml-ach-thumb jml-ach-thumb-empty">无图</span>';
        return (
          '<tr data-id="' +
          escapeHtml(item.id) +
          '">' +
          '<td><code>' +
          escapeHtml(item.id) +
          '</code></td>' +
          '<td class="jml-ach-name-cell">' +
          thumb +
          ' ' +
          escapeHtml(item.name || '') +
          '</td>' +
          '<td>' +
          escapeHtml(item.category || '') +
          '</td>' +
          '<td class="num">' +
          escapeHtml(String(item.xpReward != null ? item.xpReward : 0)) +
          '</td>' +
          '<td><code>' +
          escapeHtml(item.ruleType || '') +
          '</code></td>' +
          '<td>' +
          (item.enabled === false ? '否' : '是') +
          '</td>' +
          '<td><button type="button" class="jml-btn jml-btn-sm jml-ach-edit-btn">编辑</button></td>' +
          '</tr>'
        );
      })
      .join('');
    wrap.innerHTML =
      '<div class="jml-table-wrap"><table class="jml-user-table jml-achievements-table">' +
      '<thead><tr><th>id</th><th>名称</th><th>分类</th><th class="num">XP</th><th>ruleType</th><th>启用</th><th>操作</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>';
    wrap.querySelectorAll('.jml-ach-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr ? tr.getAttribute('data-id') : '';
        openEditModal(id);
      });
    });
  }

  function findItem(id) {
    var items = state.catalog && state.catalog.items ? state.catalog.items : [];
    return items.find(function (x) {
      return x && x.id === id;
    });
  }

  function openEditModal(id) {
    var item = findItem(id);
    if (!item) return;
    var modal = document.getElementById('jml-modal-overlay');
    var title = document.getElementById('jml-modal-title');
    var body = document.getElementById('jml-modal-body');
    var actions = document.getElementById('jml-modal-actions');
    if (!modal || !title || !body || !actions) return;
    title.textContent = '编辑成就 · ' + item.id;
    var ruleOptions = (state.ruleTypes || [])
      .map(function (rt) {
        var sel = rt === item.ruleType ? ' selected' : '';
        return '<option value="' + escapeHtml(rt) + '"' + sel + '>' + escapeHtml(rt) + '</option>';
      })
      .join('');
    var preview = resolveImagePreview(item);
    body.innerHTML =
      '<div class="jml-field"><label>id（不可改）</label><input type="text" value="' +
      escapeHtml(item.id) +
      '" disabled /></div>' +
      '<div class="jml-field"><label>名称</label><input id="jml-ach-edit-name" type="text" value="' +
      escapeHtml(item.name || '') +
      '" /></div>' +
      '<div class="jml-field"><label>徽章图片（任意尺寸，上传后自动转为 256×256）</label>' +
      (preview ? '<div style="margin:0 0 8px;"><img id="jml-ach-edit-preview" src="' + escapeHtml(preview) + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" /></div>' : '<div id="jml-ach-edit-preview-wrap" class="muted" style="margin:0 0 8px;">尚未上传</div>') +
      '<input id="jml-ach-edit-image" type="file" accept="image/png,image/jpeg,image/webp,image/*" /></div>' +
      '<div class="jml-field"><label>分类</label><input id="jml-ach-edit-category" type="text" value="' +
      escapeHtml(item.category || '') +
      '" /></div>' +
      '<div class="jml-field"><label>稀有度</label><input id="jml-ach-edit-tier" type="text" value="' +
      escapeHtml(item.tier || '') +
      '" /></div>' +
      '<div class="jml-field"><label>XP 奖励</label><input id="jml-ach-edit-xp" type="number" min="0" step="1" value="' +
      escapeHtml(String(item.xpReward != null ? item.xpReward : 0)) +
      '" /></div>' +
      '<div class="jml-field"><label>未解锁提示</label><input id="jml-ach-edit-hint" type="text" value="' +
      escapeHtml(item.hint || '') +
      '" /></div>' +
      '<div class="jml-field"><label>排序 sortOrder</label><input id="jml-ach-edit-sort" type="number" step="1" value="' +
      escapeHtml(String(item.sortOrder != null ? item.sortOrder : 0)) +
      '" /></div>' +
      '<div class="jml-field"><label>ruleType</label><select id="jml-ach-edit-rule-type">' +
      ruleOptions +
      '</select></div>' +
      '<div class="jml-field"><label>ruleParams（JSON）</label><textarea id="jml-ach-edit-rule-params" rows="4">' +
      escapeHtml(JSON.stringify(item.ruleParams || {}, null, 2)) +
      '</textarea></div>' +
      '<div class="jml-field"><label><input id="jml-ach-edit-enabled" type="checkbox"' +
      (item.enabled !== false ? ' checked' : '') +
      ' /> 启用</label></div>';
    actions.innerHTML = '';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'jml-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', closeModal);
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'jml-btn jml-btn-primary';
    saveBtn.textContent = '保存到列表';
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      var pending;
      try {
        pending = applyEditToItem(item.id);
      } catch (e) {
        saveBtn.disabled = false;
        setStatus(e.message || String(e), 'err');
        return;
      }
      pending
        .then(function () {
          closeModal();
          renderTable();
          state.dirty = true;
        })
        .catch(function (e) {
          setStatus(e.message || String(e), 'err');
        })
        .finally(function () {
          saveBtn.disabled = false;
        });
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.hidden = false;
  }

  function closeModal() {
    var modal = document.getElementById('jml-modal-overlay');
    if (modal) modal.hidden = true;
  }

  function applyEditToItem(id) {
    var item = findItem(id);
    if (!item) return Promise.resolve();
    var nameEl = document.getElementById('jml-ach-edit-name');
    var catEl = document.getElementById('jml-ach-edit-category');
    var tierEl = document.getElementById('jml-ach-edit-tier');
    var xpEl = document.getElementById('jml-ach-edit-xp');
    var hintEl = document.getElementById('jml-ach-edit-hint');
    var sortEl = document.getElementById('jml-ach-edit-sort');
    var ruleTypeEl = document.getElementById('jml-ach-edit-rule-type');
    var ruleParamsEl = document.getElementById('jml-ach-edit-rule-params');
    var enabledEl = document.getElementById('jml-ach-edit-enabled');
    var imageEl = document.getElementById('jml-ach-edit-image');
    item.name = nameEl ? nameEl.value.trim() : item.name;
    item.category = catEl ? catEl.value.trim() : item.category;
    item.tier = tierEl ? tierEl.value.trim() : item.tier;
    item.xpReward = Math.max(0, Math.floor(Number(xpEl && xpEl.value) || 0));
    item.hint = hintEl ? hintEl.value.trim() : item.hint;
    item.sortOrder = Number(sortEl && sortEl.value) || 0;
    item.ruleType = ruleTypeEl ? ruleTypeEl.value : item.ruleType;
    item.enabled = !!(enabledEl && enabledEl.checked);
    try {
      item.ruleParams = JSON.parse(ruleParamsEl ? ruleParamsEl.value : '{}');
    } catch (e) {
      return Promise.reject(new Error('ruleParams JSON 无效'));
    }
    var file = imageEl && imageEl.files && imageEl.files[0];
    if (!file) return Promise.resolve();
    setStatus('第 1/2 步：正在读取并压缩图片（256×256）…', '');
    return normalizeUploadFile(file)
      .then(function (normalized) {
        var kb = Math.max(1, Math.round((normalized.bytes || 0) / 1024));
        setStatus('第 2/2 步：压缩完成（约 ' + kb + 'KB），正在上传到服务器…', '');
        return apiFetch('/api/admin/achievements/' + encodeURIComponent(id) + '/replace-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: normalized.dataUrl }),
        }).then(function (data) {
          return { data: data, normalized: normalized };
        });
      })
      .then(function (result) {
        var data = result.data;
        var normalized = result.normalized;
        if (data.catalog) {
          state.catalog = data.catalog;
          item = findItem(id) || item;
        } else if (data.item) {
          item.imagePath = data.item.imagePath || item.imagePath;
          item.imageUrl = data.item.imageUrl || item.imageUrl;
        }
        setStatus('上传完成 · ' + formatNormalizeStatus(normalized), 'ok');
      });
  }

  function loadCatalog() {
    setStatus('加载成就 catalog…', '');
    return apiFetch('/api/admin/achievements/catalog')
      .then(function (data) {
        state.catalog = data.catalog || { version: 1, items: [] };
        state.ruleTypes = Array.isArray(data.ruleTypes) ? data.ruleTypes.slice() : [];
        state.dirty = false;
        renderTable();
        setStatus('成就 catalog 已加载（' + (state.catalog.items || []).length + ' 条）', 'ok');
      })
      .catch(function (e) {
        setStatus('加载成就失败：' + (e.message || e), 'err');
      });
  }

  function saveCatalog() {
    if (!state.catalog) return Promise.resolve();
    setStatus('保存成就 catalog…', '');
    return apiFetch('/api/admin/achievements/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog: state.catalog }),
    })
      .then(function (data) {
        state.catalog = data.catalog || state.catalog;
        state.dirty = false;
        renderTable();
        setStatus('成就 catalog 已保存', 'ok');
      })
      .catch(function (e) {
        setStatus('保存失败：' + (e.message || e), 'err');
      });
  }

  function recomputeAll() {
    if (!window.confirm('将对全部学员重算成就（仅补解锁，不收回）。继续？')) return;
    setStatus('重算成就中…', '');
    apiFetch('/api/admin/achievements/recompute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(function (data) {
        setStatus(
          '重算完成：' +
            (data.usersTouched || 0) +
            ' 名学员，新解锁 ' +
            (data.newlyUnlockedCount || 0) +
            ' 条',
          'ok',
        );
      })
      .catch(function (e) {
        setStatus('重算失败：' + (e.message || e), 'err');
      });
  }

  function bindEvents() {
    var refreshBtn = document.getElementById('jml-btn-achievements-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadCatalog);
    var saveBtn = document.getElementById('jml-btn-achievements-save');
    if (saveBtn) saveBtn.addEventListener('click', saveCatalog);
    var recomputeBtn = document.getElementById('jml-btn-achievements-recompute');
    if (recomputeBtn) recomputeBtn.addEventListener('click', recomputeAll);
  }

  window.JmlAdminAchievements = {
    init: function () {
      bindEvents();
    },
    onTabShow: function () {
      if (!state.catalog) loadCatalog();
      else renderTable();
    },
  };
})();
