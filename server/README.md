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

## 数据存储

数据保存在 `server/data/` 目录下的 JSON 文件中：
- `users.json` - 学员账号
- `settings.json` - 练习设置
- `runs-by-user/<user>.json` - 各学员对局记录（业务热路径只读写单用户文件）
- `runs.json` - 历史总库（仅作首次迁移源与核对基准，日常不再写入）

启动时若尚未同步，会从 `runs.json` 一次性拆到 `runs-by-user/`（不改动原文件）。管理页「维护」可核对两边是否一致。

部署时请确保该目录可写，或配置持久化存储。
