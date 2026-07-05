/**
 * 管理端 · 成就 catalog 编辑
 */
(function () {
  var RULE_PARAM_HINTS = {
    any_run: '示例：{ "minCount": 1 } — 任意模式累计完成局数',
    mode_run_count:
      '示例：{ "mode": "training", "minCount": 1 } — mode 可为 survival / level / training / decimal 等',
  };

  var state = {
    catalog: null,
    ruleTypes: [],
    implementedRuleTypes: [],
    dirty: false,
    categoryDragFrom: -1,
    itemDragFrom: { category: "", index: -1 },
  };
  var modalKeyHandler = null;
  var DEFAULT_CATEGORY_SLUG = 'other';
  var collapsedCategories = {};

  function slugifyAscii(source) {
    return String(source || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  function isCategorySlug(value) {
    return /^[a-z][a-z0-9-]*$/.test(String(value || '').trim());
  }

  function collectUsedCategorySlugs() {
    var used = new Set();
    var cats = (state.catalog && state.catalog.categories) || {};
    Object.keys(cats).forEach(function (slug) {
      if (isCategorySlug(slug)) used.add(slug);
    });
    return used;
  }

  function deriveCategorySlug(nameEn, name) {
    var used = collectUsedCategorySlugs();
    var fromEn = slugifyAscii(nameEn);
    if (fromEn && fromEn.length >= 2 && !used.has(fromEn)) return fromEn;
    var fromName = slugifyAscii(name);
    if (fromName && fromName.length >= 2 && !used.has(fromName)) return fromName;
    var base = fromEn || fromName || 'category';
    var slug = base;
    var n = 2;
    while (used.has(slug)) {
      slug = base + '-' + n;
      n += 1;
    }
    return slug;
  }

  function getCategoriesMap() {
    return (state.catalog && state.catalog.categories) || {};
  }

  function getCategoryMeta(slug) {
    var cats = getCategoriesMap();
    var key = String(slug || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    return cats[key] || { name: key, nameEn: '' };
  }

  function categoryAdminLabel(slug) {
    var meta = getCategoryMeta(slug);
    var label = meta.name || slug;
    if (meta.nameEn) label += ' · ' + meta.nameEn;
    return label;
  }

  function categorySelectLabel(slug) {
    var meta = getCategoryMeta(slug);
    if (meta.nameEn) return meta.name + ' · ' + meta.nameEn;
    return meta.name || slug;
  }

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

  function isRuleTypeImplemented(ruleType) {
    return (state.implementedRuleTypes || []).indexOf(ruleType) >= 0;
  }

  function ensureCatalogShape(catalog) {
    if (!catalog || typeof catalog !== 'object') {
      return { version: 2, categoryOrder: [DEFAULT_CATEGORY_SLUG], categories: {}, items: [] };
    }
    if (!Array.isArray(catalog.items)) catalog.items = [];
    if (!Array.isArray(catalog.categoryOrder)) catalog.categoryOrder = [];
    if (!catalog.categories || typeof catalog.categories !== 'object') catalog.categories = {};
    if (!catalog.categories[DEFAULT_CATEGORY_SLUG]) {
      catalog.categories[DEFAULT_CATEGORY_SLUG] = { name: '其他', nameEn: 'Other' };
    }
    catalog.items.forEach(function (item) {
      if (!item.category || !isCategorySlug(item.category)) item.category = DEFAULT_CATEGORY_SLUG;
      if (typeof item.nameEn !== 'string') item.nameEn = '';
      if (typeof item.hintEn !== 'string') item.hintEn = '';
    });
    catalog.categoryOrder = catalog.categoryOrder.filter(function (slug) {
      return isCategorySlug(slug) && catalog.categories[slug];
    });
    catalog.items.forEach(function (item) {
      var slug = item.category || DEFAULT_CATEGORY_SLUG;
      if (!catalog.categories[slug]) {
        catalog.categories[slug] = { name: slug, nameEn: '' };
      }
      if (catalog.categoryOrder.indexOf(slug) < 0) catalog.categoryOrder.push(slug);
    });
    if (!catalog.categoryOrder.length) catalog.categoryOrder.push(DEFAULT_CATEGORY_SLUG);
    return catalog;
  }

  function itemsForCategory(category) {
    return (state.catalog.items || [])
      .filter(function (item) {
        return (item.category || DEFAULT_CATEGORY_SLUG) === category;
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

  function categorySortLabel(item) {
    if (!item) return '';
    var cat = item.category || DEFAULT_CATEGORY_SLUG;
    var list = itemsForCategory(cat);
    var idx = list.findIndex(function (x) {
      return x && x.id === item.id;
    });
    if (idx < 0) return '';
    return categoryAdminLabel(cat) + ' · 第 ' + (idx + 1) + ' / ' + list.length + ' 项';
  }

  function markDirty(msg) {
    state.dirty = true;
    if (msg) setStatus(msg, '');
  }

  function fieldRow(label, controlHtml, extraClass) {
    return (
      '<div class="jml-field-row' +
      (extraClass ? ' ' + extraClass : '') +
      '">' +
      '<label>' +
      escapeHtml(label) +
      '</label>' +
      '<div class="jml-field-control">' +
      controlHtml +
      '</div></div>'
    );
  }

  function buildCategorySelectHtml(selected) {
    var order = (state.catalog && state.catalog.categoryOrder) || [];
    return (
      '<select id="jml-ach-edit-category">' +
      order
        .map(function (slug) {
          var sel = slug === selected ? ' selected' : '';
          return (
            '<option value="' + escapeHtml(slug) + '"' + sel + '>' + escapeHtml(categorySelectLabel(slug)) + '</option>'
          );
        })
        .join('') +
      '</select>'
    );
  }

  function buildRuleTypeSelectHtml(selected) {
    var implSet = new Set(state.implementedRuleTypes || []);
    var implemented = (state.ruleTypes || []).filter(function (rt) {
      return implSet.has(rt);
    });
    var pending = (state.ruleTypes || []).filter(function (rt) {
      return !implSet.has(rt);
    });
    function opts(list, suffix) {
      return list
        .map(function (rt) {
          var sel = rt === selected ? ' selected' : '';
          return (
            '<option value="' +
            escapeHtml(rt) +
            '"' +
            sel +
            '>' +
            escapeHtml(rt) +
            (suffix || '') +
            '</option>'
          );
        })
        .join('');
    }
    return (
      '<select id="jml-ach-edit-rule-type">' +
      '<optgroup label="已实现">' +
      opts(implemented) +
      '</optgroup>' +
      '<optgroup label="未实现（暂不可解锁）">' +
      opts(pending, ' · 未实现') +
      '</optgroup>' +
      '</select>' +
      '<div id="jml-ach-rule-type-warn" class="jml-ach-inline-warn" hidden></div>'
    );
  }

  function buildRuleParamsHintHtml(ruleType) {
    var hint = RULE_PARAM_HINTS[ruleType] || 'JSON 对象，字段取决于 ruleType；未实现的类型改了也不会生效。';
    return '<div id="jml-ach-rule-params-hint" class="jml-ach-field-hint">' + escapeHtml(hint) + '</div>';
  }

  function achievementRowHtml(item) {
    var preview = resolveImagePreview(item);
    var thumb = preview
      ? '<img class="jml-ach-thumb" src="' + escapeHtml(preview) + '" alt="" />'
      : '<span class="jml-ach-thumb jml-ach-thumb-empty">无图</span>';
    var nameCell =
      escapeHtml(item.name || '') +
      (item.nameEn
        ? '<div class="jml-ach-name-en muted">' + escapeHtml(item.nameEn) + '</div>'
        : '<div class="jml-ach-name-en jml-ach-inline-warn">英文名为空</div>');
    var ruleBadge = isRuleTypeImplemented(item.ruleType)
      ? ''
      : ' <span class="jml-ach-pill-warn">未实现</span>';
    return (
      '<tr class="jml-ach-item-row" draggable="true" data-id="' +
      escapeHtml(item.id) +
      '" data-category="' +
      escapeHtml(item.category || DEFAULT_CATEGORY_SLUG) +
      '">' +
      '<td class="jml-ach-drag-col"><span class="jml-ach-drag-handle" title="拖动排序">⠿</span></td>' +
      '<td><code>' +
      escapeHtml(item.id) +
      '</code></td>' +
      '<td class="jml-ach-name-cell">' +
      '<div class="jml-ach-name-stack">' +
      thumb +
      '<div class="jml-ach-name-text">' +
      nameCell +
      '</div></div></td>' +
      '<td class="num">' +
      escapeHtml(String(item.xpReward != null ? item.xpReward : 0)) +
      '</td>' +
      '<td><code>' +
      escapeHtml(item.ruleType || '') +
      '</code>' +
      ruleBadge +
      '</td>' +
      '<td>' +
      (item.enabled === false ? '否' : '是') +
      '</td>' +
      '<td class="jml-ach-row-actions">' +
      '<button type="button" class="jml-btn jml-btn-sm jml-ach-edit-btn">编辑</button> ' +
      '<button type="button" class="jml-btn jml-btn-sm jml-btn-danger jml-ach-del-btn" data-id="' +
      escapeHtml(item.id) +
      '">删除</button></td>' +
      '</tr>'
    );
  }

  function deleteAchievement(id) {
    var item = findItem(id);
    if (!item) {
      setStatus('成就不存在：' + id, 'err');
      return;
    }
    var msg =
      '确定永久删除成就「' +
      (item.name || id) +
      '」（' +
      id +
      '）？\n\n' +
      '将删除 catalog 配置、徽章图片，并清除全部学员的解锁与佩戴记录。\n' +
      '已发放的 XP 不会扣回。此操作不可撤销。';
    if (!window.confirm(msg)) return;
    setStatus('正在删除成就…', '');
    apiFetch('/api/admin/achievements/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (data) {
        state.catalog = ensureCatalogShape(data.catalog || state.catalog);
        state.dirty = false;
        renderTable();
        setStatus(
          '已删除「' +
            id +
            '」· 清除 ' +
            (data.recordsRemoved || 0) +
            ' 条解锁 · ' +
            (data.usersTouched || 0) +
            ' 名学员受影响',
          'ok',
        );
      })
      .catch(function (e) {
        setStatus('删除失败：' + (e.message || e), 'err');
      });
  }

  function wireCategoryDnD(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll('.jml-ach-folder-head').forEach(function (head) {
      head.addEventListener('dragstart', function (e) {
        var folder = head.closest('.jml-ach-folder');
        if (!folder) return;
        state.categoryDragFrom = Array.from(listEl.children).indexOf(folder);
        folder.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      head.addEventListener('dragend', function () {
        var folder = head.closest('.jml-ach-folder');
        if (folder) folder.classList.remove('dragging');
        listEl.querySelectorAll('.jml-ach-folder').forEach(function (x) {
          x.classList.remove('drag-over-top');
          x.classList.remove('drag-over-bottom');
        });
      });
      head.addEventListener('dragover', function (e) {
        e.preventDefault();
        var folder = head.closest('.jml-ach-folder');
        if (!folder) return;
        var rect = head.getBoundingClientRect();
        var before = e.clientY - rect.top < rect.height / 2;
        folder.classList.toggle('drag-over-top', before);
        folder.classList.toggle('drag-over-bottom', !before);
      });
      head.addEventListener('dragleave', function () {
        var folder = head.closest('.jml-ach-folder');
        if (!folder) return;
        folder.classList.remove('drag-over-top');
        folder.classList.remove('drag-over-bottom');
      });
      head.addEventListener('drop', function (e) {
        e.preventDefault();
        var folder = head.closest('.jml-ach-folder');
        if (!folder) return;
        var from = state.categoryDragFrom;
        if (from < 0) return;
        var rows = Array.from(listEl.children);
        var to = rows.indexOf(folder);
        if (to < 0 || to === from) return;
        var rect = head.getBoundingClientRect();
        var before = e.clientY - rect.top < rect.height / 2;
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

  function toggleCategoryCollapsed(slug) {
    collapsedCategories[slug] = !collapsedCategories[slug];
    renderTable();
  }

  function openCategoryModal(mode, slug) {
    mode = mode === 'edit' ? 'edit' : 'add';
    var modal = document.getElementById('jml-modal-overlay');
    var title = document.getElementById('jml-modal-title');
    var body = document.getElementById('jml-modal-body');
    var actions = document.getElementById('jml-modal-actions');
    if (!modal || !title || !body || !actions) return;
    modal.classList.remove('jml-modal-wide');
    var meta = mode === 'edit' ? getCategoryMeta(slug) : { name: '', nameEn: '' };
    var initialSlug = mode === 'edit' ? slug : deriveCategorySlug('', '');
    title.textContent = mode === 'edit' ? '编辑分类' : '添加分类';
    body.innerHTML =
      fieldRow(
        'slug',
        mode === 'edit'
          ? '<code class="jml-ach-id-chip">' + escapeHtml(slug) + '</code>'
          : '<input id="jml-cat-edit-slug" type="text" value="' +
            escapeHtml(initialSlug) +
            '" spellcheck="false" />' +
            '<div class="jml-ach-field-hint">仅小写英文、数字与连字符；创建后不可修改</div>',
      ) +
      fieldRow('名称（繁中）', '<input id="jml-cat-edit-name" type="text" value="' + escapeHtml(meta.name || '') + '" />') +
      fieldRow(
        '名称（English）',
        '<input id="jml-cat-edit-name-en" type="text" value="' +
          escapeHtml(meta.nameEn || '') +
          '" placeholder="English name" />' +
          (mode === 'add'
            ? '<div class="jml-ach-field-hint">填写英文名后会自动建议 slug</div>'
            : ''),
      );

    actions.innerHTML = '';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'jml-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', closeModal);
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'jml-btn jml-btn-primary';
    saveBtn.textContent = mode === 'edit' ? '保存' : '添加';
    saveBtn.addEventListener('click', function () {
      try {
        if (mode === 'add') saveNewCategory();
        else saveCategoryEdit(slug);
        closeModal();
        renderTable();
      } catch (e) {
        setStatus(e.message || String(e), 'err');
      }
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.hidden = false;
    modalKeyHandler = function (e) {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', modalKeyHandler);

    if (mode === 'add') {
      var nameEl = document.getElementById('jml-cat-edit-name');
      var nameEnEl = document.getElementById('jml-cat-edit-name-en');
      var slugEl = document.getElementById('jml-cat-edit-slug');
      var slugTouched = false;
      if (slugEl) {
        slugEl.addEventListener('input', function () {
          slugTouched = true;
        });
      }
      function syncSuggestedSlug() {
        if (slugTouched || !slugEl) return;
        slugEl.value = deriveCategorySlug(nameEnEl ? nameEnEl.value : '', nameEl ? nameEl.value : '');
      }
      if (nameEl) nameEl.addEventListener('input', syncSuggestedSlug);
      if (nameEnEl) nameEnEl.addEventListener('input', syncSuggestedSlug);
    }
  }

  function saveNewCategory() {
    var nameEl = document.getElementById('jml-cat-edit-name');
    var nameEnEl = document.getElementById('jml-cat-edit-name-en');
    var slugEl = document.getElementById('jml-cat-edit-slug');
    var name = nameEl ? nameEl.value.trim() : '';
    var nameEn = nameEnEl ? nameEnEl.value.trim() : '';
    var slug = slugEl ? slugEl.value.trim().toLowerCase() : '';
    if (!name) throw new Error('请填写繁中名称');
    if (!isCategorySlug(slug)) throw new Error('slug 格式无效（需以小写字母开头，仅含 a-z、0-9、-）');
    ensureCatalogShape(state.catalog);
    if (state.catalog.categories[slug]) throw new Error('slug 已存在：' + slug);
    state.catalog.categories[slug] = { name: name, nameEn: nameEn };
    if (state.catalog.categoryOrder.indexOf(slug) < 0) state.catalog.categoryOrder.push(slug);
    collapsedCategories[slug] = false;
    markDirty('已添加分类「' + name + '」，记得保存 catalog');
  }

  function saveCategoryEdit(slug) {
    if (!slug) throw new Error('分类不存在');
    var nameEl = document.getElementById('jml-cat-edit-name');
    var nameEnEl = document.getElementById('jml-cat-edit-name-en');
    var name = nameEl ? nameEl.value.trim() : '';
    var nameEn = nameEnEl ? nameEnEl.value.trim() : '';
    if (!name) throw new Error('请填写繁中名称');
    ensureCatalogShape(state.catalog);
    if (!state.catalog.categories[slug]) throw new Error('分类不存在');
    state.catalog.categories[slug] = { name: name, nameEn: nameEn };
    markDirty('分类「' + name + '」已更新，记得保存 catalog');
  }

  function deleteCategory(slug) {
    if (!slug || slug === DEFAULT_CATEGORY_SLUG) {
      setStatus('系统默认分类「其他」不可删除', 'err');
      return;
    }
    if (itemsForCategory(slug).length > 0) {
      setStatus('该分类下仍有成就，请先移走或删除后再删分类', 'err');
      return;
    }
    var meta = getCategoryMeta(slug);
    if (!window.confirm('确定删除空分类「' + (meta.name || slug) + '」？')) return;
    ensureCatalogShape(state.catalog);
    delete state.catalog.categories[slug];
    state.catalog.categoryOrder = (state.catalog.categoryOrder || []).filter(function (s) {
      return s !== slug;
    });
    delete collapsedCategories[slug];
    markDirty('已删除分类，记得保存 catalog');
    renderTable();
  }

  function renderTable() {
    var wrap = document.getElementById('jml-achievements-table-wrap');
    if (!wrap || !state.catalog) return;
    ensureCatalogShape(state.catalog);
    var order = state.catalog.categoryOrder || [];
    if (!order.length) {
      wrap.innerHTML = '<p class="muted">暂无分类。请添加分类后再管理成就。</p>';
      return;
    }

    var treeHtml =
      '<div class="jml-ach-tree">' +
      '<div class="jml-ach-tree-toolbar">' +
      '<button type="button" class="jml-btn jml-btn-sm" id="jml-btn-add-category">+ 添加分类</button>' +
      '<span class="muted jml-ach-tree-hint">拖动文件夹行调整分类顺序；展开后可拖动成就排序</span>' +
      '</div>' +
      '<ul class="jml-ach-tree-list" id="jml-ach-category-list">' +
      order
        .map(function (slug) {
          var catItems = itemsForCategory(slug);
          var collapsed = !!collapsedCategories[slug];
          var canDelete = catItems.length === 0 && slug !== DEFAULT_CATEGORY_SLUG;
          return (
            '<li class="jml-ach-folder' +
            (collapsed ? ' is-collapsed' : '') +
            '" data-category="' +
            escapeHtml(slug) +
            '">' +
            '<div class="jml-ach-folder-head" draggable="true">' +
            '<button type="button" class="jml-ach-folder-toggle" data-category="' +
            escapeHtml(slug) +
            '" aria-label="展开/折叠">' +
            (collapsed ? '▸' : '▾') +
            '</button>' +
            '<span class="jml-ach-drag-handle" title="拖动调整分类顺序">⠿</span>' +
            '<span class="jml-ach-folder-title">' +
            escapeHtml(categoryAdminLabel(slug)) +
            '</span>' +
            '<code class="jml-ach-folder-slug muted">' +
            escapeHtml(slug) +
            '</code>' +
            '<span class="jml-ach-category-count muted">' +
            catItems.length +
            ' 项</span>' +
            '<span class="jml-ach-folder-actions">' +
            '<button type="button" class="jml-btn jml-btn-sm jml-ach-cat-edit-btn" data-category="' +
            escapeHtml(slug) +
            '">编辑</button> ' +
            '<button type="button" class="jml-btn jml-btn-sm jml-ach-cat-del-btn"' +
            (canDelete ? '' : ' disabled') +
            ' data-category="' +
            escapeHtml(slug) +
            '">删除</button>' +
            '</span></div>' +
            '<div class="jml-ach-folder-body">' +
            (catItems.length
              ? '<div class="jml-table-wrap"><table class="jml-user-table jml-achievements-table">' +
                '<thead><tr><th class="jml-ach-drag-col"></th><th>id</th><th>名称</th><th class="num">XP</th><th>ruleType</th><th>启用</th><th>操作</th></tr></thead>' +
                '<tbody data-category="' +
                escapeHtml(slug) +
                '">' +
                catItems.map(achievementRowHtml).join('') +
                '</tbody></table></div>'
              : '<p class="muted jml-ach-folder-empty">此分类暂无成就</p>') +
            '</div></li>'
          );
        })
        .join('') +
      '</ul></div>';

    wrap.innerHTML = treeHtml;

    var addBtn = document.getElementById('jml-btn-add-category');
    if (addBtn) addBtn.addEventListener('click', function () { openCategoryModal('add'); });

    wrap.querySelectorAll('.jml-ach-folder-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleCategoryCollapsed(btn.getAttribute('data-category') || '');
      });
    });
    wrap.querySelectorAll('.jml-ach-cat-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCategoryModal('edit', btn.getAttribute('data-category') || '');
      });
    });
    wrap.querySelectorAll('.jml-ach-cat-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        deleteCategory(btn.getAttribute('data-category') || '');
      });
    });

    wireCategoryDnD(document.getElementById('jml-ach-category-list'));
    wrap.querySelectorAll('tbody[data-category]').forEach(function (tbody) {
      wireItemDnD(tbody, tbody.getAttribute('data-category') || DEFAULT_CATEGORY_SLUG);
    });
    wrap.querySelectorAll('.jml-ach-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr ? tr.getAttribute('data-id') : '';
        openEditModal(id);
      });
    });
    wrap.querySelectorAll('.jml-ach-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteAchievement(btn.getAttribute('data-id') || '');
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
        markDirty('「' + categoryAdminLabel(category) + '」内成就顺序已更新，记得保存 catalog');
        renderTable();
      });
    });
  }

  function findItem(id) {
    var items = state.catalog && state.catalog.items ? state.catalog.items : [];
    return items.find(function (x) {
      return x && x.id === id;
    });
  }

  function mergeImageFromUploadResponse(id, data) {
    var local = findItem(id);
    if (!local) return;
    var remote = data && data.item ? data.item : null;
    if (remote) {
      local.imagePath = remote.imagePath || local.imagePath;
      local.imageUrl = remote.imageUrl || local.imageUrl;
      return;
    }
    if (!data || !data.catalog || !Array.isArray(data.catalog.items)) return;
    var remoteItem = data.catalog.items.find(function (x) {
      return x && x.id === id;
    });
    if (!remoteItem) return;
    local.imagePath = remoteItem.imagePath || local.imagePath;
    local.imageUrl = remoteItem.imageUrl || local.imageUrl;
  }

  function updateRuleTypeUi() {
    var ruleTypeEl = document.getElementById('jml-ach-edit-rule-type');
    var warnEl = document.getElementById('jml-ach-rule-type-warn');
    var hintEl = document.getElementById('jml-ach-rule-params-hint');
    if (!ruleTypeEl) return;
    var rt = ruleTypeEl.value;
    if (warnEl) {
      if (!isRuleTypeImplemented(rt)) {
        warnEl.hidden = false;
        warnEl.textContent = '该 ruleType 尚未实现，学员无法解锁此成就。';
      } else {
        warnEl.hidden = true;
        warnEl.textContent = '';
      }
    }
    if (hintEl) {
      hintEl.textContent = RULE_PARAM_HINTS[rt] || 'JSON 对象，字段取决于 ruleType；未实现的类型改了也不会生效。';
    }
  }

  function updateEnglishWarnUi() {
    var nameEnEl = document.getElementById('jml-ach-edit-name-en');
    var hintEnEl = document.getElementById('jml-ach-edit-hint-en');
    var nameWarn = document.getElementById('jml-ach-name-en-warn');
    var hintWarn = document.getElementById('jml-ach-hint-en-warn');
    if (nameWarn && nameEnEl) nameWarn.hidden = !!nameEnEl.value.trim();
    if (hintWarn && hintEnEl) hintWarn.hidden = !!hintEnEl.value.trim();
  }

  /** 徽章预览：固定 DOM，仅切换 img / 占位可见性与 src */
  function updateAchievementImagePreview(opts) {
    opts = opts || {};
    var src = opts.src ? String(opts.src) : '';
    var pending = opts.pending === true;
    var img = document.getElementById('jml-ach-edit-preview');
    var empty = document.getElementById('jml-ach-edit-preview-empty');
    if (!img || !empty) return;
    if (src) {
      img.src = src;
      img.hidden = false;
      empty.hidden = true;
      if (pending) img.classList.add('jml-ach-edit-preview-pending');
      else img.classList.remove('jml-ach-edit-preview-pending');
      return;
    }
    img.removeAttribute('src');
    img.hidden = true;
    img.classList.remove('jml-ach-edit-preview-pending');
    empty.hidden = false;
  }

  function buildAchievementImageBlockHtml() {
    return (
      '<div class="jml-ach-edit-image-block">' +
      '<div id="jml-ach-edit-preview-host" class="jml-ach-edit-preview-host">' +
      '<img id="jml-ach-edit-preview" alt="" class="jml-ach-edit-preview" hidden />' +
      '<div id="jml-ach-edit-preview-empty" class="jml-ach-edit-preview-empty muted">尚未上传</div>' +
      '</div>' +
      '<label class="jml-ach-file-btn"><span>选择图片</span><input id="jml-ach-edit-image" type="file" accept="image/png,image/jpeg,image/webp,image/*" hidden /></label>' +
      '<div class="jml-ach-field-hint">任意尺寸，保存时自动转为 256×256</div>' +
      '</div>'
    );
  }

  function wireEditModalInteractions(item) {
    var ruleTypeEl = document.getElementById('jml-ach-edit-rule-type');
    if (ruleTypeEl) {
      ruleTypeEl.addEventListener('change', updateRuleTypeUi);
      updateRuleTypeUi();
    }
    ['jml-ach-edit-name-en', 'jml-ach-edit-hint-en'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', updateEnglishWarnUi);
    });
    updateEnglishWarnUi();

    var imageEl = document.getElementById('jml-ach-edit-image');
    if (imageEl) {
      imageEl.addEventListener('change', function () {
        var file = imageEl.files && imageEl.files[0];
        if (!file) return;
        normalizeUploadFile(file)
          .then(function (normalized) {
            updateAchievementImagePreview({ src: normalized.dataUrl, pending: true });
          })
          .catch(function (e) {
            setStatus(e.message || String(e), 'err');
          });
      });
    }
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

    var sortLabel = categorySortLabel(item);
    var imageBlock = buildAchievementImageBlockHtml();

    body.innerHTML =
      '<p class="jml-ach-edit-intro muted">保存后会立即写入服务器（含文案与图片）。排序请在列表页拖动。</p>' +
      '<div class="jml-ach-edit-grid">' +
      '<div class="jml-ach-edit-col jml-ach-edit-col--meta">' +
      '<h4 class="jml-ach-edit-section">基本信息</h4>' +
      fieldRow('id', '<code class="jml-ach-id-chip">' + escapeHtml(item.id) + '</code>') +
      fieldRow('名称（繁中）', '<input id="jml-ach-edit-name" type="text" value="' + escapeHtml(item.name || '') + '" />') +
      fieldRow(
        '名称（English）',
        '<input id="jml-ach-edit-name-en" type="text" value="' +
          escapeHtml(item.nameEn || '') +
          '" placeholder="English name" />' +
          '<div id="jml-ach-name-en-warn" class="jml-ach-inline-warn"' +
          (item.nameEn ? ' hidden' : '') +
          '>英文名为空时，英文界面会显示繁中名称</div>',
      ) +
      fieldRow(
        '分类',
        buildCategorySelectHtml(item.category || DEFAULT_CATEGORY_SLUG) +
          (sortLabel
            ? '<div class="jml-ach-field-hint">当前排序：' + escapeHtml(sortLabel) + '</div>'
            : ''),
      ) +
      fieldRow('XP 奖励', '<input id="jml-ach-edit-xp" type="number" min="0" step="1" value="' + escapeHtml(String(item.xpReward != null ? item.xpReward : 0)) + '" />') +
      fieldRow('未解锁提示（繁中）', '<input id="jml-ach-edit-hint" type="text" value="' + escapeHtml(item.hint || '') + '" />') +
      fieldRow(
        '未解锁提示（English）',
        '<input id="jml-ach-edit-hint-en" type="text" value="' +
          escapeHtml(item.hintEn || '') +
          '" placeholder="Hint in English" />' +
          '<div id="jml-ach-hint-en-warn" class="jml-ach-inline-warn"' +
          (item.hintEn ? ' hidden' : '') +
          '>英文提示为空时，英文界面会显示繁中提示</div>',
      ) +
      '</div>' +
      '<div class="jml-ach-edit-col jml-ach-edit-col--rule">' +
      '<h4 class="jml-ach-edit-section">规则与图片</h4>' +
      fieldRow('徽章图片', imageBlock, 'jml-field-row--top') +
      fieldRow('ruleType', buildRuleTypeSelectHtml(item.ruleType)) +
      fieldRow(
        'ruleParams',
        buildRuleParamsHintHtml(item.ruleType) +
          '<textarea id="jml-ach-edit-rule-params" rows="5">' +
          escapeHtml(JSON.stringify(item.ruleParams || {}, null, 2)) +
          '</textarea>',
        'jml-field-row--top',
      ) +
      fieldRow(
        '启用',
        '<label class="jml-ach-enabled-label"><input id="jml-ach-edit-enabled" type="checkbox"' +
          (item.enabled !== false ? ' checked' : '') +
          ' /><span>启用此成就</span></label>',
        'jml-field-row--check',
      ) +
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
    saveBtn.textContent = '保存';
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
    modalKeyHandler = function (e) {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', modalKeyHandler);
    updateAchievementImagePreview({ src: resolveImagePreview(item), pending: false });
    wireEditModalInteractions(item);
  }

  function closeModal() {
    var modal = document.getElementById('jml-modal-overlay');
    if (modal) {
      modal.hidden = true;
      modal.classList.remove('jml-modal-wide');
    }
    if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
  }

  function readFormIntoItem(id) {
    var item = findItem(id);
    if (!item) return null;
    var oldCategory = item.category || DEFAULT_CATEGORY_SLUG;
    var nameEl = document.getElementById('jml-ach-edit-name');
    var nameEnEl = document.getElementById('jml-ach-edit-name-en');
    var catEl = document.getElementById('jml-ach-edit-category');
    var xpEl = document.getElementById('jml-ach-edit-xp');
    var hintEl = document.getElementById('jml-ach-edit-hint');
    var hintEnEl = document.getElementById('jml-ach-edit-hint-en');
    var ruleTypeEl = document.getElementById('jml-ach-edit-rule-type');
    var ruleParamsEl = document.getElementById('jml-ach-edit-rule-params');
    var enabledEl = document.getElementById('jml-ach-edit-enabled');

    if (!nameEl || !nameEl.value.trim()) {
      throw new Error('请填写繁中名称');
    }

    item.name = nameEl.value.trim();
    item.nameEn = nameEnEl ? nameEnEl.value.trim() : item.nameEn;
    var nextCategory = catEl ? catEl.value : item.category;
    if (!nextCategory || !state.catalog.categories[nextCategory]) {
      throw new Error('请选择有效分类');
    }
    item.category = nextCategory;
    item.xpReward = Math.max(0, Math.floor(Number(xpEl && xpEl.value) || 0));
    item.hint = hintEl ? hintEl.value.trim() : item.hint;
    item.hintEn = hintEnEl ? hintEnEl.value.trim() : item.hintEn;
    item.ruleType = ruleTypeEl ? ruleTypeEl.value : item.ruleType;
    item.enabled = !!(enabledEl && enabledEl.checked);
    try {
      item.ruleParams = JSON.parse(ruleParamsEl ? ruleParamsEl.value : '{}');
    } catch (e) {
      throw new Error('ruleParams JSON 无效');
    }

    ensureCatalogShape(state.catalog);
    if (nextCategory !== oldCategory) {
      var dest = itemsForCategory(nextCategory).filter(function (x) {
        return x.id !== item.id;
      });
      item.sortOrder = dest.length ? (dest[dest.length - 1].sortOrder || 0) + 10 : 10;
      reindexItemsInCategory(oldCategory);
    }
    return item;
  }

  function uploadAchievementImage(id, file) {
    setStatus('第 1/2 步：正在读取并压缩图片（256×256）…', '');
    return normalizeUploadFile(file)
      .then(function (normalized) {
        var kb = Math.max(1, Math.round((normalized.bytes || 0) / 1024));
        setStatus('第 2/2 步：压缩完成（约 ' + kb + 'KB），正在上传图片…', '');
        return apiFetch('/api/admin/achievements/' + encodeURIComponent(id) + '/replace-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: normalized.dataUrl }),
        }).then(function (data) {
          mergeImageFromUploadResponse(id, data);
          return { data: data, normalized: normalized };
        });
      })
      .then(function (result) {
        return '图片已更新 · ' + formatNormalizeStatus(result.normalized);
      });
  }

  function applyEditToItem(id) {
    readFormIntoItem(id);
    var imageEl = document.getElementById('jml-ach-edit-image');
    var file = imageEl && imageEl.files && imageEl.files[0];

    setStatus('正在保存成就…', '');
    return saveCatalog({ silent: true })
      .then(function () {
        if (!file) return '成就已保存';
        return uploadAchievementImage(id, file);
      })
      .then(function (msg) {
        setStatus(msg, 'ok');
      });
  }

  function loadCatalog() {
    setStatus('加载成就 catalog…', '');
    return apiFetch('/api/admin/achievements/catalog')
      .then(function (data) {
        state.catalog = ensureCatalogShape(data.catalog || { version: 2, categoryOrder: [DEFAULT_CATEGORY_SLUG], categories: {}, items: [] });
        state.ruleTypes = Array.isArray(data.ruleTypes) ? data.ruleTypes.slice() : [];
        state.implementedRuleTypes = Array.isArray(data.implementedRuleTypes)
          ? data.implementedRuleTypes.slice()
          : ['any_run', 'mode_run_count'];
        state.dirty = false;
        renderTable();
        setStatus('成就 catalog 已加载（' + (state.catalog.items || []).length + ' 条）', 'ok');
      })
      .catch(function (e) {
        setStatus('加载成就失败：' + (e.message || e), 'err');
      });
  }

  function saveCatalog(opts) {
    opts = opts || {};
    if (!state.catalog) return Promise.resolve();
    ensureCatalogShape(state.catalog);
    if (!opts.silent) setStatus('保存成就 catalog…', '');
    return apiFetch('/api/admin/achievements/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog: state.catalog }),
    })
      .then(function (data) {
        state.catalog = ensureCatalogShape(data.catalog || state.catalog);
        state.dirty = false;
        if (!opts.silent) {
          renderTable();
          setStatus('成就 catalog 已保存', 'ok');
        }
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

  function formatImportReportHtml(report) {
    if (!report) return '<p class="muted">无报告</p>';
    var parts = [];
    if (report.comment) {
      parts.push('<p><strong>说明：</strong>' + escapeHtml(report.comment) + '</p>');
    }
    parts.push('<p>将新增成就 <strong>' + (report.addedItems || []).length + '</strong> 条，跳过 <strong>' + (report.skippedItems || []).length + '</strong> 条。</p>');
    if ((report.addedCategories || []).length) {
      parts.push('<p><strong>新增分类</strong></p><ul>');
      report.addedCategories.forEach(function (c) {
        parts.push('<li><code>' + escapeHtml(c.slug) + '</code> · ' + escapeHtml(c.name) + '</li>');
      });
      parts.push('</ul>');
    }
    if ((report.skippedCategories || []).length) {
      parts.push('<p><strong>跳过的分类</strong></p><ul class="muted">');
      report.skippedCategories.forEach(function (c) {
        parts.push('<li><code>' + escapeHtml(c.slug) + '</code>（' + escapeHtml(c.reason || '') + '）</li>');
      });
      parts.push('</ul>');
    }
    if ((report.addedItems || []).length) {
      parts.push('<p><strong>将添加的成就</strong></p><ul>');
      report.addedItems.forEach(function (item) {
        parts.push(
          '<li><code>' +
            escapeHtml(item.id) +
            '</code> · ' +
            escapeHtml(item.name) +
            ' · <code>' +
            escapeHtml(item.ruleType || '') +
            '</code></li>',
        );
      });
      parts.push('</ul>');
    }
    if ((report.skippedItems || []).length) {
      parts.push('<p><strong>跳过的成就</strong></p><ul class="muted">');
      report.skippedItems.forEach(function (item) {
        parts.push(
          '<li><code>' +
            escapeHtml(item.id) +
            '</code>（' +
            escapeHtml(item.reason || '') +
            (item.name ? ' · ' + escapeHtml(item.name) : '') +
            '）</li>',
        );
      });
      parts.push('</ul>');
    }
    if ((report.warnings || []).length) {
      parts.push('<p><strong>提示</strong></p><ul class="jml-ach-inline-warn">');
      report.warnings.forEach(function (w) {
        parts.push('<li>' + escapeHtml(w) + '</li>');
      });
      parts.push('</ul>');
    }
    return parts.join('');
  }

  function formatImportStatusMessage(report, applied) {
    if (!report) return applied ? '导入完成' : '预览完成';
    var added = (report.addedItems || []).length;
    var skipped = (report.skippedItems || []).length;
    var prefix = applied ? '导入完成' : '预览';
    return prefix + '：新增 ' + added + ' 条，跳过 ' + skipped + ' 条';
  }

  function postAchievementImport(importPayload, dryRun) {
    return apiFetch('/api/admin/achievements/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ import: importPayload, dryRun: !!dryRun }),
    });
  }

  function openImportPreviewModal(importPayload, previewReport) {
    var modal = document.getElementById('jml-modal-overlay');
    var title = document.getElementById('jml-modal-title');
    var body = document.getElementById('jml-modal-body');
    var actions = document.getElementById('jml-modal-actions');
    if (!modal || !title || !body || !actions) return;
    modal.classList.add('jml-modal-wide');
    title.textContent = '从文件添加成就 · 预览';
    body.innerHTML = formatImportReportHtml(previewReport);
    actions.innerHTML = '';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'jml-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', closeModal);
    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'jml-btn jml-btn-primary';
    confirmBtn.textContent = '确认添加';
    confirmBtn.disabled = !(previewReport.addedItems && previewReport.addedItems.length);
    confirmBtn.addEventListener('click', function () {
      confirmBtn.disabled = true;
      setStatus('正在导入成就…', '');
      postAchievementImport(importPayload, false)
        .then(function (data) {
          closeModal();
          state.catalog = ensureCatalogShape(data.catalog || state.catalog);
          state.dirty = false;
          renderTable();
          setStatus(formatImportStatusMessage(data.report, true), 'ok');
        })
        .catch(function (e) {
          confirmBtn.disabled = false;
          setStatus('导入失败：' + (e.message || e), 'err');
        });
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.hidden = false;
    modalKeyHandler = function (e) {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', modalKeyHandler);
  }

  function handleImportFileSelected(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        setStatus('JSON 解析失败：' + (e.message || e), 'err');
        return;
      }
      setStatus('正在预览导入…', '');
      postAchievementImport(parsed, true)
        .then(function (data) {
          setStatus(formatImportStatusMessage(data.report, false), 'ok');
          openImportPreviewModal(parsed, data.report || {});
        })
        .catch(function (e) {
          setStatus('预览失败：' + (e.message || e), 'err');
        });
    };
    reader.onerror = function () {
      setStatus('读取文件失败', 'err');
    };
    reader.readAsText(file, 'utf-8');
  }

  function bindEvents() {
    var refreshBtn = document.getElementById('jml-btn-achievements-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadCatalog);
    var importBtn = document.getElementById('jml-btn-achievements-import');
    var importFile = document.getElementById('jml-achievements-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', function () {
        importFile.value = '';
        importFile.click();
      });
      importFile.addEventListener('change', function () {
        var file = importFile.files && importFile.files[0];
        handleImportFileSelected(file);
      });
    }
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
