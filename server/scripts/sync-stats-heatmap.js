/**
 * 将 server/stats-heatmap-browser.js（算法真源）同步到 docs/（GitHub Pages 展示用）。
 * 用法：在 server/ 下执行 npm run sync-heatmap
 *
 * 改热图/选关算法：只改 server/stats-heatmap-browser.js，再 sync，再提交两边。
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "stats-heatmap-browser.js");
const dest = path.join(__dirname, "..", "..", "docs", "stats-heatmap-browser.js");

if (!fs.existsSync(src)) {
  console.error("source missing:", src);
  process.exit(1);
}

let code = fs.readFileSync(src, "utf8");
// 去掉文件头块注释，换成 Pages 副本说明
code = code.replace(/^\/\*\*[\s\S]*?\*\/\r?\n/, "");

const header = `/**
 * 【Pages 发布副本】算法真源：server/stats-heatmap-browser.js
 * 勿在此直接改算法；改 server 后于 server/ 执行 npm run sync-heatmap。
 *
 * 难度热图：个人加权指标 × 全体速度常模；主站/报表展示与分类元数据用。
 * 训练选关与热图格子数据以服务器 API 为准。
 */
`;

const destDir = path.dirname(dest);
if (!fs.existsSync(destDir)) {
  console.error("docs dir missing:", destDir);
  process.exit(1);
}
fs.writeFileSync(dest, header + code, "utf8");
console.log("synced", path.relative(process.cwd(), src), "->", path.relative(process.cwd(), dest));
