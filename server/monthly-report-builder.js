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
  { key: "level", zh: "闯关", unlockOrdinal: true },
  { key: "survival", zh: "生存", unlockOrdinal: true },
  { key: "prime", zh: "质数", timedOnly: true },
  { key: "perfectSquare", zh: "平方数", unlockOrdinal: true },
  { key: "divisibility", zh: "整除", unlockOrdinal: true },
  { key: "factorsMultiples", zh: "因数倍数", unlockOrdinal: true },
  { key: "decimal", zh: "小数", unlockOrdinal: true },
  { key: "expandBrackets", zh: "拆括号", unlockOrdinal: true },
];

const MIX_BUCKETS = [
  { id: "arithmetic", zh: "四则运算", en: "Arithmetic", modes: ["survival", "level", "training"] },
  { id: "perfectSquare", zh: "平方数", en: "Perfect squares", modes: ["perfectsquare"] },
  { id: "divisibility", zh: "整除", en: "Divisibility", modes: ["divisibility"] },
  { id: "factorsMultiples", zh: "因数倍数", en: "Factors & multiples", modes: ["factorsmultiples"] },
  { id: "decimal", zh: "小数运算", en: "Decimals", modes: ["decimal"] },
  { id: "other", zh: "其他", en: "Other", modes: null },
];

/** 热图/突破用等级短名（与学员端文案对齐，去掉「第 n 级 ·」前缀后展示） */
const HEAT_LEVEL_NAMES = {
  arithmetic: [
    "一位数加法入门",
    "一位数加法进阶",
    "一位数加减混合",
    "两位数加减基础",
    "两位数加一位数/整十数",
    "两位数减一位数/整十数",
    "两位数加两位数（进位）",
    "两位数减两位数（退位）",
    "两位数加减混合",
    "乘法口诀基础",
    "两位除一位整除",
    "两位数加两位数（结果超100）",
    "两位乘一位",
    "两位乘一位的逆运算",
    "不带括号的四则运算",
    "带括号的四则运算",
  ],
  perfectSquare: ["2～11 的平方", "2～20 的平方", "2～30 的平方", "2/3/5 质因数的幂"],
  divisibility: ["2 与 5 的整除", "3 与 9 的整除", "4 与 8 的整除", "6 与 12 的整除"],
  factorsMultiples: [
    "因数",
    "倍数",
    "最大公因数 · 入门",
    "最小公倍数 · 入门",
    "最大公因数 · 进阶",
    "最小公倍数 · 进阶",
  ],
  decimal: [
    "一位小数与整数混合加减",
    "一位与两位小数混合加减",
    "乘或除以 10ⁿ",
    "小数乘除一位整数",
    "单位分数与小数互化",
    "小数乘除小数",
  ],
};

const EXPAND_LEVEL_NAMES = ["入门", "进阶", "提高", "综合", "挑战"];

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

function formatDurationZh(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  if (s < 60) return s + "秒";
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r > 0 ? m + "分" + r + "秒" : m + "分钟";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? h + "小时" + mm + "分" : h + "小时";
}

function formatCompactRunTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? m + "m " + r + "s" : m + "m";
}

function mixBucketId(mode) {
  const m = normalizeMode(mode);
  for (let i = 0; i < MIX_BUCKETS.length; i++) {
    const b = MIX_BUCKETS[i];
    if (b.modes && b.modes.indexOf(m) >= 0) return b.id;
  }
  return "other";
}

