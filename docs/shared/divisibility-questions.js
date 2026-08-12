/**
 * 整除判断 Z1–Z5 出题（打印 / 日后学员端共用）
 * 题型：以下哪个整数可以被 N 整除？两选项一真一假，顺序随机。
 * 一局内位数分三批递进：2→3→4 位。批内除数打乱，批间不打乱。
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = randomInt(0, i);
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  var QUESTIONS_PER_RUN = 24;
  var DIV_MAX_LEVEL = 4;

  var LEVEL_DEFS = [
    { id: "Z1", name: "第 1 级 · 2 与 5 的整除", divisors: [2, 5] },
    { id: "Z2", name: "第 2 级 · 3 与 9 的整除", divisors: [3, 9] },
    { id: "Z3", name: "第 3 级 · 4 与 8 的整除", divisors: [4, 8] },
    { id: "Z4", name: "第 4 级 · 6 与 12 的整除", divisors: [6, 12] },
    { id: "Z5", name: "第 5 级 · 混合整除", divisors: [2, 3, 4, 5, 6, 8, 9, 12] },
  ];

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  var DIGIT_TIERS = [2, 3, 4];

  /** tier 0/1/2 → 易/中/难位数 */
  function digitsForTier(tier) {
    var t = Math.max(0, Math.min(DIGIT_TIERS.length - 1, Math.floor(Number(tier) || 0)));
    return DIGIT_TIERS[t];
  }

  function rangeForDigits(digits) {
    var min = Math.pow(10, digits - 1);
    var max = Math.pow(10, digits) - 1;
    return { min: min, max: max };
  }

  function randomMultipleInDigits(divisor, digits) {
    var r = rangeForDigits(digits);
    var lo = Math.ceil(r.min / divisor);
    var hi = Math.floor(r.max / divisor);
    if (lo > hi) return null;
    return divisor * randomInt(lo, hi);
  }

  function randomInDigits(digits) {
    var r = rangeForDigits(digits);
    return randomInt(r.min, r.max);
  }

  function isMultiple(n, d) {
    return n % d === 0;
  }

  /** 错项：满足 distractor 规则且与 correct 不同 */
  function buildDistractor(divisor, digits, correct) {
    var tries;
    var n;
    var r = rangeForDigits(digits);

    function pickWhere(pred) {
      for (tries = 0; tries < 80; tries += 1) {
        n = randomInDigits(digits);
        if (n !== correct && pred(n)) return n;
      }
      return null;
    }

    if (divisor === 2 || divisor === 5 || divisor === 3) {
      return pickWhere(function (x) {
        return !isMultiple(x, divisor);
      });
    }

    if (divisor === 9) {
      return pickWhere(function (x) {
        return isMultiple(x, 3) && !isMultiple(x, 9);
      });
    }

    if (divisor === 4) {
      return pickWhere(function (x) {
        return x % 2 === 0 && !isMultiple(x, 4);
      });
    }

    if (divisor === 8) {
      return pickWhere(function (x) {
        return x % 2 === 0 && !isMultiple(x, 8);
      });
    }

    if (divisor === 6) {
      // 含 2 或 3（或看似相关），但不是 6 的倍数
      return pickWhere(function (x) {
        if (isMultiple(x, 6)) return false;
        return isMultiple(x, 2) || isMultiple(x, 3);
      });
    }

    if (divisor === 12) {
      // 含 2 或 3 相关因子，但不是 12 的倍数（含 6 的倍数但非 12）
      return pickWhere(function (x) {
        if (isMultiple(x, 12)) return false;
        return isMultiple(x, 2) || isMultiple(x, 3) || isMultiple(x, 4);
      });
    }

    return pickWhere(function (x) {
      return !isMultiple(x, divisor);
    });
  }

  function buildOneQuestion(divisor, digits) {
    var dig = Math.floor(Number(digits));
    if (!Number.isFinite(dig) || dig < 1) {
      dig = DIGIT_TIERS[randomInt(0, DIGIT_TIERS.length - 1)];
    }
    var correct = null;
    var wrong = null;
    var t;
    var tryDigits = dig;

    for (t = 0; t < 40; t += 1) {
      correct = randomMultipleInDigits(divisor, tryDigits);
      if (correct == null) {
        tryDigits = DIGIT_TIERS[t % DIGIT_TIERS.length];
        continue;
      }
      wrong = buildDistractor(divisor, tryDigits, correct);
      if (wrong != null) {
        dig = tryDigits;
        break;
      }
    }
    if (correct == null || wrong == null) {
      correct = divisor * randomInt(12, 48);
      wrong = correct + 1;
      if (isMultiple(wrong, divisor)) wrong += 1;
    }

    var correctFirst = Math.random() < 0.5;
    var optA = correctFirst ? correct : wrong;
    var optB = correctFirst ? wrong : correct;
    var answerLetter = correctFirst ? "A" : "B";
    var promptStem = "以下哪个整数可以被 " + divisor + " 整除？";
    var text = promptStem + "  A. " + optA + "  B. " + optB;
    return {
      text: text,
      prompt: text,
      promptStem: promptStem,
      optionA: optA,
      optionB: optB,
      answer: answerLetter + "（" + correct + "）",
      correctValue: correct,
      wrongValue: wrong,
      divisor: divisor,
      digits: dig,
      answerLetter: answerLetter,
      baseLevelId: "Z",
      op: "div",
      a: divisor,
      b: correct,
    };
  }

  /** 一批内除数配平后打乱（不跨批） */
  function buildBatchDivisors(levelIndex, batchSize) {
    levelIndex = clampLevelIndex(levelIndex);
    batchSize = Math.max(0, Math.floor(Number(batchSize) || 0));
    var divisors = LEVEL_DEFS[levelIndex].divisors;
    var list = [];
    var i;
    var d;
    var per;
    var extra;
    var order;

    if (levelIndex === 4) {
      per = Math.floor(batchSize / divisors.length);
      extra = batchSize % divisors.length;
      for (i = 0; i < divisors.length; i += 1) {
        for (d = 0; d < per; d += 1) list.push(divisors[i]);
      }
      order = shuffleArray(divisors.slice());
      for (i = 0; i < extra; i += 1) list.push(order[i]);
      return shuffleArray(list);
    }

    per = Math.floor(batchSize / 2);
    extra = batchSize % 2;
    for (i = 0; i < per; i += 1) {
      list.push(divisors[0]);
      list.push(divisors[1]);
    }
    if (extra) list.push(divisors[randomInt(0, 1)]);
    return shuffleArray(list);
  }

  /** 将总题数拆成三批（尽量均分；24 → 8+8+8） */
  function splitIntoThreeBatches(count) {
    var base = Math.floor(count / 3);
    var rem = count % 3;
    return [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    if (count == null || count === "") count = QUESTIONS_PER_RUN;
    count = Math.max(0, Math.floor(Number(count) || 0));
    var sizes = splitIntoThreeBatches(count);
    var run = [];
    var tier;
    var targets;
    var i;
    var q;

    for (tier = 0; tier < 3; tier += 1) {
      targets = buildBatchDivisors(levelIndex, sizes[tier]);
      for (i = 0; i < targets.length; i += 1) {
        q = buildOneQuestion(targets[i], digitsForTier(tier));
        q.baseLevelId = LEVEL_DEFS[levelIndex].id;
        q.digitTier = tier;
        run.push(q);
      }
    }
    return run;
  }

  function buildQuestion(levelIndex) {
    levelIndex = clampLevelIndex(levelIndex);
    var divisors = LEVEL_DEFS[levelIndex].divisors;
    var d = divisors[randomInt(0, divisors.length - 1)];
    var tier = randomInt(0, 2);
    var q = buildOneQuestion(d, digitsForTier(tier));
    q.baseLevelId = LEVEL_DEFS[levelIndex].id;
    q.digitTier = tier;
    return q;
  }

  function questionsPerRun(levelIndex) {
    clampLevelIndex(levelIndex);
    return QUESTIONS_PER_RUN;
  }

  /** 热图仅 Z1–Z4；Z5 按除数归入对应基础档 */
  var HEATMAP_LEVEL_COUNT = 4;
  var DIVISOR_TO_HEAT_LEVEL = {
    2: 0,
    5: 0,
    3: 1,
    9: 1,
    4: 2,
    8: 2,
    6: 3,
    12: 3,
  };

  function heatLevelIndexFromDivisor(divisor) {
    var d = Math.floor(Number(divisor));
    if (!isFinite(d)) return null;
    if (Object.prototype.hasOwnProperty.call(DIVISOR_TO_HEAT_LEVEL, d)) {
      return DIVISOR_TO_HEAT_LEVEL[d];
    }
    return null;
  }

  /** 优先 divisor；旧数据 levelIndex 0–3 可用；无 divisor 的旧 L5 题返回 null（不进热图） */
  function heatLevelIndexFromAttempt(a) {
    if (!a || typeof a !== "object") return null;
    var fromDiv = heatLevelIndexFromDivisor(a.divisor);
    if (fromDiv != null) return fromDiv;
    var li = Math.floor(Number(a.levelIndex));
    if (isFinite(li) && li >= 0 && li < HEATMAP_LEVEL_COUNT) return li;
    return null;
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    var shortName = String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlDivisibility = {
    LEVEL_COUNT: LEVEL_DEFS.length,
    DIV_MAX_LEVEL: DIV_MAX_LEVEL,
    HEATMAP_LEVEL_COUNT: HEATMAP_LEVEL_COUNT,
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    LEVEL_LABELS: LEVEL_LABELS,
    questionsPerRun: questionsPerRun,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
    heatLevelIndexFromDivisor: heatLevelIndexFromDivisor,
    heatLevelIndexFromAttempt: heatLevelIndexFromAttempt,
  };
})(typeof window !== "undefined" ? window : this);
