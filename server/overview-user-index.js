/**
 * 学员概览用账号索引：写时维护，全员列表零读 runs。
 * - overviewActiveDayKeys: 中国日历日 YYYY-MM-DD 列表（剪枝保留近 60 天）
 * - trainingFluentCount: 四则热图流畅关数 0–16
 * - trainingFluentCohortBuiltAt: 算出流畅数时所用四则常模 builtAt（常模更新后概览可据此重算）
 * - levelClearEstimateSec: 热图预估全通秒数（L1–L16 avgSec×10×1.1；缺格为无字段）
 * - survivalBestLevel: 生存模式最高 maxLevel（0-based）
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");

const ACTIVE_KEYS_KEEP_DAYS = 60;
const TRAINING_LEVEL_COUNT = 16;
/** 与 practice-advice estimateClearSec 一致 */
const SCAN_CLEAR_ITEMS = 10;
const SCAN_CLEAR_OVERHEAD = 1.1;

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
      Math.round(Number(c.p) * 1000) / 1000 >= 0.95 &&
      c.tooSlow !== true
    ) {
      fluentCount += 1;
    }
  });
  return fluentCount;
}

/** 与 practice-advice.avgSecFromCell 对齐 */
function avgSecFromCell(cell) {
  if (!cell) return null;
  if (cell.meanLnCorrect != null && Number.isFinite(Number(cell.meanLnCorrect))) {
    const sec = Math.exp(Number(cell.meanLnCorrect)) / 1000;
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }
  if (cell.avgSec != null && Number.isFinite(Number(cell.avgSec))) {
    const a = Number(cell.avgSec);
    return a > 0 ? a : null;
  }
  if (typeof cell.avgSecText === "string") {
    const m = cell.avgSecText.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

function cellAtLevel(cells, levelIndex) {
  const list = Array.isArray(cells) ? cells : [];
  const k = Math.floor(Number(levelIndex));
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].levelIndex === k) return list[i];
  }
  return list[k] || null;
}

/**
 * 闯关全通估时（秒）：L1–L16 均有 avgSec 才出数；与热图建议页 estimateClearSec 同公式。
 * @returns {number|null}
 */
function estimateClearSecFromHeat(heat) {
  const cells = (heat && heat.cells) || [];
  let sum = 0;
  for (let i = 0; i < TRAINING_LEVEL_COUNT; i += 1) {
    const sec = avgSecFromCell(cellAtLevel(cells, i));
    if (sec == null || sec <= 0) return null;
    sum += sec;
  }
  const est = sum * SCAN_CLEAR_ITEMS * SCAN_CLEAR_OVERHEAD;
  return Number.isFinite(est) && est > 0 ? est : null;
}

/**
 * @returns {{ fluentCount: number|null, clearEstimateSec: number|null, ok: boolean }}
 */
function computeTrainingFluentCount(runs, opts) {
  opts = opts || {};
  let HM = opts.HM || null;
  if (!HM) {
    try {
      HM = getJmlStatsHeatmap();
    } catch (e) {
      return { fluentCount: null, clearEstimateSec: null, ok: false };
    }
  }
  if (!HM || typeof HM.buildHeatmapCells !== "function") {
    return { fluentCount: null, clearEstimateSec: null, ok: false };
  }
  const arith = HM.filterArithmeticRuns ? HM.filterArithmeticRuns(runs || []) : runs || [];
  if (!arith.length) return { fluentCount: 0, clearEstimateSec: null, ok: true };
  const cohort = opts.cohort && opts.cohort.ok !== false ? opts.cohort : null;
  const capMs = Number(opts.capMs) > 0 ? Number(opts.capMs) : 60 * 1000;
  const heat = HM.buildHeatmapCells({
    runs: arith,
    cohort,
    maxTimeSpentMs: capMs,
    nowTs: opts.nowMs != null ? Number(opts.nowMs) : Date.now(),
  });
  return {
    fluentCount: countFluentFromHeat(heat),
    clearEstimateSec: estimateClearSecFromHeat(heat),
    ok: true,
  };
}

/** 流畅索引是否相对当前四则常模过期（无常模 builtAt 时不强制重算） */
function isTrainingFluentCohortStale(u, cohortBuiltAt) {
  if (cohortBuiltAt == null || !Number.isFinite(Number(cohortBuiltAt))) return false;
  if (!u || u.trainingFluentCount == null || !Number.isFinite(Number(u.trainingFluentCount))) {
    return true;
  }
  const stamped = Number(u.trainingFluentCohortBuiltAt);
  if (!Number.isFinite(stamped)) return true;
  return stamped !== Number(cohortBuiltAt);
}

