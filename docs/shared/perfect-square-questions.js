/**
 * 平方数 L1–L3 出题（框架占位；规则定稿后替换 buildQuestion 内部）
 */
(function (global) {
  const PS_MAX_LEVEL = 2;

  const LEVEL_LABELS = [
    "L1 · 平方数（入门）",
    "L2 · 平方数（进阶）",
    "L3 · 平方数（挑战）",
  ];

  /** @returns {{ prompt: string, text: string, answer: number }} */
  function buildQuestion(level) {
    const lv = Math.min(PS_MAX_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
    const n = lv + 2;
    const sq = n * n;
    const prompt = "√" + sq + " = ?";
    return {
      prompt,
      text: prompt,
      answer: n,
    };
  }

  global.JmlPerfectSquare = {
    buildQuestion,
    LEVEL_LABELS,
    PS_MAX_LEVEL,
  };
})(typeof window !== "undefined" ? window : globalThis);
