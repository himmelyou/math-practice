/**
 * 在 Node 中加载 docs/stats-heatmap-browser.js（与 Report 训练选关口径一致）
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let cached = null;

function getJmlStatsHeatmap() {
  if (cached) return cached;
  const filePath = path.join(__dirname, "..", "docs", "stats-heatmap-browser.js");
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
  if (!cached) {
    throw new Error("Failed to load JmlStatsHeatmap");
  }
  return cached;
}

module.exports = { getJmlStatsHeatmap };
