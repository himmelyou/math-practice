# runs `cleared` 字段一次性迁移说明

## 变更摘要

- 单局记录统一使用 **`cleared: true`** 表示通关（生存 / 闯关等由 `mode` 区分语义）。
- 已删除 **`survivalCleared`**（代码与迁移后数据均不再使用）。
- **闯关**：仅 `endLevelGame(completed=true)`（L16 达标通关，含 10+10 附加段规则）写入 `cleared: true`；本关错 2 题结束、放弃均为非通关。
- **生存**：与原先 `survivalCleared` 相同，通关局写 `cleared: true`。
- 历史 **闯关** 记录**不会**根据 `maxLevel>=15` 回填 `cleared`（避免把 L16 答错误标为通关）；仅将旧 **`survivalCleared`** 迁入 **`cleared`**。

---

## 你需要手动做的（部署清单）

### 1. 备份（必做）

备份生产 `DATA_DIR` 下至少：

- `users.json`
- `runs.json`

### 2. 部署新代码

- 部署/重启 **后端**（`server/server.js` 含新写入逻辑 + 迁移接口）。
- 部署/刷新 **前端**（`docs/index.html`），用户强刷页面（Ctrl+F5）。

### 3. 执行一次性数据迁移

**推荐：管理后台（无需 curl）**

1. 打开管理页：`docs/admin/index.html`（与主站同域或已配置 `config.js` 里的 API 地址）。
2. 输入管理员 PIN（与服务器 `ADMIN_PIN` 一致）。
3. **系统备份** Tab → **下载全部备份**。
4. **初始化/维护** Tab → **迁移 runs：survivalCleared → cleared**。
5. 看页面底部状态栏的成功提示（改动条数等）。

**备选：命令行**

```bash
curl -X POST "https://你的API/api/admin/maintenance/migrate-run-cleared" \
  -H "X-Admin-Pin: 你的ADMIN_PIN"
```

或本地：`node server/scripts/migrate-run-cleared.js`

### 4. 验证

- 抽查 `runs.json`：不应再出现 `survivalCleared`；生存通关局应有 `cleared: true`。
- 登录曾 survival 通关的账号：生存榜 gate 仍正常。
- 玩一局闯关 **通全关** → 最近记录 **Cleared: 是**。
- 玩一局闯关 **L16 本关错 2 题** → **Cleared: 否**（即使 Max level 为 L16）。

### 5. 顺序提醒

**先部署新代码，再跑迁移。** 若先跑迁移再部署旧前端，旧客户端仍可能写入 `survivalCleared`（新服务端已不接收该字段写入 `cleared`，需避免短暂窗口内用旧前端记 survival 通关）。

---

## 相关代码位置

| 项 | 文件 |
|----|------|
| 记局写入 `cleared` | `docs/index.html` → `appendRun` |
| 闯关通关 | `endLevelGame(true)` → `cleared: true` |
| 服务端记局 | `server/server.js` → `POST /api/user/:username/runs` |
| 迁移 API | `POST /api/admin/maintenance/migrate-run-cleared` |
| 本地脚本 | `server/scripts/migrate-run-cleared.js` |
