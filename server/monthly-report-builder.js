/**
 * 真月报汇总：当月练习量 + 快照 progress/热图差分（仅变化项）。
 * 不含徽章、不含训练熟悉格数。
 */
const {
  buildProgressSnapshot,
  buildOneCategorySlim,
  categoryIdFromRunMode,
} = require("./monthly-snapshot");

const PROGRESS_MODES = [
  { key: "level", zh: "闯关", en: "Challenge" },
  { key: "survival", zh: "生存", en: "Survival" },
  { key: "prime", zh: "质数", en: "Primes" },
  { key: "perfectSquare", zh: "平方数", en: "Squares" },
  { key: "divisibility", zh: "整除", en: "Divisibility" },
  { key: "factorsMultiples", zh: "因数倍数", en: "Factors & multiples" },
  { key: "decimal", zh: "小数", en: "Decimals" },
  { key: "expandBrackets", zh: "拆括号", en: "Expand brackets" },
];

const MIX_BUCKETS = [
  { id: "arithmetic", zh: "四则运算", en: "Arithmetic", modes: ["survival", "level", "training"] },
  { id: "perfectSquare", zh: "平方数", en: "Perfect squares", modes: ["perfectsquare"] },
  { id: "divisibility", zh: "整除", en: "Divisibility", modes: ["divisibility"] },
  { id: "factorsMultiples", zh: "因数倍数", en: "Factors & multiples", modes: ["factorsmultiples"] },
  { id: "decimal", zh: "小数运算", en: "Decimals", modes: ["decimal"] },
  { id: "other", zh: "其他", en: "Other", modes: null },
];

const HEAT_CAT_META = {
  arithmetic: { zh: "四则", en: "Arithmetic", prefix: "L" },
  perfectSquare: { zh: "平方", en: "Squares", prefix: "L" },
  divisibility: { zh: "整除", en: "Divisibility", prefix: "Z" },
  factorsMultiples: { zh: "因倍", en: "Factors", prefix: "Y" },
  decimal: { zh: "小数", en: "Decimals", prefix: "D" },
};

function normalizeMode(mode) {
  return String(mode || "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function emptyMark() {
  return { stage: "none", label: null, levelIndex: null, timeSec: null };
}

function asMark(raw) {
  if (!raw || typeof raw !== "object") return emptyMark();
  const stage = String(raw.stage || "none");
  if (stage === "none") return emptyMark();
  return {
    stage: stage,
    label: raw.label != null ? String(raw.label) : null,
    levelIndex: Number.isFinite(Number(raw.levelIndex)) ? Math.floor(Number(raw.levelIndex)) : null,
    timeSec: Number.isFinite(Number(raw.timeSec)) ? Math.floor(Number(raw.timeSec)) : null,
  };
}

function markLabel(m) {
  const mark = asMark(m);
  if (mark.stage === "none") return "—";
  if (mark.label) return mark.label;
  if (mark.stage === "cleared") return "通关";
  if (mark.stage === "timed" && mark.timeSec != null) return mark.timeSec + "s";
  if (mark.stage === "climbing" && mark.levelIndex != null) return "L" + (mark.levelIndex + 1);
  return "—";
}

function markLabelEn(m) {
  const mark = asMark(m);
  if (mark.stage === "none") return "—";
  if (mark.stage === "cleared") return "cleared";
  if (mark.stage === "timed" && mark.timeSec != null) {
    const s = mark.timeSec;
    if (s < 60) return s + "s";
    const mm = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? mm + "m " + r + "s" : mm + "m";
  }
  if (mark.label && /^[LDZY]\d+$/.test(mark.label)) return mark.label;
  if (mark.stage === "climbing" && mark.levelIndex != null) return "L" + (mark.levelIndex + 1);
  return mark.label || "—";
}

/** 可比较排序键：越大越好（timed 用负秒数） */
function markRank(m) {
  const mark = asMark(m);
  if (mark.stage === "none") return 0;
  if (mark.stage === "climbing") return 1000 + (mark.levelIndex == null ? 0 : mark.levelIndex);
  if (mark.stage === "cleared") return 10000;
  if (mark.stage === "timed") {
    const sec = mark.timeSec == null ? 999999 : mark.timeSec;
    return 20000 - Math.min(sec, 19999);
  }
  return 0;
}

function marksDiffer(a, b) {
  return markRank(a) !== markRank(b) || markLabel(a) !== markLabel(b);
}

function chinaDayFromTs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(n));
  } catch (e) {
    return new Date(n).toISOString().slice(0, 10);
  }
}

function chinaMonthKeyFromTs(ts) {
  const day = chinaDayFromTs(ts);
  return day ? day.slice(0, 7) : "";
}

function monthLabelZh(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return String(monthKey || "");
  return monthKey.slice(0, 4) + "年" + Number(monthKey.slice(5, 7)) + "月";
}

function monthLabelEn(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return String(monthKey || "");
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[Number(monthKey.slice(5, 7)) - 1] + " " + monthKey.slice(0, 4);
}

