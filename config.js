/**
 * API 服务器地址配置（按 hostname 自动切换）
 * - 本地开发（localhost / 127.0.0.1）：使用 http://localhost:3001，需先 npm run start 启动 server
 * - 线上部署（如 GitHub Pages）：使用 Render 后端
 */
(function () {
  var isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.host);
  window.API_BASE_URL = window.API_BASE_URL || (
    isLocal ? "http://localhost:3001" : "https://math-practice-lo1u.onrender.com"
  );
})();
