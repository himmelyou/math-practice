/**
 * 练习建议案例快照：按用户名拉取 Render 管理端只读数据，打印摘要。
 *
 * 用法（仓库根目录）：
 *   node server/scripts/coach-snapshot.js 用户名
 *   node server/scripts/coach-snapshot.js --check
 *
 * 口令：仓库根目录 .env 的 JML_ADMIN_PIN（或环境变量 ADMIN_PIN）。
 * 切勿把 .env 或 coach-snapshots/ 提交进 git。
 */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ENV_FILE = path.join(REPO_ROOT, ".env");
const OUT_DIR = path.join(REPO_ROOT, "coach-snapshots");

const HEAT_P_ORANGE = 0.9;
const HEAT_P_YELLOW = 0.95;

function loadDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const t = String(line || "").trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq <= 0) return;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  });
  return out;
}

function resolveConfig() {
  const fileEnv = loadDotEnv(ENV_FILE);
  const apiBase = String(
    process.env.JML_API_BASE || fileEnv.JML_API_BASE || "https://api.adsmathlab.com"
  )
    .trim()
    .replace(/\/+$/, "");
  const pin = String(
    process.env.JML_ADMIN_PIN ||
      process.env.ADMIN_PIN ||
      fileEnv.JML_ADMIN_PIN ||
      fileEnv.ADMIN_PIN ||
      ""
  ).trim();
  return { apiBase, pin };
}

function parseArgs(argv) {
  const args = argv.slice(2).filter(Boolean);
  const flags = {};
  const rest = [];
  args.forEach((a) => {
    if (a === "--check") flags.check = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--no-write") flags.noWrite = true;
    else if (a.startsWith("-")) flags.unknown = a;
    else rest.push(a);
  });
  return { flags, username: rest[0] ? String(rest[0]).trim() : "" };
}

function adminGet(apiBase, pin, pathname) {
  const target = new URL(apiBase + pathname);
  const lib = target.protocol === "http:" ? http : https;
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === "http:" ? 80 : 443),
    path: target.pathname + target.search,
    method: "GET",
    headers: {
      "X-Admin-Pin": pin,
      Accept: "application/json",
    },
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = null;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(
            (json && json.error) || text || res.statusMessage || String(res.statusCode)
          );
          err.status = res.statusCode;
          err.body = json;
          reject(err);
          return;
        }
        resolve(json);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function gradeLabel(grade) {
  if (grade === null || grade === undefined || grade === "") return "未填";
  const n = Number(grade);
  if (!Number.isInteger(n) || n < 0 || n > 12) return String(grade);
  if (n === 0) return "学前";
  return n + "年级";
}

function chinaDateTime(ts) {
  const n = Number(ts) || 0;
  if (n <= 0) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(n));
  } catch (e) {
    return new Date(n).toISOString();
  }
}

function heatBand(cell) {
  if (!cell || !cell.active) return "inactive";
  const p = cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
  if (p == null) return "unknown";
  if (p < HEAT_P_ORANGE || cell.tooSlow === true) return "orange";
  if (p < HEAT_P_YELLOW) return "yellow";
  return "fluent";
}

function summarizeCells(cells) {
  const list = Array.isArray(cells) ? cells : [];
  const holes = [];
  let active = 0;
  list.forEach((c) => {
    if (!c || !c.active) return;
    active += 1;
    const band = heatBand(c);
    const p =
      c.p != null && Number.isFinite(Number(c.p))
        ? Math.round(Number(c.p) * 1000) / 10
        : null;
    const row = {
      L: (Number(c.levelIndex) || 0) + 1,
      band: band,
      n: c.n != null ? c.n : 0,
      pPct: p,
      tooSlow: c.tooSlow === true,
      fluent: c.fluent === true,
    };
    if (band === "orange" || band === "yellow") holes.push(row);
  });
  return { active, holes };
}

