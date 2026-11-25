/**
 * 按月能力快照：每用户一份 JSON，months[YYYY-MM] 为该月最后一局后的状态。
 * 不做定时截点；历史回放另议。
 */
const fs = require("fs");
const path = require("path");
const {
  stampEverAccurateOnHeatmap,
  previousMonthKey,
  nextMonthKey,
  cloneJson,
  mergeHeatmapCarryForward,
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

  /** 取严格早于 monthKey 的最近一个月快照行 */
  function nearestPriorRow(doc, monthKey) {
    const keys = Object.keys((doc && doc.months) || {})
      .filter(isValidMonthKey)
      .filter(function (k) {
        return k < String(monthKey);
      })
      .sort();
    if (!keys.length) return null;
    const k = keys[keys.length - 1];
    const row = doc.months[k];
    return row && typeof row === "object" ? row : null;
  }

  /**
   * 写入当月快照行。
   * 热图：先继承上月（或更早最近月）完整各类，再覆盖本月 patch 中的类；无局类不会丢。
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

    const priorMk = previousMonthKey(monthKey);
    const priorRowExact =
      priorMk && doc.months[priorMk] && typeof doc.months[priorMk] === "object"
        ? doc.months[priorMk]
        : null;
    const priorRow = priorRowExact || nearestPriorRow(doc, monthKey);
    const priorHeat =
      priorRow && priorRow.heatmap && typeof priorRow.heatmap === "object" ? priorRow.heatmap : {};

    // 底：上月完整热图 ← 同月已有块；再叠本月重算类
    let baseHeat = mergeHeatmapCarryForward(priorHeat, prevHeat);
    const overlay =
      payload.heatmapPatch && typeof payload.heatmapPatch === "object"
        ? payload.heatmapPatch
        : payload.heatmap && typeof payload.heatmap === "object"
          ? payload.heatmap
          : null;
    // replaceHeatmap 旧义=只留 patch；现改为「继承 + 覆盖 patch 类」，避免抹掉未打类
    let nextHeat = overlay ? mergeHeatmapCarryForward(baseHeat, overlay) : baseHeat;
    nextHeat = stampEverAccurateOnHeatmap(nextHeat, mergeHeatmapCarryForward(priorHeat, prevHeat));

    const nextProgress =
      payload.progress && typeof payload.progress === "object"
        ? payload.progress
        : prev.progress && typeof prev.progress === "object"
          ? prev.progress
          : priorRow && priorRow.progress && typeof priorRow.progress === "object"
            ? cloneJson(priorRow.progress)
            : {};

    doc.months[monthKey] = {
      monthKey: monthKey,
      updatedAt: now,
      lastRunTs: payload.lastRunTs != null ? Number(payload.lastRunTs) || now : prev.lastRunTs || now,
      heatmap: nextHeat,
      progress: nextProgress,
      v: 2,
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

  function listMonthKeysInclusive(fromKey, toKey) {
    if (!isValidMonthKey(fromKey) || !isValidMonthKey(toKey) || fromKey > toKey) return [];
    const out = [];
    let mk = fromKey;
    let guard = 0;
    while (mk && mk <= toKey && guard < 600) {
      out.push(mk);
      if (mk === toKey) break;
      mk = nextMonthKey(mk);
      guard += 1;
    }
    return out;
  }

  function countHeatCategories(heatmap) {
    const heat = heatmap && typeof heatmap === "object" ? heatmap : {};
    return Object.keys(heat).length;
  }

  /**
   * 不重算热图：补缺月（上月副本）、补本月缺失类（从上月继承）、再打 everAccurate。
   * @param {string} username
   * @param {{ throughMonthKey?: string }} [opts] 补齐到该月（含）；默认=已有最大月
   */
  function backfillHeatmapCarryForUser(username, opts) {
    opts = opts || {};
    const name = String(username || "");
    if (!name) {
      return {
        ok: false,
        error: "no_user",
        monthsScanned: 0,
        monthsCreated: 0,
        monthsUpdated: 0,
        categoriesFilled: 0,
        cellsNewlyTrue: 0,
      };
    }
    const doc = get(name);
    const existing = Object.keys(doc.months || {})
      .filter(isValidMonthKey)
      .sort();
    if (!existing.length) {
      return {
        ok: true,
        username: name,
        monthsScanned: 0,
        monthsCreated: 0,
        monthsUpdated: 0,
        categoriesFilled: 0,
        cellsNewlyTrue: 0,
      };
    }

    const through =
      opts.throughMonthKey && isValidMonthKey(opts.throughMonthKey)
        ? String(opts.throughMonthKey)
        : existing[existing.length - 1];
    const endKey = through >= existing[existing.length - 1] ? through : existing[existing.length - 1];
    const timeline = listMonthKeysInclusive(existing[0], endKey);

    let carryHeat = {};
    let carryProgress = {};
    let carryLastRunTs = null;
    let monthsCreated = 0;
    let monthsUpdated = 0;
    let categoriesFilled = 0;
    let cellsNewlyTrue = 0;
    let dirty = false;
    const now = Date.now();

    timeline.forEach(function (mk) {
      let row = doc.months[mk] && typeof doc.months[mk] === "object" ? doc.months[mk] : null;
      let rowDirty = false;

      if (!row) {
        row = {
          monthKey: mk,
          updatedAt: now,
          lastRunTs: carryLastRunTs,
          heatmap: cloneJson(carryHeat) || {},
          progress: cloneJson(carryProgress) || {},
          v: 2,
          carriedForward: true,
        };
        doc.months[mk] = row;
        monthsCreated += 1;
        rowDirty = true;
        dirty = true;
      }

      const heat =
        row.heatmap && typeof row.heatmap === "object" ? row.heatmap : {};
      const beforeCats = countHeatCategories(heat);
      const beforeEver = countEverAccurateTrue(heat);
      const merged = mergeHeatmapCarryForward(carryHeat, heat);
      stampEverAccurateOnHeatmap(merged, carryHeat);
      const afterCats = countHeatCategories(merged);
      const afterEver = countEverAccurateTrue(merged);
      const filled = Math.max(0, afterCats - beforeCats);
      const gainedEver = Math.max(0, afterEver - beforeEver);

      if (filled > 0 || gainedEver > 0 || rowDirty) {
        row.heatmap = merged;
        if (!row.progress || typeof row.progress !== "object" || !Object.keys(row.progress).length) {
          if (carryProgress && Object.keys(carryProgress).length) {
            row.progress = cloneJson(carryProgress);
          }
        }
        if (row.lastRunTs == null && carryLastRunTs != null) row.lastRunTs = carryLastRunTs;
        row.updatedAt = now;
        row.v = 2;
        categoriesFilled += filled;
        cellsNewlyTrue += gainedEver;
        if (!rowDirty) monthsUpdated += 1;
        dirty = true;
      } else {
        row.heatmap = merged;
      }

      carryHeat = cloneJson(merged) || {};
      if (row.progress && typeof row.progress === "object" && Object.keys(row.progress).length) {
        carryProgress = cloneJson(row.progress) || {};
      }
      if (row.lastRunTs != null) carryLastRunTs = row.lastRunTs;
    });

    if (dirty) set(name, doc);
    return {
      ok: true,
      username: name,
      monthsScanned: timeline.length,
      monthsCreated: monthsCreated,
      monthsUpdated: monthsUpdated,
      categoriesFilled: categoriesFilled,
      cellsNewlyTrue: cellsNewlyTrue,
    };
  }

  /** @deprecated 兼容旧名：改为热图继承 + everAccurate */
  function backfillEverAccurateForUser(username, opts) {
    return backfillHeatmapCarryForUser(username, opts);
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

  /**
   * 全体：补缺月/缺类 + everAccurate（不重算热图）。
   * @param {{ throughMonthKey?: string }} [opts]
   */
  function backfillHeatmapCarryAll(opts) {
    opts = opts || {};
    const names = listSnapshotUsernames();
    const users = [];
    let monthsCreated = 0;
    let monthsUpdated = 0;
    let categoriesFilled = 0;
    let cellsNewlyTrue = 0;
    names.forEach(function (name) {
      const out = backfillHeatmapCarryForUser(name, opts);
      monthsCreated += out.monthsCreated || 0;
      monthsUpdated += out.monthsUpdated || 0;
      categoriesFilled += out.categoriesFilled || 0;
      cellsNewlyTrue += out.cellsNewlyTrue || 0;
      users.push(out);
    });
    return {
      ok: true,
      usersScanned: names.length,
      monthsCreated: monthsCreated,
      monthsUpdated: monthsUpdated,
      categoriesFilled: categoriesFilled,
      cellsNewlyTrue: cellsNewlyTrue,
      users: users,
      throughMonthKey: opts.throughMonthKey || null,
      note: "不重算热图：缺月用上月副本、缺类继承上月，并打 everAccurate",
    };
  }

  /** @deprecated 兼容旧名 */
  function backfillEverAccurateAll(opts) {
    return backfillHeatmapCarryAll(opts);
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
    backfillHeatmapCarryForUser,
    backfillHeatmapCarryAll,
    backfillEverAccurateForUser,
    backfillEverAccurateAll,
    listSnapshotUsernames,
  };
}

module.exports = { createMonthlySnapshotStore };
