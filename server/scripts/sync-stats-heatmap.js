/**
 * 将 docs/stats-heatmap-browser.js 同步到 server/（供 Render 部署）。
 * 用法：在 server/ 下执行 npm run sync-heatmap
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "docs", "stats-heatmap-browser.js");
const dest = path.join(__dirname, "..", "stats-heatmap-browser.js");

if (!fs.existsSync(src)) {
  console.error("source missing:", src);
  process.exit(1);
}
fs.copyFileSync(src, dest);
console.log("synced", path.relative(process.cwd(), src), "->", path.relative(process.cwd(), dest));
