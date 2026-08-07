/**
 * 管理端流量/使用发展统计：以「有对局的中国日历日」为活跃口径
 */
const {
  chinaTodayKey,
  chinaDateKeyFromTs,
  daysBetweenDateKeys,
  computeDaysOffline,
} = require("./student-overview");

const MODE_ORDER = [
  "survival",
  "level",
  "training",
  "primeComposite",
  "divisibility",
  "perfectSquare",
  "decimal",
  "expandBrackets",
];

const MODE_LABELS = {
  survival: "生存",
  level: "闯关",
  training: "训练",
  primeComposite: "质数",
  divisibility: "整除",
  perfectSquare: "平方数",
  decimal: "小数",
  expandBrackets: "拆括号",
};

const DEPTH_BUCKETS = [
  { id: "0", label: "0 天", min: 0, max: 0 },
  { id: "1-3", label: "1–3 天", min: 1, max: 3 },
  { id: "4-10", label: "4–10 天", min: 4, max: 10 },
  { id: "11-20", label: "11–20 天", min: 11, max: 20 },
  { id: "21-30", label: "21–30 天", min: 21, max: 30 },
];

function normalizeMode(mode) {
  const m = String(mode || "").trim();
  if (m === "level") return "level";
  if (m === "training") return "training";
  if (m === "primeComposite") return "primeComposite";
  if (m === "expandBrackets") return "expandBrackets";
  if (m === "perfectSquare") return "perfectSquare";
  if (m === "divisibility") return "divisibility";
  if (m === "decimal") return "decimal";
  return "survival";
}

function shiftChinaDateKey(key, deltaDays) {
  const base = Date.parse(String(key) + "T12:00:00+08:00");
  if (Number.isNaN(base)) return "";
  return chinaDateKeyFromTs(base + deltaDays * 86400000);
}

function buildDateKeysInclusive(endKey, rangeDays) {
  const n = Math.max(1, Math.min(366, Math.floor(Number(rangeDays) || 30)));
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const k = shiftChinaDateKey(endKey, -i);
    if (k) keys.push(k);
  }
  return keys;
}

function emptyDayBucket() {
  return {
    activeUsers: Object.create(null),
    vipActiveUsers: Object.create(null),
    runs: 0,
    newUsers: 0,
  };
}

function countKeys(obj) {
  let n = 0;
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) n += 1;
  }
  return n;
}

function resolveCreatedAtMs(user, runs) {
  const c = Number(user && user.createdAt) || 0;
  if (c > 0) return c;
  let minTs = 0;
  (runs || []).forEach((r) => {
    const t = Number(r && r.ts) || 0;
    if (t <= 0) return;
    if (!minTs || t < minTs) minTs = t;
  });
  return minTs > 0 ? minTs : 0;
}

/**
 * @param {{
 *   users: array,
 *   getUserRuns: (username: string) => array,
 *   rangeDays?: number,
 *   scope?: 'all'|'vip',
 *   excludeTesters?: boolean,
 *   churnDays?: number,
 *   nowMs?: number,
 * }} options
 */
