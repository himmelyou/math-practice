/**
 * Jarvis Math Lab 计算游戏 - 后端 API
 * 部署到 Railway / Render 等平台后，将 API_BASE_URL 指向此服务地址
 */
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const heatmapStats = require("./stats-heatmap");
const playerLevel = require("./player-level");
const achievementCatalog = require("./achievements/catalog");
const achievementEngine = require("./achievements/engine");
const achievementRankings = require("./achievements/rankings");
const achievementImport = require("./achievements/import");
const { buildStudentOverviewRows } = require("./student-overview");
const { buildTrafficStats } = require("./traffic-stats");
const trainingRunSpeedBackfill = require("./backfill-training-run-speed");
const dedupeUsernames = require("./dedupe-usernames");
const { computeTrainingNextLevelForUser } = require("./training-next-level");
const { buildUserHeatmapsByCategory } = require("./user-heatmap");
const {
  computeDecimalNextLevel,
  computeDivisibilityNextLevel,
  computePerfectSquareNextLevel,
  computeSpecialCategoryNextLevels,
} = require("./mode-next-level");
const { createRunsStore } = require("./runs-store");
const { createPracticePlanStore } = require("./practice-plan-store");
const practicePlanService = require("./practice-plan-service");
const {
  DIVISIBILITY_HEATMAP_LEVEL_COUNT,
  heatLevelIndexFromAttempt,
} = require("./divisibility-heat-level");
const { defaultGameGuide } = require("./game-guide-defaults");
const {
  REGISTERED_RULE_TYPES,
  IMPLEMENTED_RULE_TYPES,
  inferPrimeMasteredFromRun,
  PRIME_MASTERED_TARGET,
  PRIME_RANKING_MAX_WRONG,
} = require("./achievements/evaluators");

const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
if (!JWT_SECRET) {
  throw new Error("Missing required env var JWT_SECRET");
}
const JWT_EXPIRES_IN = "24h";
const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const BCRYPT_ROUNDS = 10;
function isBcryptHash(s) {
  return typeof s === "string" && s.length >= 50 && s.startsWith("$2");
}

function safeUser(u) {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
}

const WRONGBOOK_MAX_STORE = 100;
const EXPAND_WRONG_MAX_STORE = 20;
const DIVISIBILITY_WRONG_MAX_STORE = 20;

const WRONG_ANSWER_MODES = new Set(["survival", "level", "training", "decimal", "perfectSquare", "divisibility"]);
const WRONG_ANSWER_LEVEL_MAX = {
  survival: 15,
  level: 15,
  training: 15,
  decimal: 5,
  perfectSquare: 3,
  divisibility: 4,
};

function normalizeWrongAnswerMode(mode) {
  const m = String(mode || "").trim();
  return WRONG_ANSWER_MODES.has(m) ? m : "level";
}

function clampWrongAnswerLevelIndex(mode, levelIndex) {
  const max = WRONG_ANSWER_LEVEL_MAX[normalizeWrongAnswerMode(mode)] ?? 15;
  const lv = typeof levelIndex === "number" && Number.isFinite(levelIndex) ? Math.floor(levelIndex) : 0;
  return Math.max(0, Math.min(max, lv));
}

function formatWrongAnswerLevelLabel(mode, levelIndex) {
  const m = normalizeWrongAnswerMode(mode);
  const n = clampWrongAnswerLevelIndex(m, levelIndex) + 1;
  if (m === "decimal") return "D" + n;
  return "L" + n;
}

function normalizeWrongAnswerEntry(raw) {
  const mode = normalizeWrongAnswerMode(raw && raw.mode);
  const levelIndex = clampWrongAnswerLevelIndex(
    mode,
    raw && typeof raw.levelIndex === "number" && Number.isFinite(raw.levelIndex) ? raw.levelIndex : 0
  );
  return {
    text: String((raw && raw.text) || ""),
    answer: Number(raw && raw.answer),
    studentAnswer: Number(raw && raw.studentAnswer),
    ts: raw && typeof raw.ts === "number" && Number.isFinite(raw.ts) ? raw.ts : Date.now(),
    mode,
    levelIndex,
    levelLabel: formatWrongAnswerLevelLabel(mode, levelIndex),
  };
}

function getWrongAnswersClearedBeforeTs(user) {
  const n = Number(user && user.wrongAnswersClearedBeforeTs);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function visibleWrongAnswers(user) {
  const list = Array.isArray(user.wrongAnswers) ? user.wrongAnswers : [];
  const clearedBefore = getWrongAnswersClearedBeforeTs(user);
  return list.filter((w) => (Number(w && w.ts) || 0) > clearedBefore);
}

/** 练习全对「清空」：不删数组，游标推进到当前可见集最新一条 ts */
function markWrongAnswersCleared(user) {
  const list = Array.isArray(user.wrongAnswers) ? user.wrongAnswers : [];
  const prev = getWrongAnswersClearedBeforeTs(user);
  let maxTs = prev;
  list.forEach((w) => {
    const ts = Number(w && w.ts) || 0;
    if (ts > prev && ts > maxTs) maxTs = ts;
  });
  user.wrongAnswersClearedBeforeTs = maxTs;
  return maxTs;
}

/** 学员端 API：wrongAnswers 仅为游标后可见集；库存仍在 user.wrongAnswers；附带拆括号/整除错题供错题本 tab */
function wrongAnswersPayload(user) {
  const expand = Array.isArray(user.expandBracketsWrongAnswers)
    ? user.expandBracketsWrongAnswers.slice(0, EXPAND_WRONG_MAX_STORE)
    : [];
  const div = Array.isArray(user.divisibilityWrongAnswers)
    ? user.divisibilityWrongAnswers.slice(0, DIVISIBILITY_WRONG_MAX_STORE)
    : [];
  return {
    wrongAnswers: visibleWrongAnswers(user),
    wrongAnswersClearedBeforeTs: getWrongAnswersClearedBeforeTs(user),
    wrongAnswersStoredCount: Array.isArray(user.wrongAnswers) ? user.wrongAnswers.length : 0,
    expandBracketsWrongAnswers: expand,
    divisibilityWrongAnswers: div,
  };
}

/** 学员端 API：不返回拆括号/整除错题（仅管理端 report 使用）；VIP 标记仅管理端使用 */
function safeUserForStudent(u) {
  const out = safeUser(u);
  if (out && Object.prototype.hasOwnProperty.call(out, "expandBracketsWrongAnswers")) {
    delete out.expandBracketsWrongAnswers;
  }
  if (out && Object.prototype.hasOwnProperty.call(out, "divisibilityWrongAnswers")) {
    delete out.divisibilityWrongAnswers;
  }
  if (out && Object.prototype.hasOwnProperty.call(out, "isVip")) {
    delete out.isVip;
  }
  if (out && Object.prototype.hasOwnProperty.call(out, "grade")) {
    delete out.grade;
  }
  if (out && Object.prototype.hasOwnProperty.call(out, "adminNote")) {
    delete out.adminNote;
  }
  out.needsGrade = !isGradeSet(u && u.grade);
  return out;
}

const GRADE_ADULT = 13;
const GRADE_MAX = 13;

function isGradeSet(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= GRADE_MAX;
}

/** 管理端年级：null 未设置，0=学前，1–12 为年级，13=成人 */
function normalizeAdminGrade(value) {
  if (value === null || value === undefined || value === "") return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > GRADE_MAX) {
    return { error: "年级须为 0（学前）、1–12，或 13（成人）" };
  }
  return { value: n };
}

/** 注册 / 学员补填：必须选有效年级，不能空 */
function normalizeRequiredGrade(value) {
  if (value === null || value === undefined || value === "") return { error: "请选择年级" };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > GRADE_MAX) return { error: "请选择有效年级" };
  return { value: n };
}

/** 学年 ID（中国时区）：每年 9/1 起至次年 8/31，取学年起始年 */
function chinaSchoolYearId(ts) {
  const key = toChinaDateKey(ts != null ? ts : Date.now());
  if (!key || key.length < 7) return null;
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return m >= 9 ? y : y - 1;
}

function readAdminMeta() {
  const data = readJson(ADMIN_META_FILE, {});
  return data && typeof data === "object" ? data : {};
}

function writeAdminMeta(meta) {
  writeJson(ADMIN_META_FILE, meta && typeof meta === "object" ? meta : {});
}

function nextGradeBulkUnlockDate(lastAt) {
  const sy = chinaSchoolYearId(lastAt);
  if (sy == null) return null;
  return String(sy + 1) + "-09-01";
}

function getGradeBulkUpgradeStatus(nowTs) {
  const meta = readAdminMeta();
  const lastAt = Number(meta.lastGradeBulkUpgradeAt) || 0;
  const now = nowTs != null ? Number(nowTs) : Date.now();
  const nowSy = chinaSchoolYearId(now);
  const lastSy = lastAt ? chinaSchoolYearId(lastAt) : null;
  const canUpgrade = !lastAt || (nowSy != null && lastSy != null && nowSy > lastSy);
  return {
    lastAt: lastAt || null,
    lastAtDate: lastAt ? toChinaDateKey(lastAt) : null,
    canUpgrade: !!canUpgrade,
    nextUnlockDate: canUpgrade ? null : nextGradeBulkUnlockDate(lastAt),
    schoolYearId: nowSy,
  };
}

/** 一键升级：学前/成人/未设置不动；1→2…11→12；12→清空 */
function bumpAdminGradeOneYear(grade) {
  if (grade === null || grade === undefined || grade === "") return { skip: "unset" };
  const n = Number(grade);
  if (!Number.isInteger(n) || n < 0 || n > GRADE_MAX) return { skip: "invalid" };
  if (n === 0) return { skip: "preschool" };
  if (n === GRADE_ADULT) return { skip: "adult" };
  if (n === 12) return { value: null, cleared: true };
  return { value: n + 1 };
}

/** 管理端备注：trim 后最多 20 字 */
function normalizeAdminNote(value) {
  if (value === null || value === undefined) return { value: "" };
  const s = String(value).trim();
  if (s.length > 20) return { error: "备注最多 20 个字" };
  return { value: s };
}

/** 记局后仅返回客户端需刷新的字段 */
function buildRunSyncForStudent(u, mode) {
  const sync = { totalScore: typeof u.totalScore === "number" ? u.totalScore : 0 };
  const m = normalizeRunMode(mode);
  if (m === "level") {
    sync.recentLevelRuns = Array.isArray(u.recentLevelRuns) ? u.recentLevelRuns : [];
  } else if (m === "training") {
    sync.recentTrainingRuns = Array.isArray(u.recentTrainingRuns) ? u.recentTrainingRuns : [];
  } else if (m === "primeComposite") {
    sync.recentPrimeCompositeRuns = Array.isArray(u.recentPrimeCompositeRuns) ? u.recentPrimeCompositeRuns : [];
  } else if (m === "expandBrackets") {
    sync.recentExpandBracketsRuns = Array.isArray(u.recentExpandBracketsRuns) ? u.recentExpandBracketsRuns : [];
  } else if (m === "perfectSquare") {
    sync.recentPerfectSquareRuns = Array.isArray(u.recentPerfectSquareRuns) ? u.recentPerfectSquareRuns : [];
  } else if (m === "divisibility") {
    sync.recentDivisibilityRuns = Array.isArray(u.recentDivisibilityRuns) ? u.recentDivisibilityRuns : [];
  } else if (m === "decimal") {
    sync.recentDecimalRuns = Array.isArray(u.recentDecimalRuns) ? u.recentDecimalRuns : [];
  } else {
    sync.recentSurvivalRuns = Array.isArray(u.recentSurvivalRuns) ? u.recentSurvivalRuns : [];
    sync.bestSurvivalSec = typeof u.bestSurvivalSec === "number" ? u.bestSurvivalSec : 0;
    sync.bestScore = typeof u.bestScore === "number" ? u.bestScore : 0;
  }
  sync.trainingL16Cleared = u.trainingL16Cleared === true;
  sync.heatmapL16Passed = u.heatmapL16Passed === true;
  sync.levelChallengeBestLevel = typeof u.levelChallengeBestLevel === "number" ? u.levelChallengeBestLevel : 0;
  sync.survivalEligible = userEligibleForSurvivalUnlock(u);
  sync.achievements = u.achievements && typeof u.achievements === "object" ? u.achievements : {};
  sync.equippedBadges = Array.isArray(u.equippedBadges) ? u.equippedBadges.slice(0, achievementEngine.MAX_EQUIPPED_BADGES) : [];
  return sync;
}

function readAchievementsCatalog() {
  return catalogStore.readCatalog();
}

function pickStudentUserPatch(u, keys) {
  const patch = {};
  (keys || []).forEach((k) => {
    if (u && Object.prototype.hasOwnProperty.call(u, k)) patch[k] = u[k];
  });
  return patch;
}

const app = express();
const PORT = process.env.PORT || 3001;
const os = require("os");
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".jarvis-math-lab", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const I18N_FILE = path.join(DATA_DIR, "i18n.json");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");
const COHORT_LEVEL_STATS_FILE = path.join(DATA_DIR, "cohort-level-stats.json");
const COHORT_DECIMAL_STATS_FILE = path.join(DATA_DIR, "cohort-decimal-stats.json");
const COHORT_PERFECT_SQUARE_STATS_FILE = path.join(DATA_DIR, "cohort-perfect-square-stats.json");
const COHORT_DIVISIBILITY_STATS_FILE = path.join(DATA_DIR, "cohort-divisibility-stats.json");
/** 全体难度常模快照缓存时长；可用环境变量 COHORT_STATS_TTL_MS 覆盖（毫秒） */
const COHORT_STATS_TTL_MS = Number(process.env.COHORT_STATS_TTL_MS) || 24 * 60 * 60 * 1000;
const SURVIVAL_RANKING_FILE = path.join(DATA_DIR, "survival-ranking.json");
const LEVEL_RANKING_FILE = path.join(DATA_DIR, "level-ranking.json");
const PRIME_PERFECT_RANKING_FILE = path.join(DATA_DIR, "prime-perfect-ranking.json");
const DIVISIBILITY_PERFECT_RANKING_FILE = path.join(DATA_DIR, "divisibility-perfect-ranking.json");
const DIVISIBILITY_RANKING_LEVEL_INDEX = 4; // L5 / Z5
const ADMIN_PIN_FILE = path.join(DATA_DIR, "admin-pin.json");
const ADMIN_META_FILE = path.join(DATA_DIR, "admin-meta.json");
const AVATARS_FILE = path.join(DATA_DIR, "avatars.json");
const AVATAR_ASSET_DIR = path.join(DATA_DIR, "avatar-assets");
const ACHIEVEMENT_ASSET_DIR = path.join(DATA_DIR, "achievement-assets");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const ACHIEVEMENTS_CATALOG_FILE = path.join(DATA_DIR, "achievements-catalog.json");
const GAME_GUIDE_FILE = path.join(DATA_DIR, "game-guide.json");
const GAME_GUIDE_BODY_MAX_LEN = 80000;
const GAME_GUIDE_TITLE_MAX_LEN = 80;
const catalogStore = achievementCatalog.createCatalogStore(ACHIEVEMENTS_CATALOG_FILE);
const FEEDBACK_CATEGORIES = new Set(["bug", "suggestion", "account", "other"]);
const FEEDBACK_MESSAGE_MAX_LEN = 2000;
const FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_MAX_PER_HOUR = 10;
const feedbackSubmitTimestamps = new Map();
/** 学员端排行榜 API 对外可见条数（全榜仍用于 myRank；list 仅返回前 N） */
const RANKING_PUBLIC_MAX = 20;
const RANKING_TESTER_MAX = 500;

// 读取 JSON（按 mtime 缓存）。须在任何 readJson/writeJson 调用之前定义（含启动时 migrate）。
const jsonReadCache = new Map();

function readJson(filePath, defaultValue = {}) {
  try {
    const st = fs.statSync(filePath);
    const hit = jsonReadCache.get(filePath);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.data;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    jsonReadCache.set(filePath, { mtimeMs: st.mtimeMs, data });
    return data;
  } catch (e) {
    jsonReadCache.delete(filePath);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  try {
    const st = fs.statSync(filePath);
    jsonReadCache.set(filePath, { mtimeMs: st.mtimeMs, data });
  } catch (e) {
    jsonReadCache.delete(filePath);
  }
}

function clearJsonCacheFor(filePath) {
  jsonReadCache.delete(filePath);
}

/** runs 分用户存储（原 runs.json 只读迁移/核对，业务读写走 by-user） */
const runsStore = createRunsStore({
  dataDir: DATA_DIR,
  legacyFile: RUNS_FILE,
  readJson,
  writeJson,
  clearJsonCacheFor,
});
const practicePlanStore = createPracticePlanStore({
  dataDir: DATA_DIR,
  readJson,
  writeJson,
});
try {
  const syncResult = runsStore.syncFromLegacy({ force: false });
  if (syncResult && syncResult.ok) {
    console.log(
      "[runs-store]",
      syncResult.skipped
        ? "by-user already synced, skip"
        : "synced from legacy → runs-by-user, users=" + syncResult.userCount
    );
  }
} catch (e) {
  console.warn("[runs-store] sync failed", e && e.message ? e.message : e);
}

function readTaskCountsByUser() {
  const out = {};
  try {
    const names = practicePlanStore.listUsernames();
    names.forEach(function (name) {
      const n = practicePlanStore.historyCount(name);
      if (n > 0) out[name] = n;
    });
  } catch (e) {
    console.warn("[task-master-ranking] read counts failed", e && e.message ? e.message : e);
  }
  return out;
}

function readRankingEvalData() {
  const usersData = readJson(USERS_FILE, { users: [] });
  const survivalData = readJson(SURVIVAL_RANKING_FILE, { list: [] });
  const levelData = readJson(LEVEL_RANKING_FILE, { list: [] });
  const primeData = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  const divisibilityData = readJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list: [] });
  return {
    users: usersData.users || [],
    survivalList: Array.isArray(survivalData.list) ? survivalData.list : [],
    levelList: Array.isArray(levelData.list) ? levelData.list : [],
    primeList: Array.isArray(primeData.list) ? primeData.list : [],
    divisibilityList: Array.isArray(divisibilityData.list) ? divisibilityData.list : [],
    taskCountsByUser: readTaskCountsByUser(),
  };
}

function buildAchievementRankingContext(username, rankingData) {
  const data = rankingData || readRankingEvalData();
  return achievementRankings.buildRankingContextForUser(username, data);
}

function normalizeRunMode(mode) {
  if (mode === "level") return "level";
  if (mode === "training") return "training";
  if (mode === "primeComposite") return "primeComposite";
  if (mode === "expandBrackets") return "expandBrackets";
  if (mode === "perfectSquare") return "perfectSquare";
  if (mode === "divisibility") return "divisibility";
  if (mode === "decimal") return "decimal";
  return "survival";
}

/** 单局是否通关（生存/闯关等 mode 各自语义，统一 cleared 字段） */
function runIsCleared(r) {
  return !!(r && r.cleared === true);
}

function userHasClearedSurvivalFromRuns(runs) {
  return (runs || []).some((r) => normalizeRunMode(r.mode) === "survival" && runIsCleared(r));
}

function userHasClearedLevelFromRuns(runs) {
  return (runs || []).some((r) => normalizeRunMode(r.mode) === "level" && runIsCleared(r));
}

/** 闯关达人榜：用时 → 错题 → 更早 ts 优先 */
function compareLevelRankingEntries(a, b) {
  const ta = Number(a && a.survivalTimeSec) || 0;
  const tb = Number(b && b.survivalTimeSec) || 0;
  if (ta !== tb) return ta - tb;
  const wa = Number(a && a.wrongCount) || 0;
  const wb = Number(b && b.wrongCount) || 0;
  if (wa !== wb) return wa - wb;
  return (Number(a && a.ts) || 0) - (Number(b && b.ts) || 0);
}

function isLevelRankingBetter(a, b) {
  return compareLevelRankingEntries(a, b) < 0;
}

function dedupeBestLevelRanking(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const cur = byUser[e.username];
    if (!cur || isLevelRankingBetter(e, cur)) byUser[e.username] = e;
  });
  return Object.values(byUser);
}

function sortLevelRankingList(list) {
  return (list || []).slice().sort(compareLevelRankingEntries);
}

function upsertLevelRankingEntry(username, runEntry) {
  const rankingData = readJson(LEVEL_RANKING_FILE, { list: [] });
  let list = Array.isArray(rankingData.list) ? rankingData.list : [];
  const entry = {
    username,
    survivalTimeSec: Number(runEntry.survivalTimeSec) || 0,
    wrongCount: runEntry.wrongCount ?? 0,
    ts: runEntry.ts || Date.now(),
  };
  const existing = list.find((e) => e && e.username === username);
  if (!existing || isLevelRankingBetter(entry, existing)) {
    list = list.filter((e) => e && e.username !== username);
    list.push(entry);
    rankingData.list = sortLevelRankingList(list);
    writeJson(LEVEL_RANKING_FILE, rankingData);
    return true;
  }
  return false;
}

function rebuildLevelRankingFromRuns() {
  const usersData = readJson(USERS_FILE, { users: [] });
  const byUser = {};
  let clearedRunsScanned = 0;
  let usernamesScanned = 0;
  runsStore.forEachUserRuns((username, runs) => {
    usernamesScanned += 1;
    (runs || []).forEach((r) => {
      if (normalizeRunMode(r.mode) !== "level") return;
      if (!runIsCleared(r)) return;
      clearedRunsScanned += 1;
      const entry = {
        username,
        survivalTimeSec: Number(r.survivalTimeSec) || 0,
        wrongCount: r.wrongCount ?? 0,
        ts: r.ts || 0,
      };
      const cur = byUser[username];
      if (!cur || isLevelRankingBetter(entry, cur)) byUser[username] = entry;
    });
  });
  const list = sortLevelRankingList(Object.values(byUser));
  writeJson(LEVEL_RANKING_FILE, { list });
  let usersFlagUpdated = 0;
  usersData.users.forEach((u) => {
    if (!u || !u.username) return;
    const should = !!byUser[u.username];
    if (should && u.hasClearedLevel !== true) {
      u.hasClearedLevel = true;
      usersFlagUpdated += 1;
    }
  });
  writeJson(USERS_FILE, usersData);
  return {
    entries: list.length,
    clearedRunsScanned,
    usersFlagUpdated,
    usernamesScanned,
  };
}

function comparePrimePerfectRankingEntries(a, b) {
  const ta = Number(a && a.survivalTimeSec) || 0;
  const tb = Number(b && b.survivalTimeSec) || 0;
  if (ta !== tb) return ta - tb;
  const wa = Number(a && a.wrongCount) || 0;
  const wb = Number(b && b.wrongCount) || 0;
  if (wa !== wb) return wa - wb;
  return (Number(a && a.ts) || 0) - (Number(b && b.ts) || 0);
}

function isPrimePerfectRankingBetter(a, b) {
  return comparePrimePerfectRankingEntries(a, b) < 0;
}

function primePerfectRankingEntryFromRun(username, run) {
  const mastered = inferPrimeMasteredFromRun(run);
  if (mastered < PRIME_MASTERED_TARGET) return null;
  const elapsed = Number(run.survivalTimeSec) || 0;
  if (elapsed <= 0) return null;
  const wrongCount = Number(run.wrongCount) || 0;
  if (wrongCount > PRIME_RANKING_MAX_WRONG) return null;
  return { username, survivalTimeSec: elapsed, wrongCount, ts: run.ts || 0 };
}

