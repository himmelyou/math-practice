const {
  normalizeCatalogItem,
  normalizeCatalog,
  isCategorySlug,
  DEFAULT_CATEGORY_SLUG,
} = require("./catalog");

const IMPORT_SCHEMA = "jml-achievement-import";

function normalizeImportPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "导入内容无效" };
  }
  const schema = String(raw.schema || "").trim();
  if (schema !== IMPORT_SCHEMA) {
    return { ok: false, error: `schema 须为 ${IMPORT_SCHEMA}` };
  }
  return {
    ok: true,
    payload: {
      schema: IMPORT_SCHEMA,
      version: Number(raw.version) || 1,
      comment: String(raw.comment || "").trim(),
      addCategories:
        raw.addCategories && typeof raw.addCategories === "object" && !Array.isArray(raw.addCategories)
          ? raw.addCategories
          : {},
      appendCategoryOrder: Array.isArray(raw.appendCategoryOrder)
        ? raw.appendCategoryOrder.map((s) => String(s || "").trim()).filter(Boolean)
        : [],
      addItems: Array.isArray(raw.addItems) ? raw.addItems : [],
    },
  };
}

function normalizeCategoryEntry(slug, raw) {
  const id = String(slug || "").trim();
  if (!isCategorySlug(id)) return null;
  const source = raw && typeof raw === "object" ? raw : {};
  const name = String(source.name || id).trim() || id;
  const nameEn = String(source.nameEn || "").trim();
  return { slug: id, name, nameEn };
}

/**
 * @param {object} catalog 已 normalize 的 catalog
 * @param {object} importPayload normalizeImportPayload 的 payload
 * @param {{ registeredRuleTypes?: string[], implementedRuleTypes?: string[] }} options
 */
function mergeImportIntoCatalog(catalog, importPayload, options) {
  const registered = new Set(options && options.registeredRuleTypes ? options.registeredRuleTypes : []);
  const implemented = new Set(options && options.implementedRuleTypes ? options.implementedRuleTypes : []);
  const report = {
    comment: importPayload.comment || "",
    addedCategories: [],
    skippedCategories: [],
    appendedCategoryOrder: [],
    addedItems: [],
    skippedItems: [],
    warnings: [],
  };

  const next = {
    version: catalog.version || 2,
    categoryOrder: Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder.slice() : [],
    categories: Object.assign({}, catalog.categories || {}),
    items: (catalog.items || []).slice(),
  };

  const existingIds = new Set(next.items.map((item) => item.id));

  Object.keys(importPayload.addCategories || {}).forEach((slug) => {
    const entry = normalizeCategoryEntry(slug, importPayload.addCategories[slug]);
    if (!entry) {
      report.skippedCategories.push({ slug: String(slug || ""), reason: "invalid_slug" });
      return;
    }
    if (next.categories[entry.slug]) {
      report.skippedCategories.push({ slug: entry.slug, reason: "exists", name: next.categories[entry.slug].name });
      return;
    }
    next.categories[entry.slug] = { name: entry.name, nameEn: entry.nameEn };
    report.addedCategories.push({ slug: entry.slug, name: entry.name, nameEn: entry.nameEn });
  });

  (importPayload.appendCategoryOrder || []).forEach((slug) => {
    const s = String(slug || "").trim();
    if (!isCategorySlug(s)) {
      report.warnings.push(`appendCategoryOrder 忽略无效 slug：${s}`);
      return;
    }
    if (!next.categories[s]) {
      report.warnings.push(`appendCategoryOrder 跳过未知分类：${s}`);
      return;
    }
    if (next.categoryOrder.indexOf(s) >= 0) return;
    next.categoryOrder.push(s);
    report.appendedCategoryOrder.push(s);
  });

  (importPayload.addItems || []).forEach((rawItem, index) => {
    const norm = normalizeCatalogItem(rawItem);
    if (!norm) {
      report.skippedItems.push({
        id: rawItem && rawItem.id ? String(rawItem.id) : `(index ${index})`,
        reason: "invalid_item",
      });
      return;
    }
    if (existingIds.has(norm.id)) {
      report.skippedItems.push({ id: norm.id, reason: "id_exists", name: norm.name });
      return;
    }
    if (registered.size > 0 && !registered.has(norm.ruleType)) {
      report.skippedItems.push({ id: norm.id, reason: "unknown_rule_type", ruleType: norm.ruleType });
      return;
    }
    if (implemented.size > 0 && !implemented.has(norm.ruleType)) {
      report.warnings.push(`成就 ${norm.id} 的 ruleType「${norm.ruleType}」尚未实现，导入后学员无法解锁`);
    }
    if (!next.categories[norm.category]) {
      next.categories[norm.category] = { name: norm.category, nameEn: "" };
      if (next.categoryOrder.indexOf(norm.category) < 0) {
        next.categoryOrder.push(norm.category);
        report.appendedCategoryOrder.push(norm.category);
      }
      report.warnings.push(`成就 ${norm.id} 引用了新分类 ${norm.category}，已自动创建占位分类名`);
    }
    next.items.push(norm);
    existingIds.add(norm.id);
    report.addedItems.push({
      id: norm.id,
      name: norm.name,
      category: norm.category,
      ruleType: norm.ruleType,
    });
  });

  const normalized = normalizeCatalog(next);
  return { catalog: normalized, report };
}

function applyAchievementImport(catalog, rawImport, options) {
  const parsed = normalizeImportPayload(rawImport);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, report: null, catalog: null };
  }
  if (!parsed.payload.addItems.length && !Object.keys(parsed.payload.addCategories || {}).length) {
    return { ok: false, error: "导入文件中没有 addItems 或 addCategories", report: null, catalog: null };
  }
  const base = normalizeCatalog(catalog || { version: 2, categoryOrder: [], categories: {}, items: [] });
  const { catalog: merged, report } = mergeImportIntoCatalog(base, parsed.payload, options || {});
  return { ok: true, catalog: merged, report };
}

module.exports = {
  IMPORT_SCHEMA,
  normalizeImportPayload,
  mergeImportIntoCatalog,
  applyAchievementImport,
};
