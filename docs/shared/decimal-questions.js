/**
 * 小数运算 D1–D6 出题（见《小数等级说明.md》）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  var QUESTIONS_PER_RUN = 20;
  var DECIMAL_MAX_LEVEL = 5;
  var D4_FRACTION_LEVEL_INDEX = 3;
  var D4_QUESTIONS_PER_RUN = 36;

  var LEVEL_DEFS = [
    { id: "D1", name: "第 1 级 · 一位小数与整数混合加减" },
    { id: "D2", name: "第 2 级 · 一位与两位小数混合加减" },
    { id: "D3", name: "第 3 级 · 乘或除以 10ⁿ" },
    { id: "D4", name: "第 4 级 · 单位分数与小数互化" },
    { id: "D5", name: "第 5 级 · 小数乘除一位整数" },
    { id: "D6", name: "第 6 级 · 小数乘除小数" },
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

  /** D4：分母 = 2^{0..3}×10ⁿ 或 5^{0..3}×10ⁿ，∈(1,1000]，分子恒 1 → 18 个分母 × 2 挖空 = 36 题 */
  var D4_UNIT_DENOMS = (function () {
    var set = {};
    var list = [];
    function add(d) {
      if (!(d > 1) || d > 1000) return;
      if (set[d]) return;
      set[d] = true;
      list.push(d);
    }
    var a;
    var n;
    var b;
    for (a = 0; a <= 3; a += 1) {
      for (n = 0; n <= 4; n += 1) {
        add(Math.pow(2, a) * Math.pow(10, n));
      }
    }
    for (b = 0; b <= 3; b += 1) {
      for (n = 0; n <= 4; n += 1) {
        add(Math.pow(5, b) * Math.pow(10, n));
      }
    }
    list.sort(function (x, y) {
      return x - y;
    });
    return list;
  })();

  function formatUnitFractionDecimalText(denom) {
    var v = 1 / denom;
    if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
    var text = formatDecimalTrim(v, 8);
    if (text) return text;
    return String(parseFloat(v.toPrecision(12)));
  }

  function buildD4AllCards() {
    var cards = [];
    for (var i = 0; i < D4_UNIT_DENOMS.length; i += 1) {
      var denom = D4_UNIT_DENOMS[i];
      var decText = formatUnitFractionDecimalText(denom);
      cards.push(
        wrapQuestion({
          text: "1/" + denom + " = ?",
          answer: decText,
          baseLevelId: "D4",
          op: "=",
          a: 1,
          b: denom,
        })
      );
      cards.push(
        wrapQuestion({
          text: "1/? = " + decText,
          answer: String(denom),
          baseLevelId: "D4",
          op: "=",
          a: 1,
          b: parseFloat(decText),
        })
      );
    }
    return cards;
  }

  function shuffleCopy(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = randomInt(0, i);
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function buildD4Question() {
    var cards = buildD4AllCards();
    return cards[randomInt(0, cards.length - 1)];
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

  var D4_DP_FORM_DEFS = [
    { id: "dp3", dp: 3 },
    { id: "dp2", dp: 2 },
    { id: "dp1", dp: 1 },
  ];

  function pickD4DpForm() {
    return D4_DP_FORM_DEFS[randomInt(0, D4_DP_FORM_DEFS.length - 1)];
  }

  function makeD4OperandParts(sf, form, mant) {
    if (mant == null) mant = makeD4Mantissa(sf);
    return {
      mant: mant,
      form: form,
      sf: sf,
      value: trimFloat(mant / Math.pow(10, form.dp)),
      text: formatD4OperandText(mant, form.dp),
    };
  }

  function makeD4FirstOperand(sf) {
    return makeD4OperandParts(sf, pickD4DpForm(), null);
  }

  function d4DivideQuotientOk(first, n) {
    var result = trimFloat(first.value / n);
    if (!(result > 0)) return null;
    if (isD5DivisorNeedSigFigCap(n) && countSigFigs(result) > 4) return null;
    return result;
  }

  function refineMantForD4QuotientCap(mant, n, sf, form) {
    var minM = Math.pow(10, sf - 1);
    var maxM = Math.pow(10, sf) - 1;
    var base = adjustMantToMultipleOf(mant, n, sf);
    var candidates = [base];
    for (var step = 1; step <= 15; step += 1) {
      if (base - step * n >= minM) candidates.push(base - step * n);
      if (base + step * n <= maxM) candidates.push(base + step * n);
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var m = candidates[i];
      if (!mantissaInSfRange(m, sf)) continue;
      var first = makeD4OperandParts(sf, form, m);
      if (d4DivideQuotientOk(first, n) != null) return m;
    }
    return base;
  }

  function buildD4Multiply() {
    var first = makeD4FirstOperand(pickD5MultiplyFirstSigFigs());
    var n = randomInt(2, 9);
    var ans = trimFloat(first.value * n);
    if (!(ans >= 0)) return null;
    return wrapQuestion({
      text: first.text + " × " + n + " = ?",
      answer: formatAnswer(ans),
      baseLevelId: "D5",
      op: "×",
      a: first.value,
      b: n,
    });
  }

  function buildD4Divide() {
    var firstDraft = makeD4FirstOperand(pickD4SigFigs());
    var sf = firstDraft.sf;
    var form = firstDraft.form;
    var mant = firstDraft.mant;
    var n = randomInt(2, 9);

    if (isD5DivisorNeedMultipleAdjust(n)) {
      mant = adjustMantToMultipleOf(mant, n, sf);
    }

    var first = makeD4OperandParts(sf, form, mant);
    var quotient = d4DivideQuotientOk(first, n);

    if (isD5DivisorNeedSigFigCap(n) && quotient == null) {
      mant = refineMantForD4QuotientCap(mant, n, sf, form);
      first = makeD4OperandParts(sf, form, mant);
      quotient = d4DivideQuotientOk(first, n);
    }

    if (quotient == null) return null;

    return wrapQuestion({
      text: first.text + " ÷ " + n + " = ?",
      answer: formatAnswer(quotient),
      baseLevelId: "D5",
      op: "÷",
      a: first.value,
      b: n,
    });
  }

  function buildD5MulDivQuestion() {
    for (var t = 0; t < 80; t += 1) {
      var q = Math.random() < 0.5 ? buildD4Multiply() : buildD4Divide();
      if (q) return q;
    }
    return wrapQuestion({
      text: "2.4 × 3 = ?",
      answer: "7.2",
      baseLevelId: "D5",
      op: "×",
      a: 2.4,
      b: 3,
    });
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

  function pickD5MultiplyFirstSigFigs() {
    return Math.random() < 0.5 ? 1 : 2;
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

  function makeD5FirstOperand(sf) {
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
      if (d === 1 && form.id === "int") continue;
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
    var first = makeD5FirstOperand(pickD5MultiplyFirstSigFigs());
    var d = randomInt(1, 9);
    var valid = filterD5SecondForms(first, d, true);
    if (!valid.length) return null;
    var picked = pickFromValidForms(valid);
    return wrapQuestion({
      text: first.text + " × " + picked.second.text + " = ?",
      answer: formatAnswer(picked.result),
      baseLevelId: "D6",
      op: "×",
      a: first.value,
      b: picked.second.value,
    });
  }

  function buildD5Divide() {
    var firstDraft = makeD5FirstOperand(pickD4SigFigs());
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
      baseLevelId: "D6",
      op: "÷",
      a: first.value,
      b: picked.second.value,
    });
  }

  function buildD6Question() {
    for (var t = 0; t < 80; t += 1) {
      var q = Math.random() < 0.5 ? buildD5Multiply() : buildD5Divide();
      if (q) return q;
    }
    return wrapQuestion({
      text: "1.2 × 0.3 = ?",
      answer: "0.36",
      baseLevelId: "D6",
      op: "×",
      a: 1.2,
      b: 0.3,
    });
  }

  var BUILDERS = [
    buildD1Question,
    buildD2Question,
    buildD3Question,
    buildD4Question,
    buildD5MulDivQuestion,
    buildD6Question,
  ];

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

  function questionsPerRun(levelIndex) {
    levelIndex = clampLevelIndex(levelIndex);
    if (levelIndex === D4_FRACTION_LEVEL_INDEX) return D4_QUESTIONS_PER_RUN;
    return QUESTIONS_PER_RUN;
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    if (levelIndex === D4_FRACTION_LEVEL_INDEX) {
      var deck = shuffleCopy(buildD4AllCards());
      if (count == null || count === "") count = D4_QUESTIONS_PER_RUN;
      count = Math.max(0, Math.floor(Number(count) || 0));
      resetLevelSegment(levelIndex, count);
      if (count >= deck.length) return deck;
      return deck.slice(0, count);
    }
    if (count == null || count === "") count = QUESTIONS_PER_RUN;
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
    DECIMAL_MAX_LEVEL: DECIMAL_MAX_LEVEL,
    D4_FRACTION_LEVEL_INDEX: D4_FRACTION_LEVEL_INDEX,
    D4_UNIT_DENOMS: D4_UNIT_DENOMS.slice(),
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    LEVEL_LABELS: LEVEL_LABELS,
    questionsPerRun: questionsPerRun,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    resetLevelSegment: resetLevelSegment,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