function filterPrimePerfectRankingList(list) {
  return (list || []).filter(
    (e) => e && e.username && (Number(e.wrongCount) || 0) <= PRIME_RANKING_MAX_WRONG
  );
}

function upsertPrimePerfectRankingEntry(username, runEntry) {
  const entry = primePerfectRankingEntryFromRun(username, runEntry);
  if (!entry) return false;
  const rankingData = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  let list = Array.isArray(rankingData.list) ? rankingData.list : [];
  const existing = list.find((e) => e && e.username === username);
  if (!existing || isPrimePerfectRankingBetter(entry, existing)) {
    list = list.filter((e) => e && e.username !== username);
    list.push(entry);
    list.sort(comparePrimePerfectRankingEntries);
    rankingData.list = list;
    writeJson(PRIME_PERFECT_RANKING_FILE, rankingData);
    return true;
  }
  return false;
}

function rebuildPrimePerfectRankingFromRuns() {
  const byUser = {};
  let masteredRunsScanned = 0;
  let usernamesScanned = 0;
  runsStore.forEachUserRuns((username, runs) => {
    usernamesScanned += 1;
    (runs || []).forEach((r) => {
      const entry = primePerfectRankingEntryFromRun(username, r);
      if (!entry) return;
      masteredRunsScanned += 1;
      const cur = byUser[username];
      if (!cur || isPrimePerfectRankingBetter(entry, cur)) byUser[username] = entry;
    });
  });
  const list = Object.values(byUser).sort(comparePrimePerfectRankingEntries);
  writeJson(PRIME_PERFECT_RANKING_FILE, { list });
  return {
    entries: list.length,
    masteredRunsScanned,
    usernamesScanned,
  };
}

function compareDivisibilityPerfectRankingEntries(a, b) {
  const ta = Number(a && a.survivalTimeSec) || 0;
  const tb = Number(b && b.survivalTimeSec) || 0;
  if (ta !== tb) return ta - tb;
  return (Number(a && a.ts) || 0) - (Number(b && b.ts) || 0);
}

function isDivisibilityPerfectRankingBetter(a, b) {
  return compareDivisibilityPerfectRankingEntries(a, b) < 0;
}

function divisibilityPerfectRankingEntryFromRun(username, run) {
  if (!run || normalizeRunMode(run.mode) !== "divisibility") return null;
  if (run.abandoned === true || run.comboOnly === true) return null;
  if ((Number(run.wrongCount) || 0) !== 0) return null;
  if (Math.floor(Number(run.maxLevel) || -1) !== DIVISIBILITY_RANKING_LEVEL_INDEX) return null;
  const elapsed = Number(run.survivalTimeSec) || 0;
  if (elapsed <= 0) return null;
  return { username, survivalTimeSec: elapsed, wrongCount: 0, ts: run.ts || 0 };
}

function upsertDivisibilityPerfectRankingEntry(username, runEntry) {
  const entry = divisibilityPerfectRankingEntryFromRun(username, runEntry);
  if (!entry) return false;
  const rankingData = readJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list: [] });
  let list = Array.isArray(rankingData.list) ? rankingData.list : [];
  const existing = list.find((e) => e && e.username === username);
  if (!existing || isDivisibilityPerfectRankingBetter(entry, existing)) {
    list = list.filter((e) => e && e.username !== username);
    list.push(entry);
    list.sort(compareDivisibilityPerfectRankingEntries);
    rankingData.list = list;
    writeJson(DIVISIBILITY_PERFECT_RANKING_FILE, rankingData);
    return true;
  }
  return false;
}

function rebuildDivisibilityPerfectRankingFromRuns() {
  const byUser = {};
  let runsScanned = 0;
  let usernamesScanned = 0;
  runsStore.forEachUserRuns((username, runs) => {
    usernamesScanned += 1;
    (runs || []).forEach((r) => {
      const entry = divisibilityPerfectRankingEntryFromRun(username, r);
      if (!entry) return;
      runsScanned += 1;
      const cur = byUser[username];
      if (!cur || isDivisibilityPerfectRankingBetter(entry, cur)) byUser[username] = entry;
    });
  });
  const list = Object.values(byUser).sort(compareDivisibilityPerfectRankingEntries);
  writeJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list });
  return { entries: list.length, runsScanned, usernamesScanned };
}


const SURVIVAL_UNLOCK_L16_INDEX = 15;
const SURVIVAL_HEATMAP_PASS_ACCURACY = 0.95;

function runsHaveTrainingL16Cleared(runs) {
  return (runs || []).some((r) => {
    if (normalizeRunMode(r.mode) !== "training") return false;
    if (r.cleared !== true) return false;
    return Number(r.maxLevel) >= SURVIVAL_UNLOCK_L16_INDEX;
  });
}

function runsMaxLevelChallengeBest(runs) {
  let best = 0;
  (runs || []).forEach((r) => {
    if (normalizeRunMode(r.mode) !== "level") return;
    const ml = Number(r.maxLevel) || 0;
    if (ml > best) best = ml;
  });
  return Math.min(SURVIVAL_UNLOCK_L16_INDEX, best);
}

function readCohortResultForHeatmap() {
  const cache = readCohortLevelStatsCache();
  return cache && cache.result && cache.result.ok === true ? cache.result : null;
}

function readCohortDecimalResultForHeatmap() {
  const cache = readCohortDecimalStatsCache();
  return cache && cache.result && cache.result.ok === true ? cache.result : null;
}

function readCohortPerfectSquareResultForHeatmap() {
  const cache = readCohortPerfectSquareStatsCache();
  return cache && cache.result && cache.result.ok === true ? cache.result : null;
}

function readCohortDivisibilityResultForHeatmap() {
  const cache = readCohortDivisibilityStatsCache();
  return cache && cache.result && cache.result.ok === true ? cache.result : null;
}

function cohortsByCategoryForHeatmap() {
  return {
    arithmetic: readCohortResultForHeatmap(),
    decimal: readCohortDecimalResultForHeatmap(),
    perfectSquare: readCohortPerfectSquareResultForHeatmap(),
    divisibility: readCohortDivisibilityResultForHeatmap(),
  };
}

function buildHeatmapPayloadForUsername(username) {
  const runs = runsStore.getUserRuns(username).map((r) => ({
    ...r,
    mode: normalizeRunMode(r.mode),
  }));
  const built = buildUserHeatmapsByCategory({
    runs,
    cohortsByCategory: cohortsByCategoryForHeatmap(),
  });
  return {
    ok: !!built.ok,
    error: built.error || null,
    username,
    at: new Date().toISOString(),
    source: "server_buildUserHeatmapsByCategory",
    categories: built.categories || [],
    byCategory: built.byCategory || {},
  };
}

function computePracticePlanForUsername(username, opts) {
  opts = opts || {};
  const usersData = readJson(USERS_FILE, { users: [] });
  const user = usersData.users.find((u) => u.username === username);
  if (!user) return { ok: false, status: 404, error: "用户不存在" };
  const runs = runsStore.getUserRuns(username).map((r) => ({
    ...r,
    mode: normalizeRunMode(r.mode),
  }));
  if (ensureUserClearedFlagsFromRuns(user, runs)) {
    writeJson(USERS_FILE, usersData);
  }
  const heatPayload = buildHeatmapPayloadForUsername(username);
  const cells = practicePlanService.arithmeticCellsFromHeatmapPayload(heatPayload);
  let systemPick = null;
  if (opts.includeSystemPick) {
    try {
      const cohort = readCohortResultForHeatmap();
      const capMs =
        cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : COHORT_MAX_TIME_SPENT_MS;
      const pick = computeTrainingNextLevelForUser({
        runs,
        cohort,
        storedDayMode: user.trainingDayMode || null,
        capMs,
      });
      systemPick = practicePlanService.systemPickFromTraining(pick);
    } catch (e) {
      systemPick = null;
    }
  }
  try {
    const advice = practicePlanService.computePracticePlanForUser({
      username,
      user,
      runs,
      cells,
      store: practicePlanStore,
      resetIncomplete: opts.resetIncomplete === true,
      snapshot: opts.snapshot === true,
      includeSystemPick: false,
      systemPick,
    });
    return { ok: true, advice };
  } catch (e) {
    console.warn("[practice-plan]", e && e.message ? e.message : e);
    return { ok: false, status: 500, error: "任务单计算失败" };
  }
}

function computeHeatmapL16PassedFromRuns(runs) {
  const cohort = readCohortResultForHeatmap();
  const cellsResult = heatmapStats.buildHeatmapCells({
    runs,
    cohort,
    minAttempts: 10,
    nowTs: Date.now(),
  });
  return heatmapStats.isHeatmapLevelPassed(
    cellsResult,
    SURVIVAL_UNLOCK_L16_INDEX,
    SURVIVAL_HEATMAP_PASS_ACCURACY,
  );
}

/** 从 runs 重算生存解锁相关标记（只升不降）；返回是否改动 user */
function recomputeSurvivalUnlockFlags(u, runs) {
  if (!u) return false;
  let changed = false;
  if (!u.trainingL16Cleared && runsHaveTrainingL16Cleared(runs)) {
    u.trainingL16Cleared = true;
    changed = true;
  }
  const runBest = runsMaxLevelChallengeBest(runs);
  const curBest = typeof u.levelChallengeBestLevel === "number" ? u.levelChallengeBestLevel : 0;
  if (runBest > curBest) {
    u.levelChallengeBestLevel = runBest;
    changed = true;
  }
  if (!u.heatmapL16Passed && computeHeatmapL16PassedFromRuns(runs)) {
    u.heatmapL16Passed = true;
    changed = true;
  }
  return changed;
}

function userEligibleForSurvivalUnlock(u, runs) {
  if (!u) return false;
  if (u.survivalUnlocked === true) return true;
  if (u.trainingL16Cleared === true) return true;
  if ((typeof u.levelChallengeBestLevel === "number" ? u.levelChallengeBestLevel : 0) >= SURVIVAL_UNLOCK_L16_INDEX) {
    return true;
  }
  if (u.heatmapL16Passed === true) return true;
  if (runs) {
    if (runsHaveTrainingL16Cleared(runs)) return true;
    if (runsMaxLevelChallengeBest(runs) >= SURVIVAL_UNLOCK_L16_INDEX) return true;
    if (computeHeatmapL16PassedFromRuns(runs)) return true;
  }
  return false;
}

/** runs.json 中该学员已入库局的最大 ts（与 report 挑战记录最新一行一致） */
function latestRunTsFromRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  let max = 0;
  runs.forEach((r) => {
    const t = Number(r && r.ts) || 0;
    if (t > max) max = t;
  });
  return max;
}

function toChinaDateKey(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch (e) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

function getStreakStatsFromRuns(runs) {
  const allowedModes = new Set(["survival", "level", "training", "primeComposite", "expandBrackets", "perfectSquare", "decimal", "divisibility"]);
  const daySet = new Set();
  (runs || []).forEach((r) => {
    if (!r) return;
    const mode = normalizeRunMode(r.mode);
    if (!allowedModes.has(mode)) return;
    const key = toChinaDateKey(r.ts);
    if (key) daySet.add(key);
  });
  const days = Array.from(daySet).sort(); // YYYY-MM-DD lexicographical == chronological
  if (days.length === 0) return { streakCurrent: 0, streakBest: 0, lastActiveDate: "" };
  let best = 1;
  let cur = 1;
  let currentEndingAtLast = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = Date.parse(days[i - 1] + "T00:00:00Z");
    const now = Date.parse(days[i] + "T00:00:00Z");
    const diffDays = Math.round((now - prev) / 86400000);
    if (diffDays === 1) {
      cur += 1;
    } else {
      cur = 1;
    }
    if (cur > best) best = cur;
    if (i === days.length - 1) currentEndingAtLast = cur;
  }
  return { streakCurrent: currentEndingAtLast, streakBest: best, lastActiveDate: days[days.length - 1] || "" };
}

function bumpUserComboFromAttempts(user, attempts) {
  if (!user || !Array.isArray(attempts) || attempts.length === 0) return;
  let cur = Number(user.comboCurrent) || 0;
  let best = Number(user.comboBest) || 0;
  attempts.forEach((a) => {
    const ok = !!(a && a.correct === true);
    if (ok) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  });
  user.comboCurrent = cur;
  user.comboBest = best;
}

