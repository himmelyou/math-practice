/**
 * 质数合数专项：2～99，每局 25 个质数 + 25 个随机合数，共 50 题。
 * 与小程序 JarvisMathLab/utils/prime-composite-logic.js 对齐。
 */
(function (global) {
  const PRIMES_2_TO_99 = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  ];

  const PRIME_SET = new Set(PRIMES_2_TO_99);

  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function getCompositePool() {
    const pool = [];
    for (let n = 2; n <= 99; n += 1) {
      if (!PRIME_SET.has(n)) pool.push(n);
    }
    return pool;
  }

  function buildRoundQuestions() {
    const pool = getCompositePool();
    if (pool.length < 25) {
      throw new Error("composite pool too small");
    }
    const pickedComposites = shuffle(pool).slice(0, 25);
    const qs = [];
    PRIMES_2_TO_99.forEach((n) => {
      qs.push({ n, kind: "prime" });
    });
    pickedComposites.forEach((n) => {
      qs.push({ n, kind: "composite" });
    });
    return shuffle(qs);
  }

  const KIND_LABEL = {
    prime: "质数",
    composite: "合数",
  };

  function kindLabel(kind) {
    return KIND_LABEL[kind] || String(kind);
  }

  global.JMLPrimeComposite = {
    PRIMES_2_TO_99,
    TOTAL_QUESTIONS: 50,
    SCORE_PER_CORRECT: 5,
    buildRoundQuestions,
    kindLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
