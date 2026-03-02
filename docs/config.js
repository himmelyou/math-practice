/**
 * API 服务器地址配置（按 hostname 自动切换）
 * - 本地开发（localhost / 127.0.0.1）：使用 http://localhost:3001，需先 npm run start 启动 server
 * - 线上部署（如 GitHub Pages）：使用 Render 后端
 */
(function () {
  var host = location.host || "";
  // 约定：
  // - 本地开发页面（如 127.0.0.1:xxxx）默认连本地后端 http://localhost:3001
  // - 本地管理端「测试环境」使用端口 8081，也连本地后端
  // - 本地管理端「真实环境」使用端口 8080，连线上 Render 后端
  var isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  var isTestAdmin = /^(localhost|127\.0\.0\.1):8081$/.test(host);
  var isProdAdmin = /^(localhost|127\.0\.0\.1):8080$/.test(host);

  var useLocalApi = (isLocalHost || isTestAdmin) && !isProdAdmin;

  window.API_BASE_URL = window.API_BASE_URL || (
    useLocalApi ? "http://localhost:3001" : "https://math-practice-lo1u.onrender.com"
  );
})();
