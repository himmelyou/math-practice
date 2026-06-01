#!/usr/bin/env node
/**
 * 本地一次性迁移：survivalCleared → cleared，并重算 hasClearedSurvival。
 * 用法（在 server 目录）：
 *   node scripts/migrate-run-cleared.js
 * 或指定数据目录：
 *   DATA_DIR=/path/to/data node scripts/migrate-run-cleared.js
 *
 * 执行前请备份 users.json 与 runs.json。
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".jarvis-math-lab", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");

function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("读取失败:", filePath, e.message);
    process.exit(1);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeRunMode(mode) {
  if (mode === "level") return "level";
  if (mode === "training") return "training";
  if (mode === "primeComposite") return "primeComposite";
  if (mode === "expandBrackets") return "expandBrackets";
  return "survival";
}

function migrateRunRecordInPlace(run) {
  if (!run || typeof run !== "object") return false;
  let changed = false;
  if (run.survivalCleared === true) {
    if (run.cleared !== true) {
      run.cleared = true;
      changed = true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(run, "survivalCleared")) {
    delete run.survivalCleared;
    changed = true;
  }
  return changed;
}

const USER_RECENT_RUN_KEYS = [
  "recentSurvivalRuns",
  "recentLevelRuns",
  "recentTrainingRuns",
  "recentPrimeCompositeRuns",
  "recentExpandBracketsRuns",
];

function main() {
  console.log("DATA_DIR:", DATA_DIR);
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const usersData = readJson(USERS_FILE, { users: [] });
  let runsChanged = 0;
  let userRunsChanged = 0;
  let usersFlagChanged = 0;

  const allRuns = runsData.runs && typeof runsData.runs === "object" ? runsData.runs : {};
  Object.keys(allRuns).forEach((username) => {
    const list = Array.isArray(allRuns[username]) ? allRuns[username] : [];
    list.forEach((run) => {
      if (migrateRunRecordInPlace(run)) runsChanged += 1;
    });
  });

  const users = Array.isArray(usersData.users) ? usersData.users : [];
  users.forEach((u) => {
    if (!u || !u.username) return;
    USER_RECENT_RUN_KEYS.forEach((key) => {
      if (!Array.isArray(u[key])) return;
      u[key].forEach((run) => {
        if (migrateRunRecordInPlace(run)) userRunsChanged += 1;
      });
    });
    const runs = Array.isArray(allRuns[u.username]) ? allRuns[u.username] : [];
    const nextFlag = runs.some((r) => normalizeRunMode(r.mode) === "survival" && r.cleared === true);
    if (u.hasClearedSurvival !== nextFlag) {
      u.hasClearedSurvival = nextFlag;
      usersFlagChanged += 1;
    }
  });

  writeJson(RUNS_FILE, runsData);
  writeJson(USERS_FILE, usersData);

  console.log("迁移完成:", {
    runsRecordsChanged: runsChanged,
    userRecentRecordsChanged: userRunsChanged,
    usersHasClearedSurvivalUpdated: usersFlagChanged,
    totalUsers: users.length,
  });
}

main();
