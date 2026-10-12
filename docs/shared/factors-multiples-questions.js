/**
 * 因数倍数 Y1–Y4 出题（先管理端打印；Y1 已定稿）
 * Y1：哪个是 N 的因数？全库 (f,N) 同权；假选项固定策略且必须 < N。
 */
(function (global) {
  var QUESTIONS_PER_RUN = 24;

  var LEVEL_DEFS = [
    { id: "Y1", name: "第 1 级 · 因数" },
    { id: "Y2", name: "第 2 级 · 倍数（待定）" },
    { id: "Y3", name: "第 3 级 · 最大公因数（待定）" },
    { id: "Y4", name: "第 4 级 · 最小公倍数（待定）" },
  ];

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    var i;
    var j;
    var t;
    for (i = a.length - 1; i > 0; i -= 1) {
      j = randomInt(0, i);
      t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    var i;
    for (i = 3; i * i <= n; i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  }

  function isFactor(f, n) {
    return f >= 1 && n % f === 0;
  }

  /** N 的真因数：去掉 1 和 N */
  function properFactors(n) {
    var out = [];
    var i;
    for (i = 2; i * i <= n; i += 1) {
      if (n % i === 0) {
        out.push(i);
        var other = n / i;
        if (other !== i && other !== n) out.push(other);
      }
    }
    out.sort(function (a, b) {
      return a - b;
    });
    return out;
  }

  /**
   * 假选项：必须 ≥2、<N、≠f、不是 N 的因数。
   * 优先 2f → 3f → 4f（且 <N），再 f+1、f−1，再从 f+2 往上找。
   */
  function buildDistractor(f, n) {
    function ok(w) {
      return w >= 2 && w < n && w !== f && !isFactor(w, n);
    }
    var k;
    for (k = 2; k <= 4; k += 1) {
      if (ok(k * f)) return k * f;
    }
    if (ok(f + 1)) return f + 1;
    if (ok(f - 1)) return f - 1;
    for (k = f + 2; k < n; k += 1) {
      if (ok(k)) return k;
    }
    for (k = 2; k < n; k += 1) {
      if (ok(k)) return k;
    }
    return null;
  }

  function buildY1Pool() {
    var pool = [];
    var n;
    var factors;
    var i;
    var f;
    var wrong;
    for (n = 4; n <= 100; n += 1) {
      if (isPrime(n)) continue;
      factors = properFactors(n);
      for (i = 0; i < factors.length; i += 1) {
        f = factors[i];
        wrong = buildDistractor(f, n);
        if (wrong == null) continue;
        pool.push({ n: n, factor: f, wrong: wrong });
      }
    }
    return pool;
  }

  var Y1_POOL = buildY1Pool();

  function materializeY1(item) {
    var correctFirst = Math.random() < 0.5;
    var optA = correctFirst ? item.factor : item.wrong;
    var optB = correctFirst ? item.wrong : item.factor;
    var answerLetter = correctFirst ? "A" : "B";
    var text =
      "哪个是 " + item.n + " 的因数？  A. " + optA + "  B. " + optB;
    return {
      text: text,
      prompt: text,
      answer: answerLetter + "（" + item.factor + "）",
      answerLetter: answerLetter,
      correctValue: item.factor,
      wrongValue: item.wrong,
      n: item.n,
      factor: item.factor,
      baseLevelId: "Y1",
      op: "factor",
    };
  }

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  function buildY1Run(count, opts) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count === 0) return [];
    opts = opts || {};
    var run = [];
    var i;
    var idx;
    var deck;
    if (opts.keepOrder) {
      // 管理端验题：按 N、f 顺序，多页用 offset 接续
      var offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
      for (i = 0; i < count; i += 1) {
        idx = (offset + i) % Y1_POOL.length;
        run.push(materializeY1(Y1_POOL[idx]));
      }
      return run;
    }
    deck = shuffleArray(Y1_POOL);
    i = 0;
    while (run.length < count) {
      if (i >= deck.length) {
        deck = shuffleArray(Y1_POOL);
        i = 0;
      }
      run.push(materializeY1(deck[i]));
      i += 1;
    }
    return run;
  }

  function buildRun(levelIndex, count, opts) {
    levelIndex = clampLevelIndex(levelIndex);
    if (count == null || count === "") count = QUESTIONS_PER_RUN;
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (levelIndex === 0) return buildY1Run(count, opts);
    throw new Error("因数倍数 Y" + (levelIndex + 1) + " 尚未定稿");
  }

  function buildQuestion(levelIndex) {
    return buildRun(levelIndex, 1)[0];
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    var shortName = String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlFactorsMultiples = {
    LEVEL_COUNT: 1,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    Y1_POOL_SIZE: Y1_POOL.length,
    Y1_POOL: Y1_POOL,
    LEVEL_LABELS: LEVEL_LABELS.slice(0, 1),
    LEVEL_DEFS: LEVEL_DEFS,
    buildDistractor: buildDistractor,
    properFactors: properFactors,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
