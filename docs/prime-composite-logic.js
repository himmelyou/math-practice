/**
 * 质数合数专项：2～99，每局 50 题（按“易混淆优先”抽题）。
 * 规则：
 * 1) 必含所有 1/3/7/9 尾数数字（去掉 1）=> 39 个
 * 2) 补上 2、5 两个尾数特例质数 => 41 个
 * 3) 再从剩余“偶数 + 5 结尾”数字中随机抽 9 个 => 合计 50 题
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

  function getEvenOrFiveEndingPool(excludeSet) {
    const pool = [];
    for (let n = 2; n <= 99; n += 1) {
      const isEven = n % 2 === 0;
      const endsWithFive = n % 10 === 5;
      if ((isEven || endsWithFive) && !excludeSet.has(n)) {
        pool.push(n);
      }
    }
    return pool;
  }

  function buildRoundQuestions() {
    const mustInclude = [];
    // 1/3/7/9 尾数（排除 1）
    for (let n = 3; n <= 99; n += 1) {
      const last = n % 10;
      if (last === 1 || last === 3 || last === 7 || last === 9) {
        mustInclude.push(n);
      }
    }

    // 补上两个漏网质数
    mustInclude.push(2, 5);

    const mustSet = new Set(mustInclude);
    const candidatePool = getEvenOrFiveEndingPool(mustSet);
    if (candidatePool.length < 9) {
      throw new Error("candidate pool too small");
    }
    const pickedExtra = shuffle(candidatePool).slice(0, 9);

    const qs = [];

    mustInclude.forEach((n) => {
      qs.push({ n, kind: PRIME_SET.has(n) ? "prime" : "composite" });
    });
    pickedExtra.forEach((n) => {
      qs.push({ n, kind: PRIME_SET.has(n) ? "prime" : "composite" });
    });

    if (qs.length !== 50) throw new Error("round question count mismatch");
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
