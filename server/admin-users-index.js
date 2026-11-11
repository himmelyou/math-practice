/**
 * 账号管理目录投影：列表热路径只读本文件，不解析胖 users.json、不扫 runs。
 * 写点（建号/改档/删号/交局/升年级）增量维护；缺文件或 schema 不对时从 users 重建。
 */
const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;
const INDEX_NAME = "admin-users-index.json";

function toListRow(u) {
  return {
    username: u && u.username ? String(u.username) : "",
    nickname: typeof (u && u.nickname) === "string" ? u.nickname.trim() : "",
    adminNote: typeof (u && u.adminNote) === "string" ? u.adminNote.trim() : "",
    grade: u && u.grade != null && u.grade !== "" ? u.grade : null,
    totalScore: Number(u && u.totalScore) || 0,
    lastGameTs: Number(u && u.lastGameTs) || 0,
    createdAt: Number(u && u.createdAt) || 0,
    isTester: !!(u && u.isTester),
    isVip: !!(u && u.isVip),
  };
}

function createAdminUsersIndex(opts) {
  const dataDir = opts.dataDir;
  const indexFile = opts.indexFile || path.join(dataDir, INDEX_NAME);
  const readJson = opts.readJson;
  const writeJson = opts.writeJson;

  function emptyDoc() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: 0,
      users: [],
    };
  }

  function readRaw() {
    try {
      if (!fs.existsSync(indexFile)) return null;
      const data = readJson(indexFile, null);
      if (!data || typeof data !== "object") return null;
      if (Number(data.schemaVersion) !== SCHEMA_VERSION) return null;
      if (!Array.isArray(data.users)) return null;
      return data;
    } catch (e) {
      console.warn("[admin-users-index] read failed", e && e.message ? e.message : e);
      return null;
    }
  }

  function writeDoc(users) {
    const list = Array.isArray(users) ? users.filter((r) => r && r.username) : [];
    writeJson(indexFile, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: Date.now(),
      users: list,
    });
    return list;
  }

  function rebuildFromUsers(usersFull) {
    const rows = (Array.isArray(usersFull) ? usersFull : [])
      .filter((u) => u && u.username)
      .map(toListRow);
    writeDoc(rows);
    return rows;
  }

  function getUsers() {
    const doc = readRaw();
    if (!doc) return null;
    return doc.users;
  }

  function upsertUser(userOrRow) {
    if (!userOrRow || !userOrRow.username) return;
    const row = toListRow(userOrRow);
    const doc = readRaw() || emptyDoc();
    const list = Array.isArray(doc.users) ? doc.users.slice() : [];
    const idx = list.findIndex((r) => r && r.username === row.username);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    writeDoc(list);
  }

  function removeUser(username) {
    const name = String(username || "");
    if (!name) return;
    const doc = readRaw();
    if (!doc) return;
    const next = (doc.users || []).filter((r) => r && r.username !== name);
    if (next.length === (doc.users || []).length) return;
    writeDoc(next);
  }

  function patchUser(username, patch) {
    const name = String(username || "");
    if (!name || !patch || typeof patch !== "object") return;
    const doc = readRaw();
    if (!doc) return;
    const list = Array.isArray(doc.users) ? doc.users.slice() : [];
    const idx = list.findIndex((r) => r && r.username === name);
    if (idx < 0) return;
    const cur = Object.assign({}, list[idx]);
    if (patch.nickname !== undefined) {
      cur.nickname = typeof patch.nickname === "string" ? patch.nickname.trim() : "";
    }
    if (patch.adminNote !== undefined) {
      cur.adminNote = typeof patch.adminNote === "string" ? patch.adminNote.trim() : "";
    }
    if (patch.grade !== undefined) {
      cur.grade = patch.grade != null && patch.grade !== "" ? patch.grade : null;
    }
    if (patch.totalScore !== undefined) {
      cur.totalScore = Number(patch.totalScore) || 0;
    }
    if (patch.lastGameTs !== undefined) {
      cur.lastGameTs = Number(patch.lastGameTs) || 0;
    }
    if (patch.createdAt !== undefined) {
      cur.createdAt = Number(patch.createdAt) || 0;
    }
    if (patch.isTester !== undefined) cur.isTester = !!patch.isTester;
    if (patch.isVip !== undefined) cur.isVip = !!patch.isVip;
    list[idx] = cur;
    writeDoc(list);
  }

  /**
   * 列表读取：有投影直接返回；否则用 rebuildFromUsers 回调重建一次。
   * @param {() => Array} loadFullUsers
   */
  function listOrRebuild(loadFullUsers) {
    const existing = getUsers();
    if (existing) {
      return { users: existing, rebuilt: false };
    }
    const full = typeof loadFullUsers === "function" ? loadFullUsers() : [];
    const users = rebuildFromUsers(full);
    return { users: users, rebuilt: true };
  }

  return {
    SCHEMA_VERSION,
    INDEX_NAME,
    indexFile,
    toListRow,
    getUsers,
    listOrRebuild,
    rebuildFromUsers,
    upsertUser,
    removeUser,
    patchUser,
  };
}

module.exports = {
  SCHEMA_VERSION,
  INDEX_NAME,
  toListRow,
  createAdminUsersIndex,
};
