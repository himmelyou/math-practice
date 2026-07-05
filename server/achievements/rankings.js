const ALL_RANKING_BOARDS = ["score", "survival", "levelClear", "primePerfect", "streak", "combo"];

function normalizeDateKey(s) {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function dedupeBestPerUser(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const k = e.username;
    const cur = byUser[k];
    if (
      !cur ||
      e.survivalTimeSec < cur.survivalTimeSec ||
      (e.survivalTimeSec === cur.survivalTimeSec && (e.wrongCount ?? 0) < (cur.wrongCount ?? 0))
    ) {
      byUser[k] = e;
    }
  });
  return Object.values(byUser);
}

function dedupeBestPrimePerfect(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const cur = byUser[e.username];
    if (!cur || compareLevelRankingEntries(e, cur) < 0) byUser[e.username] = e;
  });
  return Object.values(byUser);
}

function rankFromSortedList(username, sortedUsernames) {
  const name = String(username || "").trim();
  if (!name) return 0;
  const idx = sortedUsernames.findIndex((u) => u === name);
  return idx >= 0 ? idx + 1 : 0;
}

function buildScoreRankingUsernames(users) {
  return (users || [])
    .filter((u) => u && u.username)
    .slice()
    .sort((a, b) => {
      const sa = Number(a.totalScore) || 0;
      const sb = Number(b.totalScore) || 0;
      if (sb !== sa) return sb - sa;
      return String(a.username || "").localeCompare(String(b.username || ""));
    })
    .map((u) => u.username);
}

function buildSurvivalRankingUsernames(survivalList) {
  let list = dedupeBestPerUser(survivalList);
  list.sort((a, b) => {
    if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
    return (a.wrongCount ?? 0) - (b.wrongCount ?? 0);
  });
  return list.map((e) => e.username);
}

function compareLevelRankingEntries(a, b) {
  const ta = Number(a && a.survivalTimeSec) || 0;
  const tb = Number(b && b.survivalTimeSec) || 0;
  if (ta !== tb) return ta - tb;
  const wa = Number(a && a.wrongCount) || 0;
  const wb = Number(b && b.wrongCount) || 0;
  if (wa !== wb) return wa - wb;
  return (Number(a && a.ts) || 0) - (Number(b && b.ts) || 0);
}

function dedupeBestLevelRanking(list) {
  const byUser = {};
  (list || []).forEach((e) => {
    if (!e || !e.username) return;
    const cur = byUser[e.username];
    if (!cur || compareLevelRankingEntries(e, cur) < 0) byUser[e.username] = e;
  });
  return Object.values(byUser);
}

function buildLevelRankingUsernames(levelList) {
  let list = dedupeBestLevelRanking(levelList);
  list.sort(compareLevelRankingEntries);
  return list.map((e) => e.username);
}

function buildPrimePerfectRankingUsernames(primeList) {
  let list = dedupeBestPrimePerfect(primeList);
  list.sort(compareLevelRankingEntries);
  return list.map((e) => e.username);
}

function buildStreakRankingUsernames(users) {
  const rows = (users || [])
    .filter((u) => u && u.username)
    .map((u) => ({
      username: u.username,
      streakCurrent: Number(u.streakCurrent) || 0,
      streakBest: Number(u.streakBest) || 0,
      lastActiveDate: normalizeDateKey(u.streakLastDate || ""),
    }))
    .filter((r) => r.streakBest > 0);
  rows.sort((a, b) => {
    if (b.streakBest !== a.streakBest) return b.streakBest - a.streakBest;
    if (b.streakCurrent !== a.streakCurrent) return b.streakCurrent - a.streakCurrent;
    if ((b.lastActiveDate || "") !== (a.lastActiveDate || "")) {
      return String(b.lastActiveDate || "").localeCompare(String(a.lastActiveDate || ""));
    }
    return String(a.username || "").localeCompare(String(b.username || ""));
  });
  return rows.map((r) => r.username);
}

function buildComboRankingUsernames(users) {
  const rows = (users || [])
    .filter((u) => u && u.username)
    .map((u) => ({
      username: u.username,
      comboCurrent: Number(u.comboCurrent) || 0,
      comboBest: Number(u.comboBest) || 0,
    }))
    .filter((r) => r.comboBest > 0 || r.comboCurrent > 0);
  rows.sort((a, b) => {
    if (b.comboBest !== a.comboBest) return b.comboBest - a.comboBest;
    if (b.comboCurrent !== a.comboCurrent) return b.comboCurrent - a.comboCurrent;
    return String(a.username || "").localeCompare(String(b.username || ""));
  });
  return rows.map((r) => r.username);
}

/** @param {{ users?: array, survivalList?: array, primeList?: array }} data */
function getUserRanksByBoard(username, data) {
  const users = data && Array.isArray(data.users) ? data.users : [];
  const survivalList = data && Array.isArray(data.survivalList) ? data.survivalList : [];
  const levelList = data && Array.isArray(data.levelList) ? data.levelList : [];
  const primeList = data && Array.isArray(data.primeList) ? data.primeList : [];
  return {
    score: rankFromSortedList(username, buildScoreRankingUsernames(users)),
    survival: rankFromSortedList(username, buildSurvivalRankingUsernames(survivalList)),
    levelClear: rankFromSortedList(username, buildLevelRankingUsernames(levelList)),
    primePerfect: rankFromSortedList(username, buildPrimePerfectRankingUsernames(primeList)),
    streak: rankFromSortedList(username, buildStreakRankingUsernames(users)),
    combo: rankFromSortedList(username, buildComboRankingUsernames(users)),
  };
}

function getBestRankAmongBoards(ranksByBoard) {
  let best = 0;
  ALL_RANKING_BOARDS.forEach((board) => {
    const rank = Number(ranksByBoard && ranksByBoard[board]) || 0;
    if (rank <= 0) return;
    if (best === 0 || rank < best) best = rank;
  });
  return best;
}

function buildRankingContextForUser(username, data) {
  const ranksByBoard = getUserRanksByBoard(username, data);
  return {
    ranksByBoard,
    bestRank: getBestRankAmongBoards(ranksByBoard),
  };
}

function isUserWithinRankOnAnyBoard(username, maxRank, data) {
  const limit = Math.max(1, Math.floor(Number(maxRank) || 1));
  const ranksByBoard = getUserRanksByBoard(username, data);
  return ALL_RANKING_BOARDS.some((board) => {
    const rank = Number(ranksByBoard[board]) || 0;
    return rank > 0 && rank <= limit;
  });
}

module.exports = {
  ALL_RANKING_BOARDS,
  buildRankingContextForUser,
  getUserRanksByBoard,
  getBestRankAmongBoards,
  isUserWithinRankOnAnyBoard,
};
