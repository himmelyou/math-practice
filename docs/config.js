/**
 * API 服务器地址配置（按 hostname 自动切换）
 * - 本地开发（localhost / 127.0.0.1）：使用 http://localhost:3001，需先 npm run start 启动 server
 * - 线上部署（如 GitHub Pages）：使用 Render 后端
 */
(function () {
  var params = new URLSearchParams(location.search || "");
  // 体验版 bat：在地址后加 ?jml_api=render 可连正式 Render，不写则仍按 host 自动判断
  if (params.get("jml_api") === "render") {
    try {
      sessionStorage.setItem("jml_api", "render");
    } catch (e) {}
  }
  if (params.get("jml_api") === "local") {
    try {
      sessionStorage.setItem("jml_api", "local");
    } catch (e) {}
  }
  try {
    if (sessionStorage.getItem("jml_api") === "render") {
      window.API_BASE_URL = "https://api.adsmathlab.com";
      window.__JML_API_BASE__ = window.__JML_API_BASE__ || window.API_BASE_URL;
      return;
    }
    if (sessionStorage.getItem("jml_api") === "local") {
      // 支持局域网手机访问：让 API 指向同一台机器的 3001 端口
      var hostName = location.hostname || "localhost";
      window.API_BASE_URL = "http://" + hostName + ":3001";
      window.__JML_API_BASE__ = window.__JML_API_BASE__ || window.API_BASE_URL;
      return;
    }
  } catch (e) {}

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
    useLocalApi ? "http://localhost:3001" : "https://api.adsmathlab.com"
  );

  // 兼容小程序版管理端/报表页代码的命名
  window.__JML_API_BASE__ = window.__JML_API_BASE__ || window.API_BASE_URL;
})();