function getComboStatsFromRuns(runs) {
  const allowedModes = new Set(["survival", "level", "training", "primeComposite", "expandBrackets", "perfectSquare", "decimal", "divisibility"]);
  const seq = (runs || [])
    .filter((r) => r && allowedModes.has(normalizeRunMode(r.mode)) && Array.isArray(r.attempts) && r.attempts.length > 0)
    .slice()
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  let cur = 0;
  let best = 0;
  seq.forEach((r) => {
    r.attempts.forEach((a) => {
      const ok = !!(a && a.correct === true);
      if (ok) {
        cur += 1;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    });
  });
  return { comboCurrent: cur, comboBest: best };
}

function normalizeDateKey(s) {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function previousDateKey(dateKey) {
  const d = new Date(dateKey + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bumpUserStreakByDate(user, dateKey) {
  const today = normalizeDateKey(dateKey);
  if (!today || !user) return;
  const last = normalizeDateKey(user.streakLastDate || "");
  const current = Number(user.streakCurrent) || 0;
  const best = Number(user.streakBest) || 0;

  if (!last) {
    user.streakCurrent = 1;
    user.streakBest = Math.max(best, 1);
    user.streakLastDate = today;
    return;
  }
  if (last === today) return; // same day run does not increase

  const prev = previousDateKey(today);
  if (last === prev) {
    user.streakCurrent = Math.max(1, current + 1);
  } else {
    user.streakCurrent = 1;
  }
  user.streakBest = Math.max(best, Number(user.streakCurrent) || 1);
  user.streakLastDate = today;
}

function getAdminPin() {
  if (process.env.ADMIN_PIN && String(process.env.ADMIN_PIN).trim()) return String(process.env.ADMIN_PIN).trim();
  try {
    const data = readJson(ADMIN_PIN_FILE, {});
    if (data && typeof data.pin === "string" && data.pin.length > 0) return data.pin;
  } catch (e) {}
  return "";
}

/** 从源码中按大括号匹配提取 JS 对象字面量（跳过字符串内的括号）。 */
function extractJsObjectLiteralAfterMarker(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length;
  while (i < source.length && source[i] !== "{") i += 1;
  if (i >= source.length) return null;
  let depth = 0;
  const objStart = i;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === q) break;
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(objStart, i + 1);
    }
  }
  return null;
}

/** 与前端 docs/index.html 内 I18N_FALLBACK 同步；优先从该文件解析，避免维护两套键表。 */
function readI18nFallbackFromClientHtml() {
  try {
    const htmlPath = path.join(__dirname, "..", "docs", "index.html");
    if (!fs.existsSync(htmlPath)) return null;
    const html = fs.readFileSync(htmlPath, "utf8");
    const objStr = extractJsObjectLiteralAfterMarker(html, "const I18N_FALLBACK = ");
    if (!objStr) return null;
    const parsed = Function('"use strict"; return (' + objStr + ");")();
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.zhHant ||
      !parsed.en ||
      typeof parsed.zhHant !== "object" ||
      typeof parsed.en !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

/** docs/shared/stats-i18n-pack.js — 热力图/统计图表文案，与前端 Object.assign 一致 */
function readStatsI18nPackFromFile() {
  try {
    const packPath = path.join(__dirname, "..", "docs", "shared", "stats-i18n-pack.js");
    if (!fs.existsSync(packPath)) return null;
    const src = fs.readFileSync(packPath, "utf8");
    const m = src.match(/JmlStatsI18nPack\s*=\s*(\{[\s\S]*\})\s*;\s*\}\)\(/);
    if (!m) return null;
    const parsed = Function('"use strict"; return (' + m[1] + ");")();
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.zhHant ||
      !parsed.en ||
      typeof parsed.zhHant !== "object" ||
      typeof parsed.en !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function mergeStatsI18nPack(base) {
  const pack = readStatsI18nPackFromFile();
  if (!pack || !base) return base;
  return {
    zhHant: { ...base.zhHant, ...pack.zhHant },
    en: { ...base.en, ...pack.en },
  };
}

/** 仅当仓库内无 docs/index.html 时使用（例如只部署 server 目录）。 */
function legacyDefaultI18nPayload() {
  return {
    zhHant: {
      "lang.label": "語言",
      "lang.zhHant": "繁體中文",
      "lang.en": "English",
      "lang.toggleAria": "切換語言",
      "login.username.placeholder": "使用者名稱",
      "login.password.placeholder": "密碼",
      "login.submit": "登入",
      "login.register": "註冊",
      "login.guest": "遊客試玩",
      "login.register.username.placeholder": "使用者名稱（2-20位，字母數字底線）",
      "login.register.password.placeholder": "密碼（至少6位）",
      "login.register.confirm.placeholder": "確認密碼",
      "login.register.submit": "註冊",
      "login.register.back": "返回登入",
      "login.register.grade.aria": "年級",
      "grade.placeholder": "請選擇年級",
      "grade.preschool": "學前",
      "grade.n": "{n}年級",
      "grade.adult": "成人",
      "login.hint": "登入/註冊需連網。可遊客試玩（僅本機保存，無需連網）。",
      "login.version": "版本",
      "home.group.arith": "四則運算",
      "home.group.special": "拓展練習",
      "home.group.numberSense": "數感練習",
      "home.group.tools": "工具與統計",
      "home.mode.level": "闖關模式",
      "home.mode.training": "訓練模式",
      "home.mode.survival": "生存挑戰",
      "home.mode.expandBrackets": "拆括號",
      "home.mode.unitConversion": "單位換算",
      "home.mode.primeComposite": "質數合數",
      "home.mode.divisibility": "整除",
      "home.mode.factorsMultiples": "因數倍數",
      "home.mode.wrongbook": "錯題本",
      "home.mode.stats": "數據統計",
      "home.mode.ranking": "排行榜",
      "home.mode.achievementWall": "成就牆",
      "ranking.title": "排行榜",
      "ranking.taskMaster": "任務達人",
      "ranking.score": "等級榜",
      "ranking.survival": "生存榜",
      "ranking.levelClear": "闖關達人",
      "ranking.primePerfect": "質數達人",
      "ranking.divisibilityPerfect": "整除達人",
      "ranking.streak": "耐力榜",
      "ranking.combo": "連擊榜",
      "stats.subtitle": "按難度統計的錯誤率與用時（基於最近 500 局）。",
      "stats.level.select": "選擇難度：",
      "stats.th.level": "難度",
      "stats.th.attempts": "答題數",
      "stats.th.errorRate": "錯誤率",
      "stats.th.avgTime": "平均每題用時(秒)",
      "wrongbook.title": "錯題本",
      "wrongbook.subtitle": "以下是最新錯題，可自行複習。",
      "wrongbook.practice": "錯題練習",
      "wrongbook.studentAnswer": "學員答案：",
      "wrongbook.correctAnswer": "正確答案：",
      "wrongbook.badgeAria": "錯題 {n} 道",
      "home.soon.expandBrackets": "拆括號：功能即將上線",
      "home.soon.divisibility": "整除：功能即將上線",
      "home.soon.factorsMultiples": "因數倍數：功能即將上線",
      "home.soon.achievementWall": "成就牆：功能即將上線",
      "home.soon.unitConversion": "單位換算：功能即將上線",
      "expand.title": "拆括號",
      "expand.subtitle": "20 題選擇題：全對可升級；錯 1 題在進度前沿可解鎖下一級。",
      "expand.start": "開始挑戰",
      "expand.next": "下一題",
      "expand.explain": "解析",
      "expand.recent": "最近十次拆括號",
      "expand.th.datetime": "日期時間",
      "expand.th.time": "用時",
      "expand.th.wrong": "錯題",
      "expand.th.level": "等級",
      "expand.end.title": "本局結束",
      "expand.end.time": "用時：",
      "expand.end.level": "等級：",
      "expand.end.wrong": "錯題：",
      "expand.end.result": "結果：",
      "expand.result.unlockNew": "解鎖新等級",
      "expand.result.perfect": "完美",
      "expand.result.keepGoing": "繼續加油",
      "expand.choice.cannotRemoveBrackets": "此類情況無法去除括號",
      "expand.level.L1": "一層括號、整數加減去括號（括號外為「+」或「−」，括號內兩項）。",
      "expand.level.L2": "乘除去括號；括號與數字 k 之間僅「×」或「÷」，括號內兩數可為 +、−、×、÷。",
      "expand.level.L3": "兩個括號並排（段間為「+」或「−」）；可含 a、b、x、y 與整數，只展開不計算。",
      "expand.level.L4": "一層括號前係數 k，或雙係數兩段括號（±k1(…)±k2(…)）；分配與段間變號。",
      "expand.level.L5": "單項×括號、(…)÷A、兩括號相乘三型（約 1∶1∶2）；可出現 xy 項。",
      "ps.subtitle": "20 題：全對可升級；錯 1 題在進度前沿可解鎖下一級。",
      "ps.difficultyLabel": "難度：",
      "ps.levelSelectAria": "選擇平方數難度",
      "ps.level.L1": "2～11 的平方",
      "ps.level.L2": "2～20 的平方",
      "ps.level.L3": "2～30 的平方",
      "ps.recentTitle": "最近十次平方數",
    },
    en: {
      "lang.label": "Language",
      "lang.zhHant": "Traditional Chinese",
      "lang.en": "English",
      "lang.toggleAria": "Switch language",
      "login.username.placeholder": "Username",
      "login.password.placeholder": "Password",
      "login.submit": "Sign In",
      "login.register": "Register",
      "login.guest": "Guest Demo",
      "login.register.username.placeholder": "Username (2-20 chars: letters, numbers, underscore)",
      "login.register.password.placeholder": "Password (at least 6 characters)",
      "login.register.confirm.placeholder": "Confirm password",
      "login.register.submit": "Create Account",
      "login.register.back": "Back to Sign In",
      "login.register.grade.aria": "Grade",
      "grade.placeholder": "Select grade",
      "grade.preschool": "Preschool",
      "grade.n": "Grade {n}",
      "grade.adult": "Adult",
      "login.hint": "Login/Register requires internet. Guest demo is local-only and does not require internet.",
      "login.version": "Version",
      "home.group.arith": "Arithmetic",
      "home.group.special": "Extended Practice",
      "home.group.numberSense": "Number Sense",
      "home.group.tools": "Tools & Stats",
      "home.mode.level": "Levels",
      "home.mode.training": "Practice",
      "home.mode.survival": "Survival",
      "home.mode.expandBrackets": "Brackets",
      "home.mode.unitConversion": "Units",
      "home.mode.primeComposite": "Primes",
      "home.mode.divisibility": "Divisibility",
      "home.mode.factorsMultiples": "Factors & Multiples",
      "home.mode.wrongbook": "Mistakes",
      "home.mode.stats": "Stats",
      "home.mode.ranking": "Ranks",
      "home.mode.achievementWall": "Achievements",
      "ranking.title": "Leaderboard",
      "ranking.taskMaster": "Task Master",
      "ranking.score": "Level Rank",
      "ranking.survival": "Survival",
      "ranking.levelClear": "Level Master",
      "ranking.primePerfect": "Prime Master",
      "ranking.divisibilityPerfect": "Divisibility Master",
      "ranking.streak": "Streak",
      "ranking.combo": "Combo",
      "stats.subtitle": "Error rate and time by level (based on latest 500 runs).",
      "stats.level.select": "Level:",
      "stats.th.level": "Level",
      "stats.th.attempts": "Attempts",
      "stats.th.errorRate": "Error Rate",
      "stats.th.avgTime": "Avg Time per Question (s)",
      "wrongbook.title": "Wrongbook",
      "wrongbook.subtitle": "Latest wrong questions for review.",
      "wrongbook.practice": "Practice Wrong Questions",
      "wrongbook.studentAnswer": "Your answer:",
      "wrongbook.correctAnswer": "Correct:",
      "wrongbook.badgeAria": "{n} wrong questions",
      "home.soon.expandBrackets": "Expand Brackets: coming soon",
      "home.soon.divisibility": "Divisibility: coming soon",
      "home.soon.factorsMultiples": "Factors & Multiples: coming soon",
      "home.soon.achievementWall": "Achievement Wall: coming soon",
      "home.soon.unitConversion": "Unit Conversion: coming soon",
      "expand.title": "Expand Brackets",
      "expand.subtitle": "20 multiple-choice questions: perfect run levels up; 1 wrong at the frontier unlocks the next level.",
      "expand.start": "Start",
      "expand.next": "Next",
      "expand.explain": "Explanation",
      "expand.recent": "Last 10 Runs",
      "expand.th.datetime": "Date/Time",
      "expand.th.time": "Time",
      "expand.th.wrong": "Wrong",
      "expand.th.level": "Level",
      "expand.end.title": "Session Complete",
      "expand.end.time": "Time:",
      "expand.end.level": "Level:",
      "expand.end.wrong": "Wrong:",
      "expand.end.result": "Result:",
      "expand.result.unlockNew": "New level unlocked",
      "expand.result.perfect": "Perfect",
      "expand.result.keepGoing": "Keep going",
      "expand.choice.cannotRemoveBrackets": "This type cannot remove brackets.",
      "expand.level.L1": "One layer of parentheses; integers only (+/− outside; two terms inside).",
      "expand.level.L2": "×/÷ outside parentheses only; inner pair uses +, −, ×, or ÷.",
      "expand.level.L3": "Two groups side by side (+/− between); a, b, x, y and integers; expand only.",
      "expand.level.L4": "Coefficient k before one group, or k1/k2 on two groups; distribute and sign rules.",
      "expand.level.L5": "Three types: A×(…), (…)÷A, (…)×(…); about 1:1:2; xy terms allowed.",
      "ps.subtitle": "20 questions: perfect run levels up; 1 wrong at the frontier unlocks the next level.",
      "ps.difficultyLabel": "Difficulty:",
      "ps.levelSelectAria": "Perfect squares level",
      "ps.level.L1": "Squares 2–11",
      "ps.level.L2": "Squares 2–20",
      "ps.level.L3": "Squares 2–30",
      "ps.recentTitle": "Last 10 square runs",
    },
  };
}

function defaultI18nPayload() {
  const base = readI18nFallbackFromClientHtml() || legacyDefaultI18nPayload();
  return mergeStatsI18nPack(base);
}

/** 仅存在于 docs/index.html I18N_FALLBACK，不进 i18n.json / 管理端。 */
const BUILTIN_I18N_KEY_RE = /^home\.(mode\.|btn\.)/;

function isBuiltinI18nKey(key) {
  return BUILTIN_I18N_KEY_RE.test(String(key || "").trim());
}

function stripBuiltinI18nKeys(langObj) {
  const out = {};
  if (!langObj || typeof langObj !== "object") return out;
  Object.keys(langObj).forEach((k) => {
    if (!isBuiltinI18nKey(k)) out[k] = langObj[k];
  });
  return out;
}

function stripBuiltinFromI18nPayload(payload) {
  return {
    zhHant: stripBuiltinI18nKeys(payload && payload.zhHant),
    en: stripBuiltinI18nKeys(payload && payload.en),
  };
}

function normalizeI18nPayload(input) {
  const base = defaultI18nPayload();
  const out = { zhHant: { ...base.zhHant }, en: { ...base.en } };
  if (!input || typeof input !== "object") {
    return stripBuiltinFromI18nPayload(out);
  }
  ["zhHant", "en"].forEach((lang) => {
    const src = input[lang];
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach((k) => {
      const key = String(k || "").trim();
      if (!key || isBuiltinI18nKey(key)) return;
      const val = src[k];
      out[lang][key] = typeof val === "string" ? val : String(val ?? "");
    });
  });
  return stripBuiltinFromI18nPayload(out);
}

function readManageableI18nFromDisk() {
  const raw = readJson(I18N_FILE, {});
  return normalizeI18nPayload(raw);
}

/** 總積分榜改名等級榜：线上 i18n.json 里旧文案在部署后自动对齐代码默认。 */
const SCORE_RANKING_I18N_KEYS = [
  "ranking.score",
  "ranking.hint.score.loading",
  "ranking.hint.score.needNet",
  "ranking.hint.score.desc",
  "ranking.hint.score.fail",
  "ranking.hint.tabLoading.score",
];

function needsScoreRankingI18nMigrate(value, key) {
  const s = String(value || "");
  if (!s) return false;
  if (s.includes("總積分榜") || s.includes("总积分榜")) return true;
  if (key === "ranking.hint.score.desc" && s.includes("按總積分") && !s.includes("總經驗")) return true;
  if (key === "ranking.score" && /total\s*score/i.test(s) && !/level\s*rank/i.test(s)) return true;
  return false;
}

function migrateI18nScoreRankingLabels() {
  if (!fs.existsSync(I18N_FILE)) return;
  const raw = readJson(I18N_FILE, {});
  const defaults = defaultI18nPayload();
  let changed = false;
  ["zhHant", "en"].forEach((lang) => {
    const src = raw[lang];
    if (!src || typeof src !== "object") return;
    SCORE_RANKING_I18N_KEYS.forEach((key) => {
      const cur = src[key];
      if (typeof cur !== "string" || !needsScoreRankingI18nMigrate(cur, key)) return;
      const next = defaults[lang] && defaults[lang][key];
      if (!next || cur === next) return;
      src[key] = next;
      changed = true;
    });
  });
  if (changed) {
    writeJson(I18N_FILE, normalizeI18nPayload(raw));
    console.log("[i18n] migrated score-ranking labels (總積分榜 → 等級榜)");
  }
}

function rewriteRankingHintTopN(s) {
  let out = String(s || "");
  if (!out) return out;
  out = out.replace(/前十名/g, "前二十名");
  out = out.replace(/未進前十/g, "未進前二十");
  out = out.replace(/未进前十/g, "未进前二十");
  out = out.replace(/Top 10/g, "Top 20");
  out = out.replace(/top 10/g, "top 20");
  return out;
}

/** 线上 i18n.json 若仍写「前十」，部署后改成前二十，避免覆盖 H5 新文案。 */
function migrateI18nRankingPublicTop20() {
  if (!fs.existsSync(I18N_FILE)) return;
  const raw = readJson(I18N_FILE, {});
  let changed = false;
  ["zhHant", "en"].forEach((lang) => {
    const src = raw[lang];
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach((key) => {
      if (!/^ranking\.hint\.[^.]+\.desc$/.test(key)) return;
      const cur = src[key];
      if (typeof cur !== "string") return;
      const next = rewriteRankingHintTopN(cur);
      if (next === cur) return;
      src[key] = next;
      changed = true;
    });
  });
  if (changed) {
    writeJson(I18N_FILE, normalizeI18nPayload(raw));
    console.log("[i18n] migrated ranking hints (前十 → 前二十)");
  }
}

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
migrateI18nScoreRankingLabels();
migrateI18nRankingPublicTop20();
if (!fs.existsSync(AVATAR_ASSET_DIR)) {
  fs.mkdirSync(AVATAR_ASSET_DIR, { recursive: true });
}
if (!fs.existsSync(ACHIEVEMENT_ASSET_DIR)) {
  fs.mkdirSync(ACHIEVEMENT_ASSET_DIR, { recursive: true });
}

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Admin-Pin", "Authorization"],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use("/avatar-assets", express.static(AVATAR_ASSET_DIR));
app.use("/achievement-assets", express.static(ACHIEVEMENT_ASSET_DIR));

// 管理端 / 报表静态页：位于 docs/ 下，与主站一并部署到静态根目录时可同域访问 /admin/、/report/。
// 若只部署 server 目录到 Render，此处不会挂载；本地可用 local-admin-server（以 docs 为根）打开。
const REPO_ROOT = path.join(__dirname, "..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
if (fs.existsSync(path.join(DOCS_DIR, "admin"))) {
  app.use(
    "/admin",
    express.static(path.join(DOCS_DIR, "admin"), { index: "index.html" })
  );
}
if (fs.existsSync(path.join(DOCS_DIR, "report"))) {
  app.use(
    "/report",
    express.static(path.join(DOCS_DIR, "report"), { index: "index.html" })
  );
}
if (fs.existsSync(path.join(DOCS_DIR, "shared"))) {
  app.use("/shared", express.static(path.join(DOCS_DIR, "shared")));
}
if (fs.existsSync(DOCS_DIR)) {
  app.use("/docs", express.static(DOCS_DIR));
}

function clampUnlockLevel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function isAvatarUnlockedForUser(user, item) {
  if (!item || item.enabled === false) return false;
  const playerLv = playerLevel.levelForTotalXp(Number(user && user.totalScore) || 0);
  return playerLv >= clampUnlockLevel(item.unlockLevel);
}

function sanitizeAvatarName(v, fallback) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fallback || "未命名头像";
  return s.slice(0, 40);
}

function normalizeAvatarEntry(raw, index) {
  const fallbackId = `avt_${index + 1}`;
  const id = (raw && raw.id ? String(raw.id).trim() : fallbackId) || fallbackId;
  const order = Number.isFinite(Number(raw && raw.order)) ? Number(raw.order) : index;
  return {
    id,
    name: sanitizeAvatarName(raw && raw.name, id),
    imagePath: typeof (raw && raw.imagePath) === "string" ? raw.imagePath : "",
    unlockLevel: clampUnlockLevel(raw && raw.unlockLevel),
    order,
    enabled: raw && raw.enabled !== false,
    createdAt: Number(raw && raw.createdAt) || Date.now(),
    updatedAt: Number(raw && raw.updatedAt) || Date.now(),
  };
}

function readAvatarCatalog() {
  const data = readJson(AVATARS_FILE, { avatars: [] });
  const listRaw = Array.isArray(data.avatars) ? data.avatars : [];
  const list = listRaw.map((x, i) => normalizeAvatarEntry(x, i));
  list.sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
  return list.map((x, i) => ({ ...x, order: i }));
}

function writeAvatarCatalog(list) {
  const now = Date.now();
  const normalized = (Array.isArray(list) ? list : [])
    .map((x, i) => normalizeAvatarEntry(x, i))
    .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)))
    .map((x, i) => ({
      ...x,
      order: i,
      updatedAt: now,
      createdAt: Number(x.createdAt) || now,
    }));
  writeJson(AVATARS_FILE, { avatars: normalized });
  return normalized;
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  try {
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return null;
    return { buf, ext };
  } catch (e) {
    return null;
  }
}

const IMAGE_ASSET_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

function unlinkAssetFileSafe(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("[assets] failed to unlink", filePath, e.message);
  }
}

function assetFileFromPublicPath(publicPath, assetDir, publicPrefix) {
  if (!publicPath || typeof publicPath !== "string") return null;
  if (!publicPath.startsWith(publicPrefix)) return null;
  const rel = publicPath.slice(publicPrefix.length).replace(/^\/+/, "");
  if (!rel || rel.includes("..") || rel.includes("/") || rel.includes("\\")) return null;
  return path.join(assetDir, rel);
}

/** 删除 assetDir 下同一 id 的旧图片（如 id.webp / id.png），避免换格式后遗留死文件 */
function removeAssetFilesForId(assetDir, assetId) {
  const safeId = String(assetId || "").trim();
  if (!safeId || safeId.includes("..") || safeId.includes("/") || safeId.includes("\\")) return;
  let entries = [];
  try {
    entries = fs.readdirSync(assetDir);
  } catch (e) {
    return;
  }
  const prefix = `${safeId}.`;
  entries.forEach((name) => {
    if (!name.startsWith(prefix)) return;
    const ext = name.slice(prefix.length).toLowerCase();
    if (!IMAGE_ASSET_EXTS.has(ext)) return;
    unlinkAssetFileSafe(path.join(assetDir, name));
  });
}

function cleanupReplacedAssetImage({ assetDir, assetId, previousImagePath, publicPrefix }) {
  removeAssetFilesForId(assetDir, assetId);
  const prevFile = assetFileFromPublicPath(previousImagePath, assetDir, publicPrefix);
  if (prevFile) unlinkAssetFileSafe(prevFile);
}

function createAvatarId() {
  return `avt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildAvatarPublic(item, req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host");
  let imageUrl = item.imagePath || "";
  if (imageUrl && /^\/[^/]/.test(imageUrl) && host) {
    imageUrl = `${proto}://${host}${imageUrl}`;
  }
  return {
    id: item.id,
    name: item.name,
    imageUrl,
    unlockLevel: clampUnlockLevel(item.unlockLevel),
    order: item.order,
    enabled: item.enabled !== false,
  };
}

function buildAchievementImageUrl(item, req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host");
  let imageUrl = (item && item.imagePath) || "";
  if (imageUrl && /^\/[^/]/.test(imageUrl) && host) {
    imageUrl = `${proto}://${host}${imageUrl}`;
  }
  return imageUrl;
}

function mapAchievementItemPublic(item, req) {
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn || "",
    icon: item.icon,
    imageUrl: buildAchievementImageUrl(item, req),
    category: item.category,
    hint: item.hint,
    hintEn: item.hintEn || "",
    xpReward: item.xpReward,
    sortOrder: item.sortOrder,
  };
}

function mapAchievementItemView(item, req) {
  return Object.assign({}, item, {
    imageUrl: buildAchievementImageUrl({ imagePath: item.imagePath }, req),
  });
}

function resolveUserAvatarIdOrEmpty(user) {
  const id = user && typeof user.avatarId === "string" ? user.avatarId.trim() : "";
  if (!id) return "";
  const catalog = readAvatarCatalog();
  const item = catalog.find((x) => x.id === id);
  if (!item || item.enabled === false) return "";
  if (isAvatarUnlockedForUser(user, item)) return id;
  return "";
}

/** 排行榜：一次读 users / 成就 catalog / 头像 catalog，批量查昵称、头像、佩戴徽章 */
function createRankingLookupContext(req) {
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];
  const userByName = {};
  users.forEach((u) => {
    if (u && u.username) userByName[u.username] = u;
  });
  const achievementCatalog = readAchievementsCatalog();
  const avatarCatalog = readAvatarCatalog();
  const avatarById = {};
  avatarCatalog.forEach((item) => {
    if (item && item.id) avatarById[item.id] = item;
  });
  const badgeCache = {};

  function equippedBadgesFor(username) {
    if (!username) return [];
    if (Object.prototype.hasOwnProperty.call(badgeCache, username)) {
      return badgeCache[username];
    }
    const u = userByName[username];
    if (!u) {
      badgeCache[username] = [];
      return badgeCache[username];
    }
    achievementEngine.sanitizeEquippedBadges(u, achievementCatalog);
    const badges = achievementEngine.buildEquippedBadgesSummary(u, achievementCatalog).map((b) => ({
      ...b,
      imageUrl: buildAchievementImageUrl({ imagePath: b.imagePath }, req),
    }));
    badgeCache[username] = badges;
    return badges;
  }

  function avatarUrlForUser(u) {
    if (!u) return "";
    const avatarId = typeof u.avatarId === "string" ? u.avatarId.trim() : "";
    if (!avatarId) return "";
    const item = avatarById[avatarId];
    if (!item || item.enabled === false) return "";
    if (!isAvatarUnlockedForUser(u, item)) return "";
    return buildAvatarPublic(item, req).imageUrl || "";
  }

  function avatarUrlForUsername(username) {
    return avatarUrlForUser(userByName[username]);
  }

  function nicknameFor(username) {
    const u = userByName[username];
    const n = u && (u.nickname || "").trim();
    return n ? String(n).trim() : "新人";
  }

  function withEquippedBadges(row) {
    if (!row || !row.username) return row;
    return Object.assign({}, row, { equippedBadges: equippedBadgesFor(row.username) });
  }

  function buildScoreRankingRowUser(u) {
    if (!u || !u.username) return null;
    const displayName = (u.nickname || "").trim() ? String(u.nickname).trim() : "新人";
    const totalScore = Number(u.totalScore) || 0;
    const avatarUrl = avatarUrlForUser(u);
    return withEquippedBadges({ username: u.username, displayName, totalScore, avatarUrl });
  }

  let rankingFullList = false;
  const token = getTokenFromRequest(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && payload.role === "student" && payload.username) {
        const u = userByName[payload.username];
        rankingFullList = !!(u && u.isTester === true);
      }
    } catch (e) {
      rankingFullList = false;
    }
  }
  const rankingListLimit = rankingFullList ? RANKING_TESTER_MAX : RANKING_PUBLIC_MAX;

  return {
    users,
    userByName,
    equippedBadgesFor,
    avatarUrlForUser,
    avatarUrlForUsername,
    nicknameFor,
    withEquippedBadges,
    buildScoreRankingRowUser,
    rankingListLimit,
    rankingFullList,
  };
}

function validateAndNormalizeAvatarIdForUser(user, avatarId) {
  const id = avatarId == null ? "" : String(avatarId).trim();
  if (!id) return { ok: true, value: "" };
  const catalog = readAvatarCatalog();
  const item = catalog.find((x) => x.id === id);
  if (!item || item.enabled === false) {
    return { ok: false, status: 400, error: "无效的头像" };
  }
  const needLevel = clampUnlockLevel(item.unlockLevel);
  if (!isAvatarUnlockedForUser(user, item)) {
    return { ok: false, status: 403, error: `头像未解锁：需要 Lv.${needLevel}` };
  }
  return { ok: true, value: id };
}

// 健康检查（用于确认服务是否在线）
app.get("/api/health", (req, res) => {
  res.json({ ok: true, msg: "Jarvis Math Lab API" });
});

// 校验管理员口令（从 header 或 body 获取）
function checkAdminPin(req) {
  const pin = req.headers["x-admin-pin"] || req.body?.adminPin;
  const configuredPin = getAdminPin();
  if (!configuredPin) return false;
  return pin === configuredPin;
}

// ========== 学员接口鉴权：支持 Cookie 或 Authorization Bearer，只允许访问自己的数据 ==========
function getTokenFromRequest(req) {
  const fromCookie = req.cookies?.auth_token;
  if (fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function requireStudentAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "请先登录" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.role !== "student") {
      return res.status(403).json({ ok: false, error: "无效的登录状态" });
    }
    req.user = { username: payload.username, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "登录已过期，请重新登录" });
  }
}

function ensureOwnData(req, res, next) {
  const username = req.params.username;
  if (!req.user || req.user.username !== username) {
    return res.status(403).json({ ok: false, error: "禁止访问其他学员数据" });
  }
  next();
}

function createStudentToken(username) {
  return jwt.sign({ username, role: "student" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function setAuthCookie(res, username) {
  const token = createStudentToken(username);
  const isProd = process.env.NODE_ENV === "production" || !!process.env.RENDER;
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_MS
  });
  return token;
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.RENDER;
  res.clearCookie("auth_token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax"
  });
}

// ========== 学员自主注册 ==========
function isValidUsername(s) {
  if (typeof s !== "string" || s.length < 2 || s.length > 20) return false;
  return /^[a-zA-Z0-9_]+$/.test(s);
}

app.post("/api/register", async (req, res) => {
  const { username, password, grade } = req.body || {};
  const name = (username || "").trim();
  const pwd = password ? String(password) : "";
  if (!name || !pwd) {
    return res.json({ ok: false, error: "请填写用户名和密码" });
  }
  if (!isValidUsername(name)) {
    return res.json({ ok: false, error: "用户名 2-20 位，仅支持字母、数字、下划线" });
  }
  if (pwd.length < 6) {
    return res.json({ ok: false, error: "密码至少 6 位" });
  }
  const g = normalizeRequiredGrade(grade);
  if (g.error) {
    return res.json({ ok: false, error: g.error });
  }
  const data = readJson(USERS_FILE, { users: [] });
  if (dedupeUsernames.usernameTakenCaseInsensitive(data.users, name)) {
    return res.json({ ok: false, error: "该用户名已存在" });
  }
  const passwordHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
  const newUser = {
    username: name,
    password: passwordHash,
    nickname: "",
    avatarId: "",
    levelIndex: 0,
    bestLevelIndex: 0,
    totalScore: 0,
    bestSurvivalSec: 0,
    bestScore: 0,
    recentSurvivalRuns: [],
    recentLevelRuns: [],
    recentTrainingRuns: [],
    recentPrimeCompositeRuns: [],
    recentExpandBracketsRuns: [],
    recentPerfectSquareRuns: [],
    recentDecimalRuns: [],
    recentDivisibilityRuns: [],
    streakCurrent: 0,
    streakBest: 0,
    streakLastDate: "",
    comboCurrent: 0,
    comboBest: 0,
    levelChallengeLastLevel: 0,
    levelChallengeBestLevel: 0,
    levelTrainingCurrentLevel: -1,
    levelExpandBracketsCurrentLevel: 0,
    levelExpandBracketsUnlockedMax: 0,
    levelPerfectSquareCurrentLevel: 0,
    levelPerfectSquareUnlockedMax: 0,
    levelDecimalCurrentLevel: 0,
    levelDecimalUnlockedMax: 0,
    levelDivisibilityCurrentLevel: 0,
    levelDivisibilityUnlockedMax: 0,
    wrongAnswers: [],
    wrongAnswersClearedBeforeTs: 0,
    expandBracketsWrongAnswers: [],
    divisibilityWrongAnswers: [],
    achievements: {},
    equippedBadges: [],
    survivalUnlocked: false,
    trainingL16Cleared: false,
    heatmapL16Passed: false,
    createdBy: "self",
    createdAt: Date.now(),
    grade: g.value,
  };
  data.users.push(newUser);
  writeJson(USERS_FILE, data);
  const token = setAuthCookie(res, name);
  res.json({ ok: true, user: safeUserForStudent(newUser), token });
});

