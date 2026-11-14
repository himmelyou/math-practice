/**
 * 按分类为学员构建热图格子（权威：server/stats-heatmap-browser.js）。
 * 供学员端 / 管理端展示；与训练选关共用同一 buildHeatmapCells。
 * 可选落盘快照：无新局直接复用；有新局只重算相关分类。
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const DEFAULT_CAP_MS = 60 * 1000;

function normalizeMode(mode) {
  return String(mode || "")
    .trim()
    .toLowerCase();
}

function maxRunTsForModes(runs, modes) {
  const modeSet = Object.create(null);
  (modes || []).forEach(function (m) {
    modeSet[normalizeMode(m)] = true;
  });
  let maxTs = 0;
  (runs || []).forEach(function (r) {
    if (!r || !modeSet[normalizeMode(r.mode)]) return;
    const ts = Number(r.ts) || 0;
    if (ts > maxTs) maxTs = ts;
  });
  return maxTs;
}

function buildCategoryMeta(cat) {
  return {
    id: cat.id,
    modes: cat.modes,
    levelCount: cat.levelCount,
    levelPrefix: cat.levelPrefix,
    labelKey: cat.labelKey,
    labelFallback: cat.labelFallback,
    cohortKind: cat.cohortKind,
  };
}

function buildOneCategoryBlock(HM, cat, runs, cohorts, nowMs) {
  const cohortRaw = cohorts[cat.id];
  const cohort = cohortRaw && cohortRaw.ok ? cohortRaw : null;
  const capMs =
    cohort && Number(cohort.timeSpentMsCap) > 0 ? Number(cohort.timeSpentMsCap) : DEFAULT_CAP_MS;
  const heat = HM.buildHeatmapCells({
    runs: runs,
    cohort: cohort,
    modes: cat.modes,
    levelCount: cat.levelCount,
    maxTimeSpentMs: capMs,
    nowTs: nowMs,
  });
  const cells = (heat && heat.cells) || [];
  const cellsWithStyle = cells.map(function (c) {
    const style =
      typeof HM.heatmapCellInlineStyle === "function" ? HM.heatmapCellInlineStyle(c) || "" : "";
    return Object.assign({}, c, { cellStyle: style });
  });
  return {
    category: buildCategoryMeta(cat),
    heat: Object.assign({}, heat, { cells: cellsWithStyle }),
    cohortLoaded: !!(heat && heat.cohortLoaded),
    timeSpentMsCap: capMs,
  };
}

/**
 * @param {object} opts
 * @param {Array} opts.runs
 * @param {object} opts.cohortsByCategory { arithmetic, decimal, perfectSquare, divisibility, factorsMultiples }
 * @param {number} [opts.nowMs]
 * @param {string[]} [opts.categoryIds] 仅重算这些分类；缺省=全部
 * @returns {{ ok: boolean, byCategory: object, categories: Array, error?: string }}
 */
function buildUserHeatmapsByCategory(opts) {
  opts = opts || {};
  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return {
      ok: false,
      error: (e && e.message) || "heatmap module unavailable",
      byCategory: {},
      categories: [],
    };
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.getHeatmapCategories !== "function") {
    return { ok: false, error: "heatmap API incomplete", byCategory: {}, categories: [] };
  }

  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cohorts = opts.cohortsByCategory && typeof opts.cohortsByCategory === "object" ? opts.cohortsByCategory : {};
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const cats = HM.getHeatmapCategories();
  const onlyIds = Array.isArray(opts.categoryIds) && opts.categoryIds.length
    ? Object.create(null)
    : null;
  if (onlyIds) {
    opts.categoryIds.forEach(function (id) {
      onlyIds[String(id)] = true;
    });
  }

  const byCategory = {};
  cats.forEach(function (cat) {
    if (!cat || !cat.id) return;
    if (onlyIds && !onlyIds[cat.id]) return;
    byCategory[cat.id] = buildOneCategoryBlock(HM, cat, runs, cohorts, nowMs);
  });

  return {
    ok: true,
    byCategory: byCategory,
    categories: cats.map(function (c) {
      return {
        id: c.id,
        modes: c.modes,
        levelCount: c.levelCount,
        levelPrefix: c.levelPrefix,
        labelKey: c.labelKey,
        labelFallback: c.labelFallback,
      };
    }),
  };
}

