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
2. 设置环境变量 `ADMIN_PIN`（可选，默认 2026）
3. 获取部署后的 API 地址，例如 `https://xxx.railway.app`
4. 在项目根目录的 `config.js` 中修改：
   ```javascript
   window.API_BASE_URL = "https://你的API地址";
   ```

## 数据存储

数据保存在 `server/data/` 目录下的 JSON 文件中：
- `users.json` - 学员账号
- `settings.json` - 练习设置
- `runs.json` - 生存局完整记录

部署时请确保该目录可写，或配置持久化存储。