// ========== 学员登录 ==========
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ ok: false, error: "请输入用户名和密码" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.json({ ok: false, error: "用户不存在，请联系老师在后台添加" });
  }
  let match = false;
  if (isBcryptHash(user.password)) {
    match = await bcrypt.compare(password, user.password);
  } else {
    match = user.password === password;
    if (match) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const idx = data.users.findIndex((u) => u.username === username);
      if (idx >= 0) {
        data.users[idx].password = hash;
        writeJson(USERS_FILE, data);
      }
    }
  }
  if (!match) {
    return res.json({ ok: false, error: "密码错误" });
  }
  if (user.hasClearedSurvival === undefined) {
        const runs = runsStore.getUserRuns(username);
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    const uIdx = data.users.findIndex((u) => u.username === username);
    if (uIdx >= 0) {
      data.users[uIdx].hasClearedSurvival = user.hasClearedSurvival;
      writeJson(USERS_FILE, data);
    }
  }
  if (user.hasClearedLevel === undefined) {
        const runs = runsStore.getUserRuns(username);
    user.hasClearedLevel = userHasClearedLevelFromRuns(runs);
    const uIdx = data.users.findIndex((u) => u.username === username);
    if (uIdx >= 0) {
      data.users[uIdx].hasClearedLevel = user.hasClearedLevel;
      writeJson(USERS_FILE, data);
    }
  }
  const token = setAuthCookie(res, username);
  res.json({ ok: true, user: safeUserForStudent(user), token });
});

// ========== 学员登出（清除登录态） ==========
app.post("/api/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ========== 错题本（学员）：按需读写 ==========
app.get("/api/user/:username/wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  res.json({ ok: true, ...wrongAnswersPayload(user) });
});

app.post("/api/user/:username/wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const raw = req.body && req.body.entry != null ? req.body.entry : req.body;
  if (!raw || typeof raw !== "object") {
    return res.status(400).json({ ok: false, error: "无效错题" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  if (!Array.isArray(u.wrongAnswers)) u.wrongAnswers = [];
  // 整除为选择题，不进错题本（与学员端策略一致）
  if (String(raw.mode || "") === "divisibility") {
    return res.json({ ok: true, skipped: true, ...wrongAnswersPayload(u) });
  }
  const entry = normalizeWrongAnswerEntry(raw);
  u.wrongAnswers.unshift(entry);
  if (u.wrongAnswers.length > WRONGBOOK_MAX_STORE) {
    u.wrongAnswers = u.wrongAnswers.slice(0, WRONGBOOK_MAX_STORE);
  }
  writeJson(USERS_FILE, data);
  res.json({ ok: true, ...wrongAnswersPayload(u) });
});

app.delete("/api/user/:username/wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  if (!Array.isArray(u.wrongAnswers)) u.wrongAnswers = [];
  markWrongAnswersCleared(u);
  writeJson(USERS_FILE, data);
  res.json({ ok: true, ...wrongAnswersPayload(u) });
});

app.post("/api/user/:username/expand-brackets-wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const raw = req.body && req.body.entry != null ? req.body.entry : req.body;
  if (!raw || typeof raw !== "object") {
    return res.status(400).json({ ok: false, error: "无效错题" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  if (!Array.isArray(u.expandBracketsWrongAnswers)) u.expandBracketsWrongAnswers = [];
  const entry = {
    ts: typeof raw.ts === "number" ? raw.ts : Date.now(),
    levelIndex: typeof raw.levelIndex === "number" ? raw.levelIndex : 0,
    prompt: String(raw.prompt || ""),
    correctAnswer: String(raw.correctAnswer || ""),
    studentAnswer: String(raw.studentAnswer || ""),
  };
  u.expandBracketsWrongAnswers.unshift(entry);
  if (u.expandBracketsWrongAnswers.length > EXPAND_WRONG_MAX_STORE) {
    u.expandBracketsWrongAnswers = u.expandBracketsWrongAnswers.slice(0, EXPAND_WRONG_MAX_STORE);
  }
  writeJson(USERS_FILE, data);
  res.json({
    ok: true,
    expandBracketsWrongAnswers: Array.isArray(u.expandBracketsWrongAnswers)
      ? u.expandBracketsWrongAnswers.slice(0, EXPAND_WRONG_MAX_STORE)
      : [],
  });
});

/** 整除错题：写入档案；学员错题本 tab 可通过 GET /wrong-answers 读取 */
app.post("/api/user/:username/divisibility-wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const raw = req.body && req.body.entry != null ? req.body.entry : req.body;
  if (!raw || typeof raw !== "object") {
    return res.status(400).json({ ok: false, error: "无效错题" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  if (!Array.isArray(u.divisibilityWrongAnswers)) u.divisibilityWrongAnswers = [];
  const levelIndex =
    typeof raw.levelIndex === "number" && Number.isFinite(raw.levelIndex)
      ? Math.max(0, Math.min(4, Math.floor(raw.levelIndex)))
      : 0;
  const entry = {
    ts: typeof raw.ts === "number" ? raw.ts : Date.now(),
    levelIndex,
    prompt: String(raw.prompt || ""),
    correctAnswer: String(raw.correctAnswer != null ? raw.correctAnswer : ""),
    studentAnswer: String(raw.studentAnswer != null ? raw.studentAnswer : ""),
  };
  if (raw.divisor != null && Number.isFinite(Number(raw.divisor))) {
    entry.divisor = Math.floor(Number(raw.divisor));
  }
  u.divisibilityWrongAnswers.unshift(entry);
  if (u.divisibilityWrongAnswers.length > DIVISIBILITY_WRONG_MAX_STORE) {
    u.divisibilityWrongAnswers = u.divisibilityWrongAnswers.slice(0, DIVISIBILITY_WRONG_MAX_STORE);
  }
  writeJson(USERS_FILE, data);
  res.json({
    ok: true,
    divisibilityWrongAnswers: Array.isArray(u.divisibilityWrongAnswers)
      ? u.divisibilityWrongAnswers.slice(0, DIVISIBILITY_WRONG_MAX_STORE)
      : [],
  });
});

// ========== 获取学员数据（用于换设备同步），需登录且只能访问自己 ==========
app.get("/api/user/:username", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  if (user.hasClearedSurvival === undefined) {
        const runs = runsStore.getUserRuns(username);
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    const idx = data.users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      data.users[idx].hasClearedSurvival = user.hasClearedSurvival;
      writeJson(USERS_FILE, data);
    }
  }
  if (user.hasClearedLevel === undefined) {
        const runs = runsStore.getUserRuns(username);
    user.hasClearedLevel = userHasClearedLevelFromRuns(runs);
    const idx = data.users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      data.users[idx].hasClearedLevel = user.hasClearedLevel;
      writeJson(USERS_FILE, data);
    }
  }
  // 头像：若被删/禁用/未解锁则回退为空（前端用默认符号展示）
  user.avatarId = resolveUserAvatarIdOrEmpty(user);
  res.json({ ok: true, user: safeUserForStudent(user) });
});

// ========== 成就：公开 catalog（仅 enabled） ==========
app.get("/api/achievements/catalog", (req, res) => {
  const catalog = readAchievementsCatalog();
  const items = catalogStore.getEnabledItems(catalog).map((item) => mapAchievementItemPublic(item, req));
  res.json({
    ok: true,
    version: catalog.version,
    categoryOrder: Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder.slice() : [],
    categories: catalog.categories && typeof catalog.categories === "object" ? catalog.categories : {},
    items,
  });
});

// ========== 成就：学员进度与佩戴 ==========
app.get("/api/user/:username/achievements", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  let userNeedsSave = false;
  if (!achievementEngine.hasValidAchievementStats(user)) {
        const runs = runsStore.getUserRuns(username);
    if (achievementEngine.ensureAchievementStats(user, runs)) userNeedsSave = true;
  }
  const catalog = readAchievementsCatalog();
  achievementEngine.sanitizeEquippedBadges(user, catalog);
  const rankingCtx = buildAchievementRankingContext(username);
  const evalResult = achievementEngine.evaluateUserAchievements(user, [], catalog, { rankingCtx });
  if ((evalResult.newlyUnlocked || []).length > 0) userNeedsSave = true;
  const view = achievementEngine.buildUserAchievementsView(user, [], catalog, {
    includeDisabled: false,
    rankingCtx,
  });
  view.items = view.items.map((item) => mapAchievementItemView(item, req));
  view.categoryOrder = Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder.slice() : [];
  view.categories = catalog.categories && typeof catalog.categories === "object" ? catalog.categories : {};
  view.equippedSummary = achievementEngine.buildEquippedBadgesSummary(user, catalog).map((b) => ({
    ...b,
    imageUrl: buildAchievementImageUrl({ imagePath: b.imagePath }, req),
  }));
  if (userNeedsSave) writeJson(USERS_FILE, data);
  res.json({ ok: true, ...view });
});

app.put("/api/user/:username/achievements/equipped", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const badgeIds = req.body && Array.isArray(req.body.equippedBadges) ? req.body.equippedBadges : [];
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx < 0) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const user = data.users[idx];
  const catalog = readAchievementsCatalog();
  try {
    achievementEngine.setEquippedBadges(user, catalog, badgeIds);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
  writeJson(USERS_FILE, data);
  res.json({
    ok: true,
    equippedBadges: user.equippedBadges,
    equippedSummary: achievementEngine.buildEquippedBadgesSummary(user, catalog).map((b) => ({
      ...b,
      imageUrl: buildAchievementImageUrl({ imagePath: b.imagePath }, req),
    })),
  });
});

// ========== 更新学员进度（游戏结束后同步），需登录且只能访问自己 ==========
// 积分/最佳等只增不减，避免换设备后客户端发来旧值覆盖服务器正确值
app.put("/api/user/:username", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const updates = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  const allowed = ["nickname", "avatarId", "levelIndex", "bestLevelIndex", "totalScore", "bestSurvivalSec", "bestScore", "recentSurvivalRuns", "recentLevelRuns", "recentTrainingRuns", "recentPrimeCompositeRuns", "recentExpandBracketsRuns", "recentPerfectSquareRuns", "recentDecimalRuns", "recentDivisibilityRuns", "levelChallengeLastLevel", "levelChallengeBestLevel", "levelTrainingCurrentLevel", "levelExpandBracketsCurrentLevel", "levelExpandBracketsUnlockedMax", "levelPerfectSquareCurrentLevel", "levelPerfectSquareUnlockedMax", "levelDecimalCurrentLevel", "levelDecimalUnlockedMax", "levelDivisibilityCurrentLevel", "levelDivisibilityUnlockedMax", "wrongAnswers", "expandBracketsWrongAnswers", "divisibilityWrongAnswers", "survivalUnlocked"];
  const touched = [];
  allowed.forEach((k) => {
    if (updates[k] === undefined) return;
    if (k === "avatarId") {
      const vr = validateAndNormalizeAvatarIdForUser(u, updates.avatarId);
      if (!vr.ok) return;
      u.avatarId = vr.value;
      touched.push("avatarId");
      return;
    }
    if (k === "totalScore" || k === "bestSurvivalSec" || k === "bestScore" || k === "levelChallengeBestLevel") {
      const cur = typeof u[k] === "number" ? u[k] : 0;
      const inc = updates[k];
      if (typeof inc === "number") u[k] = Math.max(cur, inc);
      touched.push(k);
    } else {
      data.users[idx][k] = updates[k];
      touched.push(k);
    }
  });
  // avatarId 校验失败时返回明确错误
  if (updates.avatarId !== undefined) {
    const vr = validateAndNormalizeAvatarIdForUser(u, updates.avatarId);
    if (!vr.ok) {
      return res.status(vr.status || 400).json({ ok: false, error: vr.error || "头像不可用" });
    }
  }
  writeJson(USERS_FILE, data);
  data.users[idx].avatarId = resolveUserAvatarIdOrEmpty(data.users[idx]);
  const outUser = data.users[idx];
  res.json({
    ok: true,
    patch: pickStudentUserPatch(outUser, touched),
  });
});

// ========== 学员修改密码，需登录且只能修改自己 ==========
app.post("/api/user/:username/change-password", requireStudentAuth, ensureOwnData, async (req, res) => {
  const { username } = req.params;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.json({ ok: false, error: "请填写当前密码和新密码" });
  }
  if (String(newPassword).length < 6) {
    return res.json({ ok: false, error: "新密码至少 6 位" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const user = data.users[idx];
  let match = false;
  if (isBcryptHash(user.password)) {
    match = await bcrypt.compare(currentPassword, user.password);
  } else {
    match = user.password === currentPassword;
  }
  if (!match) {
    return res.json({ ok: false, error: "当前密码错误" });
  }
  data.users[idx].password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeJson(USERS_FILE, data);
  res.json({ ok: true });
});

// ========== 学员补填年级（仅未填时可写一次） ==========
app.post("/api/user/:username/grade", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = data.users[idx];
  if (isGradeSet(u.grade)) {
    return res.status(409).json({ ok: false, error: "年级已设置", needsGrade: false });
  }
  const g = normalizeRequiredGrade(req.body && req.body.grade);
  if (g.error) {
    return res.status(400).json({ ok: false, error: g.error, needsGrade: true });
  }
  u.grade = g.value;
  writeJson(USERS_FILE, data);
  res.json({ ok: true, needsGrade: false, user: safeUserForStudent(u) });
});

// ========== 学员获取自己的练习记录（完整 runs，供首页「数据统计」用），需登录且只能访问自己 ==========
app.get("/api/user/:username/runs", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  if (!data.users.some((u) => u.username === username)) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
    const runs = runsStore.getUserRuns(username)
    .map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
});

/** 训练下一关：服务端权威选关（热图 + runs 反推日状态） */
app.get("/api/user/:username/training/next-level", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const runs = runsStore.getUserRuns(username).map((r) => ({
    ...r,
    mode: normalizeRunMode(r.mode),
  }));
  const cohort = readCohortResultForHeatmap();
  let pick;
  try {
    pick = computeTrainingNextLevelForUser({
      runs,
      cohort,
      storedDayMode: user.trainingDayMode || null,
      capMs: cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : COHORT_MAX_TIME_SPENT_MS,
    });
  } catch (e) {
    console.warn("[training/next-level]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }
  if (!pick || !pick.ok) {
    return res.status(422).json({
      ok: false,
      error: (pick && pick.error) || "无法计算下一关",
      todayKey: pick && pick.todayKey,
    });
  }
  // 若日模式已跨日归一，写回用户标记（无新局时也保持隔日切换）
  if (pick.dayState && pick.dayState.dayKey && pick.dayState.dayMode) {
    const nextMark = {
      dayKey: pick.dayState.dayKey,
      dayMode: pick.dayState.dayMode,
      prevDayMode: pick.dayState.prevDayMode || null,
    };
    const prev = user.trainingDayMode || null;
    if (
      !prev ||
      prev.dayKey !== nextMark.dayKey ||
      prev.dayMode !== nextMark.dayMode ||
      prev.prevDayMode !== nextMark.prevDayMode
    ) {
      user.trainingDayMode = nextMark;
      writeJson(USERS_FILE, data);
    }
  }
  return res.json({
    ok: true,
    source: "server",
    todayKey: pick.todayKey,
    levelIndex: pick.levelIndex,
    brushMode: pick.brushMode,
    dayMode: pick.dayMode,
    frontierLevel: pick.frontierLevel,
    heatLevel: pick.heatLevel,
    mode: pick.mode,
    reason: pick.reason,
    pickReason: pick.pickReason,
    enterBrush: pick.enterBrush,
    brushPoolMax: pick.brushPoolMax,
    dayState: pick.dayState,
    heatAvgSecAtStart: pick.heatAvgSecAtStart,
    heatMeanLnAtStart: pick.heatMeanLnAtStart,
    cohortLoaded: pick.cohortLoaded,
    heat: pick.heat
      ? {
          cells: pick.heat.cells,
          minAttempts: pick.heat.minAttempts,
          maxTimeSpentMs: pick.heat.maxTimeSpentMs,
          cohortLoaded: pick.heat.cohortLoaded,
          personalWindowAttempts: pick.heat.personalWindowAttempts,
          personalHalfLifeDays: pick.heat.personalHalfLifeDays,
          levelCount: pick.heat.levelCount || 16,
        }
      : null,
    result: pick.result,
  });
});

/** 学员：各分类热图（服务器权威建格） */
app.get("/api/user/:username/heatmap", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const payload = buildHeatmapPayloadForUsername(username);
    if (!payload.ok) {
      return res.status(500).json({ ok: false, error: payload.error || "热图计算失败" });
    }
    return res.json(payload);
  } catch (e) {
    console.warn("[user/heatmap]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "热图计算失败" });
  }
});

/** 学员：练习任务单（服务器算、服务器存；引擎不在 H5） */
app.get("/api/user/:username/practice-plan", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const out = computePracticePlanForUsername(username, { includeSystemPick: false });
  if (!out.ok) {
    return res.status(out.status || 500).json({ ok: false, error: out.error || "任务单计算失败" });
  }
  return res.json(practicePlanService.studentPayload(out.advice));
});

app.post("/api/user/:username/practice-plan", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const resetIncomplete = !!(req.body && req.body.resetIncomplete);
  const out = computePracticePlanForUsername(username, {
    includeSystemPick: false,
    resetIncomplete,
  });
  if (!out.ok) {
    return res.status(out.status || 500).json({ ok: false, error: out.error || "任务单计算失败" });
  }
  return res.json(practicePlanService.studentPayload(out.advice));
});

function adminPracticePlanPayload(advice) {
  return {
    ok: true,
    ruleVersion: advice.ruleVersion,
    grade: advice.grade,
    profile: advice.profile,
    scanTarget: advice.scanTarget,
    queue: advice.queue,
    history: practicePlanService.Advice.historyToClientList(advice.plan),
    plan: advice.plan,
    planEvents: advice.planEvents,
    primary: advice.primary,
    dontOpen: advice.dontOpen,
    dontOpenLabel: advice.dontOpenLabel,
    clearEstimate: advice.clearEstimate,
    reasons: advice.reasons,
    unresolved: advice.unresolved,
    systemPick: advice.systemPick,
    divergesFromSystemPick: advice.divergesFromSystemPick,
  };
}

/** 管理员：练习任务单对照（只读快照，不跟局、不写盘） */
app.get("/api/admin/user/:username/practice-plan", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const out = computePracticePlanForUsername(username, { includeSystemPick: true, snapshot: true });
  if (!out.ok) {
    return res.status(out.status || 500).json({ ok: false, error: out.error || "任务单计算失败" });
  }
  return res.json(adminPracticePlanPayload(out.advice));
});

app.post("/api/admin/user/:username/practice-plan", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const resetIncomplete = !!(req.body && req.body.resetIncomplete);
  const out = computePracticePlanForUsername(username, {
    includeSystemPick: true,
    resetIncomplete,
  });
  if (!out.ok) {
    return res.status(out.status || 500).json({ ok: false, error: out.error || "任务单计算失败" });
  }
  return res.json(adminPracticePlanPayload(out.advice));
});

/** 学员：小数下一关（未通关梯子 / 通关后刷弱项） */
app.get("/api/user/:username/decimal/next-level", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const runs = runsStore.getUserRuns(username).map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }));
    const cohort = readCohortDecimalResultForHeatmap();
    const unlockedMax =
      req.query.unlockedMax != null && req.query.unlockedMax !== ""
        ? Number(req.query.unlockedMax)
        : typeof user.levelDecimalUnlockedMax === "number"
          ? user.levelDecimalUnlockedMax
          : 0;
    const playableMax =
      req.query.playableMax != null && req.query.playableMax !== ""
        ? Number(req.query.playableMax)
        : undefined;
    const pick = computeDecimalNextLevel({
      runs,
      cohort,
      unlockedMax,
      playableMax,
      currentLevel:
        typeof user.levelDecimalCurrentLevel === "number" ? user.levelDecimalCurrentLevel : 0,
    });
    if (!pick || !pick.ok) {
      return res.status(422).json({ ok: false, error: (pick && pick.error) || "无法计算" });
    }
    return res.json({
      ok: true,
      source: "server",
      levelIndex: pick.levelIndex,
      reason: pick.reason,
      mode: pick.mode,
      cleared: !!pick.cleared,
      unlockedMax: pick.unlockedMax,
      playableMax: pick.playableMax,
      ladderTop: pick.ladderTop != null ? pick.ladderTop : null,
    });
  } catch (e) {
    console.warn("[user/decimal/next-level]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }
});

/** 学员：整除下一关（未通关梯子 / 通关后刷弱项） */
app.get("/api/user/:username/divisibility/next-level", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const runs = runsStore.getUserRuns(username).map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }));
    const cohort = readCohortDivisibilityResultForHeatmap();
    const unlockedMax =
      req.query.unlockedMax != null && req.query.unlockedMax !== ""
        ? Number(req.query.unlockedMax)
        : typeof user.levelDivisibilityUnlockedMax === "number"
          ? user.levelDivisibilityUnlockedMax
          : 0;
    const playableMax =
      req.query.playableMax != null && req.query.playableMax !== ""
        ? Number(req.query.playableMax)
        : undefined;
    const pick = computeDivisibilityNextLevel({
      runs,
      cohort,
      unlockedMax,
      playableMax,
      currentLevel:
        typeof user.levelDivisibilityCurrentLevel === "number"
          ? user.levelDivisibilityCurrentLevel
          : 0,
    });
    if (!pick || !pick.ok) {
      return res.status(422).json({ ok: false, error: (pick && pick.error) || "无法计算" });
    }
    return res.json({
      ok: true,
      source: "server",
      levelIndex: pick.levelIndex,
      reason: pick.reason,
      mode: pick.mode,
      cleared: !!pick.cleared,
      unlockedMax: pick.unlockedMax,
      playableMax: pick.playableMax,
      ladderTop: pick.ladderTop != null ? pick.ladderTop : null,
    });
  } catch (e) {
    console.warn("[user/divisibility/next-level]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }
});

/** 学员：平方数下一关（未通关梯子 / 通关后刷弱项） */
app.get("/api/user/:username/perfect-square/next-level", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const runs = runsStore.getUserRuns(username).map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }));
    const cohort = readCohortPerfectSquareResultForHeatmap();
    const unlockedMax =
      req.query.unlockedMax != null && req.query.unlockedMax !== ""
        ? Number(req.query.unlockedMax)
        : typeof user.levelPerfectSquareUnlockedMax === "number"
          ? user.levelPerfectSquareUnlockedMax
          : 0;
    const playableMax =
      req.query.playableMax != null && req.query.playableMax !== ""
        ? Number(req.query.playableMax)
        : undefined;
    const pick = computePerfectSquareNextLevel({
      runs,
      cohort,
      unlockedMax,
      playableMax,
      currentLevel:
        typeof user.levelPerfectSquareCurrentLevel === "number"
          ? user.levelPerfectSquareCurrentLevel
          : 0,
    });
    if (!pick || !pick.ok) {
      return res.status(422).json({ ok: false, error: (pick && pick.error) || "无法计算" });
    }
    return res.json({
      ok: true,
      source: "server",
      levelIndex: pick.levelIndex,
      reason: pick.reason,
      mode: pick.mode,
      cleared: !!pick.cleared,
      unlockedMax: pick.unlockedMax,
      playableMax: pick.playableMax,
      ladderTop: pick.ladderTop != null ? pick.ladderTop : null,
    });
  } catch (e) {
    console.warn("[user/perfect-square/next-level]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }
});

