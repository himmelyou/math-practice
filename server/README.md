# Jarvis Math Lab 后端 API

## 本地运行

```bash
cd server
npm install
npm start
```

默认运行在 http://localhost:3001

## 部署（Railway / Render 等）

1. 将 `server` 目录部署到 Railway 或 Render
2. 设置环境变量 `ADMIN_PIN`（或确保数据目录中 `admin-pin.json` 含有效 `pin`；均未配置则管理接口无法通过校验）
3. 获取部署后的 API 地址，例如 `https://xxx.railway.app`
4. 在 `docs/config.js` 中修改：
   ```javascript
   window.API_BASE_URL = "https://你的API地址";
   ```

### 训练选关 / 热图算法

- **训练选关权威**：仅服务器 `computeTrainingNextLevelForUser`（`server/stats-heatmap-browser.js`）。
- **热图格子权威**：`GET /api/user|:admin/user/:username/heatmap`（`user-heatmap.js` → 同一 `buildHeatmapCells`）。学员端「数据统计」与报表「数据分析」展示都吃该 API，不再在浏览器本地建格。
- **部署**：改选关/建格逻辑后须提交 `server/stats-heatmap-browser.js`（可用 `npm run sync-heatmap` 从 docs 拷入），否则 Render（Root=`server`）不会更新。
- **docs 侧** `docs/stats-heatmap-browser.js`：仍用于上色兜底、文案、分类元数据；格子数据以服务器为准。

## 数据存储

数据保存在 `DATA_DIR`（默认 `~/.jarvis-math-lab/data/`）下的 JSON 文件中，例如：
- `users.json` - 学员账号
- `settings.json` - 练习设置
- `runs.json` / `runs/` - 练习记录
- `game-guide.json` - 游戏说明自定义稿（可选；无则用内置默认）

部署时请确保该目录可写，或配置持久化存储。