/**
 * 带学员热图快照：无新局复用；有新局只重算脏分类。
 * @param {object} opts
 * @param {string} opts.username
 * @param {Array} opts.runs
 * @param {object} opts.cohortsByCategory
 * @param {{ get: Function, set: Function }} opts.cache
 * @param {number} [opts.nowMs]
 * @param {boolean} [opts.force]
 */
function buildUserHeatmapsCached(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cache = opts.cache;
  const force = opts.force === true;
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();

  let HM;
  try {
    HM = getJmlStatsHeatmap();
  } catch (e) {
    return {
      ok: false,
      error: (e && e.message) || "heatmap module unavailable",
      byCategory: {},
      categories: [],
      cacheHit: false,
      rebuiltCategories: [],
    };
  }
  if (!HM || typeof HM.getHeatmapCategories !== "function") {
    return {
      ok: false,
      error: "heatmap API incomplete",
      byCategory: {},
      categories: [],
      cacheHit: false,
      rebuiltCategories: [],
    };
  }

  const cats = HM.getHeatmapCategories() || [];
  const categoriesMeta = cats.map(function (c) {
    return {
      id: c.id,
      modes: c.modes,
      levelCount: c.levelCount,
      levelPrefix: c.levelPrefix,
      labelKey: c.labelKey,
      labelFallback: c.labelFallback,
    };
  });

  const maxRunTsByCategory = {};
  cats.forEach(function (cat) {
    if (!cat || !cat.id) return;
    maxRunTsByCategory[cat.id] = maxRunTsForModes(runs, cat.modes);
  });

  const snap = !force && cache && username ? cache.get(username) : null;
  const dirtyIds = [];
  cats.forEach(function (cat) {
    if (!cat || !cat.id) return;
    const maxTs = maxRunTsByCategory[cat.id] || 0;
    const prevTs =
      snap && snap.maxRunTsByCategory && Number(snap.maxRunTsByCategory[cat.id]) > 0
        ? Number(snap.maxRunTsByCategory[cat.id])
        : 0;
    const block = snap && snap.byCategory && snap.byCategory[cat.id];
    const heat = block && block.heat;
    const hasBlock = !!(heat && Array.isArray(heat.cells));
    const expectLc =
      cat.levelCount > 0 && Number.isFinite(Number(cat.levelCount))
        ? Math.floor(Number(cat.levelCount))
        : 0;
    const cachedLc = hasBlock ? heat.cells.length : 0;
    const levelCountMismatch = expectLc > 0 && cachedLc !== expectLc;
    if (force || !hasBlock || maxTs > prevTs || levelCountMismatch) dirtyIds.push(cat.id);
  });

  if (snap && dirtyIds.length === 0) {
    return {
      ok: true,
      byCategory: snap.byCategory || {},
      categories: Array.isArray(snap.categories) && snap.categories.length ? snap.categories : categoriesMeta,
      cacheHit: true,
      rebuiltCategories: [],
    };
  }

  const rebuilt = buildUserHeatmapsByCategory({
    runs: runs,
    cohortsByCategory: opts.cohortsByCategory,
    nowMs: nowMs,
    categoryIds: dirtyIds.length ? dirtyIds : null,
  });
  if (!rebuilt.ok) {
    return Object.assign({}, rebuilt, { cacheHit: false, rebuiltCategories: dirtyIds });
  }

  const byCategory = Object.assign(
    {},
    snap && snap.byCategory && typeof snap.byCategory === "object" ? snap.byCategory : {},
    rebuilt.byCategory || {}
  );

  if (cache && username) {
    try {
      cache.set(username, {
        byCategory: byCategory,
        categories: categoriesMeta,
        maxRunTsByCategory: maxRunTsByCategory,
        selectionHint:
          (opts.selectionHint && typeof opts.selectionHint === "object"
            ? opts.selectionHint
            : null) ||
          (snap && snap.selectionHint && typeof snap.selectionHint === "object"
            ? snap.selectionHint
            : null),
      });
    } catch (e) {
      console.warn("[user-heatmap] cache set failed", username, e && e.message ? e.message : e);
    }
  }

  return {
    ok: true,
    byCategory: byCategory,
    categories: categoriesMeta,
    cacheHit: false,
    rebuiltCategories: dirtyIds.slice(),
  };
}

module.exports = {
  buildUserHeatmapsByCategory,
  buildUserHeatmapsCached,
  maxRunTsForModes,
};
