/**
 * Jarvis Math Lab 计算游戏 - 后端 API
 * 部署到 Railway / Render 等平台后，将 API_BASE_URL 指向此服务地址
 */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const BCRYPT_ROUNDS = 10;
function isBcryptHash(s) {
  return typeof s === "string" && s.length >= 50 && s.startsWith("$2");
}

function safeUser(u) {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
}

const app = express();
const PORT = process.env.PORT || 3001;
const os = require("os");
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".jarvis-math-lab", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");
const SURVIVAL_RANKING_FILE = path.join(DATA_DIR, "survival-ranking.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "2026";
const SURVIVAL_RANKING_MAX = 50;

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Admin-Pin"],
  credentials: false
}));
app.use(express.json());

// 健康检查（用于确认服务是否在线）
app.get("/api/health", (req, res) => {
  res.json({ ok: true, msg: "Jarvis Math Lab API" });
});

// 读取 JSON 文件
function readJson(filePath, defaultValue = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return defaultValue;
  }
}

// 写入 JSON 文件
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// 校验管理员口令（从 header 或 body 获取）
function checkAdminPin(req) {
  const pin = req.headers["x-admin-pin"] || req.body?.adminPin;
  return pin === ADMIN_PIN;
}

// ========== 学员自主注册 ==========
function isValidUsername(s) {
  if (typeof s !== "string" || s.length < 2 || s.length > 20) return false;
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(s);
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  const name = (username || "").trim();
  const pwd = password ? String(password) : "";
  if (!name || !pwd) {
    return res.json({ ok: false, error: "请填写用户名和密码" });
  }
  if (!isValidUsername(name)) {
    return res.json({ ok: false, error: "用户名 2-20 位，仅支持字母、数字、下划线、中文" });
  }
  if (pwd.length < 6) {
    return res.json({ ok: false, error: "密码至少 6 位" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  if (data.users.some((u) => u.username === name)) {
    return res.json({ ok: false, error: "该用户名已存在" });
  }
  const passwordHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
  const newUser = {
    username: name,
    password: passwordHash,
    levelIndex: 0,
    bestLevelIndex: 0,
    totalScore: 0,
    bestSurvivalSec: 0,
    bestScore: 0,
    recentSurvivalRuns: [],
    recentLevelRuns: [],
    recentTrainingRuns: [],
    levelChallengeLastLevel: 0,
    levelTrainingCurrentLevel: -1,
    wrongAnswers: [],
    createdBy: "self",
  };
  data.users.push(newUser);
  writeJson(USERS_FILE, data);
  res.json({ ok: true, user: safeUser(newUser) });
});

// ========== 学员登录 ==========
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ ok: false, error: "请输入用户名和密码" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.json({ ok: false, error: "用户不存在，请联系老师在后台添加" });
  }
  let match = false;
  if (isBcryptHash(user.password)) {
    match = await bcrypt.compare(password, user.password);
  } else {
    match = user.password === password;
    if (match) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const idx = data.users.findIndex((u) => u.username === username);
      if (idx >= 0) {
        data.users[idx].password = hash;
        writeJson(USERS_FILE, data);
      }
    }
  }
  if (!match) {
    return res.json({ ok: false, error: "密码错误" });
  }
  res.json({ ok: true, user: safeUser(user) });
});

// ========== 获取学员数据（用于换设备同步） ==========
app.get("/api/user/:username", (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  if (user.hasClearedSurvival === undefined) {
    const runsData = readJson(RUNS_FILE, { runs: {} });
    const runs = runsData.runs[username] || [];
    user.hasClearedSurvival = runs.some((r) => r.survivalCleared === true);
    const idx = data.users.findIndex((u) => u.username === username);
    if (idx >= 0) {
      data.users[idx].hasClearedSurvival = user.hasClearedSurvival;
      writeJson(USERS_FILE, data);
    }
  }
  res.json({ ok: true, user: safeUser(user) });
});

// ========== 更新学员进度（游戏结束后同步） ==========
app.put("/api/user/:username", (req, res) => {
  const { username } = req.params;
  const updates = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const allowed = ["levelIndex", "bestLevelIndex", "totalScore", "bestSurvivalSec", "bestScore", "recentSurvivalRuns", "recentLevelRuns", "recentTrainingRuns", "levelChallengeLastLevel", "levelTrainingCurrentLevel", "wrongAnswers"];
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data.users[idx][k] = updates[k];
  });
  writeJson(USERS_FILE, data);
  res.json({ ok: true, user: safeUser(data.users[idx]) });
});

