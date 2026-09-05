/**
 * 练习任务单按用户落盘（未完成 + 冷却窗 + 全量成功历史）。
 */
const fs = require("fs");
const path = require("path");

function createPracticePlanStore(opts) {
  const dataDir = opts.dataDir;
  const byUserDir = opts.byUserDir || path.join(dataDir, "practice-plans");
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

  function get(username) {
    const name = String(username || "");
    if (!name) return null;
    try {
      if (!fs.existsSync(userFile(name))) return null;
      const data = readJson(userFile(name), null);
      if (!data || typeof data !== "object") return null;
      return data;
    } catch (e) {
      console.warn("[practice-plan-store] read failed", name, e && e.message ? e.message : e);
      return null;
    }
  }

  function set(username, payload) {
    const name = String(username || "");
    if (!name || !payload || typeof payload !== "object") return;
    ensureDir();
    writeJson(userFile(name), {
      username: name,
      updatedAt: Date.now(),
      plan: payload.plan || null,
    });
  }

  function listUsernames() {
    ensureDir();
    if (!fs.existsSync(byUserDir)) return [];
    return fs.readdirSync(byUserDir).filter(function (name) {
      return name && name.toLowerCase().endsWith(".json");
    }).map(function (name) {
      try {
        return decodeURIComponent(name.slice(0, -5));
      } catch (e) {
        return name.slice(0, -5);
      }
    });
  }

  function exportAll() {
    const byUser = {};
    listUsernames().forEach(function (name) {
      const data = get(name);
      if (data) byUser[name] = data;
    });
    return { byUser: byUser };
  }

  function replaceAll(payload) {
    ensureDir();
    const byUser =
      payload && payload.byUser && typeof payload.byUser === "object" && !Array.isArray(payload.byUser)
        ? payload.byUser
        : payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload
          : {};
    try {
      fs.readdirSync(byUserDir).forEach(function (name) {
        if (name && name.toLowerCase().endsWith(".json")) {
          fs.unlinkSync(path.join(byUserDir, name));
        }
      });
    } catch (e) {
      /* ignore */
    }
    Object.keys(byUser).forEach(function (username) {
      const row = byUser[username];
      if (row && typeof row === "object") set(username, row);
    });
  }

  return { get, set, userFile, byUserDir, exportAll, replaceAll };
}

module.exports = { createPracticePlanStore };
