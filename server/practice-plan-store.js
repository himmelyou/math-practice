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

  function chinaDayFromTs(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(n));
    } catch (e) {
      return new Date(n).toISOString().slice(0, 10);
    }
  }

  /** @returns {string} YYYY-MM（上海时区） */
  function currentChinaMonthKey(nowTs) {
    const day = chinaDayFromTs(nowTs != null ? nowTs : Date.now());
    return day ? day.slice(0, 7) : "";
  }

  function historyEntryMonthKey(h) {
    if (!h || typeof h !== "object") return "";
    const day = String(h.chinaDay || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(day)) return day.slice(0, 7);
    return chinaDayFromTs(h.completedAt).slice(0, 7);
  }

  /** 全量成功历史条数（任务页历史列表等） */
  function historyCount(username) {
    const data = get(username);
    const hist = data && data.plan && Array.isArray(data.plan.history) ? data.plan.history : [];
    return hist.length;
  }

  /** 指定上海月（YYYY-MM）内完成的任务数；用于任务达人月榜 */
  function historyCountInMonth(username, monthKey) {
    const mk = String(monthKey || "").trim();
    if (!/^\d{4}-\d{2}$/.test(mk)) return 0;
    const data = get(username);
    const hist = data && data.plan && Array.isArray(data.plan.history) ? data.plan.history : [];
    let n = 0;
    for (let i = 0; i < hist.length; i += 1) {
      if (historyEntryMonthKey(hist[i]) === mk) n += 1;
    }
    return n;
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

  return {
    get,
    set,
    userFile,
    byUserDir,
    exportAll,
    replaceAll,
    listUsernames,
    historyCount,
    historyCountInMonth,
    currentChinaMonthKey,
  };
}

module.exports = { createPracticePlanStore };
