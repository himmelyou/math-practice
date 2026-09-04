/**
 * 服务器权威：用热图 + runs + 年级算练习任务单并落盘。
 */
const Advice = require("./practice-advice");
const { computeTrainingNextLevelForUser } = require("./training-next-level");

function arithmeticCellsFromHeatmapPayload(payload) {
  const pack =
    payload && payload.byCategory && payload.byCategory.arithmetic ? payload.byCategory.arithmetic : null;
  const cells = pack && pack.heat && Array.isArray(pack.heat.cells) ? pack.heat.cells : [];
  return cells;
}

function levelBestFromRuns(runs) {
  let best = null;
  (runs || []).forEach(function (r) {
    if (String(r && r.mode ? r.mode : "").toLowerCase() !== "level") return;
    const ml = Number(r.maxLevel);
    if (Number.isFinite(ml) && (best == null || ml > best)) best = Math.floor(ml);
  });
  return best;
}

function systemPickFromTraining(pick) {
  if (!pick || pick.ok === false) return null;
  const levelIndex = pick.levelIndex != null && Number.isFinite(Number(pick.levelIndex)) ? Number(pick.levelIndex) : null;
  return {
    levelIndex: levelIndex,
    pickedL: levelIndex != null ? levelIndex + 1 : null,
    dayMode: pick.dayMode || null,
    pickReason: pick.pickReason || pick.reason || "",
    reason: pick.reason || "",
    ok: true,
  };
}

function studentPayload(advice) {
  const queue = (advice.queue || []).filter(function (s) {
    return s && (s.status === "active" || s.status === "pending");
  });
  return {
    ok: true,
    ruleVersion: advice.ruleVersion,
    queue: queue,
    history: Advice.historyToClientList(advice.plan),
  };
}

function computePracticePlanForUser(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const user = opts.user || {};
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cells = Array.isArray(opts.cells) ? opts.cells : [];
  const store = opts.store;
  const stored = store && username ? store.get(username) : null;
  const savedPlan = stored && stored.plan && typeof stored.plan === "object" ? stored.plan : null;

  let systemPick = opts.systemPick || null;
  if (!systemPick && opts.includeSystemPick && typeof opts.computeTrainingPick === "function") {
    try {
      systemPick = systemPickFromTraining(opts.computeTrainingPick());
    } catch (e) {
      systemPick = null;
    }
  }

  const hasClearedLevel =
    user.hasClearedLevel === true ||
    runs.some(function (r) {
      return String(r && r.mode ? r.mode : "").toLowerCase() === "level" && r.cleared === true;
    });

  const advice = Advice.computePracticeAdvice({
    username: username,
    grade: user.grade != null ? user.grade : null,
    cells: cells,
    hasClearedLevel: hasClearedLevel,
    levelChallengeBestLevel: user.levelChallengeBestLevel != null ? user.levelChallengeBestLevel : null,
    levelBestFromRuns: levelBestFromRuns(runs),
    runs: runs,
    savedPlan: savedPlan,
    resetIncomplete: opts.resetIncomplete === true,
    nowTs: opts.nowTs != null ? Number(opts.nowTs) : Date.now(),
    systemPick: systemPick,
  });

  if (store && username && advice.plan) {
    if (Advice.STORE_FULL_HISTORY !== true) {
      advice.plan.history = [];
    }
    store.set(username, { plan: advice.plan });
  }
  return advice;
}

module.exports = {
  Advice,
  arithmeticCellsFromHeatmapPayload,
  computePracticePlanForUser,
  computeTrainingNextLevelForUser,
  studentPayload,
  systemPickFromTraining,
};
