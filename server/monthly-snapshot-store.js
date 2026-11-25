/**
 * 按月能力快照：每用户一份 JSON，months[YYYY-MM] 为该月最后一局后的状态。
 * 不做定时截点；历史回放另议。
 */
const fs = require("fs");
const path = require("path");
const {
  stampEverAccurateOnHeatmap,
  previousMonthKey,
} = require("./monthly-snapshot");

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
    const prevHeat =
      prev.heatmap && typeof prev.heatmap === "object" ? prev.heatmap : {};
    let nextHeat = prevHeat;
    if (payload.replaceHeatmap === true) {
      nextHeat =
        payload.heatmapPatch && typeof payload.heatmapPatch === "object"
          ? payload.heatmapPatch
          : payload.heatmap && typeof payload.heatmap === "object"
            ? payload.heatmap
            : {};
    } else if (payload.heatmapPatch && typeof payload.heatmapPatch === "object") {
      nextHeat = Object.assign({}, prevHeat, payload.heatmapPatch);
    } else if (payload.heatmap && typeof payload.heatmap === "object") {
      // 兼容旧调用：整表覆盖
      nextHeat = payload.heatmap;
    }
    // everAccurate：继承上月快照 + 同月旧块，再并入本格 accurate（不追溯更早盘）
    const priorMk = previousMonthKey(monthKey);
    const priorRow =
      priorMk && doc.months[priorMk] && typeof doc.months[priorMk] === "object"
        ? doc.months[priorMk]
        : null;
    const priorHeat =
      priorRow && priorRow.heatmap && typeof priorRow.heatmap === "object" ? priorRow.heatmap : {};
    const carryHeat = Object.assign({}, priorHeat, prevHeat);
    nextHeat = stampEverAccurateOnHeatmap(nextHeat, carryHeat);
    doc.months[monthKey] = {
      monthKey: monthKey,
      updatedAt: now,
      lastRunTs: payload.lastRunTs != null ? Number(payload.lastRunTs) || now : now,
      heatmap: nextHeat,
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

  function countEverAccurateTrue(heatmap) {
    let n = 0;
    const heat = heatmap && typeof heatmap === "object" ? heatmap : {};
    Object.keys(heat).forEach(function (catId) {
      const cells = heat[catId] && Array.isArray(heat[catId].cells) ? heat[catId].cells : [];
      cells.forEach(function (c) {
        if (c && c.everAccurate === true) n += 1;
      });
    });
    return n;
  }

  /**
   * 仅按已有快照热图 accurate / 历史月继承回填 everAccurate，不重算热图。
   * 按月份升序；跨月空档时仍继承更早月的达标史。
   */
  function backfillEverAccurateForUser(username) {
    const name = String(username || "");
    if (!name) return { ok: false, error: "no_user", monthsUpdated: 0, cellsNewlyTrue: 0 };
    const doc = get(name);
    const keys = Object.keys(doc.months || {})
      .filter(isValidMonthKey)
      .sort();
    if (!keys.length) {
      return { ok: true, username: name, monthsUpdated: 0, cellsNewlyTrue: 0, monthsScanned: 0 };
    }

    let carryHeat = {};
    let monthsUpdated = 0;
    let cellsNewlyTrue = 0;
    let dirty = false;

    keys.forEach(function (mk) {
      const row = doc.months[mk];
      if (!row || typeof row !== "object") return;
      const heat = row.heatmap && typeof row.heatmap === "object" ? row.heatmap : null;
      if (!heat || !Object.keys(heat).length) return;

      const before = countEverAccurateTrue(heat);
      stampEverAccurateOnHeatmap(heat, carryHeat);
      const after = countEverAccurateTrue(heat);
      const gained = Math.max(0, after - before);
      if (gained > 0) {
        cellsNewlyTrue += gained;
        monthsUpdated += 1;
        dirty = true;
      }
      row.heatmap = heat;
      // 累积继承：后面的月能看到更早月各栏目的达标史（含空档月）
      carryHeat = Object.assign({}, carryHeat, heat);
    });

    if (dirty) set(name, doc);
    return {
      ok: true,
      username: name,
      monthsScanned: keys.length,
      monthsUpdated: monthsUpdated,
      cellsNewlyTrue: cellsNewlyTrue,
    };
  }

  function listSnapshotUsernames() {
    ensureDir();
    let names = [];
    try {
      names = fs
        .readdirSync(byUserDir)
        .filter(function (f) {
          return /\.json$/i.test(f);
        })
        .map(function (f) {
          try {
            return decodeURIComponent(f.replace(/\.json$/i, ""));
          } catch (e) {
            return f.replace(/\.json$/i, "");
          }
        })
        .filter(Boolean);
    } catch (e) {
      names = [];
    }
    return names;
  }

  /** 全体已有快照文件：只补 everAccurate */
  function backfillEverAccurateAll() {
    const names = listSnapshotUsernames();
    const users = [];
    let monthsUpdated = 0;
    let cellsNewlyTrue = 0;
    names.forEach(function (name) {
      const out = backfillEverAccurateForUser(name);
      monthsUpdated += out.monthsUpdated || 0;
      cellsNewlyTrue += out.cellsNewlyTrue || 0;
      users.push(out);
    });
    return {
      ok: true,
      usersScanned: names.length,
      monthsUpdated: monthsUpdated,
      cellsNewlyTrue: cellsNewlyTrue,
      users: users,
      note: "仅回填 everAccurate（按已有快照 accurate 与月份继承）；未重算热图",
    };
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
    backfillEverAccurateForUser,
    backfillEverAccurateAll,
    listSnapshotUsernames,
  };
}

module.exports = { createMonthlySnapshotStore };
