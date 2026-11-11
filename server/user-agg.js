/**
 * 报表折线聚合：按分类落盘；无新局复用；有新局只合并 ts > prevMax 的增量。
 */
const { getJmlStatsAggregate } = require("./load-jml-stats-aggregate");
const { maxRunTsForModes } = require("./user-heatmap");

const FALLBACK_CATEGORIES = [
  { id: "arithmetic", modes: ["survival", "level", "training"], levelCount: 16 },
  { id: "decimal", modes: ["decimal"], levelCount: 6 },
  { id: "perfectSquare", modes: ["perfectSquare"], levelCount: 4 },
  { id: "divisibility", modes: ["divisibility"], levelCount: 4 },
  { id: "factorsMultiples", modes: ["factorsMultiples"], levelCount: 6 },
];

function emptyLevelAgg() {
  return { total: 0, correct: 0, totalTimeMs: 0, sumLnMs: 0, nSpeed: 0 };
}

function cloneLevelAgg(L) {
  return {
    total: Number(L && L.total) || 0,
    correct: Number(L && L.correct) || 0,
    totalTimeMs: Number(L && L.totalTimeMs) || 0,
    sumLnMs: Number(L && L.sumLnMs) || 0,
    nSpeed: Number(L && L.nSpeed) || 0,
  };
}

function addIntoLevelAgg(dst, src) {
  if (!dst || !src) return dst;
  dst.total += Number(src.total) || 0;
  dst.correct += Number(src.correct) || 0;
  dst.totalTimeMs += Number(src.totalTimeMs) || 0;
  dst.sumLnMs += Number(src.sumLnMs) || 0;
  dst.nSpeed += Number(src.nSpeed) || 0;
  return dst;
}

function cloneAggResult(agg) {
  if (!agg || typeof agg !== "object") return null;
  const levelCount =
    Number(agg.levelCount) > 0
      ? Math.floor(Number(agg.levelCount))
      : Array.isArray(agg.byLevel)
        ? agg.byLevel.length
        : 0;
  if (!(levelCount > 0)) return null;
  const byLevel = Array.from({ length: levelCount }, function (_, i) {
    return cloneLevelAgg(agg.byLevel && agg.byLevel[i]);
  });
  const byDay = {};
  const srcDay = agg.byDay && typeof agg.byDay === "object" ? agg.byDay : {};
  Object.keys(srcDay).forEach(function (d) {
    const arr = srcDay[d];
    byDay[d] = Array.from({ length: levelCount }, function (_, i) {
      return cloneLevelAgg(arr && arr[i]);
    });
  });
  return {
    byLevel: byLevel,
    byDay: byDay,
    hasAny: byLevel.some(function (l) {
      return l.total > 0;
    }),
    levelCount: levelCount,
    maxTimeSpentMs: Number(agg.maxTimeSpentMs) > 0 ? Number(agg.maxTimeSpentMs) : undefined,
  };
}

function mergeAggResults(base, delta) {
  if (!base) return cloneAggResult(delta);
  if (!delta) return cloneAggResult(base);
  const out = cloneAggResult(base);
  if (!out) return cloneAggResult(delta);
  const levelCount = out.levelCount;
  for (let i = 0; i < levelCount; i++) {
    addIntoLevelAgg(out.byLevel[i], delta.byLevel && delta.byLevel[i]);
  }
  const deltaDay = delta.byDay && typeof delta.byDay === "object" ? delta.byDay : {};
  Object.keys(deltaDay).forEach(function (d) {
    if (!out.byDay[d]) {
      out.byDay[d] = Array.from({ length: levelCount }, function () {
        return emptyLevelAgg();
      });
    }
    for (let i = 0; i < levelCount; i++) {
      addIntoLevelAgg(out.byDay[d][i], deltaDay[d] && deltaDay[d][i]);
    }
  });
  out.hasAny = out.byLevel.some(function (l) {
    return l.total > 0;
  });
  if (Number(delta.maxTimeSpentMs) > 0) {
    out.maxTimeSpentMs = Number(delta.maxTimeSpentMs);
  }
  return out;
}