// ========== 添加生存局记录（用于完整历史，供 report 页面使用），需登录且只能访问自己 ==========
app.post("/api/user/:username/runs", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const run = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const comboOnly = run.comboOnly === true;
  let allRunsAfterWrite = null;
  const runEntry = {
    survivalTimeSec: run.survivalTimeSec ?? 0,
    score: run.score ?? 0,
    maxLevel: run.maxLevel ?? 0,
    wrongCount: run.wrongCount ?? 0,
    ts: run.ts ?? Date.now(),
    mode: normalizeRunMode(run.mode),
  };
  if (comboOnly) runEntry.comboOnly = true;
  if (run.cleared === true) runEntry.cleared = true;
  if (Array.isArray(run.attempts)) runEntry.attempts = run.attempts;
  if (run.trainingMeta && typeof run.trainingMeta === "object") {
    runEntry.trainingMeta = run.trainingMeta;
  }
  if (run.abandoned === true) runEntry.abandoned = true;
  if (typeof run.mastered === "number" && Number.isFinite(run.mastered)) {
    runEntry.mastered = Math.max(0, Math.floor(run.mastered));
  }
  if (
    runEntry.abandoned === true
    || (runEntry.trainingMeta && runEntry.trainingMeta.abandoned === true)
  ) {
    runEntry.score = 0;
  }
  if (!comboOnly) {
    allRunsAfterWrite = runsStore.prependUserRun(username, runEntry);
  }

  // 质数达人榜：掌握 50 题且错题 ≤ PRIME_RANKING_MAX_WRONG；每人保留最短完成时间
  if (!comboOnly && runEntry.mode === "primeComposite") {
    upsertPrimePerfectRankingEntry(username, runEntry);
  }
  if (!comboOnly && runEntry.mode === "divisibility") {
    upsertDivisibilityPerfectRankingEntry(username, runEntry);
  }

  const userData = readJson(USERS_FILE, { users: [] });
  const uIdx = userData.users.findIndex((u) => u.username === username);
  if (uIdx >= 0) {
    const u = userData.users[uIdx];
    // 增量维护连击：放弃局（comboOnly）也计入
    bumpUserComboFromAttempts(u, runEntry.attempts);
    if (!comboOnly) {
      u.lastGameTs = runEntry.ts;
      u.totalScore = (u.totalScore || 0) + (runEntry.score || 0);
      achievementEngine.bumpAchievementStatsFromRun(u, runEntry);
      // 增量维护耐力字段：同一天仅记一次，连续天数按中国日期推进
      bumpUserStreakByDate(u, toChinaDateKey(runEntry.ts));
    }
    if (!comboOnly && runEntry.mode === "survival") {
      if ((runEntry.survivalTimeSec || 0) > (u.bestSurvivalSec || 0)) u.bestSurvivalSec = runEntry.survivalTimeSec;
      if ((runEntry.score || 0) > (u.bestScore || 0)) u.bestScore = runEntry.score;
      if (!Array.isArray(u.recentSurvivalRuns)) u.recentSurvivalRuns = [];
      u.recentSurvivalRuns.unshift(runEntry);
      if (u.recentSurvivalRuns.length > 10) u.recentSurvivalRuns = u.recentSurvivalRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "level") {
      if (!Array.isArray(u.recentLevelRuns)) u.recentLevelRuns = [];
      u.recentLevelRuns.unshift(runEntry);
      if (u.recentLevelRuns.length > 10) u.recentLevelRuns = u.recentLevelRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "training") {
      if (!Array.isArray(u.recentTrainingRuns)) u.recentTrainingRuns = [];
      u.recentTrainingRuns.unshift(runEntry);
      if (u.recentTrainingRuns.length > 10) u.recentTrainingRuns = u.recentTrainingRuns.slice(0, 10);
      const da =
        runEntry.trainingMeta &&
        runEntry.trainingMeta.dayStateAfter &&
        typeof runEntry.trainingMeta.dayStateAfter === "object"
          ? runEntry.trainingMeta.dayStateAfter
          : null;
      if (da && (da.dayMode === "frontier" || da.dayMode === "heat") && da.dayKey) {
        u.trainingDayMode = {
          dayKey: String(da.dayKey),
          dayMode: da.dayMode,
          prevDayMode: da.prevDayMode === "frontier" || da.prevDayMode === "heat" ? da.prevDayMode : null,
        };
      }
    } else if (!comboOnly && runEntry.mode === "primeComposite") {
      if (!Array.isArray(u.recentPrimeCompositeRuns)) u.recentPrimeCompositeRuns = [];
      u.recentPrimeCompositeRuns.unshift(runEntry);
      if (u.recentPrimeCompositeRuns.length > 10) u.recentPrimeCompositeRuns = u.recentPrimeCompositeRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "expandBrackets") {
      if (!Array.isArray(u.recentExpandBracketsRuns)) u.recentExpandBracketsRuns = [];
      u.recentExpandBracketsRuns.unshift(runEntry);
      if (u.recentExpandBracketsRuns.length > 10) u.recentExpandBracketsRuns = u.recentExpandBracketsRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "perfectSquare") {
      if (!Array.isArray(u.recentPerfectSquareRuns)) u.recentPerfectSquareRuns = [];
      u.recentPerfectSquareRuns.unshift(runEntry);
      if (u.recentPerfectSquareRuns.length > 10) u.recentPerfectSquareRuns = u.recentPerfectSquareRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "decimal") {
      if (!Array.isArray(u.recentDecimalRuns)) u.recentDecimalRuns = [];
      u.recentDecimalRuns.unshift(runEntry);
      if (u.recentDecimalRuns.length > 10) u.recentDecimalRuns = u.recentDecimalRuns.slice(0, 10);
    } else if (!comboOnly && runEntry.mode === "divisibility") {
      if (!Array.isArray(u.recentDivisibilityRuns)) u.recentDivisibilityRuns = [];
      u.recentDivisibilityRuns.unshift(runEntry);
      if (u.recentDivisibilityRuns.length > 10) u.recentDivisibilityRuns = u.recentDivisibilityRuns.slice(0, 10);
    }
    if (!comboOnly && runEntry.mode === "level") {
      const ml = Math.min(SURVIVAL_UNLOCK_L16_INDEX, Math.max(0, Number(runEntry.maxLevel) || 0));
      if (ml > (u.levelChallengeBestLevel || 0)) u.levelChallengeBestLevel = ml;
    }
    if (!comboOnly) {
      const allRuns = allRunsAfterWrite || runsStore.getUserRuns(username);
      recomputeSurvivalUnlockFlags(u, allRuns);
      if (allRuns.length >= 500) {
        achievementEngine.assignAchievementStatsFromRuns(u, allRuns);
      }
    }
  }
  if (!comboOnly && runEntry.mode === "survival" && runEntry.cleared === true) {
    const rankingData = readJson(SURVIVAL_RANKING_FILE, { list: [] });
    let list = Array.isArray(rankingData.list) ? rankingData.list : [];
    const entry = {
      username,
      survivalTimeSec: runEntry.survivalTimeSec,
      wrongCount: runEntry.wrongCount ?? 0,
      ts: runEntry.ts
    };
    const existing = list.find((e) => e.username === username);
    const isBetter = (a, b) => {
      if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec < b.survivalTimeSec;
      return (a.wrongCount ?? 0) < (b.wrongCount ?? 0);
    };
    if (!existing || isBetter(entry, existing)) {
      list = list.filter((e) => e.username !== username);
      list.push(entry);
      list.sort((a, b) => {
        if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
        return (a.wrongCount ?? 0) - (b.wrongCount ?? 0);
      });
      rankingData.list = list;
      writeJson(SURVIVAL_RANKING_FILE, rankingData);
    }

    if (uIdx >= 0) {
      userData.users[uIdx].hasClearedSurvival = true;
    }
    writeJson(USERS_FILE, userData);
  } else if (!comboOnly && runEntry.mode === "level" && runEntry.cleared === true) {
    upsertLevelRankingEntry(username, runEntry);
    if (uIdx >= 0) {
      userData.users[uIdx].hasClearedLevel = true;
    }
    writeJson(USERS_FILE, userData);
  } else if (uIdx >= 0) {
    writeJson(USERS_FILE, userData);
  }

  if (uIdx >= 0) {
    const u = userData.users[uIdx];
    let newlyUnlocked = [];
    if (!comboOnly) {
      const catalog = readAchievementsCatalog();
      const rankingCtx = buildAchievementRankingContext(u.username);
      const evalResult = achievementEngine.evaluateUserAchievements(u, [], catalog, { rankingCtx });
      newlyUnlocked = evalResult.newlyUnlocked || [];
      achievementEngine.sanitizeEquippedBadges(u, catalog);
      writeJson(USERS_FILE, userData);
    }
    const sync = buildRunSyncForStudent(u, runEntry.mode);
    if (newlyUnlocked.length) sync.newAchievements = newlyUnlocked;
    return res.json({ ok: true, sync });
  }
  res.json({ ok: true });
});

/**
 * 学员端排行榜 JSON：list 仅含全榜前 RANKING_PUBLIC_MAX；myRank/myEntry 按全榜排序计算。
 * @param {Array} sortedRows 已排序的全榜行（原始数据）
 * @param {string} usernameQuery req.query.username
 * @param {{ getUsername?: (row: unknown) => string, getRank?: (row: unknown, index: number) => number, toEntry: (row: unknown, rank: number) => object|null }} options
 */
function buildPublicRankingJson(sortedRows, usernameQuery, options) {
  const getUsername = options.getUsername || ((row) => (row && row.username) || "");
  const toEntry = options.toEntry;
  const getRank = typeof options.getRank === "function" ? options.getRank : (_row, i) => i + 1;
  const listLimit =
    options.listLimit != null && Number.isFinite(Number(options.listLimit))
      ? Math.max(1, Math.floor(Number(options.listLimit)))
      : RANKING_PUBLIC_MAX;
  const list = [];
  const limit = Math.min(listLimit, sortedRows.length);
  for (let i = 0; i < limit; i += 1) {
    const entry = toEntry(sortedRows[i], getRank(sortedRows[i], i));
    if (entry) list.push(entry);
  }
  const uname = String(usernameQuery || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (uname) {
    const idx = sortedRows.findIndex((row) => getUsername(row) === uname);
    if (idx >= 0) {
      myRank = getRank(sortedRows[idx], idx);
      myEntry = toEntry(sortedRows[idx], myRank);
    }
  }
  return {
    ok: true,
    list,
    listLimit,
    fullList: options.fullList === true,
    totalEntries: sortedRows.length,
    myRank: uname ? myRank : undefined,
    myEntry: uname ? myEntry : undefined,
  };
}

function formatSurvivalRankingEntry(ctx, e, rank) {
  return ctx.withEquippedBadges({
    rank,
    username: e.username,
    displayName: ctx.nicknameFor(e.username),
    survivalTimeSec: e.survivalTimeSec ?? 0,
    wrongCount: e.wrongCount ?? 0,
    ts: e.ts,
    avatarUrl: ctx.avatarUrlForUsername(e.username),
  });
}

function formatPrimePerfectRankingEntry(ctx, e, rank) {
  return formatSurvivalRankingEntry(ctx, e, rank);
}

// ========== 任务达人：按全量成功历史条数；并列同名次，同档展示顺序每次随机 ==========
app.get("/api/task-master-ranking", (req, res) => {
  const ctx = createRankingLookupContext(req);
  const rows = achievementRankings.buildTaskMasterRankingRows(ctx.users, readTaskCountsByUser(), {
    shuffleTies: true,
  });
  res.json(
    buildPublicRankingJson(rows, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      getRank: (row) => (row && Number(row.rank) > 0 ? Number(row.rank) : 0),
      toEntry: (row, rank) => {
        if (!row || !row.username) return null;
        return ctx.withEquippedBadges({
          rank,
          username: row.username,
          displayName: ctx.nicknameFor(row.username),
          taskCount: Number(row.taskCount) || 0,
          avatarUrl: ctx.avatarUrlForUsername(row.username),
        });
      },
    })
  );
});

// ========== 等级榜：按 totalScore 降序；返回前二十名 + 当前用户全榜名次（?username=） ==========
app.get("/api/score-ranking", (req, res) => {
  const ctx = createRankingLookupContext(req);
  const users = ctx.users.slice();
  users.sort((a, b) => {
    const sa = Number(a && a.totalScore) || 0;
    const sb = Number(b && b.totalScore) || 0;
    if (sb !== sa) return sb - sa;
    return String((a && a.username) || "").localeCompare(String((b && b.username) || ""));
  });
  res.json(
    buildPublicRankingJson(users, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (u, rank) => {
        const row = ctx.buildScoreRankingRowUser(u);
        return row ? { rank, ...row } : null;
      },
    })
  );
});

// ========== 生存通关排行榜：每人只保留一条最佳，全量排名；前二十名 + 当前用户 ==========
function dedupeBestPerUser(list) {
  const byUser = {};
  list.forEach((e) => {
    const k = e.username;
    const cur = byUser[k];
    if (!cur || e.survivalTimeSec < cur.survivalTimeSec || (e.survivalTimeSec === cur.survivalTimeSec && (e.wrongCount ?? 0) < (cur.wrongCount ?? 0))) {
      byUser[k] = e;
    }
  });
  return Object.values(byUser);
}

app.get("/api/survival-ranking", (req, res) => {
  const data = readJson(SURVIVAL_RANKING_FILE, { list: [] });
  let list = Array.isArray(data.list) ? data.list : [];
  list = dedupeBestPerUser(list);
  list.sort((a, b) => {
    if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
    return (a.wrongCount ?? 0) - (b.wrongCount ?? 0);
  });
  const ctx = createRankingLookupContext(req);
  res.json(
    buildPublicRankingJson(list, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (e, rank) => formatSurvivalRankingEntry(ctx, e, rank),
    })
  );
});

// ========== 闯关达人榜：L1–L16 全通最短用时；前二十名 + 当前用户 ==========
app.get("/api/level-ranking", (req, res) => {
  const data = readJson(LEVEL_RANKING_FILE, { list: [] });
  let list = Array.isArray(data.list) ? data.list : [];
  list = dedupeBestLevelRanking(list);
  list = sortLevelRankingList(list);
  const ctx = createRankingLookupContext(req);
  res.json(
    buildPublicRankingJson(list, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (e, rank) => formatSurvivalRankingEntry(ctx, e, rank),
    })
  );
});

// ========== 质数达人榜：掌握 50 题、错题 ≤5、最短用时；前二十名 + 当前用户 ==========
function dedupeBestPrimePerfect(list) {
  const byUser = {};
  filterPrimePerfectRankingList(list).forEach((e) => {
    const cur = byUser[e.username];
    if (!cur || isPrimePerfectRankingBetter(e, cur)) byUser[e.username] = e;
  });
  return Object.values(byUser);
}

app.get("/api/prime-perfect-ranking", (req, res) => {
  const data = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  let list = filterPrimePerfectRankingList(Array.isArray(data.list) ? data.list : []);
  list = dedupeBestPrimePerfect(list);
  list.sort(comparePrimePerfectRankingEntries);
  const ctx = createRankingLookupContext(req);
  res.json(
    buildPublicRankingJson(list, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (e, rank) => formatPrimePerfectRankingEntry(ctx, e, rank),
    })
  );
});

// ========== 整除达人榜：L5 零错通关最短用时；前二十名 + 当前用户 ==========
function dedupeBestDivisibilityPerfect(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const cur = byUser[e.username];
    if (!cur || isDivisibilityPerfectRankingBetter(e, cur)) byUser[e.username] = e;
  });
  return Object.values(byUser);
}

app.get("/api/divisibility-perfect-ranking", (req, res) => {
  const data = readJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list: [] });
  let list = Array.isArray(data.list) ? data.list : [];
  list = dedupeBestDivisibilityPerfect(list);
  list.sort(compareDivisibilityPerfectRankingEntries);
  const ctx = createRankingLookupContext(req);
  res.json(
    buildPublicRankingJson(list, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (e, rank) => formatPrimePerfectRankingEntry(ctx, e, rank),
    })
  );
});

// ========== 耐力榜：按最长连续挑战天数；前二十名 + 当前用户 ==========
app.get("/api/streak-ranking", (req, res) => {
  const ctx = createRankingLookupContext(req);
  const users = ctx.users;

  const rows = users
    .filter((u) => u && u.username)
    .map((u) => ({
      username: u.username,
      displayName: (u.nickname || "").trim() ? String(u.nickname).trim() : "新人",
      streakCurrent: Number(u.streakCurrent) || 0,
      streakBest: Number(u.streakBest) || 0,
      lastActiveDate: normalizeDateKey(u.streakLastDate || ""),
      avatarUrl: ctx.avatarUrlForUser(u),
    }))
    .filter((r) => r.streakBest > 0);

  rows.sort((a, b) => {
    if (b.streakBest !== a.streakBest) return b.streakBest - a.streakBest;
    if (b.streakCurrent !== a.streakCurrent) return b.streakCurrent - a.streakCurrent;
    if ((b.lastActiveDate || "") !== (a.lastActiveDate || "")) return String(b.lastActiveDate || "").localeCompare(String(a.lastActiveDate || ""));
    return String(a.username || "").localeCompare(String(b.username || ""));
  });

  res.json(
    buildPublicRankingJson(rows, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (r, rank) => ctx.withEquippedBadges({ rank, ...r }),
    })
  );
});

// ========== 连击榜：按最高连对；前二十名 + 当前用户 ==========
app.get("/api/combo-ranking", (req, res) => {
  const ctx = createRankingLookupContext(req);
  const users = ctx.users;

  const rows = users
    .filter((u) => u && u.username)
    .map((u) => ({
      username: u.username,
      displayName: (u.nickname || "").trim() ? String(u.nickname).trim() : "新人",
      comboCurrent: Number(u.comboCurrent) || 0,
      comboBest: Number(u.comboBest) || 0,
      avatarUrl: ctx.avatarUrlForUser(u),
    }))
    .filter((r) => r.comboBest > 0 || r.comboCurrent > 0);

  rows.sort((a, b) => {
    if (b.comboBest !== a.comboBest) return b.comboBest - a.comboBest;
    if (b.comboCurrent !== a.comboCurrent) return b.comboCurrent - a.comboCurrent;
    return String(a.username || "").localeCompare(String(b.username || ""));
  });

  res.json(
    buildPublicRankingJson(rows, req.query.username, {
      listLimit: ctx.rankingListLimit,
      fullList: ctx.rankingFullList,
      toEntry: (r, rank) => ctx.withEquippedBadges({ rank, ...r }),
    })
  );
});

// ========== 管理员：获取所有学员 ==========
app.get("/api/admin/users", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const users = data.users.map((u) => {
    const out = { ...u };
    const userRuns = runsStore.getUserRuns(u.username);
    out.lastGameTs = latestRunTsFromRuns(userRuns);
    return safeUser(out);
  });
  res.json({ ok: true, users, gradeBulkUpgrade: getGradeBulkUpgradeStatus() });
});

/**
 * 一键升级年级：已选年级 +1；12 清空为未设置；学年内（9/1–次年8/31）最多一次。
 */
app.post("/api/admin/users/bulk-upgrade-grade", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const now = Date.now();
  const status = getGradeBulkUpgradeStatus(now);
  if (!status.canUpgrade) {
    return res.status(409).json({
      ok: false,
      error:
        "本学年已升级过（" +
        (status.lastAtDate || "—") +
        "），下次解禁：" +
        (status.nextUnlockDate || "—"),
      gradeBulkUpgrade: status,
    });
  }

  const data = readJson(USERS_FILE, { users: [] });
  if (!Array.isArray(data.users)) data.users = [];
  let upgraded = 0;
  let clearedFrom12 = 0;
  let skippedUnset = 0;
  let skippedInvalid = 0;
  let skippedPreschool = 0;
  let skippedAdult = 0;

  data.users.forEach((u) => {
    if (!u) return;
    const bumped = bumpAdminGradeOneYear(u.grade);
    if (bumped.skip === "unset") {
      skippedUnset += 1;
      return;
    }
    if (bumped.skip === "preschool") {
      skippedPreschool += 1;
      return;
    }
    if (bumped.skip === "adult") {
      skippedAdult += 1;
      return;
    }
    if (bumped.skip === "invalid") {
      skippedInvalid += 1;
      return;
    }
    u.grade = bumped.value;
    upgraded += 1;
    if (bumped.cleared) clearedFrom12 += 1;
  });

  writeJson(USERS_FILE, data);
  const meta = readAdminMeta();
  meta.lastGradeBulkUpgradeAt = now;
  writeAdminMeta(meta);

  const nextStatus = getGradeBulkUpgradeStatus(now);
  return res.json({
    ok: true,
    upgraded,
    clearedFrom12,
    skippedUnset,
    skippedInvalid,
    skippedPreschool,
    skippedAdult,
    gradeBulkUpgrade: nextStatus,
  });
});

// ========== 管理员：学员概览表（各模式进度、未上线天数） ==========
// 可选 ?username=xxx：只算该学员一行（管理页深链 / 切换单人）
app.get("/api/admin/student-overview", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const onlyUsername = (req.query && req.query.username ? String(req.query.username) : "").trim();
  const usersData = readJson(USERS_FILE, { users: [] });
  const primeData = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  const primeList = (Array.isArray(primeData.list) ? primeData.list : []).filter(
    (e) => e && e.username && (Number(e.wrongCount) || 0) <= PRIME_RANKING_MAX_WRONG
  );
  const divisibilityData = readJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list: [] });
  const divisibilityList = (Array.isArray(divisibilityData.list) ? divisibilityData.list : []).filter(
    (e) => e && e.username && (Number(e.wrongCount) || 0) === 0 && (Number(e.survivalTimeSec) || 0) > 0
  );
  const survivalData = readJson(SURVIVAL_RANKING_FILE, { list: [] });
  const survivalList = (Array.isArray(survivalData.list) ? survivalData.list : []).filter(
    (e) => e && e.username && (Number(e.survivalTimeSec) || 0) > 0
  );
  const levelData = readJson(LEVEL_RANKING_FILE, { list: [] });
  const levelList = (Array.isArray(levelData.list) ? levelData.list : []).filter(
    (e) => e && e.username && (Number(e.survivalTimeSec) || 0) > 0
  );
  const cohort = readCohortResultForHeatmap();
  const capMs = cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : COHORT_MAX_TIME_SPENT_MS;
  let users = (Array.isArray(usersData.users) ? usersData.users : []).map((u) => {
    const userRuns = runsStore.getUserRuns(u.username);
    const out = { ...u };
    out.lastGameTs = latestRunTsFromRuns(userRuns);
    return out;
  });
  if (onlyUsername) {
    users = users.filter((u) => u && u.username === onlyUsername);
    if (!users.length) {
      return res.status(404).json({ ok: false, error: "用户不存在" });
    }
  }
  const scopedRuns = {};
  users.forEach((u) => {
    if (!u || !u.username) return;
    scopedRuns[u.username] = runsStore.getUserRuns(u.username);
  });
  const rows = buildStudentOverviewRows({
    users,
    runsByUser: scopedRuns,
    primeList,
    divisibilityList,
    survivalList,
    levelList,
    cohort,
    capMs,
  });
  res.json({
    ok: true,
    rows,
    builtAt: Date.now(),
    scope: onlyUsername ? "user" : "all",
    username: onlyUsername || undefined,
  });
});

