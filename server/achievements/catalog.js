const fs = require("fs");
const path = require("path");

const DEFAULT_CATALOG_PATH = path.join(__dirname, "default-catalog.json");

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

function normalizeCatalogItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(raw.name || id),
    icon: String(raw.icon || "🏅"),
    imagePath: String(raw.imagePath || ""),
    category: String(raw.category || "其他"),
    tier: String(raw.tier || ""),
    xpReward: Math.max(0, Math.floor(Number(raw.xpReward) || 0)),
    hint: String(raw.hint || ""),
    ruleType: String(raw.ruleType || ""),
    ruleParams: raw.ruleParams && typeof raw.ruleParams === "object" ? raw.ruleParams : {},
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    enabled: raw.enabled !== false,
  };
}

function normalizeCatalog(raw) {
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  const map = new Map();
  items.forEach((item) => {
    const norm = normalizeCatalogItem(item);
    if (norm) map.set(norm.id, norm);
  });
  return {
    version: Number(raw && raw.version) || 1,
    items: Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  };
}

function createCatalogStore(catalogFilePath) {
  function seedIfMissing() {
    const existing = readJsonFile(catalogFilePath, null);
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
      return normalizeCatalog(existing);
    }
    const seed = normalizeCatalog(readJsonFile(DEFAULT_CATALOG_PATH, { version: 1, items: [] }));
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
  };
}

module.exports = {
  createCatalogStore,
  normalizeCatalog,
  normalizeCatalogItem,
};
