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
const { REGISTERED_RULE_TYPES, IMPLEMENTED_RULE_TYPES } = require("./achievements/evaluators");

const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
if (!JWT_SECRET) {
  throw new Error("Missing required env var JWT_SECRET");
}
const JWT_EXPIRES_IN = "7d";

const BCRYPT_ROUNDS = 10;
function isBcryptHash(s) {
  return typeof s === "string" && s.length >= 50 && s.startsWith("$2");
}

function safeUser(u) {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
}

const WRONGBOOK_MAX_STORE = 30;
const EXPAND_WRONG_MAX_STORE = 20;

const WRONG_ANSWER_MODES = new Set(["survival", "level", "training", "decimal", "perfectSquare"]);
const WRONG_ANSWER_LEVEL_MAX = {
  survival: 15,
  level: 15,
  training: 15,
  decimal: 4,
  perfectSquare: 2,
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

/** 学员端 API：不返回拆括号错题（仅管理端 report 使用） */
function safeUserForStudent(u) {
  const out = safeUser(u);
  if (out && Object.prototype.hasOwnProperty.call(out, "expandBracketsWrongAnswers")) {
    delete out.expandBracketsWrongAnswers;
  }
  return out;
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

function equippedBadgesForUsername(username, req) {
  const usersData = readJson(USERS_FILE, { users: [] });
  const u = (usersData.users || []).find((x) => x && x.username === username);
  if (!u) return [];
  const catalog = readAchievementsCatalog();
  achievementEngine.sanitizeEquippedBadges(u, catalog);
  return achievementEngine.buildEquippedBadgesSummary(u, catalog).map((b) => ({
    ...b,
    imageUrl: buildAchievementImageUrl({ imagePath: b.imagePath }, req),
  }));
}

function withEquippedBadges(row, req) {
  if (!row || !row.username) return row;
  return Object.assign({}, row, { equippedBadges: equippedBadgesForUsername(row.username, req) });
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
/** 全体难度常模快照缓存时长；可用环境变量 COHORT_STATS_TTL_MS 覆盖（毫秒） */
const COHORT_STATS_TTL_MS = Number(process.env.COHORT_STATS_TTL_MS) || 24 * 60 * 60 * 1000;
const SURVIVAL_RANKING_FILE = path.join(DATA_DIR, "survival-ranking.json");
const PRIME_PERFECT_RANKING_FILE = path.join(DATA_DIR, "prime-perfect-ranking.json");
const ADMIN_PIN_FILE = path.join(DATA_DIR, "admin-pin.json");
const AVATARS_FILE = path.join(DATA_DIR, "avatars.json");
const AVATAR_ASSET_DIR = path.join(DATA_DIR, "avatar-assets");
const ACHIEVEMENT_ASSET_DIR = path.join(DATA_DIR, "achievement-assets");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const ACHIEVEMENTS_CATALOG_FILE = path.join(DATA_DIR, "achievements-catalog.json");
const catalogStore = achievementCatalog.createCatalogStore(ACHIEVEMENTS_CATALOG_FILE);
const FEEDBACK_CATEGORIES = new Set(["bug", "suggestion", "account", "other"]);
const FEEDBACK_MESSAGE_MAX_LEN = 2000;
const FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_MAX_PER_HOUR = 10;
const feedbackSubmitTimestamps = new Map();
const SURVIVAL_RANKING_MAX = 50;
const SCORE_RANKING_MAX = 50;
const STREAK_RANKING_MAX = 50;
const COMBO_RANKING_MAX = 50;

function normalizeRunMode(mode) {
  if (mode === "level") return "level";
  if (mode === "training") return "training";
  if (mode === "primeComposite") return "primeComposite";
  if (mode === "expandBrackets") return "expandBrackets";
  if (mode === "perfectSquare") return "perfectSquare";
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

function backfillLastGameTsForAllUsers() {
  const usersData = readJson(USERS_FILE, { users: [] });
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const users = Array.isArray(usersData.users) ? usersData.users : [];
  let updatedUsers = 0;
  users.forEach((u) => {
    if (!u || !u.username) return;
    const runs = runsData.runs && Array.isArray(runsData.runs[u.username]) ? runsData.runs[u.username] : [];
    const next = latestRunTsFromRuns(runs);
    const old = Number(u.lastGameTs) || 0;
    if (next !== old) {
      if (next > 0) u.lastGameTs = next;
      else delete u.lastGameTs;
      updatedUsers += 1;
    }
  });
  writeJson(USERS_FILE, { users });
  return { totalUsers: users.length, updatedUsers };
}

const EXPAND_SCORE_PER_CORRECT = 5;

function countCorrectAttempts(attempts) {
  if (!Array.isArray(attempts)) return null;
  return attempts.filter((a) => a && a.correct === true).length;
}

/** 拆括号旧版：score 存的是答对题数（1 分/题）；新版为答对数×5 */
function expandRunNeedsScoreBackfill(run) {
  if (!run || normalizeRunMode(run.mode) !== "expandBrackets") return false;
  if (run.expandScorePerCorrect === EXPAND_SCORE_PER_CORRECT) return false;
  const correct = countCorrectAttempts(run.attempts);
  const score = Number(run.score) || 0;
  if (correct != null) {
    if (score === correct * EXPAND_SCORE_PER_CORRECT) return false;
    if (correct > 0 && score === correct) return true;
    return false;
  }
  if (score > 0 && score <= 20 && score % EXPAND_SCORE_PER_CORRECT !== 0) return true;
  return false;
}

function applyExpandBracketsScoreBackfill(run) {
  const correct = countCorrectAttempts(run.attempts);
  const oldScore = Number(run.score) || 0;
  const newScore =
    correct != null ? correct * EXPAND_SCORE_PER_CORRECT : oldScore * EXPAND_SCORE_PER_CORRECT;
  run.score = newScore;
  run.expandScorePerCorrect = EXPAND_SCORE_PER_CORRECT;
  return { oldScore, newScore, delta: newScore - oldScore };
}

function sumNonComboRunScores(runs) {
  if (!Array.isArray(runs)) return 0;
  return runs.reduce((sum, r) => {
    if (!r || r.comboOnly === true) return sum;
    return sum + (Number(r.score) || 0);
  }, 0);
}

function backfillExpandBracketsScoresForAllUsers() {
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];
  let updatedRuns = 0;
  let updatedUsers = 0;
  let totalScoreDelta = 0;

  const patchRun = (run) => {
    if (!expandRunNeedsScoreBackfill(run)) return 0;
    const { delta } = applyExpandBracketsScoreBackfill(run);
    updatedRuns += 1;
    return delta;
  };

  Object.keys(runsData.runs || {}).forEach((username) => {
    const arr = runsData.runs[username];
    if (!Array.isArray(arr)) return;
    arr.forEach((run) => {
      totalScoreDelta += patchRun(run);
    });
  });

  users.forEach((u) => {
    if (!u || !u.username) return;
    if (Array.isArray(u.recentExpandBracketsRuns)) {
      u.recentExpandBracketsRuns.forEach((run) => {
        patchRun(run);
      });
    }
    const runs = runsData.runs && Array.isArray(runsData.runs[u.username]) ? runsData.runs[u.username] : [];
    const nextTotal = sumNonComboRunScores(runs);
    const oldTotal = Number(u.totalScore) || 0;
    if (nextTotal !== oldTotal) {
      u.totalScore = nextTotal;
      updatedUsers += 1;
    }
  });

  writeJson(RUNS_FILE, runsData);
  writeJson(USERS_FILE, usersData);
  return {
    totalUsers: users.length,
    updatedRuns,
    updatedUsers,
    totalScoreDelta,
  };
}

function buildScoreRankingRowUser(u, req) {
  if (!u || !u.username) return null;
  const displayName = (u.nickname || "").trim() ? String(u.nickname).trim() : "新人";
  const totalScore = Number(u.totalScore) || 0;
  const avatarId = resolveUserAvatarIdOrEmpty(u);
  let avatarUrl = "";
  if (avatarId) {
    const catalog = readAvatarCatalog();
    const item = catalog.find((x) => x.id === avatarId);
    if (item) {
      avatarUrl = buildAvatarPublic(item, req).imageUrl || "";
    }
  }
  return withEquippedBadges({ username: u.username, displayName, totalScore, avatarUrl }, req);
}

function avatarUrlForUsername(username, req) {
  const usersData = readJson(USERS_FILE, { users: [] });
  const u = (usersData.users || []).find((x) => x && x.username === username);
  if (!u) return "";
  const row = buildScoreRankingRowUser(u, req);
  return row && row.avatarUrl ? row.avatarUrl : "";
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
  const allowedModes = new Set(["survival", "level", "training", "primeComposite", "expandBrackets", "perfectSquare", "decimal"]);
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
  const allowedModes = new Set(["survival", "level", "training", "primeComposite", "expandBrackets", "perfectSquare", "decimal"]);
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
      "login.register.username.placeholder": "使用者名稱（2-20位，字母數字底線中文）",
      "login.register.password.placeholder": "密碼（至少6位）",
      "login.register.confirm.placeholder": "確認密碼",
      "login.register.submit": "註冊",
      "login.register.back": "返回登入",
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
      "home.mode.gcd": "公因數",
      "home.mode.lcm": "公倍數",
      "home.mode.wrongbook": "錯題本",
      "home.mode.stats": "數據統計",
      "home.mode.ranking": "排行榜",
      "home.mode.achievementWall": "成就牆",
      "ranking.title": "排行榜",
      "ranking.score": "等級榜",
      "ranking.survival": "生存榜",
      "ranking.primePerfect": "質數達人",
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
      "home.soon.gcd": "公因數：功能即將上線",
      "home.soon.lcm": "公倍數：功能即將上線",
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
      "login.register.username.placeholder": "Username (2-20 chars: letters, numbers, underscore, Chinese)",
      "login.register.password.placeholder": "Password (at least 6 characters)",
      "login.register.confirm.placeholder": "Confirm password",
      "login.register.submit": "Create Account",
      "login.register.back": "Back to Sign In",
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
      "home.mode.gcd": "GCF",
      "home.mode.lcm": "LCM",
      "home.mode.wrongbook": "Mistakes",
      "home.mode.stats": "Stats",
      "home.mode.ranking": "Ranks",
      "home.mode.achievementWall": "Achievements",
      "ranking.title": "Leaderboard",
      "ranking.score": "Level Rank",
      "ranking.survival": "Survival",
      "ranking.primePerfect": "Prime Master",
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
      "home.soon.gcd": "Common Factors: coming soon",
      "home.soon.lcm": "Common Multiples: coming soon",
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

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
migrateI18nScoreRankingLabels();
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
app.use(express.json({ limit: "5mb" }));
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

// 读取 JSON 文件
function readJson(filePath, defaultValue = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

// 写入 JSON 文件
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

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
    maxAge: 7 * 24 * 60 * 60 * 1000
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
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(s);
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  const name = (username || "").trim();
  const pwd = password ? String(password) : "";
  if (!name || !pwd) {
    return res.json({ ok: false, error: "请填写用户名和密码" });
  }
  if (!isValidUsername(name)) {
    return res.json({ ok: false, error: "用户名 2-20 位，仅支持字母、数字、下划线、中文" });
  }
  if (pwd.length < 6) {
    return res.json({ ok: false, error: "密码至少 6 位" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  if (data.users.some((u) => u.username === name)) {
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
    wrongAnswers: [],
    expandBracketsWrongAnswers: [],
    achievements: {},
    equippedBadges: [],
    survivalUnlocked: false,
    trainingL16Cleared: false,
    heatmapL16Passed: false,
    createdBy: "self",
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
    const runsData = readJson(RUNS_FILE, { runs: {} });
    const runs = runsData.runs[username] || [];
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    const uIdx = data.users.findIndex((u) => u.username === username);
    if (uIdx >= 0) {
      data.users[uIdx].hasClearedSurvival = user.hasClearedSurvival;
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
  const wrongAnswers = Array.isArray(user.wrongAnswers) ? user.wrongAnswers : [];
  res.json({ ok: true, wrongAnswers });
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
  const entry = normalizeWrongAnswerEntry(raw);
  u.wrongAnswers.unshift(entry);
  if (u.wrongAnswers.length > WRONGBOOK_MAX_STORE) {
    u.wrongAnswers = u.wrongAnswers.slice(0, WRONGBOOK_MAX_STORE);
  }
  writeJson(USERS_FILE, data);
  res.json({ ok: true, wrongAnswers: u.wrongAnswers });
});

app.delete("/api/user/:username/wrong-answers", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  data.users[idx].wrongAnswers = [];
  writeJson(USERS_FILE, data);
  res.json({ ok: true, wrongAnswers: [] });
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
  res.json({ ok: true });
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
    const runsData = readJson(RUNS_FILE, { runs: {} });
    const runs = runsData.runs[username] || [];
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    const idx = data.users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      data.users[idx].hasClearedSurvival = user.hasClearedSurvival;
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
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = runsData.runs[username] || [];
  const catalog = readAchievementsCatalog();
  achievementEngine.sanitizeEquippedBadges(user, catalog);
  const view = achievementEngine.buildUserAchievementsView(user, runs, catalog, { includeDisabled: false });
  view.items = view.items.map((item) => mapAchievementItemView(item, req));
  view.categoryOrder = Array.isArray(catalog.categoryOrder) ? catalog.categoryOrder.slice() : [];
  view.equippedSummary = achievementEngine.buildEquippedBadgesSummary(user, catalog).map((b) => ({
    ...b,
    imageUrl: buildAchievementImageUrl({ imagePath: b.imagePath }, req),
  }));
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
  const allowed = ["nickname", "avatarId", "levelIndex", "bestLevelIndex", "totalScore", "bestSurvivalSec", "bestScore", "recentSurvivalRuns", "recentLevelRuns", "recentTrainingRuns", "recentPrimeCompositeRuns", "recentExpandBracketsRuns", "recentPerfectSquareRuns", "recentDecimalRuns", "levelChallengeLastLevel", "levelChallengeBestLevel", "levelTrainingCurrentLevel", "levelExpandBracketsCurrentLevel", "levelExpandBracketsUnlockedMax", "levelPerfectSquareCurrentLevel", "levelPerfectSquareUnlockedMax", "levelDecimalCurrentLevel", "levelDecimalUnlockedMax", "wrongAnswers", "expandBracketsWrongAnswers", "survivalUnlocked"];
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

// ========== 学员获取自己的练习记录（完整 runs，供首页「数据统计」用），需登录且只能访问自己 ==========
app.get("/api/user/:username/runs", requireStudentAuth, ensureOwnData, (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  if (!data.users.some((u) => u.username === username)) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = (runsData.runs[username] || [])
    .map((r) => ({
      ...r,
      mode: normalizeRunMode(r.mode),
    }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
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
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const comboOnly = run.comboOnly === true;
  if (!comboOnly && !runsData.runs[username]) runsData.runs[username] = [];
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
  if (!comboOnly) {
    runsData.runs[username].unshift(runEntry);
    if (runsData.runs[username].length > 500) {
      runsData.runs[username] = runsData.runs[username].slice(0, 500);
    }
    writeJson(RUNS_FILE, runsData);
  }

  // 质数达人榜：仅统计 50 题全对（wrongCount=0）的局，每人保留最短完成时间
  if (!comboOnly && runEntry.mode === "primeComposite" && (runEntry.wrongCount ?? 0) === 0) {
    const elapsed = Number(runEntry.survivalTimeSec) || 0;
    const score = Number(runEntry.score) || 0;
    if (elapsed > 0 && score >= 250) {
      const rankingData = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
      let list = Array.isArray(rankingData.list) ? rankingData.list : [];
      const entry = { username, survivalTimeSec: elapsed, ts: runEntry.ts };
      const existing = list.find((e) => e.username === username);
      const isBetterPrime = (a, b) => {
        if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec < b.survivalTimeSec;
        return (a.ts || 0) < (b.ts || 0);
      };
      if (!existing || isBetterPrime(entry, existing)) {
        list = list.filter((e) => e.username !== username);
        list.push(entry);
        list.sort((a, b) => {
          if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
          return (a.ts || 0) - (b.ts || 0);
        });
        rankingData.list = list;
        writeJson(PRIME_PERFECT_RANKING_FILE, rankingData);
      }
    }
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
    }
    if (!comboOnly && runEntry.mode === "level") {
      const ml = Math.min(SURVIVAL_UNLOCK_L16_INDEX, Math.max(0, Number(runEntry.maxLevel) || 0));
      if (ml > (u.levelChallengeBestLevel || 0)) u.levelChallengeBestLevel = ml;
    }
    if (!comboOnly) {
      const allRuns = runsData.runs[username] || [];
      recomputeSurvivalUnlockFlags(u, allRuns);
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
  } else if (uIdx >= 0) {
    writeJson(USERS_FILE, userData);
  }

  if (uIdx >= 0) {
    const u = userData.users[uIdx];
    let newlyUnlocked = [];
    if (!comboOnly) {
      const catalog = readAchievementsCatalog();
      const allRuns = runsData.runs[username] || [];
      const evalResult = achievementEngine.evaluateUserAchievements(u, allRuns, catalog);
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

// ========== 总积分榜：按 totalScore 降序；返回前 50 + 当前用户名次（可选 ?username=） ==========
app.get("/api/score-ranking", (req, res) => {
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users.slice() : [];
  users.sort((a, b) => {
    const sa = Number(a && a.totalScore) || 0;
    const sb = Number(b && b.totalScore) || 0;
    if (sb !== sa) return sb - sa;
    return String((a && a.username) || "").localeCompare(String((b && b.username) || ""));
  });
  const top = users.slice(0, SCORE_RANKING_MAX).map((u, i) => {
    const row = buildScoreRankingRowUser(u, req);
    return row ? { rank: i + 1, ...row } : null;
  }).filter(Boolean);
  const username = (req.query.username || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (username) {
    const idx = users.findIndex((u) => u && u.username === username);
    if (idx >= 0) {
      myRank = idx + 1;
      const row = buildScoreRankingRowUser(users[idx], req);
      if (row) myEntry = { rank: myRank, ...row };
    }
  }
  res.json({
    ok: true,
    list: top,
    myRank: username ? myRank : undefined,
    myEntry: username ? myEntry : undefined,
  });
});

// ========== 生存通关排行榜：每人只保留一条最佳，全量排名；返回前 50 + 当前用户的名次与记录 ==========
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
  const usersData = readJson(USERS_FILE, { users: [] });
  const nicknameMap = {};
  (usersData.users || []).forEach((u) => {
    const n = (u.nickname || "").trim();
    nicknameMap[u.username] = n ? n : "新人";
  });
  const top50 = list.slice(0, SURVIVAL_RANKING_MAX).map((e, i) => withEquippedBadges({
    rank: i + 1,
    username: e.username,
    displayName: nicknameMap[e.username] || "新人",
    survivalTimeSec: e.survivalTimeSec ?? 0,
    wrongCount: e.wrongCount ?? 0,
    ts: e.ts,
    avatarUrl: avatarUrlForUsername(e.username, req),
  }, req));
  const username = (req.query.username || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (username) {
    const idx = list.findIndex((e) => e.username === username);
    if (idx >= 0) {
      myRank = idx + 1;
      const e = list[idx];
      myEntry = withEquippedBadges({
        rank: myRank,
        username: e.username,
        displayName: nicknameMap[e.username] || "新人",
        survivalTimeSec: e.survivalTimeSec ?? 0,
        wrongCount: e.wrongCount ?? 0,
        ts: e.ts,
        avatarUrl: avatarUrlForUsername(e.username, req),
      }, req);
    }
  }
  res.json({ ok: true, list: top50, myRank: username ? myRank : undefined, myEntry: username ? myEntry : undefined });
});

// ========== 质数达人榜：质数合数 50 题全对的最短用时；每人一条最佳；前 50 + 当前用户 ==========
function dedupeBestPrimePerfect(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const k = e.username;
    const cur = byUser[k];
    if (!cur || e.survivalTimeSec < cur.survivalTimeSec || (e.survivalTimeSec === cur.survivalTimeSec && (e.ts || 0) < (cur.ts || 0))) {
      byUser[k] = e;
    }
  });
  return Object.values(byUser);
}

app.get("/api/prime-perfect-ranking", (req, res) => {
  const data = readJson(PRIME_PERFECT_RANKING_FILE, { list: [] });
  let list = Array.isArray(data.list) ? data.list : [];
  list = dedupeBestPrimePerfect(list);
  list.sort((a, b) => {
    if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
    return (a.ts || 0) - (b.ts || 0);
  });
  const usersData = readJson(USERS_FILE, { users: [] });
  const nicknameMap = {};
  (usersData.users || []).forEach((u) => {
    const n = (u.nickname || "").trim();
    nicknameMap[u.username] = n ? n : "新人";
  });
  const top50 = list.slice(0, SURVIVAL_RANKING_MAX).map((e, i) => withEquippedBadges({
    rank: i + 1,
    username: e.username,
    displayName: nicknameMap[e.username] || "新人",
    survivalTimeSec: e.survivalTimeSec ?? 0,
    ts: e.ts,
    avatarUrl: avatarUrlForUsername(e.username, req),
  }, req));
  const username = (req.query.username || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (username) {
    const idx = list.findIndex((e) => e.username === username);
    if (idx >= 0) {
      myRank = idx + 1;
      const e = list[idx];
      myEntry = withEquippedBadges({
        rank: myRank,
        username: e.username,
        displayName: nicknameMap[e.username] || "新人",
        survivalTimeSec: e.survivalTimeSec ?? 0,
        ts: e.ts,
        avatarUrl: avatarUrlForUsername(e.username, req),
      }, req);
    }
  }
  res.json({ ok: true, list: top50, myRank: username ? myRank : undefined, myEntry: username ? myEntry : undefined });
});

// ========== 耐力榜：按“最长连续挑战天数”排名；返回前 50 + 当前用户 ==========
app.get("/api/streak-ranking", (req, res) => {
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];

  const rows = users
    .filter((u) => u && u.username)
    .map((u) => {
      return {
        username: u.username,
        displayName: (u.nickname || "").trim() ? String(u.nickname).trim() : "新人",
        streakCurrent: Number(u.streakCurrent) || 0,
        streakBest: Number(u.streakBest) || 0,
        lastActiveDate: normalizeDateKey(u.streakLastDate || ""),
        avatarUrl: avatarUrlForUsername(u.username, req),
      };
    })
    .filter((r) => r.streakBest > 0);

  rows.sort((a, b) => {
    if (b.streakBest !== a.streakBest) return b.streakBest - a.streakBest;
    if (b.streakCurrent !== a.streakCurrent) return b.streakCurrent - a.streakCurrent;
    if ((b.lastActiveDate || "") !== (a.lastActiveDate || "")) return String(b.lastActiveDate || "").localeCompare(String(a.lastActiveDate || ""));
    return String(a.username || "").localeCompare(String(b.username || ""));
  });

  const top = rows.slice(0, STREAK_RANKING_MAX).map((r, i) => withEquippedBadges({ rank: i + 1, ...r }, req));
  const username = (req.query.username || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (username) {
    const idx = rows.findIndex((r) => r.username === username);
    if (idx >= 0) {
      myRank = idx + 1;
      myEntry = withEquippedBadges({ rank: myRank, ...rows[idx] }, req);
    }
  }

  res.json({ ok: true, list: top, myRank: username ? myRank : undefined, myEntry: username ? myEntry : undefined });
});

// ========== 连击榜：按“最高连对”排名；同分按“当前连对” ==========
app.get("/api/combo-ranking", (req, res) => {
  const usersData = readJson(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];

  const rows = users
    .filter((u) => u && u.username)
    .map((u) => ({
      username: u.username,
      displayName: (u.nickname || "").trim() ? String(u.nickname).trim() : "新人",
      comboCurrent: Number(u.comboCurrent) || 0,
      comboBest: Number(u.comboBest) || 0,
      avatarUrl: avatarUrlForUsername(u.username, req),
    }))
    .filter((r) => r.comboBest > 0 || r.comboCurrent > 0);

  rows.sort((a, b) => {
    if (b.comboBest !== a.comboBest) return b.comboBest - a.comboBest;
    if (b.comboCurrent !== a.comboCurrent) return b.comboCurrent - a.comboCurrent;
    return String(a.username || "").localeCompare(String(b.username || ""));
  });

  const top = rows.slice(0, COMBO_RANKING_MAX).map((r, i) => withEquippedBadges({ rank: i + 1, ...r }, req));
  const username = (req.query.username || "").trim();
  let myRank = 0;
  let myEntry = null;
  if (username) {
    const idx = rows.findIndex((r) => r.username === username);
    if (idx >= 0) {
      myRank = idx + 1;
      myEntry = withEquippedBadges({ rank: myRank, ...rows[idx] }, req);
    }
  }
  res.json({ ok: true, list: top, myRank: username ? myRank : undefined, myEntry: username ? myEntry : undefined });
});

// ========== 管理员：获取所有学员 ==========
app.get("/api/admin/users", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const users = data.users.map((u) => {
    const out = { ...u };
    const userRuns = runsData.runs && Array.isArray(runsData.runs[u.username]) ? runsData.runs[u.username] : [];
    out.lastGameTs = latestRunTsFromRuns(userRuns);
    return safeUser(out);
  });
  res.json({ ok: true, users });
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
  const data = readJson(USERS_FILE, { users: [] });
  if (data.users.some((u) => u.username === username)) {
    return res.json({ ok: false, error: "该用户名已存在" });
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  data.users.push({
    username,
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
    recentExpandBracketsRuns: [],
    recentPerfectSquareRuns: [],
    recentDecimalRuns: [],
    wrongAnswers: [],
    expandBracketsWrongAnswers: [],
    achievements: {},
    equippedBadges: [],
    survivalUnlocked: false,
    trainingL16Cleared: false,
    heatmapL16Passed: false,
    isTester: false,
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
  const allowed = ["password", "levelIndex", "bestLevelIndex", "totalScore", "isTester"];
  for (const k of allowed) {
    if (updates[k] === undefined) continue;
    if (k === "password") {
      data.users[idx].password = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    } else if (k === "isTester") {
      data.users[idx].isTester = updates[k] === true;
    } else {
      data.users[idx][k] = updates[k];
    }
  }
  writeJson(USERS_FILE, data);
  res.json({ ok: true, user: safeUser(data.users[idx]) });
});

// ========== 管理员：删除学员 ==========
app.delete("/api/admin/users/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  data.users.splice(idx, 1);
  writeJson(USERS_FILE, data);
  const runsData = readJson(RUNS_FILE, { runs: {} });
  delete runsData.runs[username];
  writeJson(RUNS_FILE, runsData);
  res.json({ ok: true, users: data.users });
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

// ========== 管理员：获取某学员全部练习记录（生存+闯关，按时间排序） ==========
app.get("/api/admin/records/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = (runsData.runs[username] || [])
    .map((r) => ({ ...r, mode: normalizeRunMode(r.mode) }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
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
  if (user.hasClearedSurvival === undefined) {
    const runsData = readJson(RUNS_FILE, { runs: {} });
    const runs = runsData.runs[username] || [];
    user.hasClearedSurvival = userHasClearedSurvivalFromRuns(runs);
    const idx = data.users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      data.users[idx].hasClearedSurvival = user.hasClearedSurvival;
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
  const list = data.users.map((u) => u.username);
  res.json({ ok: true, users: list });
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
  return {
    n: arr.length,
    q10: quantileSorted(arr, 10),
    q25: quantileSorted(arr, 25),
    q50: quantileSorted(arr, 50),
    q75: quantileSorted(arr, 75),
    q90: quantileSorted(arr, 90),
  };
}

/** 全量扫描 runs 计算难度常模（不含 builtAt / 缓存字段）；仅全体答对 ln(耗时) 分位 */
function computeLevelCohortResult() {
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const lnTimesByLevel = Array.from({ length: COHORT_LEVEL_COUNT }, () => []);

  const usernames = Object.keys(runsData.runs || {});
  usernames.forEach((username) => {
    const runs = runsData.runs[username] || [];
    runs.forEach((r) => {
      const mode = normalizeRunMode(r.mode);
      if (mode !== "survival" && mode !== "level" && mode !== "training") return;
      if (!Array.isArray(r.attempts)) return;
      r.attempts.forEach((a) => {
        const idx = Math.max(0, Math.min(COHORT_LEVEL_COUNT - 1, Number(a.levelIndex) || 0));
        if (!a.correct) return;
        const ms = Number(a.timeSpentMs);
        if (Number.isFinite(ms) && ms > 0 && ms <= COHORT_MAX_TIME_SPENT_MS) {
          lnTimesByLevel[idx].push(Math.log(ms));
        }
      });
    });
  });

  const levels = [];
  for (let k = 0; k < COHORT_LEVEL_COUNT; k++) {
    const lnQ = summarizeQuantiles(lnTimesByLevel[k]);
    levels.push({
      levelIndex: k,
      cohortLnTimeCorrect: lnQ,
      cohortLnTimeHistogram: buildLnHistogram(lnTimesByLevel[k], COHORT_HISTOGRAM_BIN_COUNT),
    });
  }
  return {
    ok: true,
    minAttemptsForHeatmap: COHORT_MIN_ATTEMPTS_PER_USER_LEVEL,
    timeSpentMsCap: COHORT_MAX_TIME_SPENT_MS,
    timeSpentMsCapNote:
      "答对题的 timeSpentMs 超过该毫秒数（默认 1 分钟）的记录不纳入全体/个人速度侧统计（排除挂机、长时间切屏等异常偏慢）",
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
  const result = computeLevelCohortResult();
  const builtAt = Date.now();
  writeCohortLevelStatsCache(builtAt, result);
  return res.json({
    ...result,
    builtAt,
    ttlMs: COHORT_STATS_TTL_MS,
    expiresAt: builtAt + COHORT_STATS_TTL_MS,
    servedFromCache: false,
    rebuilt: true,
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
app.get("/api/admin/backup", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const users = readJson(USERS_FILE, { users: [] });
  const runs = readJson(RUNS_FILE, { runs: {} });
  const settings = readJson(SETTINGS_FILE, { levels: [] });
  const i18n = readJson(I18N_FILE, defaultI18nPayload());
  const feedback = readFeedbackStore();
  const achievementsCatalog = readAchievementsCatalog();
  const backup = { users, runs, settings, i18n, feedback, achievementsCatalog, ts: Date.now() };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=jarvis-math-backup-" + new Date().toISOString().slice(0, 10) + ".json");
  res.send(JSON.stringify(backup, null, 2));
});

// ========== 管理员：恢复/导入数据 ==========
app.post("/api/admin/restore", express.json({ limit: "5mb" }), (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.json({ ok: false, error: "无效的备份格式" });
  }
  try {
    if (body.users) {
      const u = body.users;
      writeJson(USERS_FILE, (u.users && Array.isArray(u.users)) ? u : { users: Array.isArray(u) ? u : [] });
    }
    if (body.runs) {
      const r = body.runs;
      writeJson(RUNS_FILE, (r.runs && typeof r.runs === "object") ? r : { runs: typeof r === "object" ? r : {} });
      try {
        if (fs.existsSync(COHORT_LEVEL_STATS_FILE)) fs.unlinkSync(COHORT_LEVEL_STATS_FILE);
      } catch (e2) {
        /* 忽略：常模快照删除失败不影响恢复 */
      }
    }
    if (body.settings) {
      const s = body.settings;
      writeJson(SETTINGS_FILE, (s.levels && Array.isArray(s.levels)) ? s : { levels: Array.isArray(s) ? s : [] });
    }
    if (body.i18n && typeof body.i18n === "object") {
      writeJson(I18N_FILE, normalizeI18nPayload(body.i18n));
    }
    if (body.feedback && typeof body.feedback === "object") {
      const fb = body.feedback;
      writeFeedbackStore(Array.isArray(fb.items) ? fb : { items: Array.isArray(fb) ? fb : [] });
    }
    if (body.achievementsCatalog && typeof body.achievementsCatalog === "object") {
      catalogStore.writeCatalog(body.achievementsCatalog);
    }
    res.json({ ok: true, msg: "数据已恢复" });
  } catch (e) {
    res.json({ ok: false, error: "恢复失败：" + (e.message || String(e)) });
  }
});

// ========== 管理员：回填 lastGameTs（与 runs.json 最新入库局对齐） ==========
app.post("/api/admin/maintenance/backfill-last-game-ts", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const stats = backfillLastGameTsForAllUsers();
    return res.json({ ok: true, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "回填失败：" + (e.message || String(e)) });
  }
});

// ========== 管理员：拆括号 runs 得分 1 分/题 → 5 分/题 ==========
app.post("/api/admin/maintenance/backfill-expand-brackets-score", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  try {
    const stats = backfillExpandBracketsScoresForAllUsers();
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
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = runsData.runs && Array.isArray(runsData.runs[username]) ? runsData.runs[username] : [];
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
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const catalog = readAchievementsCatalog();
  let users = usersData.users || [];
  if (targetUsername) {
    users = users.filter((u) => u && u.username === targetUsername);
  }
  let unlockedTotal = 0;
  let usersTouched = 0;
  users.forEach((user) => {
    if (!user || !user.username) return;
    const runs = runsData.runs[user.username] || [];
    const before = Object.keys(user.achievements || {}).length;
    achievementEngine.evaluateUserAchievements(user, runs, catalog);
    achievementEngine.sanitizeEquippedBadges(user, catalog);
    const after = Object.keys(user.achievements || {}).length;
    if (after > before) unlockedTotal += after - before;
    usersTouched += 1;
  });
  writeJson(USERS_FILE, usersData);
  res.json({ ok: true, usersTouched, newlyUnlockedCount: unlockedTotal });
});

app.listen(PORT, () => {
  console.log(`Jarvis Math Lab API 运行在 http://localhost:${PORT}`);
});
