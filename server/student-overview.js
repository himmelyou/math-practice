/**
 * 管理端学员概览表：各模式进度、未上线天数等
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const LEVEL_CHALLENGE_MAX_INDEX = 15;
const EXPAND_MAX_LEVEL = 4;
const PS_MAX_LEVEL = 2;
const DECIMAL_MAX_LEVEL = 4;
const PRIME_RANKING_MAX_WRONG = 5;

function formatGradeLabel(grade) {
  if (grade === null || grade === undefined || grade === "") return null;
  const n = Number(grade);
  if (!Number.isInteger(n) || n < 0 || n > 12) return null;
  if (n === 0) return "学前";
  return String(n);
}

function formatCompactRunTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? m + "m " + r + "s" : m + "m";
}

function chinaDateKeyFromTs(ts) {
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

function chinaTodayKey(nowMs) {
  return chinaDateKeyFromTs(nowMs != null ? nowMs : Date.now());
}

function daysBetweenDateKeys(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const from = Date.parse(fromKey + "T00:00:00Z");
  const to = Date.parse(toKey + "T00:00:00Z");
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

function computeDaysOffline(lastGameTs, nowMs) {
  const ts = Number(lastGameTs) || 0;
  if (ts <= 0) return null;
  const lastKey = chinaDateKeyFromTs(ts);
  const todayKey = chinaTodayKey(nowMs);
  return daysBetweenDateKeys(lastKey, todayKey);
}

function userHasClearedLevel(u, runs) {
  if (u && u.hasClearedLevel === true) return true;
  return (runs || []).some((r) => {
    const m = String(r && r.mode ? r.mode : "").toLowerCase();
    return (m === "level" || m === "") && r.cleared === true;
  });
}

function userHasClearedSurvival(u, runs) {
  if (u && u.hasClearedSurvival === true) return true;
  return (runs || []).some((r) => {
    const m = String(r && r.mode ? r.mode : "").toLowerCase();
    return m === "survival" && r.cleared === true;
  });
}

function maxSurvivalLevelFromRuns(runs) {
  let best = -1;
  (runs || []).forEach((r) => {
    if (String(r && r.mode ? r.mode : "").toLowerCase() !== "survival") return;
    const ml = Number(r.maxLevel);
    if (Number.isFinite(ml) && ml > best) best = Math.floor(ml);
  });
  return best;
}

function hasRunMode(runs, mode) {
  const want = String(mode || "").toLowerCase();
  return (runs || []).some((r) => String(r && r.mode ? r.mode : "survival").toLowerCase() === want);
}

function formatLevelChallengeProgress(u, runs) {
  if (!hasRunMode(runs, "level") && u.hasClearedLevel !== true) return { text: null, cleared: false };
  if (userHasClearedLevel(u, runs)) return { text: "通关", cleared: true };
  let best =
    typeof u.levelChallengeBestLevel === "number" && Number.isFinite(u.levelChallengeBestLevel)
      ? Math.floor(u.levelChallengeBestLevel)
      : -1;
  (runs || []).forEach((r) => {
    if (String(r && r.mode ? r.mode : "").toLowerCase() !== "level") return;
    const ml = Number(r.maxLevel);
    if (Number.isFinite(ml) && Math.floor(ml) > best) best = Math.floor(ml);
  });
  if (best < 0) return { text: null, cleared: false };
  best = Math.min(LEVEL_CHALLENGE_MAX_INDEX, Math.max(0, best));
  return { text: "L" + (best + 1), cleared: false };
}

function formatSurvivalProgress(u, runs) {
  if (!hasRunMode(runs, "survival") && u.hasClearedSurvival !== true) return { text: null, cleared: false };
  if (userHasClearedSurvival(u, runs)) return { text: "通关", cleared: true };
  const best = maxSurvivalLevelFromRuns(runs);
  if (best < 0) return { text: null, cleared: false };
  return { text: "L" + (Math.min(LEVEL_CHALLENGE_MAX_INDEX, best) + 1), cleared: false };
}

function formatSpecialModeProgress(unlockedMax, maxLevelIndex, prefix, runs, mode) {
  const hasRuns = hasRunMode(runs, mode);
  const u = Math.max(0, Math.floor(Number(unlockedMax) || 0));
  if (!hasRuns && u <= 0) return { text: null, cleared: false };
  const max = Math.max(0, Math.floor(Number(maxLevelIndex) || 0));
  const capped = Math.min(max, u);
  if (capped >= max) return { text: "通关", cleared: true };
  return { text: prefix + (capped + 1), cleared: false };
}

function formatTrainingProgress(runs, cohort, capMs, HM, todayKey) {
  if (!hasRunMode(runs, "training")) return { text: null, mode: "", reason: "" };
  if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.computeTrainingNextLevel !== "function") {
    return { text: null, mode: "", reason: "" };
  }
  const arith = HM.filterArithmeticRuns ? HM.filterArithmeticRuns(runs || []) : runs || [];
  if (!arith.length) return { text: null, mode: "", reason: "" };
  const heat = HM.buildHeatmapCells({
    runs: arith,
    cohort,
    maxTimeSpentMs: capMs,
  });
  let dayState = { dayKey: todayKey, brushMode: false, brushPoolMax: null, lastRun: null };
  if (typeof HM.reconstructTrainingDayStateFromRuns === "function") {
    dayState = HM.reconstructTrainingDayStateFromRuns(runs || [], todayKey, {
      cohort,
      maxTimeSpentMs: capMs,
    });
  }
  const result = HM.computeTrainingNextLevel(heat, dayState, todayKey);
  if (!result || result.levelIndex == null || !Number.isFinite(Number(result.levelIndex))) {
    if (result && (result.brushMode || result.mode === "brush")) {
      return { text: "刷热图", mode: "brush", reason: result.reason || "" };
    }
    return { text: null, mode: "", reason: "" };
  }
  const li = Math.min(15, Math.max(0, Math.floor(Number(result.levelIndex))));
  if (result.brushMode || result.mode === "brush") {
    return { text: "刷热图·L" + (li + 1), mode: "brush", reason: result.reason || "" };
  }
  return { text: "L" + (li + 1), mode: "daily", reason: result.reason || "" };
}

function buildPrimeRankingMap(primeList) {
  const map = {};
  (primeList || []).forEach((e) => {
    if (!e || !e.username) return;
    const wrong = Number(e.wrongCount) || 0;
    if (wrong > PRIME_RANKING_MAX_WRONG) return;
    const cur = map[e.username];
    const entry = {
      survivalTimeSec: Number(e.survivalTimeSec) || 0,
      wrongCount: wrong,
      ts: Number(e.ts) || 0,
    };
    if (!entry.survivalTimeSec) return;
    if (!cur || entry.survivalTimeSec < cur.survivalTimeSec) {
      map[e.username] = entry;
    } else if (entry.survivalTimeSec === cur.survivalTimeSec && entry.ts < cur.ts) {
      map[e.username] = entry;
    }
  });
  return map;
}

function buildStudentOverviewRows(options) {
  const users = options.users || [];
  const runsByUser = options.runsByUser || {};
  const primeList = options.primeList || [];
  const cohort = options.cohort || null;
  const capMs = options.capMs != null ? options.capMs : 60 * 1000;
  const nowMs = options.nowMs != null ? options.nowMs : Date.now();
  const todayKey = options.todayKey || chinaTodayKey(nowMs);

  let HM = null;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    console.warn("[student-overview] heatmap load failed", e.message);
  }

  const primeMap = buildPrimeRankingMap(primeList);
  const rows = [];

  users.forEach((u) => {
    if (!u || !u.username) return;
    const username = u.username;
    const runs = runsByUser[username] || [];
    const lastTs = Number(u.lastGameTs) || latestRunTsFromRuns(runs);
    const daysOff = computeDaysOffline(lastTs, nowMs);
    const levelP = formatLevelChallengeProgress(u, runs);
    const survivalP = formatSurvivalProgress(u, runs);
    const trainingP = formatTrainingProgress(runs, cohort, capMs, HM, todayKey);
    const psUnlocked =
      typeof u.levelPerfectSquareUnlockedMax === "number"
        ? u.levelPerfectSquareUnlockedMax
        : typeof u.levelPerfectSquareCurrentLevel === "number"
          ? u.levelPerfectSquareCurrentLevel
          : 0;
    const decUnlocked =
      typeof u.levelDecimalUnlockedMax === "number"
        ? u.levelDecimalUnlockedMax
        : typeof u.levelDecimalCurrentLevel === "number"
          ? u.levelDecimalCurrentLevel
          : 0;
    const expUnlocked =
      typeof u.levelExpandBracketsUnlockedMax === "number"
        ? u.levelExpandBracketsUnlockedMax
        : typeof u.levelExpandBracketsCurrentLevel === "number"
          ? u.levelExpandBracketsCurrentLevel
          : 0;
    const primeEntry = primeMap[username];

    rows.push({
      username,
      nickname: typeof u.nickname === "string" ? u.nickname.trim() : "",
      grade: u.grade != null ? u.grade : null,
      gradeLabel: formatGradeLabel(u.grade),
      adminNote: typeof u.adminNote === "string" ? u.adminNote.trim() : "",
      isVip: u.isVip === true,
      lastGameTs: lastTs > 0 ? lastTs : 0,
      daysOffline: daysOff,
      levelProgress: levelP.text,
      survivalProgress: survivalP.text,
      trainingProgress: trainingP.text,
      trainingMode: trainingP.mode,
      trainingReason: trainingP.reason,
      primeProgress: primeEntry ? formatCompactRunTime(primeEntry.survivalTimeSec) : null,
      perfectSquareProgress: formatSpecialModeProgress(psUnlocked, PS_MAX_LEVEL, "L", runs, "perfectSquare").text,
      decimalProgress: formatSpecialModeProgress(decUnlocked, DECIMAL_MAX_LEVEL, "D", runs, "decimal").text,
      expandProgress: formatSpecialModeProgress(expUnlocked, EXPAND_MAX_LEVEL, "L", runs, "expandBrackets").text,
    });
  });

  rows.sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return rows;
}

function latestRunTsFromRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  let max = 0;
  runs.forEach((r) => {
    const t = Number(r && r.ts) || 0;
    if (t > max) max = t;
  });
  return max;
}

module.exports = {
  buildStudentOverviewRows,
  formatGradeLabel,
  formatCompactRunTime,
  computeDaysOffline,
  chinaTodayKey,
};