function buildHabit(runsInMonth, opts) {
  opts = opts || {};
  const daySet = Object.create(null);
  const counts = Object.create(null);
  MIX_BUCKETS.forEach(function (b) {
    counts[b.id] = 0;
  });
  let runs = 0;
  let durationSec = 0;
  (runsInMonth || []).forEach(function (r) {
    if (!r || r.comboOnly === true) return;
    runs += 1;
    const day = chinaDayFromTs(r.ts);
    if (day) daySet[day] = true;
    const id = mixBucketId(r.mode);
    counts[id] = (counts[id] || 0) + 1;
    const sec = Number(r.survivalTimeSec) || 0;
    if (sec > 0) durationSec += sec;
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
  const tasksDone = Math.max(0, Math.floor(Number(opts.tasksDone) || 0));
  return {
    activeDays: activeDays,
    runs: runs,
    tasksDone: tasksDone,
    durationSec: durationSec,
    durationLabel: formatDurationZh(durationSec),
    mix: mix,
  };
}

function levelNameForMode(modeKey, levelIndex) {
  const li = Math.max(0, Math.floor(Number(levelIndex) || 0));
  if (modeKey === "level" || modeKey === "survival") {
    return HEAT_LEVEL_NAMES.arithmetic[li] || "";
  }
  if (modeKey === "perfectSquare") return HEAT_LEVEL_NAMES.perfectSquare[li] || "";
  if (modeKey === "divisibility") return HEAT_LEVEL_NAMES.divisibility[li] || "";
  if (modeKey === "factorsMultiples") return HEAT_LEVEL_NAMES.factorsMultiples[li] || "";
  if (modeKey === "decimal") return HEAT_LEVEL_NAMES.decimal[li] || "";
  if (modeKey === "expandBrackets") return EXPAND_LEVEL_NAMES[li] || "";
  return "";
}

function cleanLevelTitle(name) {
  return String(name || "")
    .replace(/^第\s*\d+\s*级\s*·\s*/, "")
    .replace(/^Y\d+\s*·\s*/, "")
    .replace(/^Z\d+\s*·\s*/, "")
    .replace(/^D\d+\s*·\s*/, "")
    .replace(/^L\d+\s*·\s*/, "")
    .replace(/\s*·\s*/g, "")
    .trim();
}

function heatCellTitle(catId, levelIndex) {
  const names = HEAT_LEVEL_NAMES[catId];
  const li = Math.max(0, Math.floor(Number(levelIndex) || 0));
  if (names && names[li]) return cleanLevelTitle(names[li]);
  const prefix = catId === "decimal" ? "小数" : catId === "divisibility" ? "整除" : "";
  return prefix + "第" + (li + 1) + "级";
}

/** 「新的突破」说明句（仅进步/变化项） */
function buildBreakthroughs(priorProgress, currentProgress) {
  const prior = priorProgress && typeof priorProgress === "object" ? priorProgress : {};
  const cur = currentProgress && typeof currentProgress === "object" ? currentProgress : {};
  const out = [];
  PROGRESS_MODES.forEach(function (meta) {
    const a = asMark(prior[meta.key]);
    const b = asMark(cur[meta.key]);
    if (!marksDiffer(a, b)) return;
    if (markRank(b) < markRank(a)) return; // 回退不写进「突破」

    if (b.stage === "timed") {
      const shortened =
        a.stage === "timed" &&
        a.timeSec != null &&
        b.timeSec != null &&
        b.timeSec < a.timeSec
          ? formatDurationZh(a.timeSec - b.timeSec)
          : "";
      if (shortened) {
        if (meta.key === "level") out.push({ zh: "闯关用时缩短了 " + shortened });
        else if (meta.key === "survival") out.push({ zh: "生存用时缩短了 " + shortened });
        else if (meta.key === "prime") out.push({ zh: "质数用时缩短了 " + shortened });
        else if (meta.key === "divisibility") out.push({ zh: "整除用时缩短了 " + shortened });
        else out.push({ zh: meta.zh + "用时缩短了 " + shortened });
      } else if (meta.key === "level") {
        out.push({ zh: "闯关通关" });
      } else if (meta.key === "survival") {
        out.push({ zh: "生存通关" });
      } else if (meta.key === "prime") {
        out.push({ zh: "质数达人上榜" });
      } else if (meta.key === "divisibility") {
        out.push({ zh: "整除零错通关" });
      } else {
        out.push({ zh: meta.zh + "通关" });
      }
      return;
    }
    if (b.stage === "cleared") {
      out.push({ zh: meta.zh + "通关" });
      return;
    }
    if (b.stage === "climbing" && b.levelIndex != null) {
      const ord = b.levelIndex + 1;
      const title = cleanLevelTitle(levelNameForMode(meta.key, b.levelIndex));
      if (meta.unlockOrdinal) {
        out.push({
          zh: title
            ? meta.zh + "解锁第" + ord + "级：" + title
            : meta.zh + "解锁第" + ord + "级",
        });
      } else {
        out.push({ zh: meta.zh + "推进至第" + ord + "级" });
      }
    }
  });
  return out;
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

function cellIsAccurate(c) {
  return !!(c && (c.accurate === true || (c.p != null && Number(c.p) >= 0.95)));
}

function cellHasSample(c) {
  return !!(c && c.active && Math.max(0, Math.floor(Number(c.n) || 0)) > 0);
}

function cellAvgSec(c) {
  if (!c) return null;
  const a = Number(c.avgSec);
  if (Number.isFinite(a) && a > 0) return a;
  const ln = Number(c.meanLnCorrect);
  if (Number.isFinite(ln)) {
    const sec = Math.exp(ln) / 1000;
    if (Number.isFinite(sec) && sec > 0) return sec;
  }
  return null;
}

function formatPct1(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return (Math.round(pct * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

/**
 * 热图进步：
 * - 准确率：上月末已有样本且未达标 → 本月末达标（首次从无样本到达标不算）
 * - 速度：两端均达标，用均速算提升百分比；排序用该百分比
 */
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
    const title = heatCellTitle(catId, li);
    const nowAcc = cellIsAccurate(c);
    const wasAcc = cellIsAccurate(p);
    const priorSample = cellHasSample(p);

    if (priorSample && !wasAcc && nowAcc) {
      const pctStr = formatPct1(c.p);
      improved.push({
        kind: "acc",
        score: 1000 + (Number(c.p) || 0) * 100,
        zh: title + "：准确率达到 " + (pctStr != null ? pctStr + "%" : "掌握线"),
      });
      return;
    }

    if (nowAcc && wasAcc && priorSample) {
      const oldSec = cellAvgSec(p);
      const newSec = cellAvgSec(c);
      if (oldSec != null && newSec != null && oldSec > newSec && oldSec > 0) {
        const speedPct = ((oldSec - newSec) / oldSec) * 100;
        if (speedPct >= 3) {
          const pctShow = Math.round(speedPct);
          improved.push({
            kind: "speed",
            score: speedPct,
            speedPct: speedPct,
            zh: title + "：速度提升 " + pctShow + "%",
          });
        }
      }
    }
  });

  improved.sort(function (a, b) {
    return b.score - a.score;
  });
  return {
    improvedCells: improved.length,
    top: improved.slice(0, 3).map(function (row) {
      return { kind: row.kind, zh: row.zh };
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
  const prior = opts.priorSnap && typeof opts.priorSnap === "object" ? opts.priorSnap : null;
  const priorProgress = prior && prior.progress ? prior.progress : {};
  const priorHeat = prior && prior.heatmap ? prior.heatmap : {};

  const habit = buildHabit(runsInMonth(runs, monthKey), {
    tasksDone: opts.tasksDone,
  });
  const breakthroughs = buildBreakthroughs(priorProgress, current.progress || {});
  const heatDiff = buildHeatmapDiff(priorHeat, current.heatmap || {});

  const nicknameRaw = opts.nickname != null ? String(opts.nickname).trim() : "";
  return {
    ok: true,
    nickname: nicknameRaw,
    monthKey: monthKey,
    titleZh: monthLabelZh(monthKey) + "学习月报",
    titleEn: "Monthly Learning Report · " + monthLabelEn(monthKey),
    baselineMonthKey: opts.priorMonthKey || null,
    currentSynthesized: !!current.synthesized,
    habit: habit,
    milestones: {
      breakthroughsZh: breakthroughs.map(function (b) {
        return b.zh;
      }),
      breakthroughs: breakthroughs,
      /** 兼容旧画布字段 */
      changesZh: breakthroughs.map(function (b) {
        return b.zh;
      }),
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
  const getTasksDoneInMonth = deps.getTasksDoneInMonth;
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
    const tasksDone =
      typeof getTasksDoneInMonth === "function" ? getTasksDoneInMonth(name, monthKey) : 0;
    return buildMonthlyReportPayload({
      username: name,
      nickname: nickname,
      monthKey: monthKey,
      runs: runs,
      currentSnap: currentSnap,
      priorSnap: priorSnap,
      priorMonthKey: priorMonthKey,
      cohortsByCategory: cohorts,
      tasksDone: tasksDone,
    });
  }

  return { buildForUser: buildForUser, buildMonthlyReportPayload: buildMonthlyReportPayload };
}

module.exports = {
  createMonthlyReportBuilder,
  buildMonthlyReportPayload,
  buildHabit,
  buildBreakthroughs,
  buildHeatmapDiff,
  PROGRESS_MODES,
};
