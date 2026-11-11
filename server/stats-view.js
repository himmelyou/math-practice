/**
 * 学员统计物化视图：热图 + 折线聚合 + 默认选关 hint。
 * 读路径在索引与快照一致时可零读 runs；写路径按局增量维护。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");
const { buildUserHeatmapsCached, maxRunTsForModes } = require("./user-heatmap");
const { buildUserAggCached } = require("./user-agg");

function normalizeMode(mode) {
  return String(mode || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function getHeatmapModule() {
  try {
    return getJmlStatsHeatmap();
  } catch (e) {
    return null;
  }
}

function listCategories() {
  const HM = getHeatmapModule();
  if (HM && typeof HM.getHeatmapCategories === "function") {
    const list = HM.getHeatmapCategories();
    if (Array.isArray(list) && list.length) return list;
  }
  return [
    { id: "arithmetic", modes: ["survival", "level", "training"], levelCount: 16 },
    { id: "decimal", modes: ["decimal"], levelCount: 6 },
    { id: "perfectSquare", modes: ["perfectSquare"], levelCount: 4 },
    { id: "divisibility", modes: ["divisibility"], levelCount: 4 },
    { id: "factorsMultiples", modes: ["factorsMultiples"], levelCount: 6 },
  ];
}

function categoryForMode(mode) {
  const HM = getHeatmapModule();
  if (HM && typeof HM.categoryForMode === "function") {
    return HM.categoryForMode(mode);
  }
  const m = normalizeMode(mode);
  const cats = listCategories();
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const modes = cat.modes || [];
    for (let j = 0; j < modes.length; j++) {
      if (normalizeMode(modes[j]) === m) return cat;
    }
  }
  return null;
}

function isHeatmapRelatedRun(run) {
  if (!run || run.comboOnly === true) return false;
  return !!categoryForMode(run.mode);
}

function clampLevel(levelIndex, levelCount) {
  const n = levelCount > 0 ? Math.floor(Number(levelCount)) : 16;
  const li = Math.floor(Number(levelIndex) || 0);
  if (!Number.isFinite(li)) return 0;
  return Math.max(0, Math.min(n - 1, li));
}

function selectionHintFromRun(run) {
  if (!isHeatmapRelatedRun(run)) return null;
  const cat = categoryForMode(run.mode);
  if (!cat) return null;
  let levelIndex = 0;
  if (cat.id === "divisibility" && Array.isArray(run.attempts) && run.attempts.length) {
    const lastA = run.attempts[run.attempts.length - 1];
    const HM = getHeatmapModule();
    let mapped = null;
    if (HM && typeof HM.resolveDivisibilityAttemptLevel === "function") {
      mapped = HM.resolveDivisibilityAttemptLevel(lastA);
    } else {
      const d = Math.floor(Number(lastA && lastA.divisor));
      const map = { 2: 0, 5: 0, 3: 1, 9: 1, 4: 2, 8: 2, 6: 3, 12: 3 };
      if (Number.isFinite(d) && Object.prototype.hasOwnProperty.call(map, d)) mapped = map[d];
    }
    if (mapped == null && lastA) {
      const li0 = Math.floor(Number(lastA.levelIndex));
      if (Number.isFinite(li0)) mapped = li0;
    }
    levelIndex = clampLevel(mapped != null ? mapped : 0, cat.levelCount);
  } else if (typeof run.maxLevel === "number" && Number.isFinite(run.maxLevel) && run.maxLevel >= 0) {
    levelIndex = clampLevel(run.maxLevel, cat.levelCount);
  } else if (Array.isArray(run.attempts) && run.attempts.length) {
    const last = run.attempts[run.attempts.length - 1];
    levelIndex = clampLevel(last && last.levelIndex, cat.levelCount);
  }
  return {
    categoryId: cat.id,
    levelIndex: levelIndex,
    mode: String(run.mode || ""),
    ts: Number(run.ts) || 0,
  };
}

function selectionHintFromRuns(runs) {
  let best = null;
  (runs || []).forEach(function (r) {
    if (!isHeatmapRelatedRun(r)) return;
    if (!best || (Number(r.ts) || 0) > (Number(best.ts) || 0)) best = r;
  });
  return best ? selectionHintFromRun(best) : null;
}

function ensureStatsMaxMap(user) {
  if (!user.statsMaxRunTsByCategory || typeof user.statsMaxRunTsByCategory !== "object") {
    user.statsMaxRunTsByCategory = {};
  }
  return user.statsMaxRunTsByCategory;
}

function backfillStatsIndexesFromRuns(user, runs) {
  if (!user) return false;
  const map = {};
  listCategories().forEach(function (cat) {
    if (!cat || !cat.id) return;
    map[cat.id] = maxRunTsForModes(runs, cat.modes);
  });
  user.statsMaxRunTsByCategory = map;
  const hint = selectionHintFromRuns(runs);
  if (hint) user.statsSelectionHint = hint;
  user.statsViewRevision = computeStatsRevision(user);
  return true;
}

function bumpStatsIndexesAfterRun(user, runEntry) {
  if (!user || !runEntry || runEntry.comboOnly === true) return false;
  if (!isHeatmapRelatedRun(runEntry)) return false;
  const cat = categoryForMode(runEntry.mode);
  if (!cat) return false;
  const map = ensureStatsMaxMap(user);
  const ts = Number(runEntry.ts) || 0;
  const prev = Number(map[cat.id]) || 0;
  if (ts > prev) map[cat.id] = ts;
  const hint = selectionHintFromRun(runEntry);
  if (hint) user.statsSelectionHint = hint;
  user.statsViewRevision = computeStatsRevision(user);
  return true;
}

function maxMapValue(map) {
  let m = 0;
  if (!map || typeof map !== "object") return 0;
  Object.keys(map).forEach(function (k) {
    const v = Number(map[k]) || 0;
    if (v > m) m = v;
  });
  return m;
}

function computeStatsRevision(user) {
  const fromMap = maxMapValue(user && user.statsMaxRunTsByCategory);
  const hintTs =
    user && user.statsSelectionHint ? Number(user.statsSelectionHint.ts) || 0 : 0;
  const last = Number(user && user.lastGameTs) || 0;
  return Math.max(fromMap, hintTs, last, 0);
}

function snapCoversUserIndexes(user, heatSnap, aggSnap) {
  if (!heatSnap || !aggSnap) return false;
  if (!heatSnap.byCategory || !aggSnap.byCategory) return false;
  const userMap = user && user.statsMaxRunTsByCategory;
  if (!userMap || typeof userMap !== "object") return false;
  const heatMap = heatSnap.maxRunTsByCategory || {};
  const aggMap = aggSnap.maxRunTsByCategory || {};
  const cats = listCategories();
  for (let i = 0; i < cats.length; i++) {
    const id = cats[i] && cats[i].id;
    if (!id) continue;
    const ut = Number(userMap[id]) || 0;
    const ht = Number(heatMap[id]) || 0;
    const at = Number(aggMap[id]) || 0;
    if (ut > ht || ut > at) return false;
    if (ut > 0) {
      if (!heatSnap.byCategory[id] || !heatSnap.byCategory[id].heat) return false;
      if (!aggSnap.byCategory[id]) return false;
    }
  }
  return true;
}

function heatPayloadFromSnap(username, snap) {
  if (!snap || !snap.byCategory) return null;
  const keys = Object.keys(snap.byCategory);
  if (!keys.length) return null;
  return {
    ok: true,
    error: null,
    username: username,
    at: new Date().toISOString(),
    source: "server_stats_view_cache",
    cacheHit: true,
    rebuiltCategories: [],
    categories: Array.isArray(snap.categories) ? snap.categories : [],
    byCategory: snap.byCategory,
  };
}

/**
 * 读路径：索引与双快照一致则零读 runs。
 */