function resolveCategories() {
  try {
    const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");
    const HM = getJmlStatsHeatmap();
    if (HM && typeof HM.getHeatmapCategories === "function") {
      const list = HM.getHeatmapCategories();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch (e) {
    /* fallback */
  }
  return FALLBACK_CATEGORIES.slice();
}

function categoriesMeta(cats) {
  return (cats || []).map(function (c) {
    return {
      id: c.id,
      modes: c.modes,
      levelCount: c.levelCount,
      levelPrefix: c.levelPrefix,
      labelKey: c.labelKey,
      labelFallback: c.labelFallback,
    };
  });
}

function aggregateOne(Agg, cat, runs) {
  return Agg.aggregateFromRuns(runs, {
    modes: cat.modes,
    levelCount: cat.levelCount,
  });
}

function runsAfterTs(runs, prevTs) {
  const cut = Number(prevTs) || 0;
  if (!(cut > 0)) return Array.isArray(runs) ? runs : [];
  return (runs || []).filter(function (r) {
    return (Number(r && r.ts) || 0) > cut;
  });
}

/**
 * @param {object} opts
 * @param {string} [opts.username]
 * @param {Array} opts.runs
 * @param {{ get: Function, set: Function }} [opts.cache]
 * @param {boolean} [opts.force]
 */
function buildUserAggCached(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cache = opts.cache;
  const force = opts.force === true;

  let Agg;
  try {
    Agg = getJmlStatsAggregate();
  } catch (e) {
    return {
      ok: false,
      error: (e && e.message) || "aggregate unavailable",
      byCategory: {},
      categories: [],
      cacheHit: false,
      rebuiltCategories: [],
    };
  }
  if (!Agg || typeof Agg.aggregateFromRuns !== "function") {
    return {
      ok: false,
      error: "aggregate API incomplete",
      byCategory: {},
      categories: [],
      cacheHit: false,
      rebuiltCategories: [],
    };
  }

  const cats = resolveCategories();
  const meta = categoriesMeta(cats);
  const maxRunTsByCategory = {};
  cats.forEach(function (cat) {
    if (!cat || !cat.id) return;
    maxRunTsByCategory[cat.id] = maxRunTsForModes(runs, cat.modes);
  });

  const snap = !force && cache && username ? cache.get(username) : null;
  const dirtyIds = [];
  const fullRebuildIds = Object.create(null);

  cats.forEach(function (cat) {
    if (!cat || !cat.id) return;
    const maxTs = maxRunTsByCategory[cat.id] || 0;
    const prevTs =
      snap && snap.maxRunTsByCategory && Number(snap.maxRunTsByCategory[cat.id]) > 0
        ? Number(snap.maxRunTsByCategory[cat.id])
        : 0;
    const hasBlock = !!(snap && snap.byCategory && snap.byCategory[cat.id]);
    if (force || !hasBlock) {
      dirtyIds.push(cat.id);
      fullRebuildIds[cat.id] = true;
    } else if (maxTs > prevTs) {
      dirtyIds.push(cat.id);
    }
  });

  if (snap && dirtyIds.length === 0) {
    return {
      ok: true,
      byCategory: snap.byCategory || {},
      categories: Array.isArray(snap.categories) && snap.categories.length ? snap.categories : meta,
      cacheHit: true,
      rebuiltCategories: [],
    };
  }

  const byCategory = Object.assign(
    {},
    snap && snap.byCategory && typeof snap.byCategory === "object" ? snap.byCategory : {}
  );

  dirtyIds.forEach(function (id) {
    const cat = cats.find(function (c) {
      return c && c.id === id;
    });
    if (!cat) return;
    if (fullRebuildIds[id]) {
      byCategory[id] = aggregateOne(Agg, cat, runs);
      return;
    }
    const prevTs =
      snap && snap.maxRunTsByCategory && Number(snap.maxRunTsByCategory[id]) > 0
        ? Number(snap.maxRunTsByCategory[id])
        : 0;
    const deltaRuns = runsAfterTs(runs, prevTs);
    const delta = aggregateOne(Agg, cat, deltaRuns);
    byCategory[id] = mergeAggResults(snap.byCategory[id], delta);
  });

  if (cache && username) {
    try {
      cache.set(username, {
        byCategory: byCategory,
        categories: meta,
        maxRunTsByCategory: maxRunTsByCategory,
      });
    } catch (e) {
      console.warn("[user-agg] cache set failed", username, e && e.message ? e.message : e);
    }
  }

  return {
    ok: true,
    byCategory: byCategory,
    categories: meta,
    cacheHit: false,
    rebuiltCategories: dirtyIds.slice(),
  };
}

module.exports = {
  buildUserAggCached,
  mergeAggResults,
  cloneAggResult,
  emptyLevelAgg,
};
