/**
 * 在 Node 中加载 stats 聚合模块（浏览器同源文件）。
 * 真源：docs/stats-aggregate-browser.js；若 server/ 有副本优先用副本。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let cached = null;
let cachedFrom = null;

function resolveAggregateBrowserPath() {
  const bundled = path.join(__dirname, "stats-aggregate-browser.js");
  if (fs.existsSync(bundled)) return bundled;
  const fromDocs = path.join(__dirname, "..", "docs", "stats-aggregate-browser.js");
  if (fs.existsSync(fromDocs)) return fromDocs;
  return null;
}

function getJmlStatsAggregate() {
  if (cached) return cached;
  const filePath = resolveAggregateBrowserPath();
  if (!filePath) {
    throw new Error("Failed to load JmlStatsAggregate: missing stats-aggregate-browser.js");
  }
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = {
    console,
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    JSON,
    window: {},
    global: {},
    isNaN: Number.isNaN,
    parseInt,
    parseFloat,
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  cached = sandbox.JmlStatsAggregate || (sandbox.window && sandbox.window.JmlStatsAggregate);
  cachedFrom = filePath;
  if (!cached) {
    throw new Error("Failed to load JmlStatsAggregate from " + filePath);
  }
  return cached;
}

function clearJmlStatsAggregateCache() {
  cached = null;
  cachedFrom = null;
}

module.exports = {
  getJmlStatsAggregate,
  clearJmlStatsAggregateCache,
  resolveAggregateBrowserPath,
};
