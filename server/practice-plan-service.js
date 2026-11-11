/**
 * 服务器权威：用热图 + runs + 年级算练习任务单并落盘。
 */
const Advice = require("./practice-advice");

function arithmeticCellsFromHeatmapPayload(payload) {
  const pack =
    payload && payload.byCategory && payload.byCategory.arithmetic ? payload.byCategory.arithmetic : null;
  const cells = pack && pack.heat && Array.isArray(pack.heat.cells) ? pack.heat.cells : [];
  return cells;
}

function modeCellsFromHeatmapPayload(payload) {
  const by = payload && payload.byCategory && typeof payload.byCategory === "object" ? payload.byCategory : {};
  const out = {};
  ["decimal", "perfectSquare", "divisibility", "factorsMultiples"].forEach(function (id) {
    const pack = by[id];
    out[id] = pack && pack.heat && Array.isArray(pack.heat.cells) ? pack.heat.cells : [];
  });
  return out;
}

function visibleArithmeticWrongCount(user) {
  if (!user) return 0;
  if (user.wrongAnswersVisibleCount != null && Number.isFinite(Number(user.wrongAnswersVisibleCount))) {
    return Math.max(0, Math.floor(Number(user.wrongAnswersVisibleCount)));
  }
  const list = Array.isArray(user.wrongAnswers) ? user.wrongAnswers : [];
  const clearedBefore = Number(user.wrongAnswersClearedBeforeTs);
  const cut = Number.isFinite(clearedBefore) && clearedBefore > 0 ? clearedBefore : 0;
  return list.filter(function (w) {
    return (Number(w && w.ts) || 0) > cut;
  }).length;
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

function studentTodayKey(advice) {
  if (advice && advice.todayKey) return String(advice.todayKey);
  if (Advice && typeof Advice.chinaDateKeyFromTs === "function") {
    return Advice.chinaDateKeyFromTs(Date.now()) || "";
  }
  return "";
}

/** 全量成功历史；排除仍在今日主列表留牌的条目。 */
function studentHistory(advice) {
  const todayKey = studentTodayKey(advice);
  const boardIds = {};
  (advice.queue || []).forEach(function (s) {
    if (!s || s.id == null) return;
    if (
      (s.status === "success" || s.status === "fail") &&
      todayKey &&
      s.chinaDay === todayKey
    ) {
      boardIds[String(s.id)] = true;
    }
  });
  function keepHistoryRow(s) {
    if (!s) return false;
    if (s.id != null && boardIds[String(s.id)]) return false;
    if (todayKey && s.chinaDay === todayKey) return false;
    return true;
  }
  const fromFull = Advice.historyToClientList(advice.plan);
  if (fromFull && fromFull.length) return fromFull.filter(keepHistoryRow);
  return (advice.queue || [])
    .filter(function (s) {
      return s && s.status === "success" && keepHistoryRow(s);
    })
    .slice()
    .reverse();
}

/** 学员端主列表：未完成 + 今日留牌（成功/失败）；历史不含今日留牌。 */
function studentPayload(advice) {
  const todayKey = studentTodayKey(advice);
  const queue = (advice.queue || []).filter(function (s) {
    if (!s) return false;
    if (s.status === "active" || s.status === "pending") return true;
    if (
      (s.status === "success" || s.status === "fail") &&
      todayKey &&
      s.chinaDay === todayKey
    ) {
      return true;
    }
    return false;
  });
  return {
    ok: true,
    ruleVersion: advice.ruleVersion,
    todayKey: todayKey,
    queue: queue,
    history: studentHistory(advice),
    lastFollow: advice.lastFollow || { kind: "none" },
  };
}

function computePracticePlanForUser(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const user = opts.user || {};
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cells = Array.isArray(opts.cells) ? opts.cells : [];
  const modeCells =
    opts.modeCells && typeof opts.modeCells === "object"
      ? opts.modeCells
      : modeCellsFromHeatmapPayload(opts.heatmapPayload || null);
  const store = opts.store;
  const stored = store && username ? store.get(username) : null;
  const savedPlan = stored && stored.plan && typeof stored.plan === "object" ? stored.plan : null;
  const snapshot = opts.snapshot === true;

  const hasClearedLevel =
    user.hasClearedLevel === true ||
    (!snapshot &&
      runs.some(function (r) {
        return String(r && r.mode ? r.mode : "").toLowerCase() === "level" && r.cleared === true;
      }));

  const wrongAnswersVisible =
    opts.wrongAnswersVisible != null
      ? Number(opts.wrongAnswersVisible)
      : visibleArithmeticWrongCount(user);

  let levelBest =
    opts.levelBestFromRuns != null && Number.isFinite(Number(opts.levelBestFromRuns))
      ? Math.floor(Number(opts.levelBestFromRuns))
      : null;
  if (levelBest == null && user.levelChallengeBestLevel != null && Number.isFinite(Number(user.levelChallengeBestLevel))) {
    levelBest = Math.floor(Number(user.levelChallengeBestLevel));
  }
  if (levelBest == null && runs.length) {
    levelBest = levelBestFromRuns(runs);
  }

  let levelClearBestSec =
    opts.levelClearBestSec != null && Number.isFinite(Number(opts.levelClearBestSec))
      ? Number(opts.levelClearBestSec)
      : null;
  if (
    levelClearBestSec == null &&
    user.levelClearBestSec != null &&
    Number.isFinite(Number(user.levelClearBestSec)) &&
    Number(user.levelClearBestSec) > 0
  ) {
    levelClearBestSec = Number(user.levelClearBestSec);
  }

  const primeFromIndex =
    user.primeCompositePlayed === true ||
    user.primeCompositeCleared === true ||
    opts.primeFromIndex === true;

  const advice = Advice.computePracticeAdvice({
    username: username,
    grade: user.grade != null ? user.grade : null,
    cells: cells,
    modeCells: modeCells,
    wrongAnswersVisible: wrongAnswersVisible,
    hasClearedLevel: hasClearedLevel,
    levelChallengeBestLevel: user.levelChallengeBestLevel != null ? user.levelChallengeBestLevel : null,
    levelBestFromRuns: levelBest,
    levelClearBestSec: levelClearBestSec,
    primePlayed: user.primeCompositePlayed === true || opts.primePlayed === true,
    primeCleared: user.primeCompositeCleared === true || opts.primeCleared === true,
    primeFromIndex: primeFromIndex,
    runs: snapshot ? [] : runs,
    savedPlan: savedPlan,
    resetIncomplete: opts.resetIncomplete === true,
    snapshot: snapshot,
    nowTs: opts.nowTs != null ? Number(opts.nowTs) : Date.now(),
  });

  if (store && username && advice.plan && opts.snapshot !== true) {
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
  modeCellsFromHeatmapPayload,
  visibleArithmeticWrongCount,
  levelBestFromRuns,
  computePracticePlanForUser,
  studentPayload,
};