function buildTrafficStats(options) {
  const nowMs = options.nowMs != null ? options.nowMs : Date.now();
  const todayKey = chinaTodayKey(nowMs);
  const rangeDays = Math.max(7, Math.min(90, Math.floor(Number(options.rangeDays) || 30)));
  const churnDays = Math.max(7, Math.min(60, Math.floor(Number(options.churnDays) || 14)));
  const scope = options.scope === "vip" ? "vip" : "all";
  const excludeTesters = options.excludeTesters !== false;
  const getUserRuns = typeof options.getUserRuns === "function" ? options.getUserRuns : () => [];

  const dateKeys = buildDateKeysInclusive(todayKey, rangeDays);
  const dateSet = Object.create(null);
  dateKeys.forEach((k) => {
    dateSet[k] = true;
  });
  const dayMap = Object.create(null);
  dateKeys.forEach((k) => {
    dayMap[k] = emptyDayBucket();
  });

  const modeCounts = Object.create(null);
  MODE_ORDER.forEach((m) => {
    modeCounts[m] = 0;
  });

  const depthCounts = Object.create(null);
  DEPTH_BUCKETS.forEach((b) => {
    depthCounts[b.id] = 0;
  });

  let totalUsers = 0;
  let vipUsers = 0;
  let testerUsers = 0;
  let usersWithAnyRun = 0;
  let createdAtKnown = 0;
  let createdAtInferred = 0;

  const dauToday = Object.create(null);
  const dauYesterdaySet = Object.create(null);
  const dauLastWeekSet = Object.create(null);
  const dau7 = Object.create(null);
  const dau30 = Object.create(null);
  const windowActive = Object.create(null);
  let runsToday = 0;
  let runsInRange = 0;

  const yesterdayKey = shiftChinaDateKey(todayKey, -1);
  const lastWeekKey = shiftChinaDateKey(todayKey, -7);

  const churnCandidates = [];
  const topActive = [];

  const users = Array.isArray(options.users) ? options.users : [];
  users.forEach((u) => {
    if (!u || !u.username) return;
    if (excludeTesters && u.isTester === true) return;
    if (scope === "vip" && u.isVip !== true) return;

    totalUsers += 1;
    if (u.isVip === true) vipUsers += 1;
    if (u.isTester === true) testerUsers += 1;

    const username = u.username;
    const runs = getUserRuns(username) || [];
    const hasExplicitCreatedAt = Number(u.createdAt) > 0;
    const createdMs = resolveCreatedAtMs(u, runs);
    if (createdMs > 0) {
      if (hasExplicitCreatedAt) createdAtKnown += 1;
      else createdAtInferred += 1;
      const createdKey = chinaDateKeyFromTs(createdMs);
      if (createdKey && dayMap[createdKey]) dayMap[createdKey].newUsers += 1;
    }

    const activeDaysIn30 = Object.create(null);
    const activeDaysInWindow = Object.create(null);
    let runsInWindowForUser = 0;
    let lastTs = Number(u.lastGameTs) || 0;
    let hasAnyCountedRun = false;

    (runs || []).forEach((r) => {
      if (!r || r.comboOnly === true) return;
      const ts = Number(r.ts) || 0;
      if (ts <= 0) return;
      if (ts > lastTs) lastTs = ts;
      hasAnyCountedRun = true;

      const key = chinaDateKeyFromTs(ts);
      if (!key) return;
      const ageFromToday = daysBetweenDateKeys(key, todayKey);
      if (ageFromToday == null || ageFromToday < 0) return;

      const mode = normalizeMode(r.mode);

      if (ageFromToday === 0) {
        dauToday[username] = true;
        runsToday += 1;
      }
      if (yesterdayKey && key === yesterdayKey) dauYesterdaySet[username] = true;
      if (lastWeekKey && key === lastWeekKey) dauLastWeekSet[username] = true;
      if (ageFromToday <= 6) dau7[username] = true;
      if (ageFromToday <= 29) {
        dau30[username] = true;
        activeDaysIn30[key] = true;
      }

      if (dateSet[key]) {
        windowActive[username] = true;
        runsInRange += 1;
        runsInWindowForUser += 1;
        activeDaysInWindow[key] = true;
        dayMap[key].activeUsers[username] = true;
        if (u.isVip === true) dayMap[key].vipActiveUsers[username] = true;
        dayMap[key].runs += 1;
        modeCounts[mode] = (modeCounts[mode] || 0) + 1;
      }
    });

    if (hasAnyCountedRun) usersWithAnyRun += 1;

    const depth = countKeys(activeDaysIn30);
    let bucketed = false;
    for (let i = 0; i < DEPTH_BUCKETS.length; i += 1) {
      const b = DEPTH_BUCKETS[i];
      if (depth >= b.min && depth <= b.max) {
        depthCounts[b.id] += 1;
        bucketed = true;
        break;
      }
    }
    if (!bucketed && depth > 30) depthCounts["21-30"] += 1;

    if (runsInWindowForUser > 0) {
      topActive.push({
        username,
        isVip: u.isVip === true,
        runs: runsInWindowForUser,
        activeDays: countKeys(activeDaysInWindow),
        lastGameTs: lastTs > 0 ? lastTs : 0,
      });
    }

    const daysOff = computeDaysOffline(lastTs, nowMs);
    if (hasAnyCountedRun && daysOff != null && daysOff >= churnDays) {
      churnCandidates.push({
        username,
        isVip: u.isVip === true,
        lastGameTs: lastTs,
        daysOffline: daysOff,
        adminNote: typeof u.adminNote === "string" ? u.adminNote.trim() : "",
      });
    }
  });

  topActive.sort((a, b) => {
    if (b.runs !== a.runs) return b.runs - a.runs;
    return String(a.username).localeCompare(String(b.username), "zh-CN");
  });
  churnCandidates.sort((a, b) => {
    if ((b.daysOffline || 0) !== (a.daysOffline || 0)) return (b.daysOffline || 0) - (a.daysOffline || 0);
    return String(a.username).localeCompare(String(b.username), "zh-CN");
  });

  const dauYesterday = countKeys(dauYesterdaySet);
  const dauLastWeekSameDay = lastWeekKey ? countKeys(dauLastWeekSet) : null;

  const series = dateKeys.map((k) => {
    const b = dayMap[k] || emptyDayBucket();
    return {
      date: k,
      dau: countKeys(b.activeUsers),
      vipDau: countKeys(b.vipActiveUsers),
      runs: b.runs,
      newUsers: b.newUsers,
    };
  });

  const modeBreakdown = MODE_ORDER.map((id) => ({
    id,
    label: MODE_LABELS[id] || id,
    runs: modeCounts[id] || 0,
  }));

  const depthDistribution = DEPTH_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    users: depthCounts[b.id] || 0,
  }));

  return {
    builtAt: nowMs,
    todayKey,
    rangeDays,
    churnDays,
    scope,
    excludeTesters,
    note: "活跃=当天至少完成 1 局（中国时区）；不含仅打开页面/登录未练。新增优先用 createdAt，旧账号可回退为首次对局日。",
    kpi: {
      dau: countKeys(dauToday),
      dauYesterday,
      dauDeltaDay: countKeys(dauToday) - dauYesterday,
      dauLastWeekSameDay,
      dauDeltaWeek:
        dauLastWeekSameDay == null ? null : countKeys(dauToday) - dauLastWeekSameDay,
      active7: countKeys(dau7),
      active30: countKeys(dau30),
      activeInRange: countKeys(windowActive),
      runsToday,
      runsInRange,
      totalUsers,
      vipUsers,
      testerExcluded: excludeTesters,
      testerUsersInScope: testerUsers,
      usersWithAnyRun,
      createdAtKnown,
      createdAtInferred,
      churnCount: churnCandidates.length,
    },
    series,
    modeBreakdown,
    depthDistribution,
    topActive: topActive.slice(0, 10),
    churnList: churnCandidates.slice(0, 20),
  };
}

module.exports = {
  buildTrafficStats,
  MODE_ORDER,
  MODE_LABELS,
};
