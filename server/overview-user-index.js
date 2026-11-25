/**
 * 学员概览用账号索引：写时维护，全员列表零读 runs。
 * - overviewActiveDayKeys: 中国日历日 YYYY-MM-DD 列表（剪枝保留近 60 天）
 * - overviewPracticeSecByDay: 日→练习秒数（剪枝近 60 天；口径同月报 habit；单局封顶）
 * - practiceSecLast30: 近 30 日练习秒数合计（可由 ByDay 重算）
 * - practiceSecRunCapSec: 写入时所用单局封顶秒数（与常量不一致则概览会重算）
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
/** 练习时长聚合：单局计入上限（防挂机墙钟），不改落库 survivalTimeSec */
const PRACTICE_DURATION_RUN_CAP_SEC = 45 * 60;

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

/** 与月报 buildHabit 一致：排除 comboOnly、memorytraining；累加 survivalTimeSec（单局封顶） */
function normalizeModeForDuration(mode) {
  return String(mode || "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function cappedPracticeDurationSec(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n <= 0) return 0;
  return Math.min(n, PRACTICE_DURATION_RUN_CAP_SEC);
}

function runCountsTowardPracticeDuration(r) {
  if (!r || r.comboOnly === true) return false;
  if (normalizeModeForDuration(r.mode) === "memorytraining") return false;
  return cappedPracticeDurationSec(r.survivalTimeSec) > 0;
}

function ensurePracticeSecByDay(u) {
  if (!u) return Object.create(null);
  if (!u.overviewPracticeSecByDay || typeof u.overviewPracticeSecByDay !== "object") {
    u.overviewPracticeSecByDay = Object.create(null);
  }
  return u.overviewPracticeSecByDay;
}

function prunePracticeSecByDay(map, todayKey) {
  const out = Object.create(null);
  const src = map && typeof map === "object" ? map : {};
  Object.keys(src).forEach((k) => {
    const key = String(k || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const age = daysBetweenDateKeys(key, todayKey);
    if (age == null || age < 0 || age > ACTIVE_KEYS_KEEP_DAYS) return;
    const sec = Math.floor(Number(src[key]) || 0);
    if (sec > 0) out[key] = sec;
  });
  return out;
}

function sumPracticeSecLast30FromMap(map, nowMs) {
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const src = map && typeof map === "object" ? map : {};
  let sum = 0;
  Object.keys(src).forEach((k) => {
    const key = String(k || "");
    if (!key) return;
    const age = daysBetweenDateKeys(key, todayKey);
    if (age == null || age < 0 || age > 29) return;
    sum += Math.max(0, Math.floor(Number(src[key]) || 0));
  });
  return sum;
}

function countPracticeSecLast30FromUser(u, nowMs) {
  return sumPracticeSecLast30FromMap(u && u.overviewPracticeSecByDay, nowMs);
}

function hasPracticeSecIndex(u) {
  return !!(
    u &&
    u.overviewPracticeSecByDay &&
    typeof u.overviewPracticeSecByDay === "object" &&
    Number(u.practiceSecRunCapSec) === PRACTICE_DURATION_RUN_CAP_SEC
  );
}

/** 局后增量：合格对局把封顶后的秒数累加到当日 */
function bumpOverviewPracticeSec(u, runEntry, nowMs) {
  if (!u || !runCountsTowardPracticeDuration(runEntry)) return false;
  const day = chinaDateKeyFromTs(runEntry.ts != null ? runEntry.ts : Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const map = ensurePracticeSecByDay(u);
  const add = cappedPracticeDurationSec(runEntry.survivalTimeSec);
  map[day] = Math.max(0, Math.floor(Number(map[day]) || 0)) + add;
  const pruned = prunePracticeSecByDay(map, todayKey);
  u.overviewPracticeSecByDay = pruned;
  u.practiceSecLast30 = sumPracticeSecLast30FromMap(pruned, nowMs);
  return true;
}

function recomputePracticeSecFromRuns(u, runs, nowMs) {
  if (!u) return false;
  const todayKey = chinaTodayKey(nowMs != null ? nowMs : Date.now());
  const raw = Object.create(null);
  (runs || []).forEach((r) => {
    if (!runCountsTowardPracticeDuration(r)) return;
    const ts = Number(r && r.ts) || 0;
    if (ts <= 0) return;
    const key = chinaDateKeyFromTs(ts);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    raw[key] =
      Math.max(0, Math.floor(Number(raw[key]) || 0)) + cappedPracticeDurationSec(r.survivalTimeSec);
  });
  const pruned = prunePracticeSecByDay(raw, todayKey);
  u.overviewPracticeSecByDay = pruned;
  u.practiceSecLast30 = sumPracticeSecLast30FromMap(pruned, nowMs);
  u.practiceSecRunCapSec = PRACTICE_DURATION_RUN_CAP_SEC;
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
 * 局后增量：活跃日 + 练习时长 +（非 comboOnly 时）生存最高档；算术局再算流畅数与闯关预计。
 */
function bumpOverviewIndexesAfterRun(u, runEntry, allRuns, opts) {
  opts = opts || {};
  if (!u || !runEntry) return false;
  let changed = bumpOverviewActiveDay(u, runEntry.ts, opts.nowMs);
  // 缺封顶标记的旧索引不能只做增量，否则脏日合计会被误标为已封顶
  if (!hasPracticeSecIndex(u)) {
    recomputePracticeSecFromRuns(u, allRuns || [], opts.nowMs);
    changed = true;
  } else if (bumpOverviewPracticeSec(u, runEntry, opts.nowMs)) {
    changed = true;
  }
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
  recomputePracticeSecFromRuns(u, runs, opts.nowMs);
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
  bumpOverviewPracticeSec,
  countPracticeSecLast30FromUser,
  sumPracticeSecLast30FromMap,
  recomputePracticeSecFromRuns,
  hasPracticeSecIndex,
  runCountsTowardPracticeDuration,
  cappedPracticeDurationSec,
  PRACTICE_DURATION_RUN_CAP_SEC,
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
