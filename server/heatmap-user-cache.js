/**
 * 学员热图快照：每用户一份 JSON。
 * 无新局则可直接复用；有新局时只重算相关分类（由 user-heatmap 判定）。
 */
const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;

function createHeatmapUserCache(opts) {
  const dataDir = opts.dataDir;
  const byUserDir = opts.byUserDir || path.join(dataDir, "heatmap-by-user");
  const readJson = opts.readJson;
  const writeJson = opts.writeJson;

  function ensureDir() {
    if (!fs.existsSync(byUserDir)) fs.mkdirSync(byUserDir, { recursive: true });
  }

  function encodeUsername(username) {
    return encodeURIComponent(String(username || ""));
  }

  function userFile(username) {
    return path.join(byUserDir, encodeUsername(username) + ".json");
  }

  function emptyDoc(username) {
    return {
      schemaVersion: SCHEMA_VERSION,
      username: String(username || ""),
      updatedAt: 0,
      byCategory: {},
      categories: [],
      maxRunTsByCategory: {},
      selectionHint: null,
    };
  }


  function get(username) {
    const name = String(username || "");
    if (!name) return null;
    try {
      if (!fs.existsSync(userFile(name))) return null;
      const data = readJson(userFile(name), null);
      if (!data || typeof data !== "object") return null;
      if (Number(data.schemaVersion) !== SCHEMA_VERSION) return null;
      if (!data.byCategory || typeof data.byCategory !== "object") return null;
      return data;
    } catch (e) {
      console.warn("[heatmap-user-cache] read failed", name, e && e.message ? e.message : e);
      return null;
    }
  }

  function set(username, doc) {
    const name = String(username || "");
    if (!name || !doc) return;
    ensureDir();
    writeJson(userFile(name), {
      schemaVersion: SCHEMA_VERSION,
      username: name,
      updatedAt: Date.now(),
      byCategory: doc.byCategory && typeof doc.byCategory === "object" ? doc.byCategory : {},
      categories: Array.isArray(doc.categories) ? doc.categories : [],
      maxRunTsByCategory:
        doc.maxRunTsByCategory && typeof doc.maxRunTsByCategory === "object"
          ? doc.maxRunTsByCategory
          : {},
      selectionHint:
        doc.selectionHint && typeof doc.selectionHint === "object" ? doc.selectionHint : null,
    });
  }

  return {
    SCHEMA_VERSION,
    get,
    set,
    userFile,
  };
}

module.exports = {
  SCHEMA_VERSION,
  createHeatmapUserCache,
};
