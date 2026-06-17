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

  function formatDecimalTrim(val, maxDp) {
    maxDp = maxDp != null && maxDp >= 0 ? Math.floor(maxDp) : 10;
    var v = Math.round(trimFloat(val) * Math.pow(10, maxDp)) / Math.pow(10, maxDp);
    if (!(v > 0)) return null;
    var s = String(v);
    if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0) {
      s = String(parseFloat(v.toPrecision(12)));
    }
    if (s.indexOf(".") < 0) return null;
    s = s.replace(/(\.\d*?[1-9])0+$/, "$1");
    s = s.replace(/\.0+$/, "");
    if (s.indexOf(".") < 0) return null;
    return s;
  }

  function formatAnswer(n, maxDp) {
    var v = trimFloat(n);
    if (maxDp != null && maxDp >= 0) {
      var trimmed = formatDecimalTrim(v, maxDp);
      if (trimmed) return trimmed;
      return String(Math.round(v * Math.pow(10, maxDp)) / Math.pow(10, maxDp));
    }
    return String(v);
  }

  var D3_ANSWER_MAX = 99999;

  var D3_FORM_DEFS = [
    { id: "dp4", dp: 4 },
    { id: "dp3", dp: 3 },
    { id: "dp2", dp: 2 },
    { id: "dp1", dp: 1 },
    { id: "int" },
    { id: "x10" },
    { id: "x100" },
  ];

  function isD3WholeNumber(val) {
    return Math.abs(val - Math.round(val)) < 1e-9;
  }

  /** D3 答案：整数无小数点；否则最多 4 位小数（去尾零）；须 0 < v < 99999 */
  function formatD3Answer(val) {
    var v = trimFloat(val);
    if (!(v > 0) || !(v < D3_ANSWER_MAX)) return null;
    if (isD3WholeNumber(v)) {
      return String(Math.round(v));
    }
    var text = formatDecimalTrim(v, 4);
    if (!text) return null;
    var frac = text.split(".")[1] || "";
    if (frac.length > 4) return null;
    if (Math.abs(parseFloat(text) - v) > 1e-9) return null;
    return text;
  }

  function d3ValueFromMantAndForm(mant, form) {
    if (form.id === "int") return mant;
    if (form.id === "x10") return mant * 10;
    if (form.id === "x100") return mant * 100;
    return mant / Math.pow(10, form.dp);
  }

  function d3TextFromMantAndForm(mant, form) {
    if (form.id === "int") return String(mant);
    if (form.id === "x10") return String(mant * 10);
    if (form.id === "x100") return String(mant * 100);
    return formatD4OperandText(mant, form.dp);
  }

  function makeD3FirstOperand() {
    var sf = pickD4SigFigs();
    var form = D3_FORM_DEFS[randomInt(0, D3_FORM_DEFS.length - 1)];
    var mant = makeD4Mantissa(sf);
    return {
      mant: mant,
      form: form,
      sf: sf,
      value: trimFloat(d3ValueFromMantAndForm(mant, form)),
      text: d3TextFromMantAndForm(mant, form),
    };
  }

  function filterD3Powers(first, multiply) {
    var valid = [];
    for (var i = 0; i < D3_POWERS.length; i += 1) {
      var power = D3_POWERS[i];
      var result = multiply
        ? trimFloat(first.value * power)
        : trimFloat(first.value / power);
      var answerText = formatD3Answer(result);
      if (!answerText) continue;
      valid.push({ power: power, result: result, answerText: answerText });
    }
    return valid;
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

  function randomD2OneDpOperand() {
    for (var t = 0; t < 80; t += 1) {
      var v = randomInt(1, 99) / 10;
      var text = formatDecimalTrim(v, 1);
      if (!text) continue;
      var frac = text.split(".")[1] || "";
      if (frac.length !== 1) continue;
      return { value: v, text: text };
    }
    return { value: 0.1, text: "0.1" };
  }

  function randomD2TwoDpOperand() {
    for (var t = 0; t < 80; t += 1) {
      var cents = randomInt(1, 99);
      if (cents % 10 === 0) continue;
      var v = cents / 100;
      var text = formatDecimalTrim(v, 2);
      if (!text) continue;
      var frac = text.split(".")[1] || "";
      if (frac.length < 2) continue;
      return { value: v, text: text };
    }
    return { value: 0.56, text: "0.56" };
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
      var decimalDecimal = Math.random() < 0.75;
      var aText;
      var bText;
      if (decimalDecimal) {
        aText = randomD1DecimalText();
        bText = randomD1DecimalText();
      } else if (Math.random() < 0.5) {
        aText = randomD1DecimalText();
        bText = randomD1IntegerText();
      } else {
        aText = randomD1IntegerText();
        bText = randomD1DecimalText();
      }
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
      left = randomD2OneDpOperand();
      right = randomD2OneDpOperand();
    } else if (kind === "1+2") {
      if (Math.random() < 0.5) {
        left = randomD2OneDpOperand();
        right = randomD2TwoDpOperand();
      } else {
        left = randomD2TwoDpOperand();
        right = randomD2OneDpOperand();
      }
    } else {
      left = randomD2TwoDpOperand();
      right = randomD2TwoDpOperand();
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
      text: "1.2 + 0.56 = ?",
      answer: "1.76",
      baseLevelId: "D2",
      op: "+",
      a: 1.2,
      b: 0.56,
    });
  }

  function buildD3Question() {
    for (var t = 0; t < 80; t += 1) {
      var first = makeD3FirstOperand();
      var multiply = Math.random() < 0.5;
      var valid = filterD3Powers(first, multiply);
      if (!valid.length) continue;
      var picked = valid[randomInt(0, valid.length - 1)];
      var op = multiply ? "×" : "÷";
      var text = multiply
        ? first.text + " × " + picked.power + " = ?"
        : first.text + " ÷ " + picked.power + " = ?";
      return wrapQuestion({
        text: text,
        answer: picked.answerText,
        baseLevelId: "D3",
        op: op,
        a: first.value,
        b: picked.power,
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

  function makeD4Mantissa(sf) {
    var digits = [randomInt(1, 9)];
    for (var i = 1; i < sf - 1; i += 1) digits.push(randomInt(0, 9));
    if (sf > 1) digits.push(randomInt(1, 9));
    return parseInt(digits.join(""), 10);
  }

  function formatD4OperandText(mant, dp) {
    var s = String(mant);
    if (dp >= s.length) {
      var pad = "";
      for (var i = 0; i < dp - s.length; i += 1) pad += "0";
      return "0." + pad + s;
    }
    return s.slice(0, s.length - dp) + "." + s.slice(s.length - dp);
  }

  function makeD4Operand() {
    var sf = pickD4SigFigs();
    var dp = randomInt(1, 3);
    var mant = makeD4Mantissa(sf);
    return {
      value: trimFloat(mant / Math.pow(10, dp)),
      text: formatD4OperandText(mant, dp),
    };
  }

  var D5_MIN = 0.0001;
  var D5_MAX = 9999;

  var D5_FORM_DEFS = [
    { id: "dp3", dp: 3 },
    { id: "dp2", dp: 2 },
    { id: "dp1", dp: 1 },
    { id: "int" },
    { id: "x10" },
  ];

  function d5ValueFromMantAndForm(mant, form) {
    if (form.id === "int") return mant;
    if (form.id === "x10") return mant * 10;
    return mant / Math.pow(10, form.dp);
  }

  function d5TextFromMantAndForm(mant, form) {
    if (form.id === "int") return String(mant);
    if (form.id === "x10") return String(mant * 10);
    return formatD4OperandText(mant, form.dp);
  }

  function pickD5Form() {
    return D5_FORM_DEFS[randomInt(0, D5_FORM_DEFS.length - 1)];
  }

  function pickD5FirstSigFigs() {
    return Math.random() < 0.5 ? 2 : 3;
  }

  function makeD5OperandParts(sf, form, mant) {
    if (mant == null) mant = makeD4Mantissa(sf);
    return {
      mant: mant,
      form: form,
      sf: sf,
      value: trimFloat(d5ValueFromMantAndForm(mant, form)),
      text: d5TextFromMantAndForm(mant, form),
    };
  }

  function makeD5FirstOperand() {
    var sf = pickD5FirstSigFigs();
    return makeD5OperandParts(sf, pickD5Form(), null);
  }

  function makeD5SecondOperand(d, form) {
    return makeD5OperandParts(1, form, d);
  }

  function inD5ResultRange(val) {
    return val >= D5_MIN && val <= D5_MAX;
  }

  function countSigFigs(val) {
    var v = trimFloat(val);
    if (!(v > 0)) return 0;
    var exp = v.toExponential(15);
    var m = exp.split("e")[0].replace(".", "").replace("-", "");
    m = m.replace(/0+$/, "");
    return m.length;
  }

  function mantissaInSfRange(mant, sf) {
    var minM = Math.pow(10, sf - 1);
    var maxM = Math.pow(10, sf) - 1;
    return mant >= minM && mant <= maxM && mant % 10 !== 0;
  }

  /** 将 M 调到最近的 d 的倍数：先试较小倍数，末位为 0 则用较大 */
  function adjustMantToMultipleOf(mant, d, sf) {
    var minM = Math.pow(10, sf - 1);
    var maxM = Math.pow(10, sf) - 1;
    var lo = Math.floor(mant / d) * d;
    var hi = lo + d;

    function usable(m) {
      return m >= minM && m <= maxM && m % 10 !== 0;
    }

    if (usable(lo)) return lo;
    if (usable(hi)) return hi;
    for (var m = lo; m >= minM; m -= d) {
      if (usable(m)) return m;
    }
    for (var m2 = hi; m2 <= maxM; m2 += d) {
      if (usable(m2)) return m2;
    }
    return mant;
  }

  function isD5DivisorNeedMultipleAdjust(d) {
    return d === 3 || d === 6 || d === 7 || d === 9;
  }

  function isD5DivisorNeedSigFigCap(d) {
    return d === 4 || d === 8;
  }

  function filterD5SecondForms(first, d, isMultiply) {
    var valid = [];
    for (var i = 0; i < D5_FORM_DEFS.length; i += 1) {
      var form = D5_FORM_DEFS[i];
      var second = makeD5SecondOperand(d, form);
      var result = isMultiply
        ? trimFloat(first.value * second.value)
        : trimFloat(first.value / second.value);
      if (!inD5ResultRange(result)) continue;
      if (!isMultiply && isD5DivisorNeedSigFigCap(d) && countSigFigs(result) > 4) continue;
      valid.push({ form: form, second: second, result: result });
    }
    return valid;
  }

  function pickFromValidForms(valid) {
    if (!valid.length) return null;
    return valid[randomInt(0, valid.length - 1)];
  }

  function refineMantForQuotientCap(mant, d, sf, firstForm) {
    var minM = Math.pow(10, sf - 1);
    var maxM = Math.pow(10, sf) - 1;
    var base = adjustMantToMultipleOf(mant, d, sf);
    var candidates = [base];
    for (var step = 1; step <= 15; step += 1) {
      if (base - step * d >= minM) candidates.push(base - step * d);
      if (base + step * d <= maxM) candidates.push(base + step * d);
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var m = candidates[i];
      if (!mantissaInSfRange(m, sf)) continue;
      var first = makeD5OperandParts(sf, firstForm, m);
      var valid = filterD5SecondForms(first, d, false);
      for (var j = 0; j < valid.length; j += 1) {
        if (countSigFigs(valid[j].result) <= 4) return m;
      }
    }
    return base;
  }

  function buildD5Multiply() {
    var first = makeD5FirstOperand();
    var d = randomInt(1, 9);
    var valid = filterD5SecondForms(first, d, true);
    if (!valid.length) return null;
    var picked = pickFromValidForms(valid);
    return wrapQuestion({
      text: first.text + " × " + picked.second.text + " = ?",
      answer: formatAnswer(picked.result),
      baseLevelId: "D5",
      op: "×",
      a: first.value,
      b: picked.second.value,
    });
  }

  function buildD5Divide() {
    var firstDraft = makeD5FirstOperand();
    var sf = firstDraft.sf;
    var form = firstDraft.form;
    var mant = firstDraft.mant;
    var d = randomInt(1, 9);

    if (isD5DivisorNeedMultipleAdjust(d)) {
      mant = adjustMantToMultipleOf(mant, d, sf);
    }

    var first = makeD5OperandParts(sf, form, mant);
    var valid = filterD5SecondForms(first, d, false);

    if (isD5DivisorNeedSigFigCap(d) && !valid.length) {
      mant = refineMantForQuotientCap(mant, d, sf, form);
      first = makeD5OperandParts(sf, form, mant);
      valid = filterD5SecondForms(first, d, false);
    }

    if (!valid.length) return null;
    var picked = pickFromValidForms(valid);
    return wrapQuestion({
      text: first.text + " ÷ " + picked.second.text + " = ?",
      answer: formatAnswer(picked.result),
      baseLevelId: "D5",
      op: "÷",
      a: first.value,
      b: picked.second.value,
    });
  }

  function buildD5Question() {
    for (var t = 0; t < 80; t += 1) {
      var q = Math.random() < 0.5 ? buildD5Multiply() : buildD5Divide();
      if (q) return q;
    }
    return wrapQuestion({
      text: "1.2 × 0.3 = ?",
      answer: "0.36",
      baseLevelId: "D5",
      op: "×",
      a: 1.2,
      b: 0.3,
    });
  }

  function buildD4Question() {
    for (var t = 0; t < 80; t += 1) {
      var n = randomInt(2, 9);
      var operand = makeD4Operand();
      var multiply = Math.random() < 0.5;
      if (multiply) {
        var ansMul = trimFloat(operand.value * n);
        if (!(ansMul >= 0)) continue;
        return wrapQuestion({
          text: operand.text + " × " + n + " = ?",
          answer: formatAnswer(ansMul),
          baseLevelId: "D4",
          op: "×",
          a: operand.value,
          b: n,
        });
      }
      var dividend = trimFloat(operand.value * n);
      if (!(dividend > 0)) continue;
      if (!isTerminatingQuotient(dividend, n)) continue;
      return wrapQuestion({
        text: formatAnswer(dividend) + " ÷ " + n + " = ?",
        answer: operand.text,
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
