/**
 * 平方数 L1–L4：各级均为固定牌库洗牌；局内须全部掌握，错题回库（L4 展示时再随机藏底数/指数/结果）
 */
(function (global) {
  const PS_MAX_LEVEL = 3;
  const L4_LEVEL_INDEX = 3;

  /** L1=20, L2=24, L3=30, L4=26（须全部掌握） */
  const QUESTIONS_PER_RUN = [20, 24, 30, 26];

  const LEVEL_LABELS = [
    "L1 · 2～11 的平方",
    "L2 · 2～20 的平方",
    "L3 · 2～30 的平方",
    "L4 · 2/3/5 质因数的幂",
  ];

  const SUPERSCRIPT_DIGITS = {
    0: "⁰",
    1: "¹",
    2: "²",
    3: "³",
    4: "⁴",
    5: "⁵",
    6: "⁶",
    7: "⁷",
    8: "⁸",
    9: "⁹",
  };

  /** 藏指数时的上标占位（无正式上标 ?，用修饰字母 ˀ，高度接近 ²³） */
  const SUPERSCRIPT_QUESTION = "ˀ";

  /** L4 固定 26 张牌（b≤30 的平方已去掉；不含 12³） */
  const L4_CARDS = [
    { base: 2, exp: 3, value: 8 },
    { base: 2, exp: 4, value: 16 },
    { base: 2, exp: 5, value: 32 },
    { base: 2, exp: 6, value: 64 },
    { base: 2, exp: 7, value: 128 },
    { base: 2, exp: 8, value: 256 },
    { base: 2, exp: 9, value: 512 },
    { base: 2, exp: 10, value: 1024 },
    { base: 3, exp: 3, value: 27 },
    { base: 3, exp: 4, value: 81 },
    { base: 3, exp: 5, value: 243 },
    { base: 3, exp: 6, value: 729 },
    { base: 4, exp: 3, value: 64 },
    { base: 4, exp: 4, value: 256 },
    { base: 4, exp: 5, value: 1024 },
    { base: 5, exp: 3, value: 125 },
    { base: 5, exp: 4, value: 625 },
    { base: 6, exp: 3, value: 216 },
    { base: 6, exp: 4, value: 1296 },
    { base: 8, exp: 3, value: 512 },
    { base: 9, exp: 3, value: 729 },
    { base: 10, exp: 3, value: 1000 },
    { base: 32, exp: 2, value: 1024 },
    { base: 36, exp: 2, value: 1296 },
    { base: 40, exp: 2, value: 1600 },
    { base: 45, exp: 2, value: 2025 },
  ];

  const L4_MASKS = ["value", "base", "exp"];

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function expSuperscript(n) {
    return String(n)
      .split("")
      .map(function (ch) {
        return SUPERSCRIPT_DIGITS[ch] || ch;
      })
      .join("");
  }

  function randomMask() {
    return L4_MASKS[Math.floor(Math.random() * L4_MASKS.length)];
  }

  /**
   * @param {{ base: number, exp: number, value: number }} card
   * @param {"value"|"base"|"exp"} [mask]
   */
  function materializeL4Question(card, mask) {
    const m = mask || randomMask();
    const expStr = expSuperscript(card.exp);
    let prompt;
    let answer;
    if (m === "value") {
      prompt = card.base + expStr + " = ?";
      answer = card.value;
    } else if (m === "base") {
      prompt = "?" + expStr + " = " + card.value;
      answer = card.base;
    } else {
      prompt = card.base + SUPERSCRIPT_QUESTION + " = " + card.value;
      answer = card.exp;
    }
    return {
      prompt: prompt,
      text: prompt,
      answer: answer,
      kind: "l4",
      mask: m,
      base: card.base,
      exp: card.exp,
      value: card.value,
      cardKey: card.base + ":" + card.exp,
    };
  }

  function cloneL4Card(card) {
    return { base: card.base, exp: card.exp, value: card.value };
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

  function isMasterDeckLevel(level) {
    return clampLevel(level) === L4_LEVEL_INDEX;
  }

  function questionsPerRun(level) {
    const lv = clampLevel(level);
    return QUESTIONS_PER_RUN[lv] || 20;
  }

  function buildL4Deck() {
    return shuffleInPlace(L4_CARDS.map(cloneL4Card));
  }

  /**
   * 生成本局题序（L1–L3 为已渲染题面；L4 为 26 张牌，展示时 materialize）
   */
  function buildRun(level) {
    const lv = clampLevel(level);
    if (lv === L4_LEVEL_INDEX) {
      return buildL4Deck();
    }

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
    if (isMasterDeckLevel(level)) {
      return materializeL4Question(run[0] || L4_CARDS[0]);
    }
    return run[0] || makeForward(2);
  }

  global.JmlPerfectSquare = {
    buildRun: buildRun,
    buildQuestion: buildQuestion,
    buildL4Deck: buildL4Deck,
    materializeL4Question: materializeL4Question,
    expSuperscript: expSuperscript,
    questionsPerRun: questionsPerRun,
    isMasterDeckLevel: isMasterDeckLevel,
    LEVEL_LABELS: LEVEL_LABELS,
    PS_MAX_LEVEL: PS_MAX_LEVEL,
    L4_LEVEL_INDEX: L4_LEVEL_INDEX,
    L4_CARD_COUNT: L4_CARDS.length,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
  };
})(typeof window !== "undefined" ? window : globalThis);
