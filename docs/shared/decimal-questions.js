/**
 * 小数运算 D1–D5 出题（见《小数等级说明.md》）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  var LEVEL_DEFS = [
    { id: "D1", name: "第 1 级 · 一位小数与整数混合加减" },
    { id: "D2", name: "第 2 级 · 一位与两位小数混合加减" },
    { id: "D3", name: "第 3 级 · 乘或除以 10ⁿ" },
    { id: "D4", name: "第 4 级 · 小数乘除一位整数" },
    { id: "D5", name: "第 5 级 · 小数乘除小数" },
  ];

  var D3_POWERS = [10, 100, 1000, 10000];
  var DEDUP_MAX_RETRIES = 100;
  var DEFAULT_SEGMENT_COUNT = 30;
  var segmentSeenKeys = null;
  var segmentLevelIndex = null;

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  function trimFloat(n) {
    return parseFloat(Number(n).toPrecision(12));
  }

  function formatSigFig(val, maxSf) {
    return String(parseFloat(Number(val).toPrecision(maxSf)));
  }

  function formatAnswer(n, maxDp) {
    var v = trimFloat(n);
    if (maxDp != null && maxDp >= 0) {
      return String(Math.round(v * Math.pow(10, maxDp)) / Math.pow(10, maxDp));
    }
    return String(v);
  }

  function pickWeighted(weights) {
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < weights.length; i += 1) {
      acc += weights[i].w;
      if (r < acc) return weights[i].v;
    }
    return weights[weights.length - 1].v;
  }

  /** 生成 [min,max] 内、恰 sigFigs 位有效数字的正数（不含 0） */
  function makeSigFigNumber(sigFigs, min, max) {
    sigFigs = Math.max(1, Math.floor(sigFigs));
    min = Number(min) || 0.0001;
    max = Number(max) || 99999;
    for (var t = 0; t < 120; t += 1) {
      var digits = [randomInt(1, 9)];
      for (var d = 1; d < sigFigs; d += 1) digits.push(randomInt(0, 9));
      var mant = parseInt(digits.join(""), 10);
      var logMin = Math.floor(Math.log10(min));
      var logMax = Math.ceil(Math.log10(max));
      var p = randomInt(logMin - sigFigs, logMax);
      var val = mant * Math.pow(10, p);
      if (val >= min && val <= max && val > 0) return trimFloat(val);
    }
    return trimFloat(min);
  }

  function makeSigFigWithDecimalPlaces(sigFigs, decimalPlaces, min, max) {
    decimalPlaces = Math.max(0, Math.floor(decimalPlaces));
    for (var t = 0; t < 120; t += 1) {
      var val = makeSigFigNumber(sigFigs, min, max);
      var rounded = Math.round(val * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
      if (rounded <= 0) continue;
      if (Math.abs(rounded - val) > 1e-8) continue;
      return {
        value: rounded,
        text: rounded.toFixed(decimalPlaces),
      };
    }
    return { value: 0.1, text: (0.1).toFixed(decimalPlaces) };
  }

  function makeOneSigFigMultiplier() {
    var d = randomInt(1, 9);
    var k = randomInt(-4, 4);
    var val = trimFloat(d * Math.pow(10, k));
    if (val <= 0) {
      k = randomInt(-2, 4);
      val = trimFloat(d * Math.pow(10, k));
    }
    var text = String(val);
    if (text.indexOf("e") >= 0) text = formatAnswer(val);
    return { value: val, text: text };
  }

  function isTerminatingQuotient(numerator, denominator) {
    if (!(denominator > 0)) return false;
    var num = Math.round(numerator * 1e9);
    var den = Math.round(denominator * 1e9);
    if (den === 0) return false;
    while (num % 2 === 0 && den % 2 === 0) {
      num /= 2;
      den /= 2;
    }
    while (num % 5 === 0 && den % 5 === 0) {
      num /= 5;
      den /= 5;
    }
    while (den % 2 === 0) den /= 2;
    while (den % 5 === 0) den /= 5;
    return den === 1;
  }

  function questionKey(q) {
    return q && q.text != null ? String(q.text) : "";
  }

  function resetLevelSegment(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    segmentLevelIndex = levelIndex;
    segmentSeenKeys = new Set();
    if (count != null && !Number.isNaN(Number(count))) {
      DEFAULT_SEGMENT_COUNT = Math.max(0, Math.floor(Number(count)));
    }
  }

  function wrapQuestion(q) {
    return {
      text: q.text,
      answer: q.answer,
      baseLevelId: q.baseLevelId,
      op: q.op || "+",
      a: q.a != null ? q.a : 0,
      b: q.b != null ? q.b : 0,
    };
  }

  function randomD1DecimalText() {
    return (randomInt(1, 99) / 10).toFixed(1);
  }

  function randomD1IntegerText() {
    return String(randomInt(1, 99));
  }

  function parseOperandText(s) {
    return parseFloat(String(s));
  }

  function buildD1Question() {
    for (var t = 0; t < 80; t += 1) {
      var op = Math.random() < 0.5 ? "+" : "−";
      var aText = Math.random() < 0.5 ? randomD1DecimalText() : randomD1IntegerText();
      var bText = Math.random() < 0.5 ? randomD1DecimalText() : randomD1IntegerText();
      var a = parseOperandText(aText);
      var b = parseOperandText(bText);
      if (op === "−" && a < b) continue;
      var answer = op === "+" ? a + b : a - b;
      if (answer < 0) continue;
      return wrapQuestion({
        text: aText + " " + op + " " + bText + " = ?",
        answer: formatAnswer(answer),
        baseLevelId: "D1",
        op: op,
        a: a,
        b: b,
      });
    }
    return wrapQuestion({
      text: "3.5 + 2 = ?",
      answer: "5.5",
      baseLevelId: "D1",
      op: "+",
      a: 3.5,
      b: 2,
    });
  }

  function pickD2PairKind() {
    return pickWeighted([
      { v: "1+1", w: 0.25 },
      { v: "1+2", w: 0.5 },
      { v: "2+2", w: 0.25 },
    ]);
  }

  function buildD2Operands(kind) {
    var left;
    var right;
    if (kind === "1+1") {
      left = makeSigFigWithDecimalPlaces(2, 1, 0.1, 99.9);
      right = makeSigFigWithDecimalPlaces(2, 1, 0.1, 99.9);
    } else if (kind === "1+2") {
      if (Math.random() < 0.5) {
        left = makeSigFigWithDecimalPlaces(2, 1, 0.1, 99.9);
        right = makeSigFigWithDecimalPlaces(2, 2, 0.01, 99.99);
      } else {
        left = makeSigFigWithDecimalPlaces(2, 2, 0.01, 99.99);
        right = makeSigFigWithDecimalPlaces(2, 1, 0.1, 99.9);
      }
    } else {
      left = makeSigFigWithDecimalPlaces(2, 2, 0.01, 99.99);
      right = makeSigFigWithDecimalPlaces(2, 2, 0.01, 99.99);
    }
    return { left: left, right: right };
  }

  function buildD2Question() {
    for (var t = 0; t < 80; t += 1) {
      var op = Math.random() < 0.5 ? "+" : "−";
      var pair = buildD2Operands(pickD2PairKind());
      var a = pair.left.value;
      var b = pair.right.value;
      if (op === "−" && a < b) continue;
      var answer = op === "+" ? a + b : a - b;
      if (answer < 0) continue;
      return wrapQuestion({
        text: pair.left.text + " " + op + " " + pair.right.text + " = ?",
        answer: formatAnswer(answer, 2),
        baseLevelId: "D2",
        op: op,
        a: a,
        b: b,
      });
    }
    return wrapQuestion({
      text: "1.2 + 3.40 = ?",
      answer: "4.6",
      baseLevelId: "D2",
      op: "+",
      a: 1.2,
      b: 3.4,
    });
  }

  function buildD3Question() {
    for (var t = 0; t < 80; t += 1) {
      var power = D3_POWERS[randomInt(0, D3_POWERS.length - 1)];
      var multiply = Math.random() < 0.5;
      var base = makeSigFigNumber(5, 0.0001, 99999);
      var answer = multiply ? base * power : base / power;
      if (!(answer >= 0.0001 && answer <= 99999)) continue;
      var baseText = formatSigFig(base, 5);
      var op = multiply ? "×" : "÷";
      var text = multiply
        ? baseText + " × " + power + " = ?"
        : baseText + " ÷ " + power + " = ?";
      return wrapQuestion({
        text: text,
        answer: formatSigFig(answer, 5),
        baseLevelId: "D3",
        op: op,
        a: base,
        b: power,
      });
    }
    return wrapQuestion({
      text: "3.45 × 100 = ?",
      answer: "345",
      baseLevelId: "D3",
      op: "×",
      a: 3.45,
      b: 100,
    });
  }

  function pickD4SigFigs() {
    return pickWeighted([
      { v: 3, w: 0.25 },
      { v: 2, w: 0.5 },
      { v: 1, w: 0.25 },
    ]);
  }

  function buildD4Question() {
    for (var t = 0; t < 80; t += 1) {
      var n = randomInt(2, 9);
      var sf = pickD4SigFigs();
      var multiply = Math.random() < 0.5;
      if (multiply) {
        var aMul = makeSigFigNumber(sf, 0.1, 9999);
        var ansMul = aMul * n;
        if (ansMul < 0) continue;
        return wrapQuestion({
          text: formatAnswer(aMul) + " × " + n + " = ?",
          answer: formatAnswer(ansMul),
          baseLevelId: "D4",
          op: "×",
          a: aMul,
          b: n,
        });
      }
      var quotient = makeSigFigNumber(sf, 0.1, 999);
      var dividend = trimFloat(quotient * n);
      if (!(dividend > 0)) continue;
      return wrapQuestion({
        text: formatAnswer(dividend) + " ÷ " + n + " = ?",
        answer: formatAnswer(quotient),
        baseLevelId: "D4",
        op: "÷",
        a: dividend,
        b: n,
      });
    }
    return wrapQuestion({
      text: "2.4 × 3 = ?",
      answer: "7.2",
      baseLevelId: "D4",
      op: "×",
      a: 2.4,
      b: 3,
    });
  }

  function pickD5FirstSigFigs() {
    return Math.random() < 0.5 ? 2 : 3;
  }

  function buildD5Question() {
    for (var t = 0; t < 80; t += 1) {
      var sf = pickD5FirstSigFigs();
      var second = makeOneSigFigMultiplier();
      var multiply = Math.random() < 0.5;
      if (multiply) {
        var a = makeSigFigNumber(sf, 0.1, 9999);
        var ans = trimFloat(a * second.value);
        if (ans < 0) continue;
        return wrapQuestion({
          text: formatAnswer(a) + " × " + second.text + " = ?",
          answer: formatAnswer(ans),
          baseLevelId: "D5",
          op: "×",
          a: a,
          b: second.value,
        });
      }
      var quotient = makeSigFigNumber(sf, 0.1, 9999);
      var dividend = trimFloat(quotient * second.value);
      if (!(dividend > 0)) continue;
      if (!isTerminatingQuotient(dividend, second.value)) continue;
      return wrapQuestion({
        text: formatAnswer(dividend) + " ÷ " + second.text + " = ?",
        answer: formatAnswer(quotient),
        baseLevelId: "D5",
        op: "÷",
        a: dividend,
        b: second.value,
      });
    }
    return wrapQuestion({
      text: "0.8 ÷ 0.2 = ?",
      answer: "4",
      baseLevelId: "D5",
      op: "÷",
      a: 0.8,
      b: 0.2,
    });
  }

  var BUILDERS = [buildD1Question, buildD2Question, buildD3Question, buildD4Question, buildD5Question];

  function buildRawQuestion(levelIndex) {
    return BUILDERS[clampLevelIndex(levelIndex)]();
  }

  function buildQuestionWithDedup(levelIndex) {
    var seen = segmentSeenKeys;
    for (var i = 0; i < DEDUP_MAX_RETRIES; i += 1) {
      var q = buildRawQuestion(levelIndex);
      var key = questionKey(q);
      if (!seen || !seen.has(key)) {
        if (seen) seen.add(key);
        return q;
      }
    }
    var fallback = buildRawQuestion(levelIndex);
    if (seen) seen.add(questionKey(fallback));
    return fallback;
  }

  function buildQuestion(levelIndex) {
    levelIndex = clampLevelIndex(levelIndex);
    if (segmentLevelIndex !== levelIndex || !segmentSeenKeys) {
      resetLevelSegment(levelIndex);
    }
    return buildQuestionWithDedup(levelIndex);
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    count = Math.max(0, Math.floor(Number(count) || 0));
    resetLevelSegment(levelIndex, count);
    var run = [];
    for (var i = 0; i < count; i += 1) {
      run.push(buildQuestionWithDedup(levelIndex));
    }
    return run;
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    var shortName = String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlDecimal = {
    LEVEL_COUNT: LEVEL_DEFS.length,
    LEVEL_LABELS: LEVEL_LABELS,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    resetLevelSegment: resetLevelSegment,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
