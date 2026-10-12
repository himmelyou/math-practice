/**
 * 因数倍数 Y1–Y6 出题（先管理端打印）
 * Y1：哪个是 N 的因数？合数 N=4～100；(f,N) 同权；假选项 <N。
 * Y2：哪个是 K 的倍数？合数 K=4～50；m=K×t(t≥2)≤100；(m,K) 同权；
 *      假选项为 K 最大真因数 d 的倍数、但非 K 的倍数，且 K<w≤100。
 * Y3/Y4 入门共用牌库：2≤a<b≤30 且 lcm≤100；三层 1:2:3；Y3 问 g，Y4 问 L。
 * Y5/Y6 进阶共用牌库：2≤a<b≤99 且 lcm≤100；三层 1:2:3；Y5 问 g，Y6 问 L。
 */
(function (global) {
  var QUESTIONS_PER_RUN = 24;
  var Y2_M_MAX = 100;
  var LCM_CAP = 100;
  var INTRO_B_MAX = 30;
  var ADV_B_MAX = 99;
  var LEVEL_COUNT = 6;

  var LEVEL_DEFS = [
    { id: "Y1", name: "第 1 级 · 因数" },
    { id: "Y2", name: "第 2 级 · 倍数" },
    { id: "Y3", name: "第 3 级 · 最大公因数 · 入门" },
    { id: "Y4", name: "第 4 级 · 最小公倍数 · 入门" },
    { id: "Y5", name: "第 5 级 · 最大公因数 · 进阶" },
    { id: "Y6", name: "第 6 级 · 最小公倍数 · 进阶" },
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

  function gcd(a, b) {
    var x = Math.abs(a);
    var y = Math.abs(b);
    var t;
    while (y) {
      t = y;
      y = x % y;
      x = t;
    }
    return x;
  }

  function lcm(a, b) {
    if (!a || !b) return 0;
    return (a / gcd(a, b)) * b;
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

  function smallestPrimeFactor(n) {
    if (n % 2 === 0) return 2;
    var i;
    for (i = 3; i * i <= n; i += 2) {
      if (n % i === 0) return i;
    }
    return n;
  }

  /** K 的最大真因数（≥2）；质数无 */
  function largestProperDivisor(k) {
    if (k < 4 || isPrime(k)) return null;
    return k / smallestPrimeFactor(k);
  }

  /**
   * Y1 假选项：≥2、<N、≠f、不是 N 的因数。
   * 优先 2f → 3f → 4f（且 <N），再 f±1，再往上找。
   */
  function buildY1Distractor(f, n) {
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

  /**
   * Y2 假选项：K < w ≤ 100，不是 K 的倍数；
   * 优先「K 最大真因数 d 的倍数」中离 m 最近者。
   */
  function buildY2Distractor(m, k) {
    var d = largestProperDivisor(k);
    if (d == null || d < 2) return null;

    function ok(w) {
      return w > k && w <= Y2_M_MAX && w !== m && !isFactor(k, w);
    }

    var candidates = [];
    var t;
    var w;
    for (t = 1; d * t <= Y2_M_MAX; t += 1) {
      w = d * t;
      if (ok(w)) candidates.push(w);
    }
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      var da = Math.abs(a - m);
      var db = Math.abs(b - m);
      if (da !== db) return da - db;
      return a - b;
    });
    return candidates[0];
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
        wrong = buildY1Distractor(f, n);
        if (wrong == null) continue;
        pool.push({ n: n, factor: f, wrong: wrong });
      }
    }
    return pool;
  }

  function buildY2Pool() {
    var pool = [];
    var k;
    var t;
    var m;
    var wrong;
    for (k = 4; k <= 50; k += 1) {
      if (isPrime(k)) continue;
      for (t = 2; k * t <= Y2_M_MAX; t += 1) {
        m = k * t;
        wrong = buildY2Distractor(m, k);
        if (wrong == null) continue;
        pool.push({ k: k, multiple: m, wrong: wrong });
      }
    }
    return pool;
  }

  /**
   * 公因数/公倍数共用数对库：2≤a<b≤bMax 且 lcm(a,b)≤LCM_CAP。
   * 按 g 分三层。
   */
  function buildPairPools(bMax) {
    var coprime = [];
    var primeGcd = [];
    var compositeGcd = [];
    var a;
    var b;
    var g;
    var L;
    var item;
    for (a = 2; a <= bMax - 1; a += 1) {
      for (b = a + 1; b <= bMax; b += 1) {
        g = gcd(a, b);
        L = (a / g) * b;
        if (L > LCM_CAP) continue;
        item = { a: a, b: b, g: g, l: L };
        if (g === 1) coprime.push(item);
        else if (isPrime(g)) primeGcd.push(item);
        else compositeGcd.push(item);
      }
    }
    return {
      coprime: coprime,
      primeGcd: primeGcd,
      compositeGcd: compositeGcd,
    };
  }

  var Y1_POOL = buildY1Pool();
  var Y2_POOL = buildY2Pool();
  var INTRO_POOLS = buildPairPools(INTRO_B_MAX);
  var ADV_POOLS = buildPairPools(ADV_B_MAX);

  /** 1:2:3 → 互质 : 质数GCF : 合数GCF；余数按小数部分最大优先补。 */
  function stratumCounts(total) {
    total = Math.max(0, Math.floor(Number(total) || 0));
    var weights = [1, 2, 3];
    var sumW = 6;
    var raw = [];
    var floors = [];
    var i;
    var rem;
    var order;
    for (i = 0; i < 3; i += 1) {
      raw[i] = (total * weights[i]) / sumW;
      floors[i] = Math.floor(raw[i]);
    }
    rem = total - (floors[0] + floors[1] + floors[2]);
    order = [0, 1, 2].sort(function (i, j) {
      var fi = raw[i] - floors[i];
      var fj = raw[j] - floors[j];
      if (fj !== fi) return fj - fi;
      return i - j;
    });
    for (i = 0; i < rem; i += 1) {
      floors[order[i]] += 1;
    }
    return {
      coprime: floors[0],
      primeGcd: floors[1],
      compositeGcd: floors[2],
    };
  }

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

  function materializeY2(item) {
    var correctFirst = Math.random() < 0.5;
    var optA = correctFirst ? item.multiple : item.wrong;
    var optB = correctFirst ? item.wrong : item.multiple;
    var answerLetter = correctFirst ? "A" : "B";
    var text =
      "哪个是 " + item.k + " 的倍数？  A. " + optA + "  B. " + optB;
    return {
      text: text,
      prompt: text,
      answer: answerLetter + "（" + item.multiple + "）",
      answerLetter: answerLetter,
      correctValue: item.multiple,
      wrongValue: item.wrong,
      k: item.k,
      multiple: item.multiple,
      baseLevelId: "Y2",
      op: "multiple",
    };
  }

  function materializeGcf(item, levelId) {
    var text = item.a + " 和 " + item.b + " 的最大公因数是 ______";
    return {
      text: text,
      prompt: text,
      answer: String(item.g),
      a: item.a,
      b: item.b,
      g: item.g,
      l: item.l,
      baseLevelId: levelId,
      op: "gcf",
      fillIn: true,
    };
  }

  function materializeLcm(item, levelId) {
    var text = item.a + " 和 " + item.b + " 的最小公倍数是 ______";
    return {
      text: text,
      prompt: text,
      answer: String(item.l),
      a: item.a,
      b: item.b,
      g: item.g,
      l: item.l,
      baseLevelId: levelId,
      op: "lcm",
      fillIn: true,
    };
  }

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(Number(i) || 0)));
  }

  function buildPoolRun(pool, materialize, count, opts) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count === 0) return [];
    if (!pool || !pool.length) {
      throw new Error("因数倍数牌库为空，无法出题");
    }
    opts = opts || {};
    var run = [];
    var i;
    var idx;
    var deck;
    if (opts.keepOrder) {
      var offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
      for (i = 0; i < count; i += 1) {
        idx = (offset + i) % pool.length;
        run.push(materialize(pool[idx]));
      }
      return run;
    }
    deck = shuffleArray(pool);
    i = 0;
    while (run.length < count) {
      if (i >= deck.length) {
        deck = shuffleArray(pool);
        i = 0;
      }
      run.push(materialize(deck[i]));
      i += 1;
    }
    return run;
  }

  function buildStratifiedPairRun(pools, materialize, count, opts) {
    opts = opts || {};
    var counts = stratumCounts(count);
    var run = [];
    run = run.concat(buildPoolRun(pools.coprime, materialize, counts.coprime, opts));
    run = run.concat(buildPoolRun(pools.primeGcd, materialize, counts.primeGcd, opts));
    run = run.concat(
      buildPoolRun(pools.compositeGcd, materialize, counts.compositeGcd, opts)
    );
    if (opts.keepOrder) return run;
    return shuffleArray(run);
  }

  function buildRun(levelIndex, count, opts) {
    levelIndex = clampLevelIndex(levelIndex);
    if (count == null || count === "") count = QUESTIONS_PER_RUN;
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (levelIndex === 0) return buildPoolRun(Y1_POOL, materializeY1, count, opts);
    if (levelIndex === 1) return buildPoolRun(Y2_POOL, materializeY2, count, opts);
    if (levelIndex === 2) {
      return buildStratifiedPairRun(
        INTRO_POOLS,
        function (item) {
          return materializeGcf(item, "Y3");
        },
        count,
        opts
      );
    }
    if (levelIndex === 3) {
      return buildStratifiedPairRun(
        INTRO_POOLS,
        function (item) {
          return materializeLcm(item, "Y4");
        },
        count,
        opts
      );
    }
    if (levelIndex === 4) {
      return buildStratifiedPairRun(
        ADV_POOLS,
        function (item) {
          return materializeGcf(item, "Y5");
        },
        count,
        opts
      );
    }
    if (levelIndex === 5) {
      return buildStratifiedPairRun(
        ADV_POOLS,
        function (item) {
          return materializeLcm(item, "Y6");
        },
        count,
        opts
      );
    }
    throw new Error("因数倍数 Y" + (levelIndex + 1) + " 尚未定稿");
  }

  function buildQuestion(levelIndex) {
    return buildRun(levelIndex, 1)[0];
  }

  var LEVEL_LABELS = LEVEL_DEFS.slice(0, LEVEL_COUNT).map(function (level) {
    var shortName = String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlFactorsMultiples = {
    LEVEL_COUNT: LEVEL_COUNT,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    LCM_CAP: LCM_CAP,
    INTRO_B_MAX: INTRO_B_MAX,
    ADV_B_MAX: ADV_B_MAX,
    Y1_POOL_SIZE: Y1_POOL.length,
    Y2_POOL_SIZE: Y2_POOL.length,
    INTRO_POOL_COPRIME_SIZE: INTRO_POOLS.coprime.length,
    INTRO_POOL_PRIME_GCD_SIZE: INTRO_POOLS.primeGcd.length,
    INTRO_POOL_COMPOSITE_GCD_SIZE: INTRO_POOLS.compositeGcd.length,
    ADV_POOL_COPRIME_SIZE: ADV_POOLS.coprime.length,
    ADV_POOL_PRIME_GCD_SIZE: ADV_POOLS.primeGcd.length,
    ADV_POOL_COMPOSITE_GCD_SIZE: ADV_POOLS.compositeGcd.length,
    Y1_POOL: Y1_POOL,
    Y2_POOL: Y2_POOL,
    INTRO_POOLS: INTRO_POOLS,
    ADV_POOLS: ADV_POOLS,
    LEVEL_LABELS: LEVEL_LABELS,
    LEVEL_DEFS: LEVEL_DEFS,
    buildY1Distractor: buildY1Distractor,
    buildY2Distractor: buildY2Distractor,
    buildDistractor: buildY1Distractor,
    properFactors: properFactors,
    largestProperDivisor: largestProperDivisor,
    gcd: gcd,
    lcm: lcm,
    stratumCounts: stratumCounts,
    y3StratumCounts: stratumCounts,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
