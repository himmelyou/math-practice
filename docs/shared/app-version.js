/**
 * 发布时修改版本号、构建号与缓存标签；各 HTML 中 ?v= 须与本文件 JML_CACHE_TAG 一致。
 */
(function (g) {
  g.JML_APP_VERSION = "v1.7.48";
  g.JML_BUILD_ID = "20260830a";
  g.JML_CACHE_TAG = "122";
  g.JML_ADMIN_STATIC_REV = "46";

  /** 尽早写入登录/首页版本，避免 HTML 占位旧号闪一下 */
  g.applyJmlAppVersionText = function (prefix) {
    var v = g.JML_APP_VERSION || "";
    if (!v) return;
    var text = (prefix || "版本") + " " + v;
    var login = typeof document !== "undefined" ? document.getElementById("login-home-version") : null;
    var home = typeof document !== "undefined" ? document.getElementById("app-home-version") : null;
    if (login) login.textContent = text;
    if (home) home.textContent = text;
  };
})(typeof window !== "undefined" ? window : globalThis);
