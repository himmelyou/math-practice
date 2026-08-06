/**
 * runs 分用户存储：热路径只读写单用户文件，避免整库 runs.json 常驻内存。
 * 原 data/runs.json 仅作迁移源与核对基准，日常业务不再写入/删除。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const META_NAME = "_meta.json";
const MAX_RUNS_PER_USER = 500;

function createRunsStore(opts) {
  const dataDir = opts.dataDir;
  const legacyFile = opts.legacyFile || path.join(dataDir, "runs.json");
  const byUserDir = opts.byUserDir || path.join(dataDir, "runs-by-user");
  const metaFile = path.join(byUserDir, META_NAME);
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

  function readMeta() {
    try {
      if (!fs.existsSync(metaFile)) return null;
      return JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch (e) {
      return null;
    }
  }

  function writeMeta(meta) {
    ensureDir();
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf8");
  }

  function readLegacyRunsObject() {
    const data = readJson(legacyFile, { runs: {} });
    if (!data || typeof data !== "object") return { runs: {} };
    if (data.runs && typeof data.runs === "object") return data;
    return { runs: typeof data === "object" ? data : {} };
  }

  function getUserRuns(username) {
    const name = String(username || "");
    if (!name) return [];
    const fp = userFile(name);
    try {
      if (!fs.existsSync(fp)) return [];
      const raw = fs.readFileSync(fp, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.runs)) return data.runs;
      return [];
    } catch (e) {
      console.warn("[runs-store] read failed", name, e && e.message ? e.message : e);
      return [];
    }
  }

  function setUserRuns(username, runs) {
    const name = String(username || "");
    if (!name) return;
    ensureDir();
    const list = Array.isArray(runs) ? runs : [];
    const trimmed = list.length > MAX_RUNS_PER_USER ? list.slice(0, MAX_RUNS_PER_USER) : list;
    writeJson(userFile(name), { username: name, runs: trimmed });
  }

  function prependUserRun(username, runEntry) {
    const list = getUserRuns(username);
    list.unshift(runEntry);
    setUserRuns(username, list);
    return list;
  }

  function deleteUserRuns(username) {
    const fp = userFile(username);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) {
      console.warn("[runs-store] delete failed", username, e && e.message ? e.message : e);
    }
  }

  function listUsernamesFromByUser() {
    ensureDir();
    const names = [];
    let files = [];
    try {
      files = fs.readdirSync(byUserDir);
    } catch (e) {
      return names;
    }
    files.forEach((f) => {
      if (!f.endsWith(".json") || f === META_NAME) return;
      try {
        names.push(decodeURIComponent(f.slice(0, -5)));
      } catch (e) {
        names.push(f.slice(0, -5));
      }
    });
    return names.sort((a, b) => String(a).localeCompare(String(b)));
  }

  /**
   * 逐用户回调，避免一次性装载全库。
   * @param {(username: string, runs: array) => void} fn
   */
  function forEachUserRuns(fn) {
    const names = listUsernamesFromByUser();
    names.forEach((username) => {
      fn(username, getUserRuns(username));
    });
  }

  /** 组装 { runs: { user: [...] } }（备份/恢复用；会占峰值内存） */
  function buildRunsObjectFromByUser() {
    const runs = {};
    forEachUserRuns((username, list) => {
      runs[username] = list;
    });
    return { runs };
  }

  /**
   * 从 legacy runs.json 同步到分文件。默认仅在尚未同步时执行；force 可重跑（覆盖分文件）。
   * 绝不修改/删除 legacy 文件。
   */
  function syncFromLegacy(options) {
    const force = !!(options && options.force);
    ensureDir();
    const meta = readMeta();
    if (meta && meta.syncedFromLegacyAt && !force) {
      return {
        ok: true,
        skipped: true,
        reason: "already_synced",
        meta,
        byUserDir,
        legacyFile,
      };
    }
    if (!fs.existsSync(legacyFile)) {
      const emptyMeta = {
        version: 1,
        syncedFromLegacyAt: Date.now(),
        legacyFile,
        byUserDir,
        userCount: 0,
        note: "legacy runs.json missing; by-user store ready",
      };
      writeMeta(emptyMeta);
      return { ok: true, skipped: false, userCount: 0, meta: emptyMeta };
    }

    const legacy = readLegacyRunsObject();
    const map = legacy.runs || {};
    const usernames = Object.keys(map);
    let written = 0;
    usernames.forEach((username) => {
      const list = Array.isArray(map[username]) ? map[username] : [];
      setUserRuns(username, list);
      written += 1;
    });
    const nextMeta = {
      version: 1,
      syncedFromLegacyAt: Date.now(),
      legacyFile,
      byUserDir,
      userCount: written,
      note: "Copied from legacy runs.json; legacy file left untouched",
    };
    writeMeta(nextMeta);
    // 清掉 legacy 的 readJson 缓存，避免大对象常驻（若曾读过）
    try {
      if (opts.clearJsonCacheFor) opts.clearJsonCacheFor(legacyFile);
    } catch (e) {
      /* ignore */
    }
    return { ok: true, skipped: false, userCount: written, meta: nextMeta };
  }

  function stableStringify(v) {
    return JSON.stringify(v);
  }

  function hashRunsList(runs) {
    const h = crypto.createHash("sha256");
    h.update(stableStringify(runs || []));
    return h.digest("hex");
  }

  /** 核对：legacy vs by-user（只读，不改任何文件） */
  function verifyAgainstLegacy() {
    const legacy = readLegacyRunsObject();
    const legacyMap = legacy.runs || {};
    const legacyNames = Object.keys(legacyMap).sort((a, b) => String(a).localeCompare(String(b)));
    const byUserNames = listUsernamesFromByUser();
    const legacySet = new Set(legacyNames);
    const byUserSet = new Set(byUserNames);

    const onlyInLegacy = legacyNames.filter((n) => !byUserSet.has(n));
    const onlyInByUser = byUserNames.filter((n) => !legacySet.has(n));
    const common = legacyNames.filter((n) => byUserSet.has(n));

    const mismatches = [];
    let matched = 0;
    common.forEach((username) => {
      const a = Array.isArray(legacyMap[username]) ? legacyMap[username] : [];
      const b = getUserRuns(username);
      const ha = hashRunsList(a);
      const hb = hashRunsList(b);
      if (ha === hb && a.length === b.length) {
        matched += 1;
        return;
      }
      mismatches.push({
        username,
        legacyCount: a.length,
        byUserCount: b.length,
        legacyHash: ha.slice(0, 12),
        byUserHash: hb.slice(0, 12),
        countEqual: a.length === b.length,
        hashEqual: ha === hb,
      });
    });

    // 核对完释放 legacy 缓存
    try {
      if (opts.clearJsonCacheFor) opts.clearJsonCacheFor(legacyFile);
    } catch (e) {
      /* ignore */
    }

    return {
      ok: true,
      at: new Date().toISOString(),
      legacyFile,
      byUserDir,
      meta: readMeta(),
      legacyUserCount: legacyNames.length,
      byUserCount: byUserNames.length,
      matchedUsers: matched,
      mismatchCount: mismatches.length,
      onlyInLegacyCount: onlyInLegacy.length,
      onlyInByUserCount: onlyInByUser.length,
      onlyInLegacy: onlyInLegacy.slice(0, 50),
      onlyInByUser: onlyInByUser.slice(0, 50),
      mismatches: mismatches.slice(0, 80),
      allEqual:
        mismatches.length === 0 && onlyInLegacy.length === 0 && onlyInByUser.length === 0,
    };
  }

  /** 用完整 { runs } 覆盖分文件（恢复备份）；不写 legacy */
  function replaceAllFromRunsObject(runsObj) {
    const map =
      runsObj && runsObj.runs && typeof runsObj.runs === "object"
        ? runsObj.runs
        : runsObj && typeof runsObj === "object"
          ? runsObj
          : {};
    ensureDir();
    const existing = listUsernamesFromByUser();
    existing.forEach((u) => deleteUserRuns(u));
    Object.keys(map).forEach((username) => {
      setUserRuns(username, Array.isArray(map[username]) ? map[username] : []);
    });
    writeMeta({
      version: 1,
      syncedFromLegacyAt: readMeta() && readMeta().syncedFromLegacyAt,
      restoredAt: Date.now(),
      legacyFile,
      byUserDir,
      userCount: Object.keys(map).length,
      note: "Replaced by-user store from backup/restore; legacy runs.json untouched",
    });
  }

  return {
    legacyFile,
    byUserDir,
    MAX_RUNS_PER_USER,
    ensureDir,
    getUserRuns,
    setUserRuns,
    prependUserRun,
    deleteUserRuns,
    listUsernamesFromByUser,
    forEachUserRuns,
    buildRunsObjectFromByUser,
    readLegacyRunsObject,
    syncFromLegacy,
    verifyAgainstLegacy,
    replaceAllFromRunsObject,
    readMeta,
  };
}

module.exports = {
  createRunsStore,
  MAX_RUNS_PER_USER,
};