// ========== 学员修改密码 ==========
app.post("/api/user/:username/change-password", async (req, res) => {
  const { username } = req.params;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.json({ ok: false, error: "请填写当前密码和新密码" });
  }
  if (String(newPassword).length < 6) {
    return res.json({ ok: false, error: "新密码至少 6 位" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const user = data.users[idx];
  let match = false;
  if (isBcryptHash(user.password)) {
    match = await bcrypt.compare(currentPassword, user.password);
  } else {
    match = user.password === currentPassword;
  }
  if (!match) {
    return res.json({ ok: false, error: "当前密码错误" });
  }
  data.users[idx].password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeJson(USERS_FILE, data);
  res.json({ ok: true });
});

// ========== 学员获取自己的练习记录（完整 runs，供首页「数据统计」用） ==========
app.get("/api/user/:username/runs", (req, res) => {
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  if (!data.users.some((u) => u.username === username)) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = (runsData.runs[username] || [])
    .map((r) => ({ ...r, mode: r.mode === "level" ? "level" : (r.mode === "training" ? "training" : "survival") }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
});

// ========== 添加生存局记录（用于完整历史，供 report 页面使用） ==========
app.post("/api/user/:username/runs", (req, res) => {
  const { username } = req.params;
  const run = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const runsData = readJson(RUNS_FILE, { runs: {} });
  if (!runsData.runs[username]) runsData.runs[username] = [];
  const runEntry = {
    survivalTimeSec: run.survivalTimeSec ?? 0,
    score: run.score ?? 0,
    maxLevel: run.maxLevel ?? 0,
    wrongCount: run.wrongCount ?? 0,
    ts: run.ts ?? Date.now(),
    mode: run.mode === "level" ? "level" : (run.mode === "training" ? "training" : "survival"),
  };
  if (runEntry.mode === "survival" && run.survivalCleared === true) runEntry.survivalCleared = true;
  if (Array.isArray(run.attempts)) runEntry.attempts = run.attempts;
  runsData.runs[username].unshift(runEntry);
  if (runsData.runs[username].length > 500) {
    runsData.runs[username] = runsData.runs[username].slice(0, 500);
  }
  writeJson(RUNS_FILE, runsData);

  const userData = readJson(USERS_FILE, { users: [] });
  const uIdx = userData.users.findIndex((u) => u.username === username);
  if (uIdx >= 0) {
    userData.users[uIdx].lastGameTs = runEntry.ts;
  }
  if (runEntry.mode === "survival" && runEntry.survivalCleared === true) {
    const rankingData = readJson(SURVIVAL_RANKING_FILE, { list: [] });
    const list = Array.isArray(rankingData.list) ? rankingData.list : [];
    const entry = {
      username,
      survivalTimeSec: runEntry.survivalTimeSec,
      wrongCount: runEntry.wrongCount ?? 0,
      ts: runEntry.ts
    };
    const next = list.filter((e) => !(e.username === entry.username && e.ts === entry.ts));
    next.push(entry);
    next.sort((a, b) => {
      if (a.survivalTimeSec !== b.survivalTimeSec) return a.survivalTimeSec - b.survivalTimeSec;
      return (a.wrongCount ?? 0) - (b.wrongCount ?? 0);
    });
    rankingData.list = next.slice(0, SURVIVAL_RANKING_MAX);
    writeJson(SURVIVAL_RANKING_FILE, rankingData);

    if (uIdx >= 0) {
      userData.users[uIdx].hasClearedSurvival = true;
    }
    writeJson(USERS_FILE, userData);
  } else if (uIdx >= 0) {
    writeJson(USERS_FILE, userData);
  }

  res.json({ ok: true });
});

// ========== 生存通关排行榜（预计算，学员只读） ==========
app.get("/api/survival-ranking", (req, res) => {
  const data = readJson(SURVIVAL_RANKING_FILE, { list: [] });
  const list = Array.isArray(data.list) ? data.list : [];
  const out = list.map((e, i) => ({
    rank: i + 1,
    username: e.username,
    survivalTimeSec: e.survivalTimeSec ?? 0,
    wrongCount: e.wrongCount ?? 0,
    ts: e.ts
  }));
  res.json({ ok: true, list: out });
});

// ========== 管理员：获取所有学员 ==========
app.get("/api/admin/users", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const users = data.users.map((u) => {
    const out = { ...u };
    if (!out.lastGameTs && runsData.runs[u.username] && runsData.runs[u.username].length > 0) {
      out.lastGameTs = runsData.runs[u.username][0].ts;
    }
    return safeUser(out);
  });
  res.json({ ok: true, users });
});

// ========== 管理员：添加学员 ==========
app.post("/api/admin/users", async (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ ok: false, error: "请填写用户名和密码" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  if (data.users.some((u) => u.username === username)) {
    return res.json({ ok: false, error: "该用户名已存在" });
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  data.users.push({
    username,
    password: passwordHash,
    levelIndex: 0,
    bestLevelIndex: 0,
    totalScore: 0,
    bestSurvivalSec: 0,
    bestScore: 0,
    recentSurvivalRuns: [],
    recentLevelRuns: [],
    recentTrainingRuns: [],
    levelChallengeLastLevel: 0,
    levelTrainingCurrentLevel: -1,
    wrongAnswers: [],
  });
  writeJson(USERS_FILE, data);
  res.json({ ok: true, users: data.users.map(safeUser) });
});

// ========== 管理员：更新学员 ==========
app.put("/api/admin/users/:username", async (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const updates = req.body || {};
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  const allowed = ["password", "levelIndex", "bestLevelIndex", "totalScore"];
  for (const k of allowed) {
    if (updates[k] === undefined) continue;
    if (k === "password") {
      data.users[idx].password = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    } else {
      data.users[idx][k] = updates[k];
    }
  }
  writeJson(USERS_FILE, data);
  res.json({ ok: true, user: safeUser(data.users[idx]) });
});

// ========== 管理员：删除学员 ==========
app.delete("/api/admin/users/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const data = readJson(USERS_FILE, { users: [] });
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }
  data.users.splice(idx, 1);
  writeJson(USERS_FILE, data);
  const runsData = readJson(RUNS_FILE, { runs: {} });
  delete runsData.runs[username];
  writeJson(RUNS_FILE, runsData);
  res.json({ ok: true, users: data.users });
});

// ========== 管理员：获取练习设置 ==========
app.get("/api/admin/settings", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(SETTINGS_FILE, { levels: [] });
  res.json({ ok: true, settings: data });
});

// ========== 管理员：保存练习设置 ==========
app.put("/api/admin/settings", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { levels } = req.body || {};
  if (!Array.isArray(levels)) {
    return res.json({ ok: false, error: "无效的配置格式" });
  }
  writeJson(SETTINGS_FILE, { levels });
  res.json({ ok: true });
});

