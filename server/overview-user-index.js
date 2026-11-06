/**
 * 学员概览用账号索引：写时维护，全员列表零读 runs。
 * - overviewActiveDayKeys: 中国日历日 YYYY-MM-DD 列表（剪枝保留近 60 天）
 * - trainingFluentCount: 四则热图流畅关数 0–16
 * - survivalBestLevel: 生存模式最高 maxLevel（0-based）
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const ACTIVE_KEYS_KEEP_DAYS = 60;
const TRAINING_LEVEL_COUNT = 16;

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
    return y + "-" + m + "-" + day;
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

function ensureActiveKeys(u) {
  if (!u) return [];
  if (!Array.isArray(u.overviewActiveDayKeys)) u.overviewActiveDayKeys = [];
  return u.overviewActiveDayKeys;
}

function pruneActiveDayKeys(keys, todayKey) {
  const list = Array.isArray(keys) ? keys : [];
  const kept = [];
  const seen = Object.create(null);
  list.forEach((k) => {
    const key = String(k || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || seen[key]) return;
    const age = daysBetweenDateKeys(key, todayKey);
    if (age == null || age < 0 || age > ACTIVE_KEYS_KEEP_DAYS) return;
    seen[key] = true;
    kept.push(key);
  });
  kept.sort();
  return kept;
}

/** 有对局（含 comboOnly）时打卡当日 */
function bumpOverviewActiveDay(u, runTs, nowMs) {
  if (!u) return false;
  const day = chinaDateKeyFromTs(runTs != null ? runTs : Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const keys = ensureActiveKeys(u);
  let changed = false;
  if (keys.indexOf(day) < 0) {
    keys.push(day);
    changed = true;
  }
  const pruned = pruneActiveDayKeys(keys, todayKey);
  if (pruned.length !== keys.length || pruned.some((k, i) => k !== keys[i])) {
    u.overviewActiveDayKeys = pruned;
    changed = true;
  } else {
    u.overviewActiveDayKeys = keys;
  }
  const n = countDaysActiveLast30FromUser(u, nowMs);
  if (u.daysActiveLast30 !== n) {
    u.daysActiveLast30 = n;
    changed = true;
  }
  return changed;
}

function countDaysActiveLast30FromUser(u, nowMs) {
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const keys = Array.isArray(u && u.overviewActiveDayKeys) ? u.overviewActiveDayKeys : [];
  let n = 0;
  const seen = Object.create(null);
  keys.forEach((k) => {
    const key = String(k || "");
    if (!key || seen[key]) return;
    const age = daysBetweenDateKeys(key, todayKey);
    if (age == null || age < 0 || age > 29) return;
    seen[key] = true;
    n += 1;
  });
  return n;
}

function recomputeActiveDaysFromRuns(u, runs, nowMs) {
  if (!u) return false;
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const seen = Object.create(null);
  (runs || []).forEach((r) => {
    const ts = Number(r && r.ts) || 0;
    if (ts <= 0) return;
    const key = chinaDateKeyFromTs(ts);
    if (!key || seen[key]) return;
    seen[key] = true;
  });
  const keys = pruneActiveDayKeys(Object.keys(seen), todayKey);
  u.overviewActiveDayKeys = keys;
  u.daysActiveLast30 = countDaysActiveLast30FromUser(u, nowMs);
  return true;
}

function bumpSurvivalBestLevel(u, maxLevel) {
  if (!u) return false;
  const ml = Math.floor(Number(maxLevel));
  if (!Number.isFinite(ml) || ml < 0) return false;
  const prev =
    typeof u.survivalBestLevel === "number" && Number.isFinite(u.survivalBestLevel)
      ? Math.floor(u.survivalBestLevel)
      : -1;
  if (ml > prev) {
    u.survivalBestLevel = ml;
    return true;
  }
  return false;
}

function recomputeSurvivalBestFromRuns(u, runs) {
  if (!u) return false;
  let best = -1;
  (runs || []).forEach((r) => {
    if (!r || r.comboOnly === true) return;
    if (String(r.mode || "").toLowerCase() !== "survival") return;
    const ml = Math.floor(Number(r.maxLevel));
    if (Number.isFinite(ml) && ml > best) best = ml;
  });
  if (best < 0) {
    if (u.survivalBestLevel != null) {
      delete u.survivalBestLevel;
      return true;
    }
    return false;
  }
  const prev =
    typeof u.survivalBestLevel === "number" && Number.isFinite(u.survivalBestLevel)
      ? Math.floor(u.survivalBestLevel)
      : -1;
  if (best !== prev) {
    u.survivalBestLevel = best;
    return true;
  }
  return false;
}

function countFluentFromHeat(heat) {
  const cells = (heat && heat.cells) || [];
  let fluentCount = 0;
  cells.forEach((c) => {
    if (!c || !c.active) return;
    if (c.fluent === true) {
      fluentCount += 1;
      return;
    }
    if (
      c.fluent == null &&
      c.p != null &&
      Number.isFinite(c.p) &&
      c.p >= 0.95 &&
      c.tooSlow !== true
    ) {
      fluentCount += 1;
    }
  });
  return fluentCount;
}

/**
 * @returns {{ fluentCount: number|null, ok: boolean }}
 */
function computeTrainingFluentCount(runs, opts) {
  opts = opts || {};
  let HM = opts.HM || null;
  if (!HM) {
    try {
      HM = getJmlStatsHeatmap();
    } catch (e) {
      return { fluentCount: null, ok: false };
    }
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { fluentCount: null, ok: false };
  }
  const arith = HM.filterArithmeticRuns ? HM.filterArithmeticRuns(runs || []) : runs || [];
  if (!arith.length) return { fluentCount: 0, ok: true };
  const cohort = opts.cohort && opts.cohort.ok !== false ? opts.cohort : null;
  const capMs = Number(opts.capMs) > 0 ? Number(opts.capMs) : 60 * 1000;
  const heat = HM.buildHeatmapCells({
    runs: arith,
    cohort,
    maxTimeSpentMs: capMs,
    nowTs: opts.nowMs != null ? Number(opts.nowMs) : Date.now(),
  });
  return { fluentCount: countFluentFromHeat(heat), ok: true };
}

function setTrainingFluentCount(u, fluentCount) {
  if (!u) return false;
  if (fluentCount == null || !Number.isFinite(Number(fluentCount))) {
    if (u.trainingFluentCount != null) {
      delete u.trainingFluentCount;
      return true;
    }
    return false;
  }
  const n = Math.max(0, Math.min(TRAINING_LEVEL_COUNT, Math.floor(Number(fluentCount))));
  if (u.trainingFluentCount !== n) {
    u.trainingFluentCount = n;
    return true;
  }
  return false;
}

/**
 * 局后增量：活跃日 +（非 comboOnly 时）生存最高档；算术局再算流畅数。
 */
function bumpOverviewIndexesAfterRun(u, runEntry, allRuns, opts) {
  opts = opts || {};
  if (!u || !runEntry) return false;
  let changed = bumpOverviewActiveDay(u, runEntry.ts, opts.nowMs);
  const comboOnly = runEntry.comboOnly === true;
  if (!comboOnly && String(runEntry.mode || "").toLowerCase() === "survival") {
    if (bumpSurvivalBestLevel(u, runEntry.maxLevel)) changed = true;
  }
  if (!comboOnly) {
    const mode = String(runEntry.mode || "").toLowerCase();
    const arith =
      mode === "training" || mode === "survival" || mode === "level" || mode === "";
    if (arith) {
      const got = computeTrainingFluentCount(allRuns || [], opts);
      if (got.ok && setTrainingFluentCount(u, got.fluentCount)) changed = true;
    }
  }
  return changed;
}

/** 全量从 runs 回填一人 */
function recomputeOverviewIndexesFromRuns(u, runs, opts) {
  opts = opts || {};
  if (!u) return false;
  recomputeActiveDaysFromRuns(u, runs, opts.nowMs);
  recomputeSurvivalBestFromRuns(u, runs);
  const got = computeTrainingFluentCount(runs || [], opts);
  if (got.ok) setTrainingFluentCount(u, got.fluentCount);
  else if (!Array.isArray(runs) || !runs.length) setTrainingFluentCount(u, 0);
  return true;
}

module.exports = {
  bumpOverviewActiveDay,
  countDaysActiveLast30FromUser,
  recomputeActiveDaysFromRuns,
  bumpSurvivalBestLevel,
  recomputeSurvivalBestFromRuns,
  computeTrainingFluentCount,
  setTrainingFluentCount,
  bumpOverviewIndexesAfterRun,
  recomputeOverviewIndexesFromRuns,
  TRAINING_LEVEL_COUNT,
  ACTIVE_KEYS_KEEP_DAYS,
};
