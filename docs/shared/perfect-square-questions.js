/**
 * 平方数 L1–L3 出题：题库生成 + 洗牌（每局题目不重复）
 * 正运算 n² = ?；逆运算 ?² = n²
 */
(function (global) {
  const PS_MAX_LEVEL = 2;

  /** L1=20, L2=24, L3=30 */
  const QUESTIONS_PER_RUN = [20, 24, 30];

  const LEVEL_LABELS = [
    "L1 · 2～11 的平方",
    "L2 · 2～20 的平方",
    "L3 · 2～30 的平方",
  ];

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** @param {number} n */
  function makeForward(n) {
    const sq = n * n;
    const prompt = n + "² = ?";
    return { prompt: prompt, text: prompt, answer: sq, kind: "forward", base: n };
  }

  /** @param {number} n */
  function makeInverse(n) {
    const sq = n * n;
    const prompt = "?² = " + sq;
    return { prompt: prompt, text: prompt, answer: n, kind: "inverse", base: n };
  }

  function buildBaseBank(minBase, maxBase) {
    const bank = [];
    for (let n = minBase; n <= maxBase; n += 1) {
      bank.push(makeForward(n));
      bank.push(makeInverse(n));
    }
    return bank;
  }

  function sampleWithoutReplacement(pool, count) {
    const copy = pool.slice();
    shuffleInPlace(copy);
    return copy.slice(0, count);
  }

  function clampLevel(level) {
    return Math.min(PS_MAX_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
  }

  function questionsPerRun(level) {
    const lv = clampLevel(level);
    return QUESTIONS_PER_RUN[lv] || 20;
  }

  /**
   * 生成本局完整题序（已洗牌，同局无重复题面）
   * @param {number} level 0=L1, 1=L2, 2=L3
   * @returns {Array<{ prompt: string, text: string, answer: number }>}
   */
  function buildRun(level) {
    const lv = clampLevel(level);
    let deck;

    if (lv === 0) {
      deck = buildBaseBank(2, 11);
    } else if (lv === 1) {
      deck = buildBaseBank(11, 20).concat(sampleWithoutReplacement(buildBaseBank(2, 10), 4));
    } else {
      deck = buildBaseBank(21, 30)
        .concat(sampleWithoutReplacement(buildBaseBank(11, 20), 8))
        .concat(sampleWithoutReplacement(buildBaseBank(2, 10), 2));
    }

    shuffleInPlace(deck);
    return deck;
  }

  /** @deprecated 请使用 buildRun；保留供调试 */
  function buildQuestion(level) {
    const run = buildRun(level);
    return run[0] || makeForward(2);
  }

  global.JmlPerfectSquare = {
    buildRun: buildRun,
    buildQuestion: buildQuestion,
    questionsPerRun: questionsPerRun,
    LEVEL_LABELS: LEVEL_LABELS,
    PS_MAX_LEVEL: PS_MAX_LEVEL,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
  };
})(typeof window !== "undefined" ? window : globalThis);
