/**
 * 管理端 · 成就 catalog 编辑
 */
(function () {
  var state = {
    catalog: null,
    ruleTypes: [],
    dirty: false,
    categoryDragFrom: -1,
    itemDragFrom: { category: "", index: -1 },
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

  function ensureCatalogShape(catalog) {
    if (!catalog || typeof catalog !== 'object') {
      return { version: 1, categoryOrder: [], items: [] };
    }
    if (!Array.isArray(catalog.items)) catalog.items = [];
    if (!Array.isArray(catalog.categoryOrder)) catalog.categoryOrder = [];
    catalog.items.forEach(function (item) {
      if (!item.category) item.category = '其他';
      if (typeof item.nameEn !== 'string') item.nameEn = '';
      if (typeof item.hintEn !== 'string') item.hintEn = '';
    });
    var seen = new Set(catalog.categoryOrder);
    catalog.items.forEach(function (item) {
      var cat = String(item.category || '其他').trim() || '其他';
      item.category = cat;
      if (!seen.has(cat)) {
        seen.add(cat);
        catalog.categoryOrder.push(cat);
      }
    });
    return catalog;
  }

  function itemsForCategory(category) {
    return (state.catalog.items || [])
      .filter(function (item) {
        return (item.category || '其他') === category;
      })
      .sort(function (a, b) {
        return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id));
      });
  }

  function reindexItemsInCategory(category) {
    var list = itemsForCategory(category);
    list.forEach(function (item, index) {
      item.sortOrder = (index + 1) * 10;
    });
  }

  function markDirty(msg) {
    state.dirty = true;
    if (msg) setStatus(msg, '');
  }

  function fieldRow(label, controlHtml) {
    return (
      '<div class="jml-field-row">' +
      '<label>' +
      escapeHtml(label) +
      '</label>' +
      '<div class="jml-field-control">' +
      controlHtml +
      '</div></div>'
    );
  }

  function achievementRowHtml(item) {
    var preview = resolveImagePreview(item);
    var thumb = preview
      ? '<img class="jml-ach-thumb" src="' + escapeHtml(preview) + '" alt="" />'
      : '<span class="jml-ach-thumb jml-ach-thumb-empty">无图</span>';
    var nameCell =
      escapeHtml(item.name || '') +
      (item.nameEn ? '<div class="jml-ach-name-en muted">' + escapeHtml(item.nameEn) + '</div>' : '');
    return (
      '<tr class="jml-ach-item-row" draggable="true" data-id="' +
      escapeHtml(item.id) +
      '" data-category="' +
      escapeHtml(item.category || '其他') +
      '">' +
      '<td class="jml-ach-drag-col"><span class="jml-ach-drag-handle" title="拖动排序">⠿</span></td>' +
      '<td><code>' +
      escapeHtml(item.id) +
      '</code></td>' +
      '<td class="jml-ach-name-cell">' +
      thumb +
      ' ' +
      nameCell +
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
  }

  function wireCategoryDnD(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll('.jml-ach-category-row').forEach(function (li) {
      li.addEventListener('dragstart', function () {
        state.categoryDragFrom = Array.from(listEl.children).indexOf(li);
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', function () {
        li.classList.remove('dragging');
        listEl.querySelectorAll('.jml-ach-category-row').forEach(function (x) {
          x.classList.remove('drag-over-top');
          x.classList.remove('drag-over-bottom');
        });
      });
      li.addEventListener('dragover', function (e) {
        e.preventDefault();
        var rect = li.getBoundingClientRect();
        var before = e.clientX - rect.left < rect.width / 2;
        li.classList.toggle('drag-over-top', before);
        li.classList.toggle('drag-over-bottom', !before);
      });
      li.addEventListener('dragleave', function () {
        li.classList.remove('drag-over-top');
        li.classList.remove('drag-over-bottom');
      });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = state.categoryDragFrom;
        if (from < 0) return;
        var rows = Array.from(listEl.children);
        var to = rows.indexOf(li);
        if (to < 0 || to === from) return;
        var rect = li.getBoundingClientRect();
        var before = e.clientX - rect.left < rect.width / 2;
        var order = (state.catalog.categoryOrder || []).slice();
        var moved = order.splice(from, 1)[0];
        var insertAt = before ? to : to + 1;
        if (insertAt > from) insertAt -= 1;
        if (insertAt < 0) insertAt = 0;
        if (insertAt > order.length) insertAt = order.length;
        order.splice(insertAt, 0, moved);
        state.catalog.categoryOrder = order;
        markDirty('分类顺序已更新，记得保存 catalog');
        renderTable();
      });
    });
  }

  function wireItemDnD(tbody, category) {
    if (!tbody) return;
    tbody.querySelectorAll('tr.jml-ach-item-row').forEach(function (tr) {
      tr.addEventListener('dragstart', function () {
        state.itemDragFrom = {
          category: category,
          index: Array.from(tbody.children).indexOf(tr),
        };
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
        var before = e.clientY - rect.top < rect.height / 2;
        tr.classList.toggle('drag-over-top', before);
        tr.classList.toggle('drag-over-bottom', !before);
      });
      tr.addEventListener('dragleave', function () {
        tr.classList.remove('drag-over-top');
        tr.classList.remove('drag-over-bottom');
      });
      tr.addEventListener('drop', function (e) {
        e.preventDefault();
        if (state.itemDragFrom.category !== category) return;
        var from = state.itemDragFrom.index;
        if (from < 0) return;
        var rows = Array.from(tbody.children);
        var to = rows.indexOf(tr);
        if (to < 0 || to === from) return;
        var rect = tr.getBoundingClientRect();
        var before = e.clientY - rect.top < rect.height / 2;
        var list = itemsForCategory(category);
        var moved = list.splice(from, 1)[0];
        var insertAt = before ? to : to + 1;
        if (insertAt > from) insertAt -= 1;
        if (insertAt < 0) insertAt = 0;
        if (insertAt > list.length) insertAt = list.length;
        list.splice(insertAt, 0, moved);
        list.forEach(function (item, index) {
          item.sortOrder = (index + 1) * 10;
        });
        markDirty('「' + category + '」内成就顺序已更新，记得保存 catalog');
        renderTable();
      });
    });
  }

  function renderTable() {
    var wrap = document.getElementById('jml-achievements-table-wrap');
    if (!wrap || !state.catalog) return;
    ensureCatalogShape(state.catalog);
    var items = state.catalog.items || [];
    if (!items.length) {
      wrap.innerHTML = '<p class="muted">暂无成就条目。</p>';
      return;
    }

    var categoryHtml =
      '<div class="jml-ach-sort-block">' +
      '<h3 class="jml-ach-sort-title">分类顺序 <span class="muted">（拖动调整外层排序）</span></h3>' +
      '<ul class="jml-ach-category-list" id="jml-ach-category-list">' +
      (state.catalog.categoryOrder || [])
        .map(function (cat) {
          return (
            '<li class="jml-ach-category-row" draggable="true" data-category="' +
            escapeHtml(cat) +
            '"><span class="jml-ach-drag-handle">⠿</span><span>' +
            escapeHtml(cat) +
            '</span><span class="muted jml-ach-category-count">' +
            itemsForCategory(cat).length +
            ' 项</span></li>'
          );
        })
        .join('') +
      '</ul></div>';

    var groupsHtml = (state.catalog.categoryOrder || [])
      .map(function (cat) {
        var catItems = itemsForCategory(cat);
        if (!catItems.length) return '';
        return (
          '<div class="jml-ach-group">' +
          '<h3 class="jml-ach-group-title">' +
          escapeHtml(cat) +
          ' <span class="muted">（类内拖动排序）</span></h3>' +
          '<div class="jml-table-wrap"><table class="jml-user-table jml-achievements-table">' +
          '<thead><tr><th class="jml-ach-drag-col"></th><th>id</th><th>名称</th><th class="num">XP</th><th>ruleType</th><th>启用</th><th>操作</th></tr></thead>' +
          '<tbody data-category="' +
          escapeHtml(cat) +
          '">' +
          catItems.map(achievementRowHtml).join('') +
          '</tbody></table></div></div>'
        );
      })
      .join('');

    wrap.innerHTML = categoryHtml + groupsHtml;

    wireCategoryDnD(document.getElementById('jml-ach-category-list'));
    wrap.querySelectorAll('tbody[data-category]').forEach(function (tbody) {
      wireItemDnD(tbody, tbody.getAttribute('data-category') || '其他');
    });
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
    modal.classList.add('jml-modal-wide');

    var ruleOptions = (state.ruleTypes || [])
      .map(function (rt) {
        var sel = rt === item.ruleType ? ' selected' : '';
        return '<option value="' + escapeHtml(rt) + '"' + sel + '>' + escapeHtml(rt) + '</option>';
      })
      .join('');
    var preview = resolveImagePreview(item);
    var imageBlock =
      (preview
        ? '<img id="jml-ach-edit-preview" src="' + escapeHtml(preview) + '" alt="" class="jml-ach-edit-preview" />'
        : '<div id="jml-ach-edit-preview-wrap" class="muted jml-ach-edit-preview-empty">尚未上传</div>') +
      '<input id="jml-ach-edit-image" type="file" accept="image/png,image/jpeg,image/webp,image/*" />';

    body.innerHTML =
      '<div class="jml-ach-edit-grid">' +
      '<div class="jml-ach-edit-col">' +
      fieldRow('id', '<input type="text" value="' + escapeHtml(item.id) + '" disabled />') +
      fieldRow('名称（繁中）', '<input id="jml-ach-edit-name" type="text" value="' + escapeHtml(item.name || '') + '" />') +
      fieldRow('名称（English）', '<input id="jml-ach-edit-name-en" type="text" value="' + escapeHtml(item.nameEn || '') + '" />') +
      fieldRow('分类', '<input id="jml-ach-edit-category" type="text" value="' + escapeHtml(item.category || '') + '" />') +
      fieldRow('XP 奖励', '<input id="jml-ach-edit-xp" type="number" min="0" step="1" value="' + escapeHtml(String(item.xpReward != null ? item.xpReward : 0)) + '" />') +
      fieldRow('未解锁提示（繁中）', '<input id="jml-ach-edit-hint" type="text" value="' + escapeHtml(item.hint || '') + '" />') +
      fieldRow('未解锁提示（English）', '<input id="jml-ach-edit-hint-en" type="text" value="' + escapeHtml(item.hintEn || '') + '" />') +
      '</div>' +
      '<div class="jml-ach-edit-col">' +
      fieldRow('徽章图片', '<div class="jml-ach-edit-image-block">' + imageBlock + '<div class="muted" style="font-size:0.78rem;margin-top:6px;">任意尺寸，自动转为 256×256</div></div>') +
      fieldRow('ruleType', '<select id="jml-ach-edit-rule-type">' + ruleOptions + '</select>') +
      fieldRow('ruleParams', '<textarea id="jml-ach-edit-rule-params" rows="5">' + escapeHtml(JSON.stringify(item.ruleParams || {}, null, 2)) + '</textarea>') +
      fieldRow('启用', '<label class="jml-ach-enabled-label"><input id="jml-ach-edit-enabled" type="checkbox"' + (item.enabled !== false ? ' checked' : '') + ' /> 启用此成就</label>') +
      '</div></div>';

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
    if (modal) {
      modal.hidden = true;
      modal.classList.remove('jml-modal-wide');
    }
  }

  function applyEditToItem(id) {
    var item = findItem(id);
    if (!item) return Promise.resolve();
    var oldCategory = item.category || '其他';
    var nameEl = document.getElementById('jml-ach-edit-name');
    var nameEnEl = document.getElementById('jml-ach-edit-name-en');
    var catEl = document.getElementById('jml-ach-edit-category');
    var xpEl = document.getElementById('jml-ach-edit-xp');
    var hintEl = document.getElementById('jml-ach-edit-hint');
    var hintEnEl = document.getElementById('jml-ach-edit-hint-en');
    var ruleTypeEl = document.getElementById('jml-ach-edit-rule-type');
    var ruleParamsEl = document.getElementById('jml-ach-edit-rule-params');
    var enabledEl = document.getElementById('jml-ach-edit-enabled');
    var imageEl = document.getElementById('jml-ach-edit-image');

    item.name = nameEl ? nameEl.value.trim() : item.name;
    item.nameEn = nameEnEl ? nameEnEl.value.trim() : item.nameEn;
    var nextCategory = catEl ? catEl.value.trim() : item.category;
    nextCategory = nextCategory || '其他';
    item.category = nextCategory;
    item.xpReward = Math.max(0, Math.floor(Number(xpEl && xpEl.value) || 0));
    item.hint = hintEl ? hintEl.value.trim() : item.hint;
    item.hintEn = hintEnEl ? hintEnEl.value.trim() : item.hintEn;
    item.ruleType = ruleTypeEl ? ruleTypeEl.value : item.ruleType;
    item.enabled = !!(enabledEl && enabledEl.checked);
    try {
      item.ruleParams = JSON.parse(ruleParamsEl ? ruleParamsEl.value : '{}');
    } catch (e) {
      return Promise.reject(new Error('ruleParams JSON 无效'));
    }

    ensureCatalogShape(state.catalog);
    if (nextCategory !== oldCategory) {
      if (state.catalog.categoryOrder.indexOf(nextCategory) < 0) {
        state.catalog.categoryOrder.push(nextCategory);
      }
      var dest = itemsForCategory(nextCategory).filter(function (x) {
        return x.id !== item.id;
      });
      item.sortOrder = dest.length ? (dest[dest.length - 1].sortOrder || 0) + 10 : 10;
      reindexItemsInCategory(oldCategory);
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
          state.catalog = ensureCatalogShape(data.catalog);
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
        state.catalog = ensureCatalogShape(data.catalog || { version: 1, categoryOrder: [], items: [] });
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
    ensureCatalogShape(state.catalog);
    setStatus('保存成就 catalog…', '');
    return apiFetch('/api/admin/achievements/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog: state.catalog }),
    })
      .then(function (data) {
        state.catalog = ensureCatalogShape(data.catalog || state.catalog);
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
