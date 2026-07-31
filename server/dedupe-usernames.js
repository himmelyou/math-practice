/**
 * 管理端临时：users 数组按用户名（大小写不敏感）去重，删掉「空壳」重复项。
 * 不碰 runs.json（同名精确匹配时成绩键共用，purge 会误删）。
 */

function userSubstanceScore(u) {
  if (!u || typeof u !== "object") return 0;
  let s = 0;
  const nick = typeof u.nickname === "string" ? u.nickname.trim() : "";
  if (nick) s += 10;
  s += Math.min(500, Math.max(0, Number(u.totalScore) || 0));
  s += Math.min(200, Math.max(0, Number(u.bestScore) || 0));
  s += Math.min(100, Math.max(0, Number(u.bestSurvivalSec) || 0));
  s += Math.min(20, Math.max(0, Number(u.bestLevelIndex) || 0));
  s += Math.min(20, Math.max(0, Number(u.levelIndex) || 0));
  const recentKeys = [
    "recentSurvivalRuns",
    "recentLevelRuns",
    "recentTrainingRuns",
    "recentPrimeCompositeRuns",
    "recentExpandBracketsRuns",
    "recentPerfectSquareRuns",
    "recentDecimalRuns",
  ];
  for (let i = 0; i < recentKeys.length; i++) {
    const arr = u[recentKeys[i]];
    if (Array.isArray(arr) && arr.length > 0) s += 5 + Math.min(20, arr.length);
  }
  if (Array.isArray(u.wrongAnswers) && u.wrongAnswers.length > 0) s += 3;
  if (u.isVip === true || u.isTester === true) s += 2;
  if (u.grade === 0 || (typeof u.grade === "number" && u.grade >= 1)) s += 1;
  if (typeof u.adminNote === "string" && u.adminNote.trim()) s += 1;
  return s;
}

/**
 * @param {object[]} users
 * @returns {{ users: object[], removed: object[], skippedConflict: object[], groupsChecked: number }}
 */
function dedupeUsernameUsers(users) {
  const list = Array.isArray(users) ? users.slice() : [];
  const groups = new Map();
  list.forEach((u, i) => {
    const name = u && u.username != null ? String(u.username) : "";
    const key = name.toLowerCase();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });

  const remove = new Set();
  const removed = [];
  const skippedConflict = [];
  let groupsChecked = 0;

  groups.forEach((idxs, key) => {
    if (idxs.length < 2) return;
    groupsChecked += 1;
    const scored = idxs.map((i) => ({
      i,
      username: list[i] && list[i].username,
      score: userSubstanceScore(list[i]),
    }));
    const rich = scored.filter((x) => x.score > 0);
    const empty = scored.filter((x) => x.score === 0);

    if (rich.length >= 2) {
      skippedConflict.push({
        key,
        usernames: scored.map((x) => x.username),
        reason: "multiple_nonempty",
      });
      return;
    }

    const toDrop = rich.length === 1 ? empty : empty.slice(1);
    toDrop.forEach((x) => {
      if (remove.has(x.i)) return;
      remove.add(x.i);
      removed.push({
        username: x.username,
        key,
        reason: rich.length === 1 ? "empty_duplicate" : "all_empty_keep_one",
      });
    });
  });

  const next = list.filter((_, i) => !remove.has(i));
  return {
    users: next,
    removed,
    skippedConflict,
    groupsChecked,
    beforeCount: list.length,
    afterCount: next.length,
  };
}

function usernameTakenCaseInsensitive(users, name) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  return (Array.isArray(users) ? users : []).some(
    (u) => u && String(u.username || "").toLowerCase() === key
  );
}

module.exports = {
  userSubstanceScore,
  dedupeUsernameUsers,
  usernameTakenCaseInsensitive,
};