function mixBucketId(mode) {
  const m = normalizeMode(mode);
  for (let i = 0; i < MIX_BUCKETS.length; i++) {
    const b = MIX_BUCKETS[i];
    if (b.modes && b.modes.indexOf(m) >= 0) return b.id;
  }
  return "other";
}

function buildHabit(runsInMonth) {
  const daySet = Object.create(null);
  const counts = Object.create(null);
  MIX_BUCKETS.forEach(function (b) {
    counts[b.id] = 0;
  });
  let runs = 0;
  (runsInMonth || []).forEach(function (r) {
    if (!r || r.comboOnly === true) return;
    runs += 1;
    const day = chinaDayFromTs(r.ts);
    if (day) daySet[day] = true;
    const id = mixBucketId(r.mode);
    counts[id] = (counts[id] || 0) + 1;
  });
  const activeDays = Object.keys(daySet).length;
  const mix = [];
  if (runs > 0) {
    MIX_BUCKETS.forEach(function (b) {
      const n = counts[b.id] || 0;
      if (n <= 0) return;
      mix.push({
        zh: b.zh,
        en: b.en,
        pct: Math.round((n / runs) * 100),
        runs: n,
      });
    });
  }
  return { activeDays: activeDays, runs: runs, mix: mix };
}

function buildProgressChanges(priorProgress, currentProgress) {
  const prior = priorProgress && typeof priorProgress === "object" ? priorProgress : {};
  const cur = currentProgress && typeof currentProgress === "object" ? currentProgress : {};
  const changes = [];
  PROGRESS_MODES.forEach(function (meta) {
    const a = asMark(prior[meta.key]);
    const b = asMark(cur[meta.key]);
    if (!marksDiffer(a, b)) return;
    if (markRank(b) < markRank(a) && a.stage !== "none") {
      // 偶发回退（重建口径差）仍展示，便于核对
    }
    changes.push({
      key: meta.key,
      zh: meta.zh + "：" + markLabel(a) + " → " + markLabel(b),
      en: meta.en + ": " + markLabelEn(a) + " → " + markLabelEn(b),
      from: a,
      to: b,
    });
  });
  return changes;
}

function cellMap(heatmap) {
  const map = Object.create(null);
  const heat = heatmap && typeof heatmap === "object" ? heatmap : {};
  Object.keys(heat).forEach(function (catId) {
    const block = heat[catId];
    const cells = block && Array.isArray(block.cells) ? block.cells : [];
    cells.forEach(function (c) {
      if (!c || !c.active) return;
      const li = Math.max(0, Math.floor(Number(c.levelIndex) || 0));
      map[catId + ":" + li] = c;
    });
  });
  return map;
}

function levelTag(catId, levelIndex) {
  const meta = HEAT_CAT_META[catId] || { zh: catId, en: catId, prefix: "L" };
  return {
    zh: meta.zh + " " + meta.prefix + (levelIndex + 1),
    en: meta.en + " " + meta.prefix + (levelIndex + 1),
  };
}

function buildHeatmapDiff(priorHeat, currentHeat) {
  const prev = cellMap(priorHeat);
  const cur = cellMap(currentHeat);
  const improved = [];
  Object.keys(cur).forEach(function (key) {
    const c = cur[key];
    const p = prev[key];
    const parts = key.split(":");
    const catId = parts[0];
    const li = Math.max(0, Math.floor(Number(parts[1]) || 0));
    const tag = levelTag(catId, li);

    const wasAcc = !!(p && (p.accurate === true || (p.p != null && Number(p.p) >= 0.95)));
    const nowAcc = !!(c.accurate === true || (c.p != null && Number(c.p) >= 0.95));
    const wasFluent = !!(p && p.fluent === true);
    const nowFluent = c.fluent === true;

    if (!wasAcc && nowAcc) {
      improved.push({
        kind: "acc",
        score: 100 + (nowFluent ? 20 : 0),
        zh: tag.zh + "：准确率达到掌握线",
        en: tag.en + ": reached accuracy mastery",
      });
      return;
    }
    if (wasAcc && !wasFluent && nowFluent) {
      improved.push({
        kind: "acc",
        score: 80,
        zh: tag.zh + "：达到流畅",
        en: tag.en + ": became fluent",
      });
      return;
    }
    if (nowAcc && p && c.meanLnCorrect != null && p.meanLnCorrect != null) {
      const dLn = Number(p.meanLnCorrect) - Number(c.meanLnCorrect);
      if (dLn > 0.05) {
        improved.push({
          kind: "speed",
          score: 40 + Math.min(40, dLn * 20),
          zh: tag.zh + "：准度保持，速度提升",
          en: tag.en + ": stayed accurate, faster",
        });
      }
    }
  });
  improved.sort(function (a, b) {
    return b.score - a.score;
  });
  return {
    improvedCells: improved.length,
    top: improved.slice(0, 3).map(function (row) {
      return { kind: row.kind, zh: row.zh, en: row.en };
    }),
  };
}

function runsUpToMonth(runs, monthKey) {
  return (runs || []).filter(function (r) {
    const mk = chinaMonthKeyFromTs(r && r.ts);
    return mk && mk <= monthKey;
  });
}