/**
 * @param {object} u
 * @param {number|null} fluentCount
 * @param {number} [cohortBuiltAt] 四则常模缓存 builtAt
 */
function setTrainingFluentCount(u, fluentCount, cohortBuiltAt) {
  if (!u) return false;
  if (fluentCount == null || !Number.isFinite(Number(fluentCount))) {
    let cleared = false;
    if (u.trainingFluentCount != null) {
      delete u.trainingFluentCount;
      cleared = true;
    }
    if (u.trainingFluentCohortBuiltAt != null) {
      delete u.trainingFluentCohortBuiltAt;
      cleared = true;
    }
    return cleared;
  }
  const n = Math.max(0, Math.min(TRAINING_LEVEL_COUNT, Math.floor(Number(fluentCount))));
  let changed = false;
  if (u.trainingFluentCount !== n) {
    u.trainingFluentCount = n;
    changed = true;
  }
  if (cohortBuiltAt != null && Number.isFinite(Number(cohortBuiltAt))) {
    const b = Number(cohortBuiltAt);
    if (u.trainingFluentCohortBuiltAt !== b) {
      u.trainingFluentCohortBuiltAt = b;
      changed = true;
    }
  }
  return changed;
}

/**
 * @param {object} u
 * @param {number|null} clearEstimateSec 原始估时秒；写入时 round 成整数
 */
function setLevelClearEstimateSec(u, clearEstimateSec) {
  if (!u) return false;
  if (clearEstimateSec == null || !Number.isFinite(Number(clearEstimateSec)) || Number(clearEstimateSec) <= 0) {
    if (u.levelClearEstimateSec != null) {
      delete u.levelClearEstimateSec;
      return true;
    }
    return false;
  }
  const n = Math.max(1, Math.round(Number(clearEstimateSec)));
  if (u.levelClearEstimateSec !== n) {
    u.levelClearEstimateSec = n;
    return true;
  }
  return false;
}

/** 从热图 payload（byCategory.arithmetic.heat）回写闯关预计 */
function setLevelClearEstimateFromHeatPayload(u, heatPayload) {
  if (!u || !heatPayload || heatPayload.ok === false) return false;
  const pack =
    heatPayload.byCategory && heatPayload.byCategory.arithmetic
      ? heatPayload.byCategory.arithmetic
      : null;
  const heat = pack && pack.heat ? pack.heat : null;
  return setLevelClearEstimateSec(u, estimateClearSecFromHeat(heat));
}

/**
 * 零重建：仅当热图用户缓存命中时取闯关预计（缺格 → clearEstimateSec null，ok 仍为 true）。
 * 无缓存 → ok false，调用方不要改索引。
 */
function peekLevelClearEstimateFromHeatCache(username, heatmapCache) {
  if (!username || !heatmapCache || typeof heatmapCache.get !== "function") {
    return { ok: false, clearEstimateSec: null };
  }
  try {
    const snap = heatmapCache.get(String(username));
    if (!snap || !snap.byCategory || typeof snap.byCategory !== "object") {
      return { ok: false, clearEstimateSec: null };
    }
    const pack = snap.byCategory.arithmetic;
    const heat = pack && pack.heat ? pack.heat : null;
    if (!heat) return { ok: false, clearEstimateSec: null };
    return { ok: true, clearEstimateSec: estimateClearSecFromHeat(heat) };
  } catch (e) {
    return { ok: false, clearEstimateSec: null };
  }
}

/**
 * 局后增量：活跃日 +（非 comboOnly 时）生存最高档；算术局再算流畅数与闯关预计。
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
      if (got.ok) {
        if (setTrainingFluentCount(u, got.fluentCount, opts.cohortBuiltAt)) changed = true;
        if (setLevelClearEstimateSec(u, got.clearEstimateSec)) changed = true;
      }
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
  if (got.ok) {
    setTrainingFluentCount(u, got.fluentCount, opts.cohortBuiltAt);
    setLevelClearEstimateSec(u, got.clearEstimateSec);
  } else if (!Array.isArray(runs) || !runs.length) {
    setTrainingFluentCount(u, 0, opts.cohortBuiltAt);
    setLevelClearEstimateSec(u, null);
  }
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
  setLevelClearEstimateSec,
  setLevelClearEstimateFromHeatPayload,
  peekLevelClearEstimateFromHeatCache,
  estimateClearSecFromHeat,
  isTrainingFluentCohortStale,
  bumpOverviewIndexesAfterRun,
  recomputeOverviewIndexesFromRuns,
  TRAINING_LEVEL_COUNT,
  ACTIVE_KEYS_KEEP_DAYS,
};
