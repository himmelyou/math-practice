/**
 * 在 Node 中加载热图/选关模块。
 * 真源：server/stats-heatmap-browser.js（Render Root=server 必含此文件）。
 * 本地若缺失才回退 ../docs（仅开发容错，勿把 docs 当改算法入口）。
 *
 * 改算法后：npm run sync-heatmap（server → docs）再提交。
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
    throw new Error("Failed to load JmlStatsHeatmap: missing server/stats-heatmap-browser.js");
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