function stripRun(r) {
  if (!r || typeof r !== "object") return r;
  const m = r.trainingMeta && typeof r.trainingMeta === "object" ? r.trainingMeta : null;
  return {
    ts: r.ts || 0,
    at: chinaDateTime(r.ts),
    mode: r.mode || "",
    durationSec: r.durationSec != null ? r.durationSec : r.survivalTimeSec,
    score: r.score,
    wrongCount: r.wrongCount,
    maxLevel: r.maxLevel,
    L: r.maxLevel != null && Number.isFinite(Number(r.maxLevel)) ? Number(r.maxLevel) + 1 : null,
    cleared: r.cleared === true,
    abandoned: r.abandoned === true || !!(m && m.abandoned),
    pickedL: m && m.pickedLevel != null ? Number(m.pickedLevel) + 1 : null,
    dayMode: m && m.dayMode ? String(m.dayMode) : "",
    pickReason: m && m.pickReason ? String(m.pickReason) : "",
    runBrushMode: !!(m && m.runBrushMode),
    heatAvgSecAtStart: m && m.heatAvgSecAtStart != null ? m.heatAvgSecAtStart : null,
    runAvgSec: m && m.runAvgSec != null ? m.runAvgSec : null,
  };
}

function compactWrong(list, n) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => (Number(b && b.ts) || 0) - (Number(a && a.ts) || 0));
  return arr.slice(0, n).map((w) => ({
    at: chinaDateTime(w.ts),
    mode: w.mode || "",
    L: w.levelIndex != null ? Number(w.levelIndex) + 1 : null,
    text: w.text || w.prompt || w.question || "",
    answer: w.answer != null ? w.answer : w.correctAnswer,
    studentAnswer: w.studentAnswer != null ? w.studentAnswer : w.userAnswer,
  }));
}

function formatHoles(holes) {
  if (!holes.length) return "无明显橙/黄档";
  return holes
    .map((h) => {
      const acc = h.pPct != null ? "准" + h.pPct + "%" : "准?";
      const slow = h.tooSlow ? " 过慢" : "";
      const band = h.band === "orange" ? "橙" : h.band === "yellow" ? "黄" : h.band;
      return "L" + h.L + " " + band + " " + acc + slow;
    })
    .join("；");
}