// ========== 管理员：流量/使用发展统计 ==========
app.get("/api/admin/traffic-stats", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const rangeRaw = req.query && req.query.range != null ? Number(req.query.range) : 30;
  const rangeDays = rangeRaw === 7 || rangeRaw === 90 ? rangeRaw : 30;
  const scope = req.query && String(req.query.scope || "") === "vip" ? "vip" : "all";
  const excludeTesters = !(req.query && String(req.query.excludeTesters || "") === "0");
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];
  const stats = buildTrafficStats({
    users,
    getUserRuns: (username) => runsStore.getUserRuns(username),
    rangeDays,
    scope,
    excludeTesters,
    churnDays: 14,
  });
  res.json({ ok: true, ...stats });
});

// ========== 管理员：添加学员 ==========
app.post("/api/admin/users", async (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ ok: false, error: "请填写用户名和密码" });
  }
  const name = String(username).trim();
  if (!isValidUsername(name)) {
    return res.json({ ok: false, error: "用户名 2-20 位，仅支持字母、数字、下划线" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  if (dedupeUsernames.usernameTakenCaseInsensitive(data.users, name)) {
    return res.json({ ok: false, error: "该用户名已存在" });
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  data.users.push({
    username: name,
    password: passwordHash,
    nickname: "",
    levelIndex: 0,
    bestLevelIndex: 0,
    totalScore: 0,
    bestSurvivalSec: 0,
    bestScore: 0,
    recentSurvivalRuns: [],
    recentLevelRuns: [],
    recentTrainingRuns: [],
    recentPrimeCompositeRuns: [],
    streakCurrent: 0,
    streakBest: 0,
    streakLastDate: "",
    comboCurrent: 0,
    comboBest: 0,
    levelChallengeLastLevel: 0,
    levelChallengeBestLevel: 0,
    levelTrainingCurrentLevel: -1,
    levelExpandBracketsCurrentLevel: 0,
    levelExpandBracketsUnlockedMax: 0,
    levelPerfectSquareCurrentLevel: 0,
    levelPerfectSquareUnlockedMax: 0,
    levelDecimalCurrentLevel: 0,
    levelDecimalUnlockedMax: 0,
    levelDivisibilityCurrentLevel: 0,
    levelDivisibilityUnlockedMax: 0,
    recentExpandBracketsRuns: [],
    recentPerfectSquareRuns: [],
    recentDecimalRuns: [],
    recentDivisibilityRuns: [],
    wrongAnswers: [],
    wrongAnswersClearedBeforeTs: 0,
    expandBracketsWrongAnswers: [],
    divisibilityWrongAnswers: [],
    achievements: {},
    equippedBadges: [],
    survivalUnlocked: false,
    trainingL16Cleared: false,
    heatmapL16Passed: false,
    isTester: false,
    isVip: false,
    grade: null,
    adminNote: "",
    createdBy: "admin",
    createdAt: Date.now(),
  });
  writeJson(USERS_FILE, data);
  res.json({ ok: true, users: data.users.map(safeUser) });
});

// ========== 管理员：更新学员 ==========
app.put("/api/admin/users/:username", async (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const updates = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  if (updates.grade !== undefined) {
    const g = normalizeAdminGrade(updates.grade);
    if (g.error) return res.status(400).json({ ok: false, error: g.error });
    data.users[idx].grade = g.value;
  }
  if (updates.adminNote !== undefined) {
    const n = normalizeAdminNote(updates.adminNote);
    if (n.error) return res.status(400).json({ ok: false, error: n.error });
    data.users[idx].adminNote = n.value;
  }
  const allowed = ["password", "levelIndex", "bestLevelIndex", "totalScore", "isTester", "isVip"];
  for (const k of allowed) {
    if (updates[k] === undefined) continue;
    if (k === "password") {
      data.users[idx].password = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    } else if (k === "isTester" || k === "isVip") {
      data.users[idx][k] = updates[k] === true;
    } else {
      data.users[idx][k] = updates[k];
    }
  }
  writeJson(USERS_FILE, data);
  res.json({ ok: true, user: safeUser(data.users[idx]) });
});

function removeUsernameFromRankingFile(filePath, username) {
  const data = readJson(filePath, { list: [] });
  const list = Array.isArray(data.list) ? data.list : [];
  const before = list.length;
  const next = list.filter((e) => e && e.username !== username);
  if (next.length === before) return 0;
  data.list = next;
  writeJson(filePath, data);
  return before - next.length;
}

/** 永久删除学员及其关联数据（管理员删号 / 后续自助删号共用） */
function purgeUserCompletely(username) {
  const name = String(username || "").trim();
  if (!name) {
    return { ok: false, error: "无效的用户名" };
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === name);
  if (idx === -1) {
    return { ok: false, status: 404, error: "用户不存在" };
  }
  data.users.splice(idx, 1);
  writeJson(USERS_FILE, data);

  const runList = runsStore.getUserRuns(name);
  const runsRemoved = runList.length;
  runsStore.deleteUserRuns(name);

  const survivalRankingRemoved = removeUsernameFromRankingFile(SURVIVAL_RANKING_FILE, name);
  const levelRankingRemoved = removeUsernameFromRankingFile(LEVEL_RANKING_FILE, name);
  const primeRankingRemoved = removeUsernameFromRankingFile(PRIME_PERFECT_RANKING_FILE, name);
  const divisibilityRankingRemoved = removeUsernameFromRankingFile(DIVISIBILITY_PERFECT_RANKING_FILE, name);

  const fbStore = readJson(FEEDBACK_FILE, { items: [] });
  const fbItems = Array.isArray(fbStore.items) ? fbStore.items : [];
  const fbNext = fbItems.filter((i) => i && i.username !== name);
  const feedbackRemoved = fbItems.length - fbNext.length;
  if (feedbackRemoved > 0) {
    writeJson(FEEDBACK_FILE, { items: fbNext });
  }

  feedbackSubmitTimestamps.delete(name);

  let cohortStatsInvalidated = false;
  try {
    if (fs.existsSync(COHORT_LEVEL_STATS_FILE)) {
      fs.unlinkSync(COHORT_LEVEL_STATS_FILE);
      cohortStatsInvalidated = true;
    }
    if (fs.existsSync(COHORT_DECIMAL_STATS_FILE)) {
      fs.unlinkSync(COHORT_DECIMAL_STATS_FILE);
      cohortStatsInvalidated = true;
    }
    if (fs.existsSync(COHORT_PERFECT_SQUARE_STATS_FILE)) {
      fs.unlinkSync(COHORT_PERFECT_SQUARE_STATS_FILE);
      cohortStatsInvalidated = true;
    }
    if (fs.existsSync(COHORT_DIVISIBILITY_STATS_FILE)) {
      fs.unlinkSync(COHORT_DIVISIBILITY_STATS_FILE);
      cohortStatsInvalidated = true;
    }
  } catch (e) {
    /* ignore */
  }

  return {
    ok: true,
    username: name,
    purged: {
      user: true,
      runs: runsRemoved,
      survivalRanking: survivalRankingRemoved,
      levelRanking: levelRankingRemoved,
      primeRanking: primeRankingRemoved,
      feedback: feedbackRemoved,
      cohortStatsInvalidated,
    },
    users: data.users,
  };
}

// ========== 管理员：删除学员 ==========
app.delete("/api/admin/users/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const result = purgeUserCompletely(req.params.username);
  if (!result.ok) {
    return res.status(result.status || 400).json({ ok: false, error: result.error });
  }
  res.json(result);
});

// ========== 管理员：获取练习设置 ==========
app.get("/api/admin/settings", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(SETTINGS_FILE, { levels: [] });
  res.json({ ok: true, settings: data });
});

// ========== 管理员：保存练习设置 ==========
app.put("/api/admin/settings", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { levels } = req.body || {};
  if (!Array.isArray(levels)) {
    return res.json({ ok: false, error: "无效的配置格式" });
  }
  writeJson(SETTINGS_FILE, { levels });
  res.json({ ok: true });
});

// ========== 管理员：多语言文案 ==========
app.get("/api/admin/i18n", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readManageableI18nFromDisk();
  res.json({ ok: true, i18n: data });
});

app.put("/api/admin/i18n", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const payload = normalizeI18nPayload(req.body && req.body.i18n);
  writeJson(I18N_FILE, payload);
  res.json({ ok: true, i18n: payload });
});

// ========== 管理员：修改口令 ==========
app.put("/api/admin/pin", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { newPin } = req.body || {};
  const pin = typeof newPin === "string" ? newPin.trim() : "";
  if (!pin || pin.length < 4) {
    return res.json({ ok: false, error: "新口令至少 4 位" });
  }
  try {
    writeJson(ADMIN_PIN_FILE, { pin });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "写入失败" });
  }
  res.json({ ok: true });
});

// ========== 管理员：重置口令为环境变量 ADMIN_PIN ==========
app.post("/api/admin/pin/reset", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const envPin = String(process.env.ADMIN_PIN || "").trim();
  if (!envPin) {
    return res.status(400).json({ ok: false, error: "未配置 ADMIN_PIN 环境变量，无法重置" });
  }
  try {
    writeJson(ADMIN_PIN_FILE, { pin: envPin });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "写入失败" });
  }
  res.json({ ok: true });
});

// ========== 获取练习设置（学员端也需要，用于难度配置） ==========
app.get("/api/settings", (req, res) => {
  const data = readJson(SETTINGS_FILE, { levels: [] });
  res.json({ ok: true, settings: data });
});

// ========== 学员端：获取多语言文案（公开） ==========
app.get("/api/i18n", (req, res) => {
  const data = readManageableI18nFromDisk();
  res.json({ ok: true, i18n: data });
});

function clampGuideText(s, maxLen) {
  const t = typeof s === "string" ? s : "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

function normalizeGameGuidePayload(raw) {
  const def = defaultGameGuide();
  const src = raw && typeof raw === "object" ? raw : {};
  const titleByLangIn = src.titleByLang && typeof src.titleByLang === "object" ? src.titleByLang : {};
  const bodyByLangIn = src.bodyByLang && typeof src.bodyByLang === "object" ? src.bodyByLang : {};
  const zhTitle = clampGuideText(
    titleByLangIn.zhHant != null ? titleByLangIn.zhHant : def.titleByLang.zhHant,
    GAME_GUIDE_TITLE_MAX_LEN
  ).trim() || def.titleByLang.zhHant;
  const enTitle = clampGuideText(
    titleByLangIn.en != null ? titleByLangIn.en : def.titleByLang.en,
    GAME_GUIDE_TITLE_MAX_LEN
  ).trim() || def.titleByLang.en;
  const zhBody = clampGuideText(
    bodyByLangIn.zhHant != null ? bodyByLangIn.zhHant : def.bodyByLang.zhHant,
    GAME_GUIDE_BODY_MAX_LEN
  );
  const enBody = clampGuideText(
    bodyByLangIn.en != null ? bodyByLangIn.en : def.bodyByLang.en,
    GAME_GUIDE_BODY_MAX_LEN
  );
  const updatedAt =
    typeof src.updatedAt === "number" && Number.isFinite(src.updatedAt) && src.updatedAt > 0
      ? Math.floor(src.updatedAt)
      : 0;
  return {
    updatedAt,
    titleByLang: { zhHant: zhTitle, en: enTitle },
    bodyByLang: { zhHant: zhBody, en: enBody },
  };
}

function readGameGuide() {
  if (!fs.existsSync(GAME_GUIDE_FILE)) return defaultGameGuide();
  return normalizeGameGuidePayload(readJson(GAME_GUIDE_FILE, null));
}

function writeGameGuide(guide) {
  writeJson(GAME_GUIDE_FILE, guide);
}

/** 学员端：游戏说明（公开；无自定义文件时回落默认稿） */
app.get("/api/game-guide", (req, res) => {
  const guide = readGameGuide();
  return res.json({ ok: true, guide, fromDefault: !fs.existsSync(GAME_GUIDE_FILE) });
});

app.get("/api/admin/game-guide", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const guide = readGameGuide();
  return res.json({
    ok: true,
    guide,
    fromDefault: !fs.existsSync(GAME_GUIDE_FILE),
    defaults: defaultGameGuide(),
  });
});

app.put("/api/admin/game-guide", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const guide = normalizeGameGuidePayload({
    titleByLang: body.titleByLang,
    bodyByLang: body.bodyByLang,
    updatedAt: Date.now(),
  });
  if (!guide.bodyByLang.zhHant.trim() && !guide.bodyByLang.en.trim()) {
    return res.status(400).json({ ok: false, error: "正文不能为空（至少填写一种语言）" });
  }
  writeGameGuide(guide);
  return res.json({ ok: true, guide, fromDefault: false });
});

app.post("/api/admin/game-guide/reset", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    if (fs.existsSync(GAME_GUIDE_FILE)) fs.unlinkSync(GAME_GUIDE_FILE);
  } catch (e) {
    return res.status(500).json({ ok: false, error: "清除自定义稿失败" });
  }
  const guide = defaultGameGuide();
  return res.json({ ok: true, guide, fromDefault: true });
});

// ========== 管理员：获取某学员全部练习记录（生存+闯关，按时间排序） ==========
app.get("/api/admin/records/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
    const runs = runsStore.getUserRuns(username)
    .map((r) => ({ ...r, mode: normalizeRunMode(r.mode) }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
});

/** 补齐 hasCleared* 标记（只读一次 runs）；返回是否改动了 user */
function ensureUserClearedFlagsFromRuns(user, runs) {
  let dirty = false;
  if (user.hasClearedSurvival === undefined) {
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    dirty = true;
  }
  if (user.hasClearedLevel === undefined) {
    user.hasClearedLevel = userHasClearedLevelFromRuns(runs);
    dirty = true;
  }
  return dirty;
}

// ========== 管理员：一次拉取学员资料 + 全部 runs（report 选学员） ==========
app.get("/api/admin/student-detail/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const usersData = readJson(USERS_FILE, { users: [] });
  const user = usersData.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
    const runs = runsStore.getUserRuns(username)
    .map((r) => ({ ...r, mode: normalizeRunMode(r.mode) }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (ensureUserClearedFlagsFromRuns(user, runs)) {
    writeJson(USERS_FILE, usersData);
  }
  res.json({ ok: true, user: safeUser(user), runs });
});

/**
 * 管理员：训练选关 Debug（与学员端 /training/next-level 同口径）
 */
app.get("/api/admin/user/:username/training/next-level-debug", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const usersData = readJson(USERS_FILE, { users: [] });
  const user = usersData.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
    const runs = runsStore.getUserRuns(username).map((r) => ({
    ...r,
    mode: normalizeRunMode(r.mode),
  }));
  const cohort = readCohortResultForHeatmap();
  const capMs =
    cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : COHORT_MAX_TIME_SPENT_MS;
  let pick;
  try {
    pick = computeTrainingNextLevelForUser({
      runs,
      cohort,
      storedDayMode: user.trainingDayMode || null,
      capMs,
    });
  } catch (e) {
    console.warn("[admin training/next-level-debug]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }

  const cells = pick && pick.heat && Array.isArray(pick.heat.cells) ? pick.heat.cells : [];
  const cellsSummary = cells.map((c) => {
    const p = c && c.p != null && Number.isFinite(Number(c.p)) ? Math.round(Number(c.p) * 1000) / 1000 : null;
    const timePct =
      c && c.timePct != null && Number.isFinite(Number(c.timePct))
        ? Math.round(Number(c.timePct) * 10) / 10
        : null;
    return {
      levelIndex: c.levelIndex,
      L: (c.levelIndex != null ? Number(c.levelIndex) : 0) + 1,
      active: !!c.active,
      n: c.n != null ? c.n : 0,
      p: p,
      timePct: timePct,
      tooSlow: c.tooSlow === true,
      fluent: c.fluent === true,
      accurate: c.accurate === true,
    };
  });

  const trainingRuns = runs
    .filter((r) => String(r && r.mode ? r.mode : "").toLowerCase() === "training")
    .filter((r) => r && r.comboOnly !== true)
    .slice()
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 12)
    .map((r) => {
      const m = r.trainingMeta && typeof r.trainingMeta === "object" ? r.trainingMeta : null;
      return {
        ts: r.ts || 0,
        iso: r.ts ? new Date(r.ts).toISOString() : "",
        maxLevel: r.maxLevel,
        L: (Number(r.maxLevel) || 0) + 1,
        cleared: r.cleared === true,
        abandoned: r.abandoned === true || !!(m && m.abandoned),
        wrongCount: r.wrongCount,
        runBrushMode: !!(m && m.runBrushMode),
        autoPickLevel: m && m.autoPickLevel != null ? m.autoPickLevel : null,
        autoPickL: m && m.autoPickLevel != null ? Number(m.autoPickLevel) + 1 : null,
        pickedLevel: m && m.pickedLevel != null ? m.pickedLevel : null,
        pickedL: m && m.pickedLevel != null ? Number(m.pickedLevel) + 1 : null,
        manualOverride: !!(m && m.manualOverride),
        pickMode: m && m.pickMode != null ? m.pickMode : null,
        effectivePickMode: m && m.effectivePickMode != null ? m.effectivePickMode : null,
        pickReason: m && m.pickReason != null ? String(m.pickReason) : "",
        entrySource: m && m.entrySource != null ? String(m.entrySource) : "",
        dayMode: m && m.dayMode != null ? String(m.dayMode) : "",
        frontierLevel: m && m.frontierLevel != null ? m.frontierLevel : null,
        heatLevel: m && m.heatLevel != null ? m.heatLevel : null,
        runKind: m && m.runKind != null ? String(m.runKind) : "",
        dayStateAfter: m && m.dayStateAfter && typeof m.dayStateAfter === "object" ? m.dayStateAfter : null,
        heatAvgSecAtStart: m && m.heatAvgSecAtStart != null ? m.heatAvgSecAtStart : null,
        runAvgSec: m && m.runAvgSec != null ? m.runAvgSec : null,
      };
    });

  const serverBlock =
    pick && pick.ok
      ? {
          ok: true,
          source: "server_computeTrainingNextLevelForUser",
          todayKey: pick.todayKey,
          levelIndex: pick.levelIndex,
          pickedL: pick.levelIndex + 1,
          brushMode: pick.brushMode,
          dayMode: pick.dayMode,
          frontierLevel: pick.frontierLevel,
          frontierL: pick.frontierLevel != null ? pick.frontierLevel + 1 : null,
          heatLevel: pick.heatLevel,
          heatL: pick.heatLevel != null ? pick.heatLevel + 1 : null,
          mode: pick.mode,
          reason: pick.reason,
          pickReason: pick.pickReason,
          enterBrush: pick.enterBrush,
          brushPoolMax: pick.brushPoolMax,
          dayState: pick.dayState,
          result: pick.result,
          heatAvgSecAtStart: pick.heatAvgSecAtStart,
          heatMeanLnAtStart: pick.heatMeanLnAtStart,
          cohortLoaded: pick.cohortLoaded,
          cellsSummary,
        }
      : {
          ok: false,
          error: (pick && pick.error) || "无法计算下一关",
          todayKey: pick && pick.todayKey,
          dayState: pick && pick.dayState,
          cellsSummary,
        };

  return res.json({
    ok: true,
    username,
    at: new Date().toISOString(),
    note:
      "server 与学员端 GET /api/user/:user/training/next-level 同口径；选关权威只在服务器。",
    trainingDayMode: user.trainingDayMode || null,
    levelTrainingCurrentLevel:
      typeof user.levelTrainingCurrentLevel === "number" ? user.levelTrainingCurrentLevel : null,
    levelTrainingCurrentL:
      typeof user.levelTrainingCurrentLevel === "number" && user.levelTrainingCurrentLevel >= 0
        ? user.levelTrainingCurrentLevel + 1
        : null,
    server: serverBlock,
    recentTraining: trainingRuns,
  });
});

/** 管理员：各分类热图（与学员端 /heatmap 同口径） */
app.get("/api/admin/user/:username/heatmap", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const usersData = readJson(USERS_FILE, { users: [] });
  const user = usersData.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const payload = buildHeatmapPayloadForUsername(username);
    if (!payload.ok) {
      return res.status(500).json({ ok: false, error: payload.error || "热图计算失败" });
    }
    return res.json(payload);
  } catch (e) {
    console.warn("[admin user/heatmap]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "热图计算失败" });
  }
});

/**
 * 管理员：小数 / 平方数 / 整除「模式下一关」
 * 口径：通关前前沿（档案 current），通关后刷弱项。四则仍见 training/next-level-debug。
 */
app.get("/api/admin/user/:username/category-next-levels", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const usersData = readJson(USERS_FILE, { users: [] });
  const user = usersData.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  try {
    const runs = runsStore.getUserRuns(username).map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }));
    const built = computeSpecialCategoryNextLevels({
      user,
      runs,
      cohorts: {
        decimal: readCohortDecimalResultForHeatmap(),
        perfectSquare: readCohortPerfectSquareResultForHeatmap(),
        divisibility: readCohortDivisibilityResultForHeatmap(),
      },
    });
    return res.json({
      ok: true,
      username,
      at: new Date().toISOString(),
      source: "server_computeSpecialCategoryNextLevels",
      note:
        "未通关：梯子顶热图选关（稳 M / 开 M+1）；通关后刷弱项。解锁仍由局内 0/1 错决定。四则请用 /training/next-level-debug。",
      byCategory: built.byCategory || {},
      profile: {
        levelDecimalCurrentLevel: user.levelDecimalCurrentLevel,
        levelDecimalUnlockedMax: user.levelDecimalUnlockedMax,
        levelPerfectSquareCurrentLevel: user.levelPerfectSquareCurrentLevel,
        levelPerfectSquareUnlockedMax: user.levelPerfectSquareUnlockedMax,
        levelDivisibilityCurrentLevel: user.levelDivisibilityCurrentLevel,
        levelDivisibilityUnlockedMax: user.levelDivisibilityUnlockedMax,
      },
    });
  } catch (e) {
    console.warn("[admin category-next-levels]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "选关计算失败" });
  }
});

// ========== 管理员：获取某学员信息（用于 report 页面） ==========
app.get("/api/admin/user/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  if (user.hasClearedSurvival === undefined || user.hasClearedLevel === undefined) {
        const runs = runsStore.getUserRuns(username);
    if (ensureUserClearedFlagsFromRuns(user, runs)) {
      writeJson(USERS_FILE, data);
    }
  }
  res.json({ ok: true, user: safeUser(user) });
});

// ========== 管理员：获取学员列表（用于 report 页面下拉选择） ==========
app.get("/api/admin/user-list", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const users = data.users
    .map((u) => ({
      username: u.username,
      nickname: typeof u.nickname === "string" ? u.nickname.trim() : "",
      adminNote: typeof u.adminNote === "string" ? u.adminNote.trim() : "",
      isVip: u.isVip === true,
    }))
    .sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
  res.json({ ok: true, users });
});

/** 报表难度热图：全体常模（仅 survival/level/training） */
const COHORT_LEVEL_COUNT = 16;
const COHORT_MIN_ATTEMPTS_PER_USER_LEVEL = 10;
/** 单题耗时上限：超过则该答对记录不纳入「速度」常模与个人 ln(t)，排除挂机/异常长暂停 */
const COHORT_MAX_TIME_SPENT_MS = 60 * 1000;
/** 全体答对耗时直方图 bin 数（report 验证分位用） */
const COHORT_HISTOGRAM_BIN_COUNT = 24;

