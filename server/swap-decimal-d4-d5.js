/**
 * 小数 D4/D5 内容对调后的历史迁移：runs / 错题 / recentDecimalRuns 的 levelIndex 3↔4。
 * 不改 levelDecimalUnlockedMax / currentLevel。
 * 幂等：由调用方写入 adminMeta.decimalD4D5SwappedAt。
 */
function normalizeMode(mode) {
  return String(mode || "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function isDecimalMode(mode) {
  return normalizeMode(mode) === "decimal";
}

/** @returns {number|null} 若需对调返回新值，否则 null */
function swapD4D5Index(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return null;
  if (v === 3) return 4;
  if (v === 4) return 3;
  return null;
}

function decimalLevelLabel(levelIndex) {
  const v = Math.floor(Number(levelIndex));
  if (!Number.isFinite(v) || v < 0) return "";
  return "D" + (v + 1);
}

function remapRun(run) {
  if (!run || !isDecimalMode(run.mode)) return { changed: false, attempts: 0 };
  let changed = false;
  let attempts = 0;

  const nextMax = swapD4D5Index(run.maxLevel);
  if (nextMax != null) {
    run.maxLevel = nextMax;
    changed = true;
  }

  if (Array.isArray(run.attempts)) {
    run.attempts.forEach((a) => {
      if (!a) return;
      const next = swapD4D5Index(a.levelIndex);
      if (next != null) {
        a.levelIndex = next;
        changed = true;
        attempts += 1;
      }
    });
  }

  const meta = run.trainingMeta;
  if (meta && typeof meta === "object") {
    ["pickedLevel", "pickedLevelIndex", "levelIndex"].forEach((key) => {
      if (meta[key] == null) return;
      const next = swapD4D5Index(meta[key]);
      if (next != null) {
        meta[key] = next;
        changed = true;
      }
    });
  }

  return { changed, attempts };
}

function remapWrongList(list) {
  let n = 0;
  if (!Array.isArray(list)) return n;
  list.forEach((w) => {
    if (!w || !isDecimalMode(w.mode)) return;
    const next = swapD4D5Index(w.levelIndex);
    if (next == null) return;
    w.levelIndex = next;
    w.levelLabel = decimalLevelLabel(next);
    n += 1;
  });
  return n;
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   forEachUserRuns: (fn: (username: string, runs: array) => void) => void,
 *   setUserRuns: (username: string, runs: array) => void,
 *   users: array,
 *   practicePlanStore?: { listUsernames: () => string[], get: (u: string) => object|null, set: (u: string, payload: object) => void },
 * }} opts
 */
function swapDecimalD4D5(opts) {
  const dryRun = !!(opts && opts.dryRun);
  const forEachUserRuns = opts.forEachUserRuns;
  const setUserRuns = opts.setUserRuns;
  const users = Array.isArray(opts.users) ? opts.users : [];
  const practicePlanStore = opts.practicePlanStore || null;

  const stats = {
    dryRun,
    usersScanned: 0,
    runUsersTouched: 0,
    runsRemapped: 0,
    attemptsRemapped: 0,
    wrongAnswersRemapped: 0,
    recentDecimalRemapped: 0,
    practicePlanUsersTouched: 0,
    practicePlanEntriesRemapped: 0,
  };

  forEachUserRuns((username, runs) => {
    stats.usersScanned += 1;
    if (!Array.isArray(runs) || !runs.length) return;
    let userChanged = false;
    let userRuns = 0;
    let userAttempts = 0;
    runs.forEach((r) => {
      const out = remapRun(r);
      if (out.changed) {
        userChanged = true;
        userRuns += 1;
        userAttempts += out.attempts;
      }
    });
    if (userChanged) {
      stats.runUsersTouched += 1;
      stats.runsRemapped += userRuns;
      stats.attemptsRemapped += userAttempts;
      if (!dryRun) setUserRuns(username, runs);
    }
  });

  users.forEach((u) => {
    if (!u) return;
    const wrongN = remapWrongList(u.wrongAnswers);
    stats.wrongAnswersRemapped += wrongN;

    let recentN = 0;
    if (Array.isArray(u.recentDecimalRuns)) {
      u.recentDecimalRuns.forEach((r) => {
        const out = remapRun(r);
        if (out.changed) recentN += 1;
      });
    }
    stats.recentDecimalRemapped += recentN;
  });

  if (practicePlanStore && typeof practicePlanStore.listUsernames === "function") {
    const names = practicePlanStore.listUsernames() || [];
    names.forEach((name) => {
      const row = practicePlanStore.get(name);
      const plan = row && row.plan;
      if (!plan) return;
      let touched = 0;
      const lists = [];
      if (Array.isArray(plan.history)) lists.push(plan.history);
      if (Array.isArray(plan.open)) lists.push(plan.open);
      if (Array.isArray(plan.cooldown)) lists.push(plan.cooldown);
      if (Array.isArray(plan.tasks)) lists.push(plan.tasks);
      lists.forEach((list) => {
        list.forEach((t) => {
          if (!t) return;
          const mode = t.mode || t.action;
          if (!isDecimalMode(mode) && String(t.action || "") !== "decimal") return;
          const next = swapD4D5Index(t.levelIndex);
          if (next == null) return;
          t.levelIndex = next;
          if (t.levelLabel) t.levelLabel = decimalLevelLabel(next);
          touched += 1;
        });
      });
      if (touched > 0) {
        stats.practicePlanUsersTouched += 1;
        stats.practicePlanEntriesRemapped += touched;
        if (!dryRun) practicePlanStore.set(name, { plan: plan });
      }
    });
  }

  return stats;
}

module.exports = {
  swapDecimalD4D5,
  swapD4D5Index,
  remapRun,
  remapWrongList,
};
