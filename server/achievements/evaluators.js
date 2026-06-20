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

function notImplemented() {
  return { met: false, progress: null };
}

/** ruleType → (params, ctx) => { met, progress? } */
const EVALUATORS = {
  any_run,
  mode_run_count,
  distinct_modes: notImplemented,
  level_challenge_best: notImplemented,
  level_perfect_run: notImplemented,
  training_heatmap_pass: notImplemented,
  wrongbook_cleared: notImplemented,
  survival_unlocked: notImplemented,
  survival_cleared: notImplemented,
  survival_run_best: notImplemented,
  decimal_best_level: notImplemented,
  expand_unlock_level: notImplemented,
  expand_perfect_run: notImplemented,
  perfect_square_unlock: notImplemented,
  perfect_square_perfect_run: notImplemented,
  prime_perfect_run: notImplemented,
  prime_run_count: notImplemented,
  streak_best: notImplemented,
  combo_best: notImplemented,
  player_level: notImplemented,
  ranking_top_n: notImplemented,
};

const REGISTERED_RULE_TYPES = Object.keys(EVALUATORS);

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
  normalizeRunMode,
  evaluateRule,
  REGISTERED_RULE_TYPES,
  EVALUATORS,
};