function tryLoadStatsViewFromCache(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const user = opts.user;
  const heatmapCache = opts.heatmapCache;
  const aggCache = opts.aggCache;
  if (!username || !user || !heatmapCache || !aggCache) {
    return { ok: false, fresh: false };
  }
  const heatSnap = heatmapCache.get(username);
  const aggSnap = aggCache.get(username);
  if (!snapCoversUserIndexes(user, heatSnap, aggSnap)) {
    return { ok: false, fresh: false, heatSnap: heatSnap, aggSnap: aggSnap };
  }
  const heatPayload = heatPayloadFromSnap(username, heatSnap);
  if (!heatPayload) return { ok: false, fresh: false };
  return {
    ok: true,
    fresh: true,
    cacheHit: true,
    heatPayload: heatPayload,
    aggByCategory: aggSnap.byCategory || {},
    aggOk: true,
    selectionHint:
      (user.statsSelectionHint && typeof user.statsSelectionHint === "object"
        ? user.statsSelectionHint
        : null) ||
      (heatSnap.selectionHint && typeof heatSnap.selectionHint === "object"
        ? heatSnap.selectionHint
        : null),
    statsRevision: computeStatsRevision(user),
    categories: heatPayload.categories,
  };
}

/**
 * 用 runs 重建/增量热图+agg，并回写学员索引。
 */
