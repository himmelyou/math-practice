const fs = require("fs");
const path = require("path");

const DEFAULT_CATALOG_PATH = path.join(__dirname, "default-catalog.json");
const DEFAULT_CATEGORY = "其他";

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

function mergeCategoryOrder(order, items) {
  const next = (Array.isArray(order) ? order : [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const seen = new Set(next);
  (items || []).forEach((item) => {
    const cat = String((item && item.category) || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    if (!seen.has(cat)) {
      seen.add(cat);
      next.push(cat);
    }
  });
  return next;
}

function sortCatalogItems(items, categoryOrder) {
  const catIndex = new Map((categoryOrder || []).map((c, i) => [c, i]));
  return (items || []).slice().sort((a, b) => {
    const ca = String(a.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    const cb = String(b.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    const ia = catIndex.has(ca) ? catIndex.get(ca) : 9999;
    const ib = catIndex.has(cb) ? catIndex.get(cb) : 9999;
    if (ia !== ib) return ia - ib;
    return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id));
  });
}

function reindexSortOrdersWithinCategories(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const cat = String(item.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
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
  return {
    id,
    name: String(raw.name || id),
    nameEn: String(raw.nameEn || ""),
    icon: String(raw.icon || "🏅"),
    imagePath: String(raw.imagePath || ""),
    category: String(raw.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY,
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
  const map = new Map();
  (Array.isArray(raw && raw.items) ? raw.items : []).forEach((item) => {
    const norm = normalizeCatalogItem(item);
    if (norm) map.set(norm.id, norm);
  });
  const items = Array.from(map.values());
  reindexSortOrdersWithinCategories(items);
  const categoryOrder = mergeCategoryOrder(raw && raw.categoryOrder, items);
  return {
    version: Number(raw && raw.version) || 1,
    categoryOrder,
    items: sortCatalogItems(items, categoryOrder),
  };
}

function createCatalogStore(catalogFilePath) {
  function seedIfMissing() {
    const existing = readJsonFile(catalogFilePath, null);
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
      return normalizeCatalog(existing);
    }
    const seed = normalizeCatalog(readJsonFile(DEFAULT_CATALOG_PATH, { version: 1, categoryOrder: [], items: [] }));
    writeJsonFile(catalogFilePath, seed);
    return seed;
  }

  function readCatalog() {
    const data = readJsonFile(catalogFilePath, null);
    if (!data || !Array.isArray(data.items)) return seedIfMissing();
    return normalizeCatalog(data);
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
  DEFAULT_CATEGORY,
};
