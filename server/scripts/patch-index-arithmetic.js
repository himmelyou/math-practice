const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const htmlPath = path.join(root, "docs/index.html");
let html = fs.readFileSync(htmlPath, "utf8");

if (!html.includes("arithmetic-questions.js")) {
  html = html.replace(
    /<script src="shared\/expand-brackets-questions\.js\?v=\d+"><\/script>/,
    '<script src="shared/arithmetic-questions.js?v=20"></script>\n  <script src="shared/expand-brackets-questions.js?v=20"></script>'
  );
}

const start = html.indexOf("    // ===== 难度模块定义 =====");
const end = html.indexOf("    // ========= 生存挑战模式：全局状态 =========");
if (start < 0 || end < 0 || end <= start) {
  throw new Error("index.html patch markers not found: start=" + start + " end=" + end);
}

const replacement =
  "    // ===== 难度模块定义（shared/arithmetic-questions.js）=====\n" +
  "    const DIFFICULTY_MODULE = {\n" +
  "      levels: window.JmlArithmetic.getDifficultyLevels()\n" +
  "    };\n\n    ";

html = html.slice(0, start) + replacement + html.slice(end);

const genRe =
  /function generateBaseQuestion\(\) \{\s*const level = DIFFICULTY_MODULE\.levels\[currentLevelIndex\];\s*return level\.generateQuestion\(\);\s*\}/;
if (!genRe.test(html)) throw new Error("generateBaseQuestion block not found");
html = html.replace(
  genRe,
  "function generateBaseQuestion() {\n      return window.JmlArithmetic.buildQuestion(currentLevelIndex);\n    }"
);

fs.writeFileSync(htmlPath, html, "utf8");
console.log("patched index.html");
