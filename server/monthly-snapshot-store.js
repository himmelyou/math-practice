/**
 * 按月能力快照：每用户一份 JSON，months[YYYY-MM] 为该月最后一局后的状态。
 * 不做定时截点；历史回放另议。
 */
const fs = require("fs");
const path = require("path");

function createMonthlySnapshotStore(opts) {
  const dataDir = opts.dataDir;
  const byUserDir = opts.byUserDir || path.join(dataDir, "monthly-snapshots");
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

  function chinaMonthKeyFromTs(ts) {
    const day = chinaDayFromTs(ts != null ? ts : Date.now());
    return day ? day.slice(0, 7) : "";
  }

  function isValidMonthKey(monthKey) {
    return /^\d{4}-\d{2}$/.test(String(monthKey || ""));
  }

  function emptyDoc(username) {
    return { username: String(username || ""), updatedAt: 0, months: {} };
  }

  function get(username) {
    const name = String(username || "");
    if (!name) return emptyDoc("");
    try {
      if (!fs.existsSync(userFile(name))) return emptyDoc(name);
      const data = readJson(userFile(name), null);
      if (!data || typeof data !== "object") return emptyDoc(name);
      if (!data.months || typeof data.months !== "object") data.months = {};
      data.username = name;
      return data;
    } catch (e) {
      console.warn("[monthly-snapshot-store] read failed", name, e && e.message ? e.message : e);
      return emptyDoc(name);
    }
  }

  function set(username, doc) {
    const name = String(username || "");
    if (!name || !doc) return;
    ensureDir();
    writeJson(userFile(name), {
      username: name,
      updatedAt: Date.now(),
      months: doc.months && typeof doc.months === "object" ? doc.months : {},
    });
  }

  /**
   * 覆盖写入当月快照行（局后调用）。
   * @returns {{ ok: boolean, monthKey?: string, error?: string }}
   */
  function upsertMonth(username, monthKey, payload) {
    const name = String(username || "");
    if (!name || !isValidMonthKey(monthKey) || !payload || typeof payload !== "object") {
      return { ok: false, error: "invalid_args" };
    }
    const doc = get(name);
    const prev = doc.months[monthKey] && typeof doc.months[monthKey] === "object" ? doc.months[monthKey] : {};
    const now = Date.now();
    doc.months[monthKey] = {
      monthKey: monthKey,
      updatedAt: now,
      lastRunTs: payload.lastRunTs != null ? Number(payload.lastRunTs) || now : now,
      heatmap: payload.heatmap && typeof payload.heatmap === "object" ? payload.heatmap : prev.heatmap || {},
      progress: payload.progress && typeof payload.progress === "object" ? payload.progress : prev.progress || {},
      v: 1,
    };
    set(name, doc);
    return { ok: true, monthKey: monthKey };
  }

  function getMonth(username, monthKey) {
    if (!isValidMonthKey(monthKey)) return null;
    const doc = get(username);
    const row = doc.months && doc.months[monthKey];
    return row && typeof row === "object" ? row : null;
  }

  /** 新月在前 */
  function listMonths(username) {
    const doc = get(username);
    return Object.keys(doc.months || {})
      .filter(isValidMonthKey)
      .sort(function (a, b) {
        return a < b ? 1 : a > b ? -1 : 0;
      })
      .map(function (k) {
        const row = doc.months[k] || {};
        return {
          monthKey: k,
          updatedAt: row.updatedAt || null,
          lastRunTs: row.lastRunTs || null,
          hasHeatmap: !!(row.heatmap && Object.keys(row.heatmap).length),
          hasProgress: !!(row.progress && Object.keys(row.progress).length),
        };
      });
  }

  /**
   * 报告环比：从 beforeMonthKey 往前找最近有快照的月（不含 beforeMonthKey 当月）。
   * @param {string} beforeMonthKey 当前报告月，如 2026-09 → 从 2026-08 起往前找
   */
  function findPriorMonthKey(username, beforeMonthKey) {
    if (!isValidMonthKey(beforeMonthKey)) return null;
    const keys = Object.keys(get(username).months || {})
      .filter(isValidMonthKey)
      .filter(function (k) {
        return k < beforeMonthKey;
      })
      .sort();
    return keys.length ? keys[keys.length - 1] : null;
  }

  return {
    chinaDayFromTs,
    chinaMonthKeyFromTs,
    isValidMonthKey,
    get,
    getMonth,
    upsertMonth,
    listMonths,
    findPriorMonthKey,
  };
}

module.exports = { createMonthlySnapshotStore };
