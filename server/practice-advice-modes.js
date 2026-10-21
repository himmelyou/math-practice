/**
 * 多模式入队：年级先验、槽位预算、模式元数据（供 practice-advice.js）。
 */
var SPECIAL_ORDER = ["primeComposite", "perfectSquare", "divisibility", "factorsMultiples"];

var MODE_META = {
  decimal: {
    id: "decimal",
    action: "decimal",
    playMode: "decimal",
    levelCount: 6,
    prefix: "D",
    label: "小数",
  },
  perfectSquare: {
    id: "perfectSquare",
    action: "perfectSquare",
    playMode: "perfectSquare",
    levelCount: 4,
    prefix: "L",
    label: "平方数",
  },
  divisibility: {
    id: "divisibility",
    action: "divisibility",
    playMode: "divisibility",
    levelCount: 4,
    prefix: "Z",
    label: "整除",
  },
  factorsMultiples: {
    id: "factorsMultiples",
    action: "factorsMultiples",
    playMode: "factorsMultiples",
    levelCount: 6,
    prefix: "Y",
    label: "因数倍数",
  },
  primeComposite: {
    id: "primeComposite",
    action: "primeComposite",
    playMode: "primeComposite",
    levelCount: 1,
    prefix: "",
    label: "质数合数",
    singlePool: true,
  },
};

var WRONGBOOK_MIN = 30;

function slotBudget(grade) {
  var g = Number(grade);
  if (!Number.isInteger(g) || g < 0) return { arith: 5, special: 0, decimal: 0 };
  if (g >= 4) return { arith: 3, special: 1, decimal: 1 };
  if (g >= 3) return { arith: 4, special: 1, decimal: 0 };
  return { arith: 5, special: 0, decimal: 0 };
}

function modeLevelLabel(modeId, levelIndex) {
  var meta = MODE_META[modeId];
  if (!meta) return "L" + (levelIndex + 1);
  if (meta.singlePool) return meta.label;
  return meta.prefix + (levelIndex + 1);
}

/**
 * @returns {"learned"|"current"|"ahead"|"blocked"}
 * blocked = 该年级暂不推
 */
function modeCurriculumPrior(modeId, grade, levelIndex) {
  var g = Number(grade);
  if (!Number.isInteger(g) || g < 0 || g > 13) return "blocked";
  var L = Math.floor(Number(levelIndex) || 0) + 1;

  if (modeId === "decimal") {
    if (g <= 1) return "blocked";
    if (g === 2) return L <= 2 ? "current" : "ahead";
    if (g === 3) {
      if (L <= 4) return "learned";
      return "current";
    }
    return "learned";
  }

  if (modeId === "primeComposite") {
    if (g <= 1) return "blocked";
    return "learned";
  }

  if (modeId === "perfectSquare") {
    if (g <= 1) return "blocked";
    if (g === 2) return L <= 1 ? "current" : "ahead";
    if (g === 3) {
      if (L <= 2) return "learned";
      if (L === 3) return "current";
      return "ahead";
    }
    if (g === 4) {
      if (L <= 3) return "learned";
      return "current";
    }
    return "learned";
  }

  if (modeId === "divisibility") {
    if (g <= 2) return "blocked";
    if (g === 3) return L <= 2 ? "current" : "ahead";
    if (g === 4) {
      if (L <= 3) return "learned";
      return "current";
    }
    return "learned";
  }

  if (modeId === "factorsMultiples") {
    if (g <= 2) return "blocked";
    if (g === 3) return L <= 2 ? "current" : "ahead";
    if (g === 4) {
      if (L <= 4) return "learned";
      return "current";
    }
    return "learned";
  }

  return "blocked";
}

function modeAllowed(modeId, grade) {
  var meta = MODE_META[modeId];
  if (!meta) return false;
  if (meta.singlePool) return modeCurriculumPrior(modeId, grade, 0) !== "blocked";
  for (var i = 0; i < meta.levelCount; i += 1) {
    if (modeCurriculumPrior(modeId, grade, i) !== "blocked") return true;
  }
  return false;
}

module.exports = {
  SPECIAL_ORDER: SPECIAL_ORDER,
  MODE_META: MODE_META,
  WRONGBOOK_MIN: WRONGBOOK_MIN,
  slotBudget: slotBudget,
  modeLevelLabel: modeLevelLabel,
  modeCurriculumPrior: modeCurriculumPrior,
  modeAllowed: modeAllowed,
};