function printSummary(snap) {
  const o = snap.overview || {};
  const pick = snap.trainingPick || {};
  const lines = [];
  lines.push("=== 练习建议快照 " + snap.username + " @ " + snap.at + " ===");
  lines.push(
    "年级：" +
      gradeLabel(o.grade) +
      "  VIP：" +
      (o.isVip ? "是" : "否") +
      "  断练：" +
      (o.daysOffline != null ? o.daysOffline + " 天" : "—") +
      "  近30日活跃：" +
      (o.daysActiveLast30 != null ? o.daysActiveLast30 + " 天" : "—")
  );
  lines.push(
    "进度：闯关 " +
      (o.levelProgress || "—") +
      "  训练 " +
      (o.trainingProgress || "—") +
      "  生存 " +
      (o.survivalProgress || "—")
  );
  lines.push(
    "特殊：小数 " +
      (o.decimalProgress || "—") +
      "  平方 " +
      (o.perfectSquareProgress || "—") +
      "  整除 " +
      (o.divisibilityProgress || "—") +
      "  拆括号 " +
      (o.expandProgress || "—")
  );
  if (pick.ok === false) {
    lines.push("系统四则选关：失败 " + (pick.error || ""));
  } else {
    lines.push(
      "系统四则选关：" +
        (pick.pickedL != null ? "L" + pick.pickedL : "—") +
        "  日模式 " +
        (pick.dayMode || "—") +
        "  F=" +
        (pick.frontierL != null ? "L" + pick.frontierL : "—") +
        "  H=" +
        (pick.heatL != null ? "L" + pick.heatL : "—") +
        "  " +
        (pick.pickReason || pick.reason || "")
    );
  }
  const arithHoles = (snap.heatHoles && snap.heatHoles.arithmetic) || [];
  lines.push("四则短板：" + formatHoles(arithHoles));
  const cat = snap.categoryNext || {};
  Object.keys(cat).forEach((id) => {
    const p = cat[id] || {};
    if (p.ok === false) return;
    const label =
      p.levelIndex != null && Number.isFinite(Number(p.levelIndex))
        ? String(Number(p.levelIndex) + 1)
        : "—";
    lines.push(
      "特殊选关 " + id + "：关 " + label + "  mode=" + (p.mode || "") + "  " + (p.reason || "")
    );
  });
  lines.push(
    "错题本：四则可见 " +
      snap.wrongbook.arithmeticVisible +
      "  拆括号 " +
      snap.wrongbook.expandCount +
      "  整除 " +
      snap.wrongbook.divCount
  );
  if (snap.recentRuns && snap.recentRuns.length) {
    lines.push("近局：");
    snap.recentRuns.slice(0, 8).forEach((r) => {
      lines.push(
        "  " +
          (r.at || "") +
          "  " +
          (r.mode || "") +
          "  L" +
          (r.L != null ? r.L : (r.pickedL != null ? r.pickedL : "-")) +
          "  错" +
          (r.wrongCount != null ? r.wrongCount : "-") +
          (r.pickReason ? "  " + r.pickReason : "")
      );
    });
  } else {
    lines.push("近局：无");
  }
  if (snap.errors && snap.errors.length) {
    lines.push("拉取警告：" + snap.errors.join("；"));
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function fetchSnapshot(apiBase, pin, username) {
  const errors = [];
  const tasks = {
    overview: adminGet(
      apiBase,
      pin,
      "/api/admin/student-overview?username=" + encodeURIComponent(username)
    ).catch((e) => {
      errors.push("overview " + (e.status || "") + " " + e.message);
      return null;
    }),
    detail: adminGet(
      apiBase,
      pin,
      "/api/admin/student-detail/" + encodeURIComponent(username)
    ).catch((e) => {
      errors.push("detail " + (e.status || "") + " " + e.message);
      return null;
    }),
    train: adminGet(
      apiBase,
      pin,
      "/api/admin/user/" + encodeURIComponent(username) + "/training/next-level-debug"
    ).catch((e) => {
      errors.push("training-debug " + (e.status || "") + " " + e.message);
      return null;
    }),
    heatmap: adminGet(
      apiBase,
      pin,
      "/api/admin/user/" + encodeURIComponent(username) + "/heatmap"
    ).catch((e) => {
      errors.push("heatmap " + (e.status || "") + " " + e.message);
      return null;
    }),
    category: adminGet(
      apiBase,
      pin,
      "/api/admin/user/" + encodeURIComponent(username) + "/category-next-levels"
    ).catch((e) => {
      errors.push("category-next " + (e.status || "") + " " + e.message);
      return null;
    }),
  };
  const keys = Object.keys(tasks);
  const vals = await Promise.all(keys.map((k) => tasks[k]));
  const got = {};
  keys.forEach((k, i) => {
    got[k] = vals[i];
  });

  const overviewRow =
    got.overview && Array.isArray(got.overview.rows) && got.overview.rows[0]
      ? got.overview.rows[0]
      : {};
  const user = (got.detail && got.detail.user) || {};
  const runs = got.detail && Array.isArray(got.detail.runs) ? got.detail.runs : [];
  const server = (got.train && got.train.server) || {};
  const arithCells =
    (got.train && got.train.server && got.train.server.cellsSummary) ||
    (got.heatmap &&
      got.heatmap.byCategory &&
      got.heatmap.byCategory.arithmetic &&
      got.heatmap.byCategory.arithmetic.heat &&
      got.heatmap.byCategory.arithmetic.heat.cells) ||
    [];

  const heatHoles = { arithmetic: summarizeCells(arithCells).holes };
  if (got.heatmap && got.heatmap.byCategory) {
    Object.keys(got.heatmap.byCategory).forEach((id) => {
      if (id === "arithmetic") return;
      const cells =
        got.heatmap.byCategory[id] &&
        got.heatmap.byCategory[id].heat &&
        got.heatmap.byCategory[id].heat.cells;
      heatHoles[id] = summarizeCells(cells).holes;
    });
  }

  const categoryNext = {};
  if (got.category && got.category.byCategory) {
    Object.keys(got.category.byCategory).forEach((id) => {
      const p = got.category.byCategory[id] || {};
      categoryNext[id] = {
        ok: p.ok !== false,
        levelIndex: p.levelIndex,
        mode: p.mode || "",
        reason: p.reason || p.pickReason || "",
        cleared: p.cleared === true,
      };
    });
  }

  const arithWrong = Array.isArray(user.wrongAnswers) ? user.wrongAnswers : [];
  const expandWrong = Array.isArray(user.expandBracketsWrongAnswers)
    ? user.expandBracketsWrongAnswers
    : [];
  const divWrong = Array.isArray(user.divisibilityWrongAnswers)
    ? user.divisibilityWrongAnswers
    : [];

  return {
    ok: errors.length === 0 || !!(got.overview || got.detail || got.train),
    username: username,
    at: new Date().toISOString(),
    apiBase: apiBase,
    overview: {
      grade: overviewRow.grade != null ? overviewRow.grade : user.grade,
      gradeLabel: overviewRow.gradeLabel || gradeLabel(user.grade),
      isVip: overviewRow.isVip === true || user.isVip === true,
      daysOffline: overviewRow.daysOffline,
      daysActiveLast30: overviewRow.daysActiveLast30,
      lastGameTs: overviewRow.lastGameTs || user.lastGameTs,
      lastGameAt: chinaDateTime(overviewRow.lastGameTs || user.lastGameTs),
      levelProgress: overviewRow.levelProgress,
      trainingProgress: overviewRow.trainingProgress,
      trainingMode: overviewRow.trainingMode,
      trainingReason: overviewRow.trainingReason,
      survivalProgress: overviewRow.survivalProgress,
      decimalProgress: overviewRow.decimalProgress,
      perfectSquareProgress: overviewRow.perfectSquareProgress,
      divisibilityProgress: overviewRow.divisibilityProgress,
      expandProgress: overviewRow.expandProgress,
      nickname: overviewRow.nickname || user.nickname || "",
    },
    trainingPick: {
      ok: server.ok !== false,
      error: server.error || "",
      todayKey: server.todayKey || (got.train && got.train.todayKey) || "",
      levelIndex: server.levelIndex,
      pickedL: server.pickedL,
      dayMode: server.dayMode,
      brushMode: !!server.brushMode,
      frontierL: server.frontierL,
      heatL: server.heatL,
      reason: server.reason || "",
      pickReason: server.pickReason || "",
    },
    heatHoles: heatHoles,
    categoryNext: categoryNext,
    wrongbook: {
      arithmeticVisible: arithWrong.length,
      expandCount: expandWrong.length,
      divCount: divWrong.length,
      recentArithmetic: compactWrong(arithWrong, 8),
    },
    recentRuns: runs
      .slice()
      .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
      .slice(0, 12)
      .map(stripRun),
    errors: errors,
  };
}

function writeSnapshotFile(username, snap) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const safe = String(username).replace(/[^\w.-]+/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(OUT_DIR, safe + "-" + stamp + ".json");
  fs.writeFileSync(file, JSON.stringify(snap, null, 2), "utf8");
  return file;
}

async function main() {
  const { flags, username } = parseArgs(process.argv);
  if (flags.unknown) {
    console.error("未知参数 " + flags.unknown);
    process.exit(2);
  }
  const cfg = resolveConfig();
  if (!cfg.pin) {
    console.error(
      "未找到管理口令。请在仓库根目录 .env 写入 JML_ADMIN_PIN=（与 report 门禁相同）。该文件已被 gitignore。"
    );
    process.exit(2);
  }

  if (flags.check) {
    try {
      await adminGet(cfg.apiBase, cfg.pin, "/api/admin/user-list");
      process.stdout.write("口令可用  API=" + cfg.apiBase + "\n");
      process.exit(0);
    } catch (e) {
      console.error("口令校验失败  HTTP " + (e.status || "?") + "  " + e.message);
      process.exit(1);
    }
  }

  if (!username) {
    console.error("用法: node server/scripts/coach-snapshot.js <用户名>");
    console.error("      node server/scripts/coach-snapshot.js --check");
    process.exit(2);
  }

  try {
    const snap = await fetchSnapshot(cfg.apiBase, cfg.pin, username);
    if (flags.json) {
      process.stdout.write(JSON.stringify(snap, null, 2) + "\n");
    } else {
      printSummary(snap);
    }
    if (!flags.noWrite) {
      const file = writeSnapshotFile(username, snap);
      process.stderr.write("已写入 " + path.relative(REPO_ROOT, file) + "\n");
    }
    if (!snap.ok) process.exit(1);
  } catch (e) {
    if (e.status === 404) {
      console.error("用户不存在：" + username);
      process.exit(1);
    }
    console.error("拉取失败  HTTP " + (e.status || "?") + "  " + e.message);
    process.exit(1);
  }
}

main();
