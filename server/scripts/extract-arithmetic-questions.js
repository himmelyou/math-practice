const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
const marker = "    const DIFFICULTY_MODULE = {";
const start = html.indexOf(marker);
if (start < 0) throw new Error("marker not found");
const levelsKey = html.indexOf("levels: [", start);
const endMarker = "    // ========= 生存挑战模式：全局状态 =========";
const end = html.indexOf(endMarker, levelsKey);
if (end < 0) throw new Error("end not found");
const beforeSurvival = html.slice(levelsKey, end);
const closeIdx = beforeSurvival.lastIndexOf("]");
if (closeIdx < 0) throw new Error("levels array close not found");
const levelsArray = beforeSurvival.slice("levels: ".length, closeIdx + 1);

const header = `/**
 * 四则运算 L1–L16 出题（与主站 docs/index.html 内联块同源，合并前请 diff）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  var LEVEL_DEFS = `;

const footer = `;

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  function buildQuestion(levelIndex) {
    var level = LEVEL_DEFS[clampLevelIndex(levelIndex)];
    return level.generateQuestion.call(level);
  }

  function getDifficultyLevels() {
    return LEVEL_DEFS;
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    var shortName = String(level.name || "").replace(/^第\\s*\\d+\\s*级\\s*·\\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlArithmetic = {
    LEVEL_COUNT: LEVEL_DEFS.length,
    LEVEL_LABELS: LEVEL_LABELS,
    buildQuestion: buildQuestion,
    getDifficultyLevels: getDifficultyLevels,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
`;

const out = header + levelsArray + footer;
const outPath = path.join(root, "docs/shared/arithmetic-questions.js");
fs.writeFileSync(outPath, out, "utf8");
console.log("written", outPath, out.length, "bytes");