function runsInMonth(runs, monthKey) {
  return (runs || []).filter(function (r) {
    return chinaMonthKeyFromTs(r && r.ts) === monthKey;
  });
}

function synthesizeSnap(runs, monthKey, cohortsByCategory) {
  const cut = runsUpToMonth(runs, monthKey);
  let asOf = 0;
  cut.forEach(function (r) {
    const t = Number(r.ts) || 0;
    if (t > asOf) asOf = t;
  });
  const progress = buildProgressSnapshot({
    user: {},
    runs: cut,
    preferUserUnlock: false,
  });
  const heat = {};
  const seen = Object.create(null);
  cut.forEach(function (r) {
    const cat = categoryIdFromRunMode(r && r.mode);
    if (!cat || seen[cat]) return;
    seen[cat] = true;
    const one = buildOneCategorySlim({
      categoryId: cat,
      runs: cut,
      cohortsByCategory: cohortsByCategory || {},
      nowMs: asOf || Date.now(),
    });
    if (one && one.ok) heat[cat] = one.block;
  });
  return {
    monthKey: monthKey,
    lastRunTs: asOf || null,
    progress: progress,
    heatmap: heat,
    synthesized: true,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.monthKey
 * @param {array} opts.runs
 * @param {object|null} opts.currentSnap
 * @param {object|null} opts.priorSnap
 * @param {string|null} opts.priorMonthKey
 * @param {object} [opts.cohortsByCategory]
 */
function buildMonthlyReportPayload(opts) {
  opts = opts || {};
  const username = String(opts.username || "");
  const monthKey = String(opts.monthKey || "");
  const runs = Array.isArray(opts.runs) ? opts.runs : [];
  const cohorts = opts.cohortsByCategory || {};

  let current = opts.currentSnap && typeof opts.currentSnap === "object" ? opts.currentSnap : null;
  if (!current || !current.progress) {
    current = synthesizeSnap(runs, monthKey, cohorts);
  }
  const prior =
    opts.priorSnap && typeof opts.priorSnap === "object" ? opts.priorSnap : null;
  const priorProgress = prior && prior.progress ? prior.progress : {};
  const priorHeat = prior && prior.heatmap ? prior.heatmap : {};

  const habit = buildHabit(runsInMonth(runs, monthKey));
  const changes = buildProgressChanges(priorProgress, current.progress || {});
  const heatDiff = buildHeatmapDiff(priorHeat, current.heatmap || {});

  const nicknameRaw = opts.nickname != null ? String(opts.nickname).trim() : "";
  return {
    ok: true,
    /** 公开展示名；空则画布不显示名字。不回传 username，避免登录名公开 */
    nickname: nicknameRaw,
    monthKey: monthKey,
    titleZh: monthLabelZh(monthKey) + "学习月报",
    titleEn: "Monthly Learning Report · " + monthLabelEn(monthKey),
    baselineMonthKey: opts.priorMonthKey || null,
    currentSynthesized: !!current.synthesized,
    habit: habit,
    milestones: {
      changesZh: changes.map(function (c) {
        return c.zh;
      }),
      changesEn: changes.map(function (c) {
        return c.en;
      }),
      changes: changes,
    },
    progress: {
      improvedCells: heatDiff.improvedCells,
      top: heatDiff.top,
    },
    noteZh: "",
    noteEn: "",
  };
}

function createMonthlyReportBuilder(deps) {
  deps = deps || {};
  const snapshotStore = deps.snapshotStore;
  const getUserRuns = deps.getUserRuns;
  const getUserNickname = deps.getUserNickname;
  const cohortsByCategory = deps.cohortsByCategory;

  function buildForUser(username, monthKey) {
    const name = String(username || "");
    if (!name || !/^\d{4}-\d{2}$/.test(String(monthKey || ""))) {
      return { ok: false, error: "invalid_args" };
    }
    const runs = typeof getUserRuns === "function" ? getUserRuns(name) : [];
    const currentSnap = snapshotStore ? snapshotStore.getMonth(name, monthKey) : null;
    const priorMonthKey = snapshotStore ? snapshotStore.findPriorMonthKey(name, monthKey) : null;
    const priorSnap = priorMonthKey && snapshotStore ? snapshotStore.getMonth(name, priorMonthKey) : null;
    const cohorts = typeof cohortsByCategory === "function" ? cohortsByCategory() : {};
    const nickname =
      typeof getUserNickname === "function" ? String(getUserNickname(name) || "").trim() : "";
    return buildMonthlyReportPayload({
      username: name,
      nickname: nickname,
      monthKey: monthKey,
      runs: runs,
      currentSnap: currentSnap,
      priorSnap: priorSnap,
      priorMonthKey: priorMonthKey,
      cohortsByCategory: cohorts,
    });
  }

  return { buildForUser: buildForUser, buildMonthlyReportPayload: buildMonthlyReportPayload };
}

module.exports = {
  createMonthlyReportBuilder,
  buildMonthlyReportPayload,
  buildHabit,
  buildProgressChanges,
  buildHeatmapDiff,
  PROGRESS_MODES,
};
