/**
 * 在 Node 中加载训练/热图选关模块（与 Report 口径一致）。
 * 优先读 server/stats-heatmap-browser.js（Render Root=server 可部署）；
 * 本地 monorepo 若无副本则回退 ../docs/stats-heatmap-browser.js。
 *
 * 改 docs 侧算法后请同步：npm run sync-heatmap（在 server/ 下）
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let cached = null;
let cachedFrom = null;

function resolveHeatmapBrowserPath() {
  const bundled = path.join(__dirname, "stats-heatmap-browser.js");
  if (fs.existsSync(bundled)) return bundled;
  const fromDocs = path.join(__dirname, "..", "docs", "stats-heatmap-browser.js");
  if (fs.existsSync(fromDocs)) return fromDocs;
  return null;
}

function getJmlStatsHeatmap() {
  if (cached) return cached;
  const filePath = resolveHeatmapBrowserPath();
  if (!filePath) {
    throw new Error(
      "Failed to load JmlStatsHeatmap: missing server/stats-heatmap-browser.js (and no ../docs fallback)"
    );
  }
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = {
    console,
    Math,
    Date,
    Intl,
    Number,
    String,
    Array,
    Object,
    JSON,
    isNaN: Number.isNaN,
    parseInt,
    parseFloat,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  cached = sandbox.JmlStatsHeatmap;
  cachedFrom = filePath;
  if (!cached) {
    throw new Error("Failed to load JmlStatsHeatmap from " + filePath);
  }
  return cached;
}

/** 测试/热重载用；生产每次部署新进程即可 */
function clearJmlStatsHeatmapCache() {
  cached = null;
  cachedFrom = null;
}

function getJmlStatsHeatmapSourcePath() {
  return cachedFrom || resolveHeatmapBrowserPath();
}

module.exports = {
  getJmlStatsHeatmap,
  clearJmlStatsHeatmapCache,
  getJmlStatsHeatmapSourcePath,
  resolveHeatmapBrowserPath,
};