function buildLnHistogram(values, binCount) {
  const n = Array.isArray(values) ? values.length : 0;
  const bins = Math.max(4, Math.min(48, Number(binCount) || COHORT_HISTOGRAM_BIN_COUNT));
  if (n === 0) return null;
  const arr = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  const min = arr[0];
  const max = arr[arr.length - 1];
  const width = max > min ? (max - min) / bins : 1e-6;
  const counts = Array(bins).fill(0);
  arr.forEach((v) => {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  });
  const edgesLn = [];
  for (let i = 0; i <= bins; i += 1) edgesLn.push(min + i * width);
  return { n: arr.length, binCount: bins, edgesLn, counts };
}

function quantileSorted(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] * (hi - idx) + sortedAsc[hi] * (idx - lo);
}

function summarizeQuantiles(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const arr = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let varSum = 0;
  for (let j = 0; j < arr.length; j++) {
    const d = arr[j] - mean;
    varSum += d * d;
  }
  const sd = arr.length > 1 ? Math.sqrt(varSum / (arr.length - 1)) : 0;
  return {
    n: arr.length,
    mean,
    sd,
    q10: quantileSorted(arr, 10),
    q25: quantileSorted(arr, 25),
    q50: quantileSorted(arr, 50),
    q75: quantileSorted(arr, 75),
    q90: quantileSorted(arr, 90),
  };
}

/**
 * 将某用户在某一档上的答对耗时汇总为一个人级 meanLn（几何均时）。
 * 答对且 ≤cap 的题数 < minAttempts 时返回 null（不占一票）。
 */
function personMeanLnFromCorrectTimes(lnTimes, minAttempts) {
  const need = Math.max(1, Math.floor(Number(minAttempts) || COHORT_MIN_ATTEMPTS_PER_USER_LEVEL));
  if (!Array.isArray(lnTimes) || lnTimes.length < need) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < lnTimes.length; i++) {
    const v = lnTimes[i];
    if (!Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  if (n < need) return null;
  return sum / n;
}

/**
 * 按人·档聚合：每人每档只贡献 1 个 meanLn（需答对题 ≥ minAttempts）。
 * @param {(mode: string) => boolean} modeFilter
 * @param {number} levelCount
 * @returns {number[][]} 每档的人级 meanLn 列表
 */
function collectPersonMeanLnByLevel(modeFilter, levelCount, attemptLevelIndexFn) {
  const personLnByLevel = Array.from({ length: levelCount }, () => []);
  const minN = COHORT_MIN_ATTEMPTS_PER_USER_LEVEL;

  runsStore.forEachUserRuns((username, runs) => {
    const perLevel = Array.from({ length: levelCount }, () => []);
    (runs || []).forEach((r) => {
      const mode = normalizeRunMode(r.mode);
      if (!modeFilter(mode)) return;
      if (!Array.isArray(r.attempts)) return;
      r.attempts.forEach((a) => {
        let idx;
        if (typeof attemptLevelIndexFn === "function") {
          idx = attemptLevelIndexFn(a);
          if (idx == null || !Number.isFinite(Number(idx))) return;
          idx = Math.max(0, Math.min(levelCount - 1, Math.floor(Number(idx))));
        } else {
          idx = Math.max(0, Math.min(levelCount - 1, Number(a.levelIndex) || 0));
        }
        if (!a.correct) return;
        const ms = Number(a.timeSpentMs);
        if (Number.isFinite(ms) && ms > 0 && ms <= COHORT_MAX_TIME_SPENT_MS) {
          perLevel[idx].push(Math.log(ms));
        }
      });
    });
    for (let k = 0; k < levelCount; k++) {
      const meanLn = personMeanLnFromCorrectTimes(perLevel[k], minN);
      if (meanLn != null) personLnByLevel[k].push(meanLn);
    }
  });

  return personLnByLevel;
}

/** 全量扫描 runs 计算难度常模（不含 builtAt / 缓存字段）；人级 meanLn 分位 */
function computeLevelCohortResult() {
  const personLnByLevel = collectPersonMeanLnByLevel(
    (mode) => mode === "survival" || mode === "level" || mode === "training",
    COHORT_LEVEL_COUNT
  );

  const levels = [];
  for (let k = 0; k < COHORT_LEVEL_COUNT; k++) {
    const lnQ = summarizeQuantiles(personLnByLevel[k]);
    levels.push({
      levelIndex: k,
      cohortLnTimeCorrect: lnQ,
      cohortLnTimeHistogram: buildLnHistogram(personLnByLevel[k], COHORT_HISTOGRAM_BIN_COUNT),
    });
  }
  return {
    ok: true,
    sampleUnit: "person",
    minAttemptsPerPersonLevel: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    minAttemptsForHeatmap: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    timeSpentMsCap: COHORT_MAX_TIME_SPENT_MS,
    timeSpentMsCapNote:
      "答对题的 timeSpentMs 超过该毫秒数（默认 1 分钟）的记录不纳入速度侧。全体常模按「人·档」计票：每人每档先算几何均时（答对且≤cap 题数≥" +
      COHORT_MIN_ATTEMPTS_PER_USER_LEVEL +
      "），再对人级 meanLn 做分位/直方图，避免高题量用户主导分布。",
    levels,
  };
}

function readCohortLevelStatsCache() {
  const raw = readJson(COHORT_LEVEL_STATS_FILE, null);
  if (!raw || typeof raw.builtAt !== "number" || !raw.result || raw.result.ok !== true) return null;
  const ttl = Number.isFinite(Number(raw.ttlMs)) && Number(raw.ttlMs) > 0 ? Number(raw.ttlMs) : COHORT_STATS_TTL_MS;
  return { builtAt: raw.builtAt, ttlMs: ttl, result: raw.result };
}

function writeCohortLevelStatsCache(builtAt, result) {
  writeJson(COHORT_LEVEL_STATS_FILE, {
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    result,
  });
}

/** 全体难度常模只读快照（无需管理员口令；不触发重算，仅读磁盘缓存） */
app.get("/api/public/level-cohort", (req, res) => {
  const cache = readCohortLevelStatsCache();
  if (!cache || !cache.result || cache.result.ok !== true) {
    return res.status(503).json({ ok: false, error: "暂无全体常模，请管理员在后台拉取或刷新常模后再试" });
  }
  const ttl = cache.ttlMs;
  const builtAt = cache.builtAt;
  return res.json({
    ...cache.result,
    builtAt,
    ttlMs: ttl,
    expiresAt: builtAt + ttl,
    servedFromCache: true,
  });
});

app.get("/api/admin/stats/level-cohort", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const now = Date.now();
  const cache = readCohortLevelStatsCache();
  const ttl = cache ? cache.ttlMs : COHORT_STATS_TTL_MS;
  if (cache && now < cache.builtAt + ttl) {
    return res.json({
      ...cache.result,
      builtAt: cache.builtAt,
      ttlMs: ttl,
      expiresAt: cache.builtAt + ttl,
      servedFromCache: true,
    });
  }
  const result = computeLevelCohortResult();
  const builtAt = now;
  writeCohortLevelStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
  });
});

app.post("/api/admin/stats/level-cohort/rebuild", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const builtAt = Date.now();
  const result = computeLevelCohortResult();
  writeCohortLevelStatsCache(builtAt, result);
  const decimalResult = computeDecimalCohortResult();
  writeCohortDecimalStatsCache(builtAt, decimalResult);
  const perfectSquareResult = computePerfectSquareCohortResult();
  writeCohortPerfectSquareStatsCache(builtAt, perfectSquareResult);
  const divisibilityResult = computeDivisibilityCohortResult();
  writeCohortDivisibilityStatsCache(builtAt, divisibilityResult);
  const wrapExtra = (extra) => ({
    ...extra,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
    rebuilt: true,
  });
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
    rebuilt: true,
    decimal: wrapExtra(decimalResult),
    perfectSquare: wrapExtra(perfectSquareResult),
    divisibility: wrapExtra(divisibilityResult),
  });
});

/** TEMP：清理 users.json 中重名空壳（大小写不敏感分组）；不碰 runs */
app.post("/api/admin/maintenance/dedupe-usernames", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dryRun = body.dryRun === true;
  const data = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(data.users) ? data.users : [];
  const result = dedupeUsernames.dedupeUsernameUsers(users);
  if (!dryRun && result.removed.length > 0) {
    data.users = result.users;
    writeJson(USERS_FILE, data);
    result.written = true;
  } else {
    result.written = false;
  }
  return res.json({
    ok: true,
    dryRun: !!dryRun,
    written: !!result.written,
    beforeCount: result.beforeCount,
    afterCount: result.afterCount,
    removed: result.removed,
    skippedConflict: result.skippedConflict,
    groupsChecked: result.groupsChecked,
  });
});

/** TEMP：全库回填本局均速 runMeanLn/runAvgSec（训练+小数+平方+整除Z1–4）；用后删路由与报表按钮 */
app.post("/api/admin/maintenance/backfill-training-run-speed", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dryRun = body.dryRun === true;
  const runsData = runsStore.buildRunsObjectFromByUser();
  const stats = trainingRunSpeedBackfill.backfillTrainingRunSpeedInRunsData(runsData, {
    capMs: COHORT_MAX_TIME_SPENT_MS,
    dryRun,
  });
  if (!stats.ok) {
    return res.status(400).json(stats);
  }
  if (!dryRun && stats.updated > 0) {
    Object.keys(runsData.runs || {}).forEach((username) => {
      runsStore.setUserRuns(username, runsData.runs[username] || []);
    });
    stats.written = true;
  } else {
    stats.written = false;
  }
  return res.json(stats);
});

/** 小数运算全体常模（D1–D6） */
const COHORT_DECIMAL_LEVEL_COUNT = 6;

function computeDecimalCohortResult() {
  const personLnByLevel = collectPersonMeanLnByLevel(
    (mode) => mode === "decimal",
    COHORT_DECIMAL_LEVEL_COUNT
  );

  const levels = [];
  for (let k = 0; k < COHORT_DECIMAL_LEVEL_COUNT; k++) {
    const lnQ = summarizeQuantiles(personLnByLevel[k]);
    levels.push({
      levelIndex: k,
      cohortLnTimeCorrect: lnQ,
      cohortLnTimeHistogram: buildLnHistogram(personLnByLevel[k], COHORT_HISTOGRAM_BIN_COUNT),
    });
  }
  return {
    ok: true,
    kind: "decimal",
    levelCount: COHORT_DECIMAL_LEVEL_COUNT,
    sampleUnit: "person",
    minAttemptsPerPersonLevel: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    minAttemptsForHeatmap: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    timeSpentMsCap: COHORT_MAX_TIME_SPENT_MS,
    timeSpentMsCapNote:
      "答对题的 timeSpentMs 超过该毫秒数（默认 1 分钟）的记录不纳入速度侧。全体常模按「人·档」计票：每人每档先算几何均时（答对且≤cap 题数≥" +
      COHORT_MIN_ATTEMPTS_PER_USER_LEVEL +
      "），再对人级 meanLn 做分位/直方图。",
    levels,
  };
}

function readCohortDecimalStatsCache() {
  const raw = readJson(COHORT_DECIMAL_STATS_FILE, null);
  if (!raw || typeof raw.builtAt !== "number" || !raw.result || raw.result.ok !== true) return null;
  const ttl = Number.isFinite(Number(raw.ttlMs)) && Number(raw.ttlMs) > 0 ? Number(raw.ttlMs) : COHORT_STATS_TTL_MS;
  return { builtAt: raw.builtAt, ttlMs: ttl, result: raw.result };
}

function writeCohortDecimalStatsCache(builtAt, result) {
  writeJson(COHORT_DECIMAL_STATS_FILE, {
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    result,
  });
}

app.get("/api/public/decimal-cohort", (req, res) => {
  const cache = readCohortDecimalStatsCache();
  if (!cache || !cache.result || cache.result.ok !== true) {
    return res.status(503).json({ ok: false, error: "暂无小数常模，请管理员在后台拉取或刷新常模后再试" });
  }
  const ttl = cache.ttlMs;
  const builtAt = cache.builtAt;
  return res.json({
    ...cache.result,
    builtAt,
    ttlMs: ttl,
    expiresAt: builtAt + ttl,
    servedFromCache: true,
  });
});

app.get("/api/admin/stats/decimal-cohort", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const now = Date.now();
  const cache = readCohortDecimalStatsCache();
  const ttl = cache ? cache.ttlMs : COHORT_STATS_TTL_MS;
  if (cache && now < cache.builtAt + ttl) {
    return res.json({
      ...cache.result,
      builtAt: cache.builtAt,
      ttlMs: ttl,
      expiresAt: cache.builtAt + ttl,
      servedFromCache: true,
    });
  }
  const result = computeDecimalCohortResult();
  const builtAt = now;
  writeCohortDecimalStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
  });
});

app.post("/api/admin/stats/decimal-cohort/rebuild", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const result = computeDecimalCohortResult();
  const builtAt = Date.now();
  writeCohortDecimalStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
    rebuilt: true,
  });
});

/** 平方数全体常模（L1–L4） */
const COHORT_PERFECT_SQUARE_LEVEL_COUNT = 4;

function computePerfectSquareCohortResult() {
  const personLnByLevel = collectPersonMeanLnByLevel(
    (mode) => mode === "perfectSquare",
    COHORT_PERFECT_SQUARE_LEVEL_COUNT
  );
  const levels = [];
  for (let k = 0; k < COHORT_PERFECT_SQUARE_LEVEL_COUNT; k++) {
    const lnQ = summarizeQuantiles(personLnByLevel[k]);
    levels.push({
      levelIndex: k,
      cohortLnTimeCorrect: lnQ,
      cohortLnTimeHistogram: buildLnHistogram(personLnByLevel[k], COHORT_HISTOGRAM_BIN_COUNT),
    });
  }
  return {
    ok: true,
    kind: "perfectSquare",
    levelCount: COHORT_PERFECT_SQUARE_LEVEL_COUNT,
    sampleUnit: "person",
    minAttemptsPerPersonLevel: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    minAttemptsForHeatmap: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    timeSpentMsCap: COHORT_MAX_TIME_SPENT_MS,
    timeSpentMsCapNote:
      "答对题的 timeSpentMs 超过该毫秒数（默认 1 分钟）的记录不纳入速度侧。全体常模按「人·档」计票。",
    levels,
  };
}

function readCohortPerfectSquareStatsCache() {
  const raw = readJson(COHORT_PERFECT_SQUARE_STATS_FILE, null);
  if (!raw || typeof raw.builtAt !== "number" || !raw.result || raw.result.ok !== true) return null;
  const ttl = Number.isFinite(Number(raw.ttlMs)) && Number(raw.ttlMs) > 0 ? Number(raw.ttlMs) : COHORT_STATS_TTL_MS;
  return { builtAt: raw.builtAt, ttlMs: ttl, result: raw.result };
}

function writeCohortPerfectSquareStatsCache(builtAt, result) {
  writeJson(COHORT_PERFECT_SQUARE_STATS_FILE, {
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    result,
  });
}

app.get("/api/public/perfect-square-cohort", (req, res) => {
  const cache = readCohortPerfectSquareStatsCache();
  if (!cache || !cache.result || cache.result.ok !== true) {
    return res.status(503).json({ ok: false, error: "暂无平方数常模，请管理员在后台拉取或刷新常模后再试" });
  }
  const ttl = cache.ttlMs;
  const builtAt = cache.builtAt;
  return res.json({
    ...cache.result,
    builtAt,
    ttlMs: ttl,
    expiresAt: builtAt + ttl,
    servedFromCache: true,
  });
});

app.get("/api/admin/stats/perfect-square-cohort", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const now = Date.now();
  const cache = readCohortPerfectSquareStatsCache();
  const ttl = cache ? cache.ttlMs : COHORT_STATS_TTL_MS;
  if (cache && now < cache.builtAt + ttl) {
    return res.json({
      ...cache.result,
      builtAt: cache.builtAt,
      ttlMs: ttl,
      expiresAt: cache.builtAt + ttl,
      servedFromCache: true,
    });
  }
  const result = computePerfectSquareCohortResult();
  const builtAt = now;
  writeCohortPerfectSquareStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
  });
});

/** 整除全体常模（热图 Z1–Z4；Z5 按除数拆入） */
const COHORT_DIVISIBILITY_LEVEL_COUNT = DIVISIBILITY_HEATMAP_LEVEL_COUNT;

function computeDivisibilityCohortResult() {
  const personLnByLevel = collectPersonMeanLnByLevel(
    (mode) => mode === "divisibility",
    COHORT_DIVISIBILITY_LEVEL_COUNT,
    heatLevelIndexFromAttempt
  );
  const levels = [];
  for (let k = 0; k < COHORT_DIVISIBILITY_LEVEL_COUNT; k++) {
    const lnQ = summarizeQuantiles(personLnByLevel[k]);
    levels.push({
      levelIndex: k,
      cohortLnTimeCorrect: lnQ,
      cohortLnTimeHistogram: buildLnHistogram(personLnByLevel[k], COHORT_HISTOGRAM_BIN_COUNT),
    });
  }
  return {
    ok: true,
    kind: "divisibility",
    levelCount: COHORT_DIVISIBILITY_LEVEL_COUNT,
    sampleUnit: "person",
    minAttemptsPerPersonLevel: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    minAttemptsForHeatmap: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    timeSpentMsCap: COHORT_MAX_TIME_SPENT_MS,
    timeSpentMsCapNote:
      "答对题的 timeSpentMs 超过该毫秒数（默认 1 分钟）的记录不纳入速度侧。全体常模按「人·档」计票。Z5 混合局按除数归入 Z1–Z4。",
    levels,
  };
}

function readCohortDivisibilityStatsCache() {
  const raw = readJson(COHORT_DIVISIBILITY_STATS_FILE, null);
  if (!raw || typeof raw.builtAt !== "number" || !raw.result || raw.result.ok !== true) return null;
  const ttl = Number.isFinite(Number(raw.ttlMs)) && Number(raw.ttlMs) > 0 ? Number(raw.ttlMs) : COHORT_STATS_TTL_MS;
  return { builtAt: raw.builtAt, ttlMs: ttl, result: raw.result };
}

function writeCohortDivisibilityStatsCache(builtAt, result) {
  writeJson(COHORT_DIVISIBILITY_STATS_FILE, {
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    result,
  });
}

app.get("/api/public/divisibility-cohort", (req, res) => {
  const cache = readCohortDivisibilityStatsCache();
  if (!cache || !cache.result || cache.result.ok !== true) {
    return res.status(503).json({ ok: false, error: "暂无整除常模，请管理员在后台拉取或刷新常模后再试" });
  }
  const ttl = cache.ttlMs;
  const builtAt = cache.builtAt;
  return res.json({
    ...cache.result,
    builtAt,
    ttlMs: ttl,
    expiresAt: builtAt + ttl,
    servedFromCache: true,
  });
});

app.get("/api/admin/stats/divisibility-cohort", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const now = Date.now();
  const cache = readCohortDivisibilityStatsCache();
  const ttl = cache ? cache.ttlMs : COHORT_STATS_TTL_MS;
  if (cache && now < cache.builtAt + ttl) {
    return res.json({
      ...cache.result,
      builtAt: cache.builtAt,
      ttlMs: ttl,
      expiresAt: cache.builtAt + ttl,
      servedFromCache: true,
    });
  }
  const result = computeDivisibilityCohortResult();
  const builtAt = now;
  writeCohortDivisibilityStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
  });
});

function readFeedbackStore() {
  const data = readJson(FEEDBACK_FILE, { items: [] });
  return Array.isArray(data.items) ? data : { items: [] };
}

function writeFeedbackStore(data) {
  writeJson(FEEDBACK_FILE, { items: Array.isArray(data.items) ? data.items : [] });
}

function isValidFeedbackEmail(email) {
  if (!email) return true;
  if (email.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkFeedbackRateLimit(username) {
  const now = Date.now();
  let stamps = feedbackSubmitTimestamps.get(username) || [];
  stamps = stamps.filter((t) => now - t < FEEDBACK_RATE_WINDOW_MS);
  if (stamps.length >= FEEDBACK_RATE_MAX_PER_HOUR) return false;
  stamps.push(now);
  feedbackSubmitTimestamps.set(username, stamps);
  return true;
}

// ========== 学员：提交反馈（须登录） ==========
app.post("/api/feedback", requireStudentAuth, (req, res) => {
  const username = req.user && req.user.username;
  if (!username) {
    return res.status(401).json({ ok: false, error: "请先登录" });
  }
  if (!checkFeedbackRateLimit(username)) {
    return res.status(429).json({ ok: false, error: "提交过于频繁，请稍后再试" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const category = String(body.category || "").trim();
  if (!FEEDBACK_CATEGORIES.has(category)) {
    return res.json({ ok: false, error: "无效的类型" });
  }
  const message = String(body.message || "").trim();
  if (!message) {
    return res.json({ ok: false, error: "请填写反馈内容" });
  }
  if (message.length > FEEDBACK_MESSAGE_MAX_LEN) {
    return res.json({ ok: false, error: "内容过长（最多 " + FEEDBACK_MESSAGE_MAX_LEN + " 字）" });
  }
  const contactEmail = String(body.contactEmail || "").trim();
  if (!isValidFeedbackEmail(contactEmail)) {
    return res.json({ ok: false, error: "邮箱格式不正确" });
  }
  const store = readFeedbackStore();
  const item = {
    id: crypto.randomUUID(),
    username,
    category,
    message,
    contactEmail,
    createdAt: Date.now(),
    read: false,
  };
  store.items.unshift(item);
  if (store.items.length > 5000) store.items.length = 5000;
  writeFeedbackStore(store);
  return res.json({ ok: true, id: item.id });
});

// ========== 管理员：用户反馈 ==========
app.get("/api/admin/feedback", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const store = readFeedbackStore();
  const items = store.items.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ ok: true, items });
});

app.put("/api/admin/feedback/:id", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.json({ ok: false, error: "无效 ID" });
  const store = readFeedbackStore();
  const idx = store.items.findIndex((x) => x.id === id);
  if (idx < 0) {
    return res.status(404).json({ ok: false, error: "未找到该反馈" });
  }
  if (req.body && typeof req.body.read === "boolean") {
    store.items[idx].read = req.body.read;
  }
  writeFeedbackStore(store);
  return res.json({ ok: true, item: store.items[idx] });
});

// ========== 管理员：备份全部数据 ==========
const BACKUP_SCHEMA_VERSION = 3;

function packImageAssetDir(dir) {
  const out = {};
  if (!dir || !fs.existsSync(dir)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return out;
  }
  entries.forEach((name) => {
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return;
    const ext = String(name.split(".").pop() || "").toLowerCase();
    if (!IMAGE_ASSET_EXTS.has(ext)) return;
    try {
      const buf = fs.readFileSync(path.join(dir, name));
      if (buf && buf.length) out[name] = buf.toString("base64");
    } catch (e) {
      console.warn("[backup] skip asset", name, e.message);
    }
  });
  return out;
}

function unpackImageAssetDir(dir, map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return 0;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  Object.keys(map).forEach((name) => {
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return;
    const ext = String(name.split(".").pop() || "").toLowerCase();
    if (!IMAGE_ASSET_EXTS.has(ext)) return;
    const b64 = map[name];
    if (typeof b64 !== "string" || !b64) return;
    try {
      const buf = Buffer.from(b64, "base64");
      if (!buf.length) return;
      fs.writeFileSync(path.join(dir, name), buf);
      n += 1;
    } catch (e) {
      console.warn("[restore] skip asset", name, e.message);
    }
  });
  return n;
}

app.get("/api/admin/backup", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const users = readJson(USERS_FILE, { users: [] });
  const runs = runsStore.buildRunsObjectFromByUser();
  const settings = readJson(SETTINGS_FILE, { levels: [] });
  const i18n = readJson(I18N_FILE, defaultI18nPayload());
  const feedback = readFeedbackStore();
  const achievementsCatalog = readAchievementsCatalog();
  const gameGuide = fs.existsSync(GAME_GUIDE_FILE) ? readGameGuide() : null;
  const survivalRanking = readJson(SURVIVAL_RANKING_FILE, { list: [] });
  const levelRanking = readJson(LEVEL_RANKING_FILE, { list: [] });
  const primePerfectRanking = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  const divisibilityPerfectRanking = readJson(DIVISIBILITY_PERFECT_RANKING_FILE, { list: [] });
  const avatars = readJson(AVATARS_FILE, { avatars: [] });
  const adminMeta = readAdminMeta();
  const avatarAssets = packImageAssetDir(AVATAR_ASSET_DIR);
  const achievementAssets = packImageAssetDir(ACHIEVEMENT_ASSET_DIR);
  const backup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: process.env.npm_package_version || null,
    ts: Date.now(),
    users,
    runs,
    settings,
    i18n,
    feedback,
    achievementsCatalog,
    gameGuide,
    survivalRanking,
    levelRanking,
    primePerfectRanking,
    divisibilityPerfectRanking,
    avatars,
    adminMeta,
    avatarAssets,
    achievementAssets,
    practicePlans: practicePlanStore.exportAll(),
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=jarvis-math-backup-" + new Date().toISOString().slice(0, 10) + ".json"
  );
  res.send(JSON.stringify(backup, null, 2));
});

