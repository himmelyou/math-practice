const { evaluateRule, normalizeRunMode, isZeroWrongClearRun } = require("./evaluators");

const MAX_EQUIPPED_BADGES = 3;
const ACHIEVEMENT_STATS_VERSION = 2;

function ensureUserAchievementFields(user) {
  if (!user) return;
  if (!user.achievements || typeof user.achievements !== "object") user.achievements = {};
  if (!Array.isArray(user.equippedBadges)) user.equippedBadges = [];
}

function rebuildAchievementStatsFromRuns(runs) {
  const validRuns = (runs || []).filter((r) => r && r.comboOnly !== true);
  const modeCounts = {};
  let hasZeroWrongClear = false;
  validRuns.forEach((r) => {
    const mode = normalizeRunMode(r.mode);
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    if (!hasZeroWrongClear && isZeroWrongClearRun(r)) hasZeroWrongClear = true;
  });
  return {
    totalRunCount: validRuns.length,
    modeCounts,
    hasZeroWrongClear,
  };
}

function hasValidAchievementStats(user) {
  return (
    user &&
    user.achievementStatsVersion === ACHIEVEMENT_STATS_VERSION &&
    user.achievementStats &&
    typeof user.achievementStats.totalRunCount === "number" &&
    user.achievementStats.modeCounts &&
    typeof user.achievementStats.modeCounts === "object" &&
    typeof user.achievementStats.hasZeroWrongClear === "boolean"
  );
}

/** 从 runs 回填并写入 user；返回是否新写入 */
function ensureAchievementStats(user, runs) {
  if (!user) return false;
  if (hasValidAchievementStats(user)) return false;
  user.achievementStats = rebuildAchievementStatsFromRuns(runs);
  user.achievementStatsVersion = ACHIEVEMENT_STATS_VERSION;
  return true;
}

function bumpAchievementStatsFromRun(user, runEntry) {
  if (!user || !runEntry || runEntry.comboOnly === true) return;
  if (!hasValidAchievementStats(user)) {
    user.achievementStats = { totalRunCount: 0, modeCounts: {}, hasZeroWrongClear: false };
    user.achievementStatsVersion = ACHIEVEMENT_STATS_VERSION;
  }
  const mode = normalizeRunMode(runEntry.mode);
  user.achievementStats.totalRunCount = Math.max(0, (user.achievementStats.totalRunCount || 0) + 1);
  const mc = user.achievementStats.modeCounts || {};
  mc[mode] = (mc[mode] || 0) + 1;
  user.achievementStats.modeCounts = mc;
  if (!user.achievementStats.hasZeroWrongClear && isZeroWrongClearRun(runEntry)) {
    user.achievementStats.hasZeroWrongClear = true;
  }
}

function assignAchievementStatsFromRuns(user, runs) {
  if (!user) return;
  user.achievementStats = rebuildAchievementStatsFromRuns(runs);
  user.achievementStatsVersion = ACHIEVEMENT_STATS_VERSION;
}

function buildAchievementContext(user, runs, options) {
  ensureAchievementStats(user, runs || []);
  const stats = (user && user.achievementStats) || {
    totalRunCount: 0,
    modeCounts: {},
    hasZeroWrongClear: false,
  };
  const rankingCtx = options && options.rankingCtx ? options.rankingCtx : null;
  return {
    user: user || {},
    runs: [],
    totalRunCount: stats.totalRunCount || 0,
    modeCounts: stats.modeCounts || {},
    hasZeroWrongClear: !!stats.hasZeroWrongClear,
    rankingBestRank: rankingCtx ? Number(rankingCtx.bestRank) || 0 : 0,
    rankingRanksByBoard: rankingCtx && rankingCtx.ranksByBoard ? rankingCtx.ranksByBoard : {},
  };
}

function evaluateUserAchievements(user, runs, catalog, options) {
  ensureUserAchievementFields(user);
  const ctx = buildAchievementContext(user, runs, options);
  const newlyUnlocked = [];
  const items = (catalog.items || []).filter((item) => item.enabled);

  items.forEach((item) => {
    if (user.achievements[item.id]) return;
    const result = evaluateRule(item.ruleType, item.ruleParams, ctx);
    if (!result.met) return;
    const unlockedAt = Date.now();
    user.achievements[item.id] = unlockedAt;
    const xpReward = Math.max(0, Math.floor(Number(item.xpReward) || 0));
    if (xpReward > 0) {
      user.totalScore = (Number(user.totalScore) || 0) + xpReward;
    }
    newlyUnlocked.push({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || "",
      icon: item.icon,
      xpReward,
      unlockedAt,
    });
  });

  return { newlyUnlocked, ctx };
}

