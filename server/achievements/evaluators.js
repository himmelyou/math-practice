function normalizeRunMode(mode) {
  const m = String(mode || "survival").toLowerCase();
  if (m === "practice") return "training";
  return m;
}

function countProgress(current, target) {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  const tgt = Math.max(1, Math.floor(Number(target) || 1));
  return { current: Math.min(cur, tgt), target: tgt };
}

function evaluateMinCount(current, minCount) {
  const progress = countProgress(current, minCount);
  return { met: progress.current >= progress.target, progress };
}

function isRunAbandoned(run) {
  if (!run) return true;
  if (run.abandoned === true) return true;
  if (run.trainingMeta && run.trainingMeta.abandoned === true) return true;
  return false;
}

/** 任意模式 0 错通关：非放弃、非 comboOnly、生存须 cleared；wrongCount=0 */
function isZeroWrongClearRun(run) {
  if (!run || run.comboOnly === true) return false;
  if ((run.wrongCount ?? 0) !== 0) return false;
  if (isRunAbandoned(run)) return false;
  const mode = normalizeRunMode(run.mode);
  if (mode === "survival" && run.cleared !== true) return false;
  return true;
}

/** 指定 mode 通关局：非放弃、cleared=true */
function isModeClearRun(run, mode) {
  if (!run || run.comboOnly === true) return false;
  if (isRunAbandoned(run)) return false;
  if (normalizeRunMode(run.mode) !== normalizeRunMode(mode)) return false;
  return run.cleared === true;
}

const PRIME_MASTERED_TARGET = 50;

/** 质数合数已掌握题数：新局用 mastered；旧局用 score/5 推断（每题只出现一次） */
function inferPrimeMasteredFromRun(run) {
  if (!run || run.comboOnly === true) return 0;
  if (isRunAbandoned(run)) return 0;
  if (normalizeRunMode(run.mode) !== "primecomposite") return 0;
  if (typeof run.mastered === "number" && Number.isFinite(run.mastered)) {
    return Math.min(PRIME_MASTERED_TARGET, Math.max(0, Math.floor(run.mastered)));
  }
  const elapsed = Number(run.survivalTimeSec) || 0;
  if (elapsed <= 0) return 0;
  const score = Number(run.score) || 0;
  return Math.min(PRIME_MASTERED_TARGET, Math.floor(score / 5));
}

/** 质数合数是否算「打完一局」（新局 cleared；旧局 score≥250） */
function isPrimeCompositeRunCompleted(run) {
  if (run && run.cleared === true) return true;
  const score = Number(run && run.score) || 0;
  return score >= PRIME_MASTERED_TARGET * 5;
}

/** 质数达人成就：无错通关（wrongCount=0；与榜「掌握 50 题」不同） */
function primePerfectRunQuestionCount(run) {
  if (!run || run.comboOnly === true) return 0;
  if (isRunAbandoned(run)) return 0;
  if (normalizeRunMode(run.mode) !== "primecomposite") return 0;
  if ((run.wrongCount ?? 0) !== 0) return 0;
  const elapsed = Number(run.survivalTimeSec) || 0;
  if (elapsed <= 0) return 0;
  if (!isPrimeCompositeRunCompleted(run)) return 0;
  return PRIME_MASTERED_TARGET;
}

function isPrimePerfectRun(run, questionCount) {
  const minQuestions = Math.max(1, Math.floor(Number(questionCount) || PRIME_MASTERED_TARGET));
  return primePerfectRunQuestionCount(run) >= minQuestions;
}

function any_run(params, ctx) {
  const minCount = params && params.minCount != null ? params.minCount : 1;
  return evaluateMinCount(ctx.totalRunCount || 0, minCount);
}

function mode_run_count(params, ctx) {
  const mode = normalizeRunMode(params && params.mode);
  const minCount = params && params.minCount != null ? params.minCount : 1;
  const current = (ctx.modeCounts && ctx.modeCounts[mode]) || 0;
  return evaluateMinCount(current, minCount);
}

function any_zero_wrong_clear(params, ctx) {
  void params;
  const met = !!ctx.hasZeroWrongClear;
  return {
    met,
    progress: met ? null : { current: 0, target: 1 },
  };
}

function streak_best(params, ctx) {
  const minDays = params && params.minDays != null ? params.minDays : 1;
  const current = Number(ctx.user && ctx.user.streakBest) || 0;
  return evaluateMinCount(current, minDays);
}

function ranking_any_top_n(params, ctx) {
  const maxRank = params && params.maxRank != null ? params.maxRank : 1;
  const limit = Math.max(1, Math.floor(Number(maxRank) || 1));
  const bestRank = Number(ctx.rankingBestRank) || 0;
  const met = bestRank > 0 && bestRank <= limit;
  return { met, progress: null };
}

function level_cleared(params, ctx) {
  const minCount = params && params.minCount != null ? params.minCount : 1;
  const current = Number(ctx.levelClearCount) || 0;
  return evaluateMinCount(current, minCount);
}

function survival_cleared(params, ctx) {
  const minCount = params && params.minCount != null ? params.minCount : 1;
  const current = Number(ctx.survivalClearCount) || 0;
  return evaluateMinCount(current, minCount);
}

function prime_perfect_run(params, ctx) {
  const questionCount = params && params.questionCount != null ? params.questionCount : 50;
  const minQuestions = Math.max(1, Math.floor(Number(questionCount) || 50));
  const current = Number(ctx.primePerfectMaxQuestions) || 0;
  const met = current >= minQuestions;
  return {
    met,
    progress: met ? null : { current: 0, target: 1 },
  };
}

function notImplemented() {
  return { met: false, progress: null };
}

/** ruleType → (params, ctx) => { met, progress? } */
const EVALUATORS = {
  any_run,
  mode_run_count,
  any_zero_wrong_clear,
  distinct_modes: notImplemented,
  level_challenge_best: notImplemented,
  level_cleared,
  level_perfect_run: notImplemented,
  training_heatmap_pass: notImplemented,
  wrongbook_cleared: notImplemented,
  survival_unlocked: notImplemented,
  survival_cleared,
  survival_run_best: notImplemented,
  decimal_best_level: notImplemented,
  expand_unlock_level: notImplemented,
  expand_perfect_run: notImplemented,
  perfect_square_unlock: notImplemented,
  perfect_square_perfect_run: notImplemented,
  prime_perfect_run,
  prime_run_count: notImplemented,
  streak_best,
  ranking_any_top_n,
  combo_best: notImplemented,
  player_level: notImplemented,
  ranking_top_n: notImplemented,
};

const REGISTERED_RULE_TYPES = Object.keys(EVALUATORS);
const IMPLEMENTED_RULE_TYPES = REGISTERED_RULE_TYPES.filter((key) => EVALUATORS[key] !== notImplemented);

function evaluateRule(ruleType, ruleParams, ctx) {
  const fn = EVALUATORS[ruleType];
  if (!fn) return { met: false, progress: null };
  try {
    return fn(ruleParams || {}, ctx || {});
  } catch (e) {
    return { met: false, progress: null };
  }
}

module.exports = {
  PRIME_MASTERED_TARGET,
  normalizeRunMode,
  isRunAbandoned,
  isZeroWrongClearRun,
  isModeClearRun,
  inferPrimeMasteredFromRun,
  isPrimeCompositeRunCompleted,
  isPrimePerfectRun,
  primePerfectRunQuestionCount,
  evaluateRule,
  REGISTERED_RULE_TYPES,
  IMPLEMENTED_RULE_TYPES,
  EVALUATORS,
};
