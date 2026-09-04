/**
 * 练习任务单按用户落盘（未完成 + 冷却窗）。全量历史 plan.history 测试期不写，上线后再接通。
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

  return { get, set, userFile, byUserDir };
}

module.exports = { createPracticePlanStore };