function materializeStatsViewFromRuns(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const user = opts.user;
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const heatmapCache = opts.heatmapCache;
  const aggCache = opts.aggCache;
  const cohortsByCategory = opts.cohortsByCategory || {};
  const force = opts.force === true;

  if (user) backfillStatsIndexesFromRuns(user, runs);

  const heatBuilt = buildUserHeatmapsCached({
    username: username,
    runs: runs,
    cohortsByCategory: cohortsByCategory,
    cache: heatmapCache,
    force: force,
  });
  const aggBuilt = buildUserAggCached({
    username: username,
    runs: runs,
    cache: aggCache,
    force: force,
  });

  const hint =
    (user && user.statsSelectionHint) || selectionHintFromRuns(runs) || null;
  if (heatmapCache && username && hint) {
    try {
      const snap = heatmapCache.get(username);
      if (snap) {
        snap.selectionHint = hint;
        heatmapCache.set(username, snap);
      }
    } catch (e) {
      /* ignore */
    }
  }

  return {
    ok: !!(heatBuilt && heatBuilt.ok && aggBuilt && aggBuilt.ok),
    cacheHit: !!(heatBuilt && heatBuilt.cacheHit && aggBuilt && aggBuilt.cacheHit),
    heatPayload: {
      ok: !!heatBuilt.ok,
      error: heatBuilt.error || null,
      username: username,
      at: new Date().toISOString(),
      source: heatBuilt.cacheHit ? "server_heatmap_user_cache" : "server_buildUserHeatmapsCached",
      cacheHit: !!heatBuilt.cacheHit,
      rebuiltCategories: Array.isArray(heatBuilt.rebuiltCategories)
        ? heatBuilt.rebuiltCategories
        : [],
      categories: heatBuilt.categories || [],
      byCategory: heatBuilt.byCategory || {},
    },
    aggByCategory: (aggBuilt && aggBuilt.byCategory) || {},
    aggOk: !!(aggBuilt && aggBuilt.ok),
    selectionHint: hint,
    statsRevision: user ? computeStatsRevision(user) : 0,
    rebuiltHeat: (heatBuilt && heatBuilt.rebuiltCategories) || [],
    rebuiltAgg: (aggBuilt && aggBuilt.rebuiltCategories) || [],
  };
}

/**
 * 写局后：增量维护物化（已有 allRuns 在手）。
 */
function refreshStatsViewAfterRun(opts) {
  opts = opts || {};
  const user = opts.user;
  const runEntry = opts.runEntry;
  if (!user || !runEntry || runEntry.comboOnly === true) {
    return { ok: true, skipped: true };
  }
  if (!isHeatmapRelatedRun(runEntry)) {
    return { ok: true, skipped: true };
  }
  bumpStatsIndexesAfterRun(user, runEntry);
  return materializeStatsViewFromRuns({
    username: opts.username,
    user: user,
    runs: Array.isArray(opts.runs) ? opts.runs : [],
    heatmapCache: opts.heatmapCache,
    aggCache: opts.aggCache,
    cohortsByCategory: opts.cohortsByCategory,
    force: false,
  });
}

module.exports = {
  listCategories,
  categoryForMode,
  isHeatmapRelatedRun,
  selectionHintFromRun,
  selectionHintFromRuns,
  backfillStatsIndexesFromRuns,
  bumpStatsIndexesAfterRun,
  computeStatsRevision,
  snapCoversUserIndexes,
  tryLoadStatsViewFromCache,
  materializeStatsViewFromRuns,
  refreshStatsViewAfterRun,
};