// ========== 获取练习设置（学员端也需要，用于难度配置） ==========
app.get("/api/settings", (req, res) => {
  const data = readJson(SETTINGS_FILE, { levels: [] });
  res.json({ ok: true, settings: data });
});

// ========== 管理员：获取某学员全部练习记录（生存+闯关，按时间排序） ==========
app.get("/api/admin/records/:username", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const { username } = req.params;
  const runsData = readJson(RUNS_FILE, { runs: {} });
  const runs = (runsData.runs[username] || [])
    .map(r => ({ ...r, mode: r.mode === "level" ? "level" : (r.mode === "training" ? "training" : "survival") }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, runs });
});

// ========== 管理员：获取学员列表（用于 report 页面下拉选择） ==========
app.get("/api/admin/user-list", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const data = readJson(USERS_FILE, { users: [] });
  const list = data.users.map((u) => u.username);
  res.json({ ok: true, users: list });
});

// ========== 管理员：备份全部数据 ==========
app.get("/api/admin/backup", (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const users = readJson(USERS_FILE, { users: [] });
  const runs = readJson(RUNS_FILE, { runs: {} });
  const settings = readJson(SETTINGS_FILE, { levels: [] });
  const backup = { users, runs, settings, ts: Date.now() };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=jarvis-math-backup-" + new Date().toISOString().slice(0, 10) + ".json");
  res.send(JSON.stringify(backup, null, 2));
});

// ========== 管理员：恢复/导入数据 ==========
app.post("/api/admin/restore", express.json({ limit: "5mb" }), (req, res) => {
  if (!checkAdminPin(req)) {
    return res.status(403).json({ ok: false, error: "需要管理员口令" });
  }
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.json({ ok: false, error: "无效的备份格式" });
  }
  try {
    if (body.users) {
      const u = body.users;
      writeJson(USERS_FILE, (u.users && Array.isArray(u.users)) ? u : { users: Array.isArray(u) ? u : [] });
    }
    if (body.runs) {
      const r = body.runs;
      writeJson(RUNS_FILE, (r.runs && typeof r.runs === "object") ? r : { runs: typeof r === "object" ? r : {} });
    }
    if (body.settings) {
      const s = body.settings;
      writeJson(SETTINGS_FILE, (s.levels && Array.isArray(s.levels)) ? s : { levels: Array.isArray(s) ? s : [] });
    }
    res.json({ ok: true, msg: "数据已恢复" });
  } catch (e) {
    res.json({ ok: false, error: "恢复失败：" + (e.message || String(e)) });
  }
});

app.listen(PORT, () => {
  console.log(`Jarvis Math Lab API 运行在 http://localhost:${PORT}`);
});