// ========== 管理员：恢复/导入数据 ==========
app.post("/api/admin/restore", express.json({ limit: "50mb" }), (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.json({ ok: false, error: "无效的备份格式" });
  }
  const restored = [];
  const notes = [];
  try {
    if (body.users) {
      const u = body.users;
      writeJson(USERS_FILE, u.users && Array.isArray(u.users) ? u : { users: Array.isArray(u) ? u : [] });
      restored.push("users");
    }
    if (body.runs) {
      const r = body.runs;
      const runsObj =
        r.runs && typeof r.runs === "object" ? r : { runs: typeof r === "object" ? r : {} };
      // 恢复写入分用户文件；不改动 legacy runs.json（保留迁移前快照供核对）
      runsStore.replaceAllFromRunsObject(runsObj);
      restored.push("runs");
      notes.push("runs 已写入 runs-by-user（未改动 legacy runs.json）");
      try {
        if (fs.existsSync(COHORT_LEVEL_STATS_FILE)) fs.unlinkSync(COHORT_LEVEL_STATS_FILE);
        if (fs.existsSync(COHORT_DECIMAL_STATS_FILE)) fs.unlinkSync(COHORT_DECIMAL_STATS_FILE);
        if (fs.existsSync(COHORT_PERFECT_SQUARE_STATS_FILE)) fs.unlinkSync(COHORT_PERFECT_SQUARE_STATS_FILE);
        if (fs.existsSync(COHORT_DIVISIBILITY_STATS_FILE)) fs.unlinkSync(COHORT_DIVISIBILITY_STATS_FILE);
        notes.push("已清除常模快照（请在报表刷新全体常模）");
      } catch (e2) {
        /* 忽略 */
      }
    }
    if (body.practicePlans && typeof body.practicePlans === "object") {
      practicePlanStore.replaceAll(body.practicePlans);
      restored.push("practicePlans");
    }
    if (body.settings) {
      const s = body.settings;
      writeJson(SETTINGS_FILE, s.levels && Array.isArray(s.levels) ? s : { levels: Array.isArray(s) ? s : [] });
      restored.push("settings");
    }
    if (body.adminMeta && typeof body.adminMeta === "object") {
      writeAdminMeta(body.adminMeta);
      restored.push("adminMeta");
    }
    if (body.i18n && typeof body.i18n === "object") {
      writeJson(I18N_FILE, normalizeI18nPayload(body.i18n));
      restored.push("i18n");
    }
    if (body.gameGuide && typeof body.gameGuide === "object") {
      writeGameGuide(normalizeGameGuidePayload(body.gameGuide));
      restored.push("gameGuide");
    }
    if (body.feedback && typeof body.feedback === "object") {
      const fb = body.feedback;
      writeFeedbackStore(Array.isArray(fb.items) ? fb : { items: Array.isArray(fb) ? fb : [] });
      restored.push("feedback");
    }
    if (body.achievementsCatalog && typeof body.achievementsCatalog === "object") {
      catalogStore.writeCatalog(body.achievementsCatalog);
      restored.push("achievementsCatalog");
    }
    if (body.survivalRanking && typeof body.survivalRanking === "object") {
      const sr = body.survivalRanking;
      writeJson(SURVIVAL_RANKING_FILE, Array.isArray(sr.list) ? sr : { list: Array.isArray(sr) ? sr : [] });
      restored.push("survivalRanking");
    }
    if (body.levelRanking && typeof body.levelRanking === "object") {
      const lr = body.levelRanking;
      writeJson(LEVEL_RANKING_FILE, Array.isArray(lr.list) ? lr : { list: Array.isArray(lr) ? lr : [] });
      restored.push("levelRanking");
    } else if (body.runs) {
      try {
        const stats = rebuildLevelRankingFromRuns();
        notes.push("备份无闯关榜，已从 runs 回填（" + (stats.entries || 0) + " 人）");
        restored.push("levelRanking(rebuilt)");
      } catch (e) {
        notes.push("闯关榜回填失败：" + (e.message || String(e)));
      }
    }
    if (body.divisibilityPerfectRanking && typeof body.divisibilityPerfectRanking === "object") {
      const dr = body.divisibilityPerfectRanking;
      writeJson(DIVISIBILITY_PERFECT_RANKING_FILE, Array.isArray(dr.list) ? dr : { list: Array.isArray(dr) ? dr : [] });
      restored.push("divisibilityPerfectRanking");
    } else if (body.runs) {
      try {
        const stats = rebuildDivisibilityPerfectRankingFromRuns();
        notes.push("备份无整除榜，已从 runs 重建（" + (stats.entries || 0) + " 人）");
        restored.push("divisibilityPerfectRanking(rebuilt)");
      } catch (e) {
        notes.push("整除榜重建失败：" + (e.message || String(e)));
      }
    }
    if (body.primePerfectRanking && typeof body.primePerfectRanking === "object") {
      const pr = body.primePerfectRanking;
      writeJson(PRIME_PERFECT_RANKING_FILE, Array.isArray(pr.list) ? pr : { list: Array.isArray(pr) ? pr : [] });
      restored.push("primePerfectRanking");
    } else if (body.runs) {
      try {
        const stats = rebuildPrimePerfectRankingFromRuns();
        notes.push("备份无质数榜，已从 runs 重建（" + (stats.entries || 0) + " 人）");
        restored.push("primePerfectRanking(rebuilt)");
      } catch (e) {
        notes.push("质数榜重建失败：" + (e.message || String(e)));
      }
    }
    if (body.avatars && typeof body.avatars === "object") {
      const av = body.avatars;
      writeJson(AVATARS_FILE, Array.isArray(av.avatars) ? av : { avatars: Array.isArray(av) ? av : [] });
      restored.push("avatars");
    }
    if (body.avatarAssets && typeof body.avatarAssets === "object") {
      const n = unpackImageAssetDir(AVATAR_ASSET_DIR, body.avatarAssets);
      restored.push("avatarAssets(" + n + ")");
    }
    if (body.achievementAssets && typeof body.achievementAssets === "object") {
      const n = unpackImageAssetDir(ACHIEVEMENT_ASSET_DIR, body.achievementAssets);
      restored.push("achievementAssets(" + n + ")");
    }
    res.json({
      ok: true,
      msg: "数据已恢复",
      schemaVersion: body.schemaVersion || 1,
      restored,
      notes,
    });
  } catch (e) {
    res.json({ ok: false, error: "恢复失败：" + (e.message || String(e)) });
  }
});

// ========== 管理员：从 runs 回填闯关达人榜 ==========
app.post("/api/admin/maintenance/backfill-level-ranking", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const stats = rebuildLevelRankingFromRuns();
    return res.json({ ok: true, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "回填失败：" + (e.message || String(e)) });
  }
});

// ========== 管理员：从 runs 重建质数达人榜（通常不必；榜文件丢失时用） ==========
app.post("/api/admin/maintenance/backfill-prime-perfect-ranking", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const stats = rebuildPrimePerfectRankingFromRuns();
    return res.json({ ok: true, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "回填失败：" + (e.message || String(e)) });
  }
});

// ========== 管理员：从 runs 重建整除达人榜（L5 零错最短用时） ==========
/** 全库清除错题本中 mode=divisibility 的条目（整除已改为不进错题本） */
app.post("/api/admin/maintenance/purge-divisibility-wrong-answers", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(data.users) ? data.users : [];
  let usersTouched = 0;
  let entriesRemoved = 0;
  users.forEach((u) => {
    if (!u || !Array.isArray(u.wrongAnswers) || u.wrongAnswers.length === 0) return;
    const before = u.wrongAnswers.length;
    u.wrongAnswers = u.wrongAnswers.filter((w) => String((w && w.mode) || "") !== "divisibility");
    const removed = before - u.wrongAnswers.length;
    if (removed > 0) {
      usersTouched += 1;
      entriesRemoved += removed;
    }
  });
  if (entriesRemoved > 0) writeJson(USERS_FILE, data);
  return res.json({
    ok: true,
    usersTouched,
    entriesRemoved,
    userCount: users.length,
  });
});

app.post("/api/admin/maintenance/backfill-divisibility-perfect-ranking", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const stats = rebuildDivisibilityPerfectRankingFromRuns();
    return res.json({ ok: true, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "回填失败：" + (e.message || String(e)) });
  }
});

// ========== 学员：刷新生存解锁资格（从 runs 重算标记） ==========
app.get("/api/user/:username/survival-eligibility", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const usersData = readJson(USERS_FILE, { users: [] });
  const uIdx = usersData.users.findIndex((u) => u.username === username);
  if (uIdx < 0) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const u = usersData.users[uIdx];
    const runs = runsStore.getUserRuns(username);
  recomputeSurvivalUnlockFlags(u, runs);
  writeJson(USERS_FILE, usersData);
  return res.json({
    ok: true,
    survivalUnlocked: u.survivalUnlocked === true,
    trainingL16Cleared: u.trainingL16Cleared === true,
    heatmapL16Passed: u.heatmapL16Passed === true,
    levelChallengeBestLevel: typeof u.levelChallengeBestLevel === "number" ? u.levelChallengeBestLevel : 0,
    eligible: userEligibleForSurvivalUnlock(u),
  });
});

// ========== 头像：学员端获取头像列表（用于解锁/选择，先预留） ==========
app.get("/api/avatars", (req, res) => {
  const list = readAvatarCatalog().map((x) => buildAvatarPublic(x, req));
  res.json({ ok: true, avatars: list });
});

// ========== 管理员：获取头像列表 ==========
app.get("/api/admin/avatars", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const list = readAvatarCatalog().map((x) => buildAvatarPublic(x, req));
  res.json({ ok: true, avatars: list });
});

// ========== 管理员：保存头像列表（名称/解锁等级/启用/排序） ==========
app.put("/api/admin/avatars", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const avatars = req.body && req.body.avatars;
  if (!Array.isArray(avatars)) {
    return res.json({ ok: false, error: "无效的 avatars 格式" });
  }
  const cur = readAvatarCatalog();
  const curMap = new Map(cur.map((x) => [x.id, x]));
  const nextRaw = avatars.map((x, i) => {
    const id = x && x.id ? String(x.id).trim() : "";
    const old = curMap.get(id);
    return normalizeAvatarEntry(
      {
        id,
        name: x && x.name,
        unlockLevel: x && x.unlockLevel != null ? x.unlockLevel : (old ? old.unlockLevel : 1),
        enabled: x && x.enabled,
        // order 只作为“同等级内的手动排序”权重使用；全局排序由服务端按规则重排
        order: Number.isFinite(Number(x && x.order)) ? Number(x.order) : i,
        imagePath: old ? old.imagePath : "",
        createdAt: old ? old.createdAt : Date.now(),
      },
      i,
    );
  });
  // 固化排序规则：
  // 1) 启用的在前；禁用的全在最后
  // 2) 启用部分按 unlockLevel 升序
  // 3) 同 unlockLevel 内按传入 order（手动排序）升序
  const next = nextRaw
    .slice()
    .sort((a, b) => {
      const ea = a.enabled !== false ? 1 : 0;
      const eb = b.enabled !== false ? 1 : 0;
      if (ea !== eb) return eb - ea;
      const sa = clampUnlockLevel(a.unlockLevel);
      const sb = clampUnlockLevel(b.unlockLevel);
      if (sa !== sb) return sa - sb;
      const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
      const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
      if (oa !== ob) return oa - ob;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((x, i) => ({ ...x, order: i }));
  const saved = writeAvatarCatalog(next);
  res.json({ ok: true, avatars: saved.map((x) => buildAvatarPublic(x, req)) });
});

// ========== 管理员：上传新头像（dataUrl） ==========
app.post("/api/admin/avatars/upload", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { name, unlockLevel, dataUrl } = req.body || {};
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return res.json({ ok: false, error: "图片格式不支持（仅 png/jpg/webp 的 dataUrl）" });
  }
  const id = createAvatarId();
  const fileName = `${id}.${parsed.ext}`;
  const target = path.join(AVATAR_ASSET_DIR, fileName);
  fs.writeFileSync(target, parsed.buf);
  const cur = readAvatarCatalog();
  cur.unshift({
    id,
    name: sanitizeAvatarName(name, id),
    imagePath: `/avatar-assets/${fileName}`,
    unlockLevel: clampUnlockLevel(unlockLevel),
    order: 0,
    enabled: true,
    createdAt: Date.now(),
  });
  const saved = writeAvatarCatalog(cur);
  res.json({ ok: true, avatars: saved.map((x) => buildAvatarPublic(x, req)) });
});

// ========== 管理员：替换头像图片（dataUrl） ==========
app.post("/api/admin/avatars/:id/replace-image", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const id = String(req.params.id || "").trim();
  const parsed = parseDataUrl(req.body && req.body.dataUrl);
  if (!id) return res.json({ ok: false, error: "缺少 id" });
  if (!parsed) return res.json({ ok: false, error: "图片格式不支持" });
  const cur = readAvatarCatalog();
  const idx = cur.findIndex((x) => x.id === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "头像不存在" });
  cleanupReplacedAssetImage({
    assetDir: AVATAR_ASSET_DIR,
    assetId: id,
    previousImagePath: cur[idx].imagePath,
    publicPrefix: "/avatar-assets/",
  });
  const fileName = `${id}.${parsed.ext}`;
  const target = path.join(AVATAR_ASSET_DIR, fileName);
  fs.writeFileSync(target, parsed.buf);
  cur[idx].imagePath = `/avatar-assets/${fileName}`;
  const saved = writeAvatarCatalog(cur);
  res.json({ ok: true, avatars: saved.map((x) => buildAvatarPublic(x, req)) });
});

// ========== 管理员：删除头像 ==========
app.delete("/api/admin/avatars/:id", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.json({ ok: false, error: "缺少 id" });
  const cur = readAvatarCatalog();
  const idx = cur.findIndex((x) => x.id === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "头像不存在" });
  const removed = cur.splice(idx, 1)[0];
  try {
    // 尝试删除对应资源文件（不强制）
    if (removed && removed.imagePath && removed.imagePath.startsWith("/avatar-assets/")) {
      const rel = removed.imagePath.replace(/^\/avatar-assets\//, "");
      const p = path.join(AVATAR_ASSET_DIR, rel);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (e) {}
  const saved = writeAvatarCatalog(cur);
  res.json({ ok: true, avatars: saved.map((x) => buildAvatarPublic(x, req)) });
});

// ========== 管理员：从仓库 pictures/profile 导入（兼容旧资源） ==========
app.post("/api/admin/avatars/init-legacy", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const repoProfileDir = path.resolve(__dirname, "../pictures/profile");
  if (!fs.existsSync(repoProfileDir)) {
    const list = readAvatarCatalog().map((x) => buildAvatarPublic(x, req));
    return res.json({ ok: true, avatars: list, added: 0, msg: "未找到 pictures/profile，已保留现有头像库" });
  }
  const files = fs.readdirSync(repoProfileDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
  const cur = readAvatarCatalog();
  const nameSet = new Set(cur.map((x) => String(x.name || "").trim().toLowerCase()).filter(Boolean));
  let added = 0;
  files.forEach((file) => {
    const ext = (path.extname(file) || "").toLowerCase();
    const base = path.basename(file, ext).trim().slice(0, 40);
    if (!base) return;
    if (nameSet.has(base.toLowerCase())) return;
    const id = createAvatarId();
    const targetName = `${id}${ext}`;
    const src = path.join(repoProfileDir, file);
    const target = path.join(AVATAR_ASSET_DIR, targetName);
    fs.copyFileSync(src, target);
    cur.unshift({
      id,
      name: base,
      imagePath: `/avatar-assets/${targetName}`,
      unlockLevel: 1,
      order: 0,
      enabled: true,
      createdAt: Date.now(),
    });
    nameSet.add(base.toLowerCase());
    added += 1;
  });
  const saved = writeAvatarCatalog(cur);
  res.json({ ok: true, avatars: saved.map((x) => buildAvatarPublic(x, req)), added });
});

// ========== 管理员：成就 catalog ==========
app.get("/api/admin/achievements/catalog", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const catalog = readAchievementsCatalog();
  res.json({ ok: true, catalog, ruleTypes: REGISTERED_RULE_TYPES, implementedRuleTypes: IMPLEMENTED_RULE_TYPES });
});

app.put("/api/admin/achievements/catalog", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body && req.body.catalog ? req.body.catalog : req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "无效 catalog" });
  }
  const saved = catalogStore.writeCatalog(body);
  res.json({ ok: true, catalog: saved });
});

app.post("/api/admin/achievements/import", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dryRun = body.dryRun === true;
  const importPayload = body.import && typeof body.import === "object" ? body.import : body;
  const catalog = readAchievementsCatalog();
  const result = achievementImport.applyAchievementImport(catalog, importPayload, {
    registeredRuleTypes: REGISTERED_RULE_TYPES,
    implementedRuleTypes: IMPLEMENTED_RULE_TYPES,
  });
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error || "导入失败" });
  }
  if (dryRun) {
    return res.json({ ok: true, dryRun: true, report: result.report });
  }
  const saved = catalogStore.writeCatalog(result.catalog);
  res.json({ ok: true, dryRun: false, report: result.report, catalog: saved });
});

app.delete("/api/admin/achievements/:id", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "缺少 id" });
  const catalog = readAchievementsCatalog();
  const idx = (catalog.items || []).findIndex((x) => x && x.id === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "成就不存在" });
  removeAssetFilesForId(ACHIEVEMENT_ASSET_DIR, id);
  catalog.items.splice(idx, 1);
  const usersData = readJson(USERS_FILE, { users: [] });
  const purge = achievementEngine.purgeAchievementFromAllUsers(usersData.users, id);
  writeJson(USERS_FILE, usersData);
  const saved = catalogStore.writeCatalog(catalog);
  res.json({
    ok: true,
    catalog: saved,
    deletedId: id,
    usersTouched: purge.usersTouched,
    recordsRemoved: purge.recordsRemoved,
  });
});

app.post("/api/admin/achievements/:id/replace-image", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const id = String(req.params.id || "").trim();
  const parsed = parseDataUrl(req.body && req.body.dataUrl);
  if (!id) return res.json({ ok: false, error: "缺少 id" });
  if (!parsed) return res.json({ ok: false, error: "图片格式不支持（仅 png/jpg/webp 的 dataUrl）" });
  const catalog = readAchievementsCatalog();
  const idx = (catalog.items || []).findIndex((x) => x && x.id === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "成就不存在" });
  cleanupReplacedAssetImage({
    assetDir: ACHIEVEMENT_ASSET_DIR,
    assetId: id,
    previousImagePath: catalog.items[idx].imagePath,
    publicPrefix: "/achievement-assets/",
  });
  const fileName = `${id}.${parsed.ext}`;
  const target = path.join(ACHIEVEMENT_ASSET_DIR, fileName);
  fs.writeFileSync(target, parsed.buf);
  catalog.items[idx].imagePath = `/achievement-assets/${fileName}`;
  const saved = catalogStore.writeCatalog(catalog);
  const item = saved.items.find((x) => x.id === id);
  res.json({
    ok: true,
    item: item ? { ...item, imageUrl: buildAchievementImageUrl(item, req) } : null,
    catalog: saved,
  });
});

app.post("/api/admin/achievements/recompute", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const targetUsername = (req.body && req.body.username ? String(req.body.username) : "").trim();
  const usersData = readJson(USERS_FILE, { users: [] });
  const catalog = readAchievementsCatalog();
  const rankingData = readRankingEvalData();
  let users = usersData.users || [];
  if (targetUsername) {
    users = users.filter((u) => u && u.username === targetUsername);
  }
  let unlockedTotal = 0;
  let usersTouched = 0;
  users.forEach((user) => {
    if (!user || !user.username) return;
    const runs = runsStore.getUserRuns(user.username);
    achievementEngine.assignAchievementStatsFromRuns(user, runs);
    const rankingCtx = buildAchievementRankingContext(user.username, rankingData);
    const before = Object.keys(user.achievements || {}).length;
    achievementEngine.evaluateUserAchievements(user, runs, catalog, { rankingCtx });
    achievementEngine.sanitizeEquippedBadges(user, catalog);
    const after = Object.keys(user.achievements || {}).length;
    if (after > before) unlockedTotal += after - before;
    usersTouched += 1;
  });
  writeJson(USERS_FILE, usersData);
  res.json({ ok: true, usersTouched, newlyUnlockedCount: unlockedTotal });
});

/** 核对：legacy runs.json vs runs-by-user（只读，不改任何文件） */
app.get("/api/admin/maintenance/runs-store-verify", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const report = runsStore.verifyAgainstLegacy();
    return res.json(report);
  } catch (e) {
    console.warn("[runs-store-verify]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : "核对失败" });
  }
});

/** 强制从 legacy runs.json 再同步到分文件（覆盖 by-user；不改 legacy） */
app.post("/api/admin/maintenance/runs-store-sync", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const result = runsStore.syncFromLegacy({ force: true });
    return res.json(result);
  } catch (e) {
    console.warn("[runs-store-sync]", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : "同步失败" });
  }
});

app.listen(PORT, () => {
  console.log(`Jarvis Math Lab API 运行在 http://localhost:${PORT}`);
});