function buildAchievementItemView(item, user, ctx) {
  const unlockedAt = user.achievements && user.achievements[item.id] ? user.achievements[item.id] : 0;
  const unlocked = unlockedAt > 0;
  let progress = null;
  if (!unlocked) {
    const result = evaluateRule(item.ruleType, item.ruleParams, ctx);
    progress = result.progress || null;
  }
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn || "",
    icon: item.icon,
    imagePath: item.imagePath || "",
    category: item.category,
    hint: item.hint,
    hintEn: item.hintEn || "",
    xpReward: item.xpReward,
    sortOrder: item.sortOrder,
    ruleType: item.ruleType,
    ruleParams: item.ruleParams,
    enabled: item.enabled !== false,
    unlocked,
    unlockedAt: unlocked ? unlockedAt : 0,
    progress,
  };
}

function buildUserAchievementsView(user, runs, catalog, options) {
  ensureUserAchievementFields(user);
  const includeDisabled = !!(options && options.includeDisabled);
  const ctx = buildAchievementContext(user, runs, options);
  const items = (catalog.items || [])
    .filter((item) => includeDisabled || item.enabled)
    .map((item) => buildAchievementItemView(item, user, ctx));
  return {
    achievements: user.achievements,
    equippedBadges: user.equippedBadges.slice(0, MAX_EQUIPPED_BADGES),
    items,
  };
}

function buildEquippedBadgesSummary(user, catalog) {
  ensureUserAchievementFields(user);
  const map = new Map((catalog.items || []).map((item) => [item.id, item]));
  return (user.equippedBadges || [])
    .slice(0, MAX_EQUIPPED_BADGES)
    .map((id) => {
      const item = map.get(id);
      if (!item || !user.achievements[id]) return null;
      return {
        id: item.id,
        name: item.name,
        nameEn: item.nameEn || "",
        icon: item.icon,
        imagePath: item.imagePath || "",
      };
    })
    .filter(Boolean);
}

function sanitizeEquippedBadges(user, catalog) {
  ensureUserAchievementFields(user);
  const map = new Map((catalog.items || []).map((item) => [item.id, item]));
  const seen = new Set();
  const next = [];
  (user.equippedBadges || []).forEach((rawId) => {
    const id = String(rawId || "").trim();
    if (!id || seen.has(id)) return;
    if (!map.has(id)) return;
    if (!user.achievements[id]) return;
    seen.add(id);
    next.push(id);
    if (next.length >= MAX_EQUIPPED_BADGES) return;
  });
  user.equippedBadges = next.slice(0, MAX_EQUIPPED_BADGES);
  return user.equippedBadges;
}

function setEquippedBadges(user, catalog, badgeIds) {
  ensureUserAchievementFields(user);
  const map = new Map((catalog.items || []).map((item) => [item.id, item]));
  const seen = new Set();
  const next = [];
  (Array.isArray(badgeIds) ? badgeIds : []).forEach((rawId) => {
    const id = String(rawId || "").trim();
    if (!id || seen.has(id)) return;
    if (!map.has(id) || !map.get(id).enabled) return;
    if (!user.achievements[id]) return;
    seen.add(id);
    next.push(id);
  });
  if (next.length > MAX_EQUIPPED_BADGES) {
    const err = new Error("最多佩戴 3 枚徽章");
    err.code = "TOO_MANY_BADGES";
    throw err;
  }
  user.equippedBadges = next;
  return user.equippedBadges;
}

/** 开发期：从全部学员移除某成就的解锁与佩戴（不扣 totalScore） */
function purgeAchievementFromAllUsers(users, achievementId) {
  const id = String(achievementId || "").trim();
  if (!id) return { usersTouched: 0, recordsRemoved: 0 };
  let usersTouched = 0;
  let recordsRemoved = 0;
  (users || []).forEach((user) => {
    if (!user) return;
    ensureUserAchievementFields(user);
    let changed = false;
    if (user.achievements && Object.prototype.hasOwnProperty.call(user.achievements, id)) {
      delete user.achievements[id];
      recordsRemoved += 1;
      changed = true;
    }
    const beforeLen = (user.equippedBadges || []).length;
    user.equippedBadges = (user.equippedBadges || []).filter((badgeId) => String(badgeId || "").trim() !== id);
    if (user.equippedBadges.length !== beforeLen) changed = true;
    if (changed) usersTouched += 1;
  });
  return { usersTouched, recordsRemoved };
}

module.exports = {
  MAX_EQUIPPED_BADGES,
  ACHIEVEMENT_STATS_VERSION,
  ensureUserAchievementFields,
  rebuildAchievementStatsFromRuns,
  hasValidAchievementStats,
  ensureAchievementStats,
  bumpAchievementStatsFromRun,
  assignAchievementStatsFromRuns,
  buildAchievementContext,
  evaluateUserAchievements,
  buildUserAchievementsView,
  buildEquippedBadgesSummary,
  sanitizeEquippedBadges,
  setEquippedBadges,
  purgeAchievementFromAllUsers,
};
