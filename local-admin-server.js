// 简单本地静态服务器，用于打开 admin/、report/ 等静态页
// 使用方法：
//   node local-admin-server.js
// 浏览器打开 http://localhost:8080/admin/index.html

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = Number(process.env.ADMIN_PORT) || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("404 Not Found");
}

function safeResolve(filePath) {
  const resolved = path.resolve(ROOT_DIR, filePath);
  if (!resolved.startsWith(ROOT_DIR)) {
    return null;
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || "/");
  let pathname = parsedUrl.pathname || "/";

  // 默认打开管理端（显式 index.html，与 bat 一致）
  if (pathname === "/") {
    pathname = "/admin/index.html";
  }

  const safePath = safeResolve(decodeURIComponent(pathname.replace(/\\/g, "/").replace(/^\/+/, "")));
  if (!safePath) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("403 Forbidden");
    return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err) {
      sendNotFound(res);
      return;
    }
    let filePath = safePath;
    if (stat.isDirectory()) {
      filePath = path.join(safePath, "index.html");
    } else if (!stat.isFile()) {
      sendNotFound(res);
      return;
    }
    fs.stat(filePath, (err2, st2) => {
      if (err2 || !st2.isFile()) {
        sendNotFound(res);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      const stream = fs.createReadStream(filePath);
      stream.on("error", () => {
        sendNotFound(res);
      });
      stream.pipe(res);
    });
  });
});

// 仅监听本机回环地址，避免局域网访问到管理端页面
server.listen(PORT, "127.0.0.1", () => {
  const urlToOpen = `http://localhost:${PORT}/admin/index.html`;
  console.log(`本地管理端静态服务器已启动：${urlToOpen}`);

  // 在 macOS 上自动打开浏览器
  if (process.platform === "darwin") {
    try {
      const { exec } = require("child_process");
      exec(`open "${urlToOpen}"`);
    } catch (e) {
      console.log("请手动在浏览器中打开上面的地址。");
    }
  } else {
    console.log("请手动在浏览器中打开上面的地址。");
  }
});

