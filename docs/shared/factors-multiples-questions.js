/**
 * 因数倍数 Y1–Y6 出题（先管理端打印）
 * Y1/Y2 共用数对 (f,N)：合数 N=4～100，f 为真因数（≥2、<N）。
 * 抽题：先抽 count 个不同 f（f 同权），再在各自 (f,N) 中各抽 1 对；整卷打乱。
 * Y1：哪个是 N 的因数？正解 f；假选项绕 f 邻域扩圈（奇 N±2，偶 N±1）。
 * Y2：哪个是 f 的倍数？正解 N；假选项绕 N 邻域 ±1 扩圈（非 f 的倍数，f<w≤100）。
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
   * 从 f 邻域扩圈：N 奇数步长 2（保持奇数），N 偶数步长 1。
   * 每圈随机一个方向，先试该侧再试对侧；两侧都不行则扩大一格。
   */
  function buildY1Distractor(f, n) {
    function ok(w) {
      return w >= 2 && w < n && w !== f && !isFactor(w, n);
    }
    var step = n % 2 === 0 ? 1 : 2;
    var maxDist = Math.max(f - 2, n - 1 - f);
    var k;
    var d;
    var dir;
    var w;
    for (k = 1; k * step <= maxDist + step; k += 1) {
      d = k * step;
      dir = Math.random() < 0.5 ? 1 : -1;
      w = f + dir * d;
      if (ok(w)) return w;
      w = f - dir * d;
      if (ok(w)) return w;
    }
    return null;
  }

  /**
   * Y2 假选项：正解倍数为 m(=N)，底数为 k(=f)。
   * f < w ≤ 100、≠m、不是 f 的倍数；从 m 邻域 ±1 扩圈，随机方向。
   */
  function buildY2Distractor(m, k) {
    function ok(w) {
      return w > k && w <= Y2_M_MAX && w !== m && !isFactor(k, w);
    }
    var maxDist = Math.max(m - (k + 1), Y2_M_MAX - m);
    var ring;
    var d;
    var dir;
    var w;
    for (ring = 1; ring <= maxDist + 1; ring += 1) {
      d = ring;
      dir = Math.random() < 0.5 ? 1 : -1;
      w = m + dir * d;
      if (ok(w)) return w;
      w = m - dir * d;
      if (ok(w)) return w;
    }
    return null;
  }

  /** Y1/Y2 共用：(factor, n)，仅保留两侧假选项都能生成的对。 */
  function buildSharedFactorPool() {
    var pool = [];
    var n;
    var factors;
    var i;
    var f;
    for (n = 4; n <= 100; n += 1) {
      if (isPrime(n)) continue;
      factors = properFactors(n);
      for (i = 0; i < factors.length; i += 1) {
        f = factors[i];
        if (buildY1Distractor(f, n) == null) continue;
        if (buildY2Distractor(n, f) == null) continue;
        pool.push({ n: n, factor: f });
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

  var SHARED_FACTOR_POOL = buildSharedFactorPool();
  var Y1_POOL = SHARED_FACTOR_POOL;
  var Y2_POOL = SHARED_FACTOR_POOL;

  function indexSharedFactorPool(pool) {
    var byF = {};
    var i;
    var item;
    var f;
    for (i = 0; i < pool.length; i += 1) {
      item = pool[i];
      f = item.factor;
      if (!byF[f]) byF[f] = [];
      byF[f].push(item);
    }
    var keys = Object.keys(byF)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    return { byF: byF, keys: keys };
  }

  var SHARED_FACTOR_INDEX = indexSharedFactorPool(SHARED_FACTOR_POOL);
  var SHARED_FACTOR_BY_F = SHARED_FACTOR_INDEX.byF;
  var SHARED_FACTOR_KEYS = SHARED_FACTOR_INDEX.keys;

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
    var wrong = buildY1Distractor(item.factor, item.n);
    if (wrong == null) {
      throw new Error("Y1 假选项生成失败: f=" + item.factor + " N=" + item.n);
    }
    var correctFirst = Math.random() < 0.5;
    var optA = correctFirst ? item.factor : wrong;
    var optB = correctFirst ? wrong : item.factor;
    var answerLetter = correctFirst ? "A" : "B";
    var promptStem = "哪个是 " + item.n + " 的因数？";
    var text = promptStem + "  A. " + optA + "  B. " + optB;
    return {
      text: text,
      prompt: text,
      promptStem: promptStem,
      optionA: optA,
      optionB: optB,
      answer: answerLetter + "（" + item.factor + "）",
      answerLetter: answerLetter,
      correctValue: item.factor,
      wrongValue: wrong,
      n: item.n,
      factor: item.factor,
      baseLevelId: "Y1",
      op: "factor",
      fillIn: false,
    };
  }

  function materializeY2(item) {
    var multiple = item.n;
    var k = item.factor;
    var wrong = buildY2Distractor(multiple, k);
    if (wrong == null) {
      throw new Error("Y2 假选项生成失败: f=" + k + " N=" + multiple);
    }
    var correctFirst = Math.random() < 0.5;
    var optA = correctFirst ? multiple : wrong;
    var optB = correctFirst ? wrong : multiple;
    var answerLetter = correctFirst ? "A" : "B";
    var promptStem = "哪个是 " + k + " 的倍数？";
    var text = promptStem + "  A. " + optA + "  B. " + optB;
    return {
      text: text,
      prompt: text,
      promptStem: promptStem,
      optionA: optA,
      optionB: optB,
      answer: answerLetter + "（" + multiple + "）",
      answerLetter: answerLetter,
      correctValue: multiple,
      wrongValue: wrong,
      k: k,
      multiple: multiple,
      n: item.n,
      factor: item.factor,
      baseLevelId: "Y2",
      op: "multiple",
      fillIn: false,
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

  /**
   * Y1/Y2：先抽不同 f（f 同权），再在该 f 的数对里各抽 1 题。
   * count ≤ 不同 f 数时，一局内 f 互不重复。
   */
  function buildFactorBalancedRun(materialize, count, opts) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count === 0) return [];
    opts = opts || {};
    var keys = SHARED_FACTOR_KEYS;
    var byF = SHARED_FACTOR_BY_F;
    if (!keys.length) {
      throw new Error("因数倍数牌库为空，无法出题");
    }
    var run = [];
    var i;
    var f;
    var pairs;
    var item;
    var selected = [];

    if (opts.keepOrder) {
      var offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
      for (i = 0; i < count; i += 1) {
        f = keys[(offset + i) % keys.length];
        pairs = byF[f];
        item = pairs[(offset + i) % pairs.length];
        run.push(materialize(item));
      }
      return run;
    }

    while (selected.length < count) {
      var deck = shuffleArray(keys);
      var take = Math.min(deck.length, count - selected.length);
      for (i = 0; i < take; i += 1) {
        selected.push(deck[i]);
      }
    }

    for (i = 0; i < selected.length; i += 1) {
      f = selected[i];
      pairs = byF[f];
      item = pairs[randomInt(0, pairs.length - 1)];
      run.push(materialize(item));
    }
    return shuffleArray(run);
  }

  function buildRun(levelIndex, count, opts) {
    levelIndex = clampLevelIndex(levelIndex);
    if (count == null || count === "") count = QUESTIONS_PER_RUN;
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (levelIndex === 0) return buildFactorBalancedRun(materializeY1, count, opts);
    if (levelIndex === 1) return buildFactorBalancedRun(materializeY2, count, opts);
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
    FM_MAX_LEVEL: LEVEL_COUNT - 1,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    LCM_CAP: LCM_CAP,
    INTRO_B_MAX: INTRO_B_MAX,
    ADV_B_MAX: ADV_B_MAX,
    SHARED_FACTOR_POOL_SIZE: SHARED_FACTOR_POOL.length,
    SHARED_FACTOR_KEY_COUNT: SHARED_FACTOR_KEYS.length,
    Y1_POOL_SIZE: Y1_POOL.length,
    Y2_POOL_SIZE: Y2_POOL.length,
    INTRO_POOL_COPRIME_SIZE: INTRO_POOLS.coprime.length,
    INTRO_POOL_PRIME_GCD_SIZE: INTRO_POOLS.primeGcd.length,
    INTRO_POOL_COMPOSITE_GCD_SIZE: INTRO_POOLS.compositeGcd.length,
    ADV_POOL_COPRIME_SIZE: ADV_POOLS.coprime.length,
    ADV_POOL_PRIME_GCD_SIZE: ADV_POOLS.primeGcd.length,
    ADV_POOL_COMPOSITE_GCD_SIZE: ADV_POOLS.compositeGcd.length,
    SHARED_FACTOR_POOL: SHARED_FACTOR_POOL,
    SHARED_FACTOR_BY_F: SHARED_FACTOR_BY_F,
    SHARED_FACTOR_KEYS: SHARED_FACTOR_KEYS,
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
