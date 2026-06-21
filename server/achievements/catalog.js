const fs = require("fs");
const path = require("path");

const DEFAULT_CATALOG_PATH = path.join(__dirname, "default-catalog.json");
const DEFAULT_CATEGORY_SLUG = "other";
const LEGACY_DEFAULT_LABEL = "其他";
const LEGACY_CATEGORY_SLUG_MAP = {
  入门: "getting-started",
  其他: "other",
  other: "other",
  "getting-started": "getting-started",
};

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function stableHash(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function isCategorySlug(value) {
  return /^[a-z][a-z0-9-]*$/.test(String(value || "").trim());
}

function slugifyAscii(source) {
  return String(source || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function allocateUniqueSlug(base, usedSlugs) {
  let slug = base;
  if (!slug || !isCategorySlug(slug)) slug = DEFAULT_CATEGORY_SLUG;
  if (!usedSlugs.has(slug)) {
    usedSlugs.add(slug);
    return slug;
  }
  let n = 2;
  while (usedSlugs.has(`${slug}-${n}`)) n += 1;
  const next = `${slug}-${n}`;
  usedSlugs.add(next);
  return next;
}

function deriveCategorySlug(label, nameEn, usedSlugs) {
  const trimmed = String(label || "").trim();
  if (isCategorySlug(trimmed)) {
    return allocateUniqueSlug(trimmed, usedSlugs);
  }
  const fromEn = slugifyAscii(nameEn);
  if (fromEn && fromEn.length >= 2) {
    return allocateUniqueSlug(fromEn, usedSlugs);
  }
  const fromLabel = slugifyAscii(trimmed);
  if (fromLabel && fromLabel.length >= 2) {
    return allocateUniqueSlug(fromLabel, usedSlugs);
  }
  return allocateUniqueSlug(`cat-${stableHash(trimmed || LEGACY_DEFAULT_LABEL)}`, usedSlugs);
}

function normalizeCategoryMeta(raw, slug) {
  const id = String(slug || "").trim();
  if (!id) return null;
  const source = raw && typeof raw === "object" ? raw : {};
  const name = String(source.name || id).trim() || id;
  const nameEn = String(source.nameEn || "").trim();
  return { name, nameEn };
}

function ensureDefaultCategory(categories) {
  if (!categories[DEFAULT_CATEGORY_SLUG]) {
    categories[DEFAULT_CATEGORY_SLUG] = { name: LEGACY_DEFAULT_LABEL, nameEn: "Other" };
  }
}

function migrateLegacyCategories(raw) {
  const categories = {};
  const usedSlugs = new Set();
  const labelToSlug = new Map();

  if (raw && raw.categories && typeof raw.categories === "object" && !Array.isArray(raw.categories)) {
    Object.keys(raw.categories).forEach((slug) => {
      const meta = normalizeCategoryMeta(raw.categories[slug], slug);
      if (!meta || !isCategorySlug(slug)) return;
      categories[slug] = meta;
      usedSlugs.add(slug);
      labelToSlug.set(meta.name, slug);
      if (meta.nameEn) labelToSlug.set(meta.nameEn, slug);
      labelToSlug.set(slug, slug);
    });
  }

  ensureDefaultCategory(categories);
  usedSlugs.add(DEFAULT_CATEGORY_SLUG);
  labelToSlug.set(LEGACY_DEFAULT_LABEL, DEFAULT_CATEGORY_SLUG);
  labelToSlug.set(DEFAULT_CATEGORY_SLUG, DEFAULT_CATEGORY_SLUG);

  function resolveLegacyLabel(label, hintNameEn) {
    const key = String(label || "").trim();
    if (!key) return DEFAULT_CATEGORY_SLUG;
    if (labelToSlug.has(key)) return labelToSlug.get(key);
    if (isCategorySlug(key) && categories[key]) return key;
    const mapped = LEGACY_CATEGORY_SLUG_MAP[key];
    if (mapped && (!categories[mapped] || categories[mapped].name === key || !categories[mapped].name)) {
      const slug = mapped;
      if (!categories[slug]) {
        categories[slug] = {
          name: key === "other" || key === DEFAULT_CATEGORY_SLUG ? LEGACY_DEFAULT_LABEL : key,
          nameEn: slug === "getting-started" ? "Getting Started" : slug === "other" ? "Other" : String(hintNameEn || "").trim(),
        };
      }
      usedSlugs.add(slug);
      labelToSlug.set(key, slug);
      labelToSlug.set(slug, slug);
      return slug;
    }
    const slug = deriveCategorySlug(key, hintNameEn, usedSlugs);
    categories[slug] = { name: key, nameEn: String(hintNameEn || "").trim() };
    labelToSlug.set(key, slug);
    labelToSlug.set(slug, slug);
    return slug;
  }

  const legacyOrder = Array.isArray(raw && raw.categoryOrder) ? raw.categoryOrder : [];
  const categoryOrder = [];
  legacyOrder.forEach((entry) => {
    const slug = resolveLegacyLabel(entry);
    if (slug && categoryOrder.indexOf(slug) < 0) categoryOrder.push(slug);
  });

  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const slug = resolveLegacyLabel(item.category, "");
    item.category = slug;
    if (categoryOrder.indexOf(slug) < 0) categoryOrder.push(slug);
  });

  if (!categoryOrder.length) {
    categoryOrder.push(DEFAULT_CATEGORY_SLUG);
  }

  return { categories, categoryOrder, labelToSlug };
}

function mergeCategoryOrder(order, items, categories) {
  const next = (Array.isArray(order) ? order : [])
    .map((c) => String(c || "").trim())
    .filter((c) => isCategorySlug(c) && categories[c]);
  const seen = new Set(next);
  (items || []).forEach((item) => {
    const cat = String((item && item.category) || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    const slug = categories[cat] ? cat : DEFAULT_CATEGORY_SLUG;
    item.category = slug;
    if (!seen.has(slug)) {
      seen.add(slug);
      next.push(slug);
    }
  });
  if (!next.length) next.push(DEFAULT_CATEGORY_SLUG);
  return next;
}

function sortCatalogItems(items, categoryOrder) {
  const catIndex = new Map((categoryOrder || []).map((c, i) => [c, i]));
  return (items || []).slice().sort((a, b) => {
    const ca = String(a.category || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    const cb = String(b.category || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    const ia = catIndex.has(ca) ? catIndex.get(ca) : 9999;
    const ib = catIndex.has(cb) ? catIndex.get(cb) : 9999;
    if (ia !== ib) return ia - ib;
    return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id));
  });
}

function reindexSortOrdersWithinCategories(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const cat = String(item.category || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });
  groups.forEach((list) => {
    list.sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id))
    );
    list.forEach((item, index) => {
      item.sortOrder = (index + 1) * 10;
    });
  });
  return items;
}

function normalizeCatalogItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const categoryRaw = String(raw.category || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
  return {
    id,
    name: String(raw.name || id),
    nameEn: String(raw.nameEn || ""),
    icon: String(raw.icon || "🏅"),
    imagePath: String(raw.imagePath || ""),
    category: isCategorySlug(categoryRaw) ? categoryRaw : categoryRaw,
    xpReward: Math.max(0, Math.floor(Number(raw.xpReward) || 0)),
    hint: String(raw.hint || ""),
    hintEn: String(raw.hintEn || ""),
    ruleType: String(raw.ruleType || ""),
    ruleParams: raw.ruleParams && typeof raw.ruleParams === "object" ? raw.ruleParams : {},
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    enabled: raw.enabled !== false,
  };
}

function normalizeCatalog(raw) {
  const migrated = migrateLegacyCategories(raw || {});
  const { categories, categoryOrder: migratedOrder, labelToSlug } = migrated;
  const map = new Map();
  (Array.isArray(raw && raw.items) ? raw.items : []).forEach((item) => {
    const norm = normalizeCatalogItem(item);
    if (!norm) return;
    const rawCat = String(norm.category || DEFAULT_CATEGORY_SLUG).trim() || DEFAULT_CATEGORY_SLUG;
    let slug = labelToSlug.get(rawCat) || rawCat;
    if (!categories[slug]) {
      slug = isCategorySlug(rawCat) && categories[rawCat] ? rawCat : DEFAULT_CATEGORY_SLUG;
    }
    norm.category = slug;
    map.set(norm.id, norm);
  });

  const items = Array.from(map.values());
  reindexSortOrdersWithinCategories(items);

  items.forEach((item) => {
    if (!categories[item.category]) {
      categories[item.category] = { name: item.category, nameEn: "" };
    }
  });

  ensureDefaultCategory(categories);
  const categoryOrder = mergeCategoryOrder(migratedOrder, items, categories);

  Object.keys(categories).forEach((slug) => {
    if (categoryOrder.indexOf(slug) < 0 && items.some((item) => item.category === slug)) {
      categoryOrder.push(slug);
    }
  });

  return {
    version: Math.max(Number(raw && raw.version) || 0, 2),
    categoryOrder,
    categories,
    items: sortCatalogItems(items, categoryOrder),
  };
}

function createCatalogStore(catalogFilePath) {
  function seedIfMissing() {
    const existing = readJsonFile(catalogFilePath, null);
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
      return normalizeCatalog(existing);
    }
    const seed = normalizeCatalog(readJsonFile(DEFAULT_CATALOG_PATH, { version: 2, categoryOrder: [], items: [] }));
    writeJsonFile(catalogFilePath, seed);
    return seed;
  }

  function readCatalog() {
    const data = readJsonFile(catalogFilePath, null);
    if (!data || !Array.isArray(data.items)) return seedIfMissing();
    const normalized = normalizeCatalog(data);
    return normalized;
  }

  function writeCatalog(catalog) {
    const normalized = normalizeCatalog(catalog);
    writeJsonFile(catalogFilePath, normalized);
    return normalized;
  }

  function getEnabledItems(catalog) {
    return (catalog.items || []).filter((item) => item.enabled);
  }

  function getItemMap(catalog) {
    const map = new Map();
    (catalog.items || []).forEach((item) => map.set(item.id, item));
    return map;
  }

  return {
    readCatalog,
    writeCatalog,
    getEnabledItems,
    getItemMap,
    normalizeCatalog,
    mergeCategoryOrder,
    sortCatalogItems,
    reindexSortOrdersWithinCategories,
  };
}

module.exports = {
  createCatalogStore,
  normalizeCatalog,
  normalizeCatalogItem,
  mergeCategoryOrder,
  sortCatalogItems,
  reindexSortOrdersWithinCategories,
  DEFAULT_CATEGORY_SLUG,
  DEFAULT_CATEGORY: DEFAULT_CATEGORY_SLUG,
  isCategorySlug,
  deriveCategorySlug,
};
