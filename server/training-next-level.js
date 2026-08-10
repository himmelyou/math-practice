/**
 * 训练下一关：服务端权威计算（与报表 reconstruct + computeTrainingNextLevel 同口径）
 */
const { getJmlStatsHeatmap } = require("./load-jml-stats-heatmap");
const { chinaTodayKey } = require("./student-overview");

const DEFAULT_CAP_MS = 60 * 1000;

/**
 * @param {object} opts
 * @param {Array} opts.runs 该学员全部 runs
 * @param {object|null} opts.cohort 四则常模（ok 快照）
 * @param {object|null} [opts.storedDayMode] 用户上持久化的 {dayKey,dayMode,prevDayMode}
 * @param {number} [opts.capMs]
 * @param {number} [opts.nowMs]
 * @param {string} [opts.todayKey] 默认中国日历日
 */
function computeTrainingNextLevelForUser(opts) {
  opts = opts || {};
  const HM = getJmlStatsHeatmap();
  if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.computeTrainingNextLevel !== "function") {
    return { ok: false, error: "heatmap module unavailable" };
  }
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const todayKey =
    opts.todayKey ||
    (typeof HM.localDayKeyFromTs === "function" ? HM.localDayKeyFromTs(nowMs) : chinaTodayKey(nowMs));
  const cohort = opts.cohort && opts.cohort.ok ? opts.cohort : null;
  const capMs =
    Number(opts.capMs) > 0
      ? Number(opts.capMs)
      : cohort && Number(cohort.timeSpentMsCap)
        ? Number(cohort.timeSpentMsCap)
        : DEFAULT_CAP_MS;

  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const arith = HM.filterArithmeticRuns ? HM.filterArithmeticRuns(runs) : runs;
  const heat = HM.buildHeatmapCells({
    runs: arith,
    cohort,
    maxTimeSpentMs: capMs,
    nowTs: nowMs,
  });

  let dayState = {
    dayKey: todayKey,
    dayMode: "frontier",
    prevDayMode: null,
    brushMode: false,
    brushPoolMax: null,
    lastRun: null,
    lastCompletedTrack: null,
  };
  if (typeof HM.reconstructTrainingDayStateFromRuns === "function") {
    dayState = HM.reconstructTrainingDayStateFromRuns(runs, todayKey, {
      cohort,
      maxTimeSpentMs: capMs,
    });
  }
  // 用户持久化日模式：同日以标记为准（局末写入，跨端一致）；无 runs 反推时用标记做隔日切换
  const stored = opts.storedDayMode && typeof opts.storedDayMode === "object" ? opts.storedDayMode : null;
  if (stored && typeof HM.normalizeTrainingDayState === "function") {
    if (stored.dayKey === todayKey && (stored.dayMode === "frontier" || stored.dayMode === "heat")) {
      dayState = HM.normalizeTrainingDayState(
        {
          dayKey: todayKey,
          dayMode: stored.dayMode,
          prevDayMode:
            stored.prevDayMode === "frontier" || stored.prevDayMode === "heat"
              ? stored.prevDayMode
              : dayState.prevDayMode,
          brushMode: stored.dayMode === "heat",
          lastCompletedTrack: stored.dayMode === "heat" ? "brush" : "daily",
        },
        todayKey
      );
    } else if (
      (!runs || !runs.length) &&
      stored.dayKey &&
      stored.dayKey !== todayKey
    ) {
      dayState = HM.normalizeTrainingDayState(stored, todayKey);
    }
  }

  const result = HM.computeTrainingNextLevel(heat, dayState, todayKey);
  if (!result || result.levelIndex == null || !Number.isFinite(Number(result.levelIndex))) {
    return {
      ok: false,
      error: "no_pick",
      todayKey,
      dayState,
      heat,
      result: result || null,
    };
  }

  const levelIndex = Math.min(15, Math.max(0, Math.floor(Number(result.levelIndex))));
  const dayMode = result.dayMode === "heat" || result.dayMode === "frontier" ? result.dayMode : dayState.dayMode;
  const brushMode = dayMode === "heat" || !!(result.brushMode || result.mode === "brush");
  const cell =
    heat && Array.isArray(heat.cells)
      ? heat.cells.find((c) => c && c.levelIndex === levelIndex) || heat.cells[levelIndex]
      : null;

  let heatAvgSecAtStart = null;
  let heatMeanLnAtStart = null;
  if (cell && cell.meanLnCorrect != null && Number.isFinite(Number(cell.meanLnCorrect))) {
    heatMeanLnAtStart = Number(cell.meanLnCorrect);
    const sec = Math.exp(heatMeanLnAtStart) / 1000;
    if (sec > 0 && sec < 600 && Number.isFinite(sec)) {
      heatAvgSecAtStart = Math.round(sec * 10) / 10;
    }
  }

  return {
    ok: true,
    source: "server",
    todayKey,
    levelIndex,
    brushMode,
    dayMode,
    frontierLevel: result.frontierLevel != null ? result.frontierLevel : null,
    heatLevel: result.heatLevel != null ? result.heatLevel : null,
    mode: result.mode || (brushMode ? "brush" : "daily"),
    reason: result.reason || "",
    pickReason: result.pickReason || result.reason || "",
    enterBrush: !!result.enterBrush,
    brushPoolMax: result.brushPoolMax != null ? result.brushPoolMax : brushMode ? 15 : null,
    dayState,
    result,
    heat,
    heatAvgSecAtStart,
    heatMeanLnAtStart,
    cohortLoaded: !!(heat && heat.cohortLoaded),
  };
}

module.exports = {
  computeTrainingNextLevelForUser,
};
