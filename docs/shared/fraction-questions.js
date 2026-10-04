/**
 * 分数运算打印出题 F1–F4（仅管理端习题纸）
 * 每页 24 题：上段 12 + 下段 12；段内左右各 6。
 */
(function (global) {
  var QUESTIONS_PER_PAGE = 24;
  var SECTION_SIZE = 12;

  var LEVEL_DEFS = [
    { id: "F1", name: "第 1 级 · 形态", sections: ["约分", "假分数与带分数"] },
    { id: "F2", name: "第 2 级 · 通分与比较", sections: ["通分", "比大小"] },
    { id: "F3", name: "第 3 级 · 加减", sections: ["同分母加减", "异分母加减"] },
    { id: "F4", name: "第 4 级 · 乘除", sections: ["乘法", "除法"] },
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

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var r = a % b;
      a = b;
      b = r;
    }
    return a || 1;
  }

  function lcm(a, b) {
    return Math.abs(a / gcd(a, b) * b);
  }

  function simplify(n, d) {
    if (d < 0) {
      n = -n;
      d = -d;
    }
    if (d === 0) return { n: n, d: 1 };
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  function fracHtml(n, d) {
    return (
      '<span class="jml-ws-frac">' +
      '<span class="jml-ws-frac-num">' +
      n +
      "</span>" +
      '<span class="jml-ws-frac-den">' +
      d +
      "</span></span>"
    );
  }

  /** 最简；假分数化带分数；整数不带分数线 */
  function valueHtml(n, d) {
    var s = simplify(n, d);
    n = s.n;
    d = s.d;
    if (d === 1) return String(n);
    if (n === 0) return "0";
    var neg = n < 0;
    n = Math.abs(n);
    var whole = Math.floor(n / d);
    var rem = n % d;
    var html = "";
    if (neg) html += "−";
    if (whole && rem) html += whole + "&nbsp;" + fracHtml(rem, d);
    else if (whole) html += String(whole);
    else html += fracHtml(rem, d);
    return html;
  }

  function valueText(n, d) {
    var s = simplify(n, d);
    n = s.n;
    d = s.d;
    if (d === 1) return String(n);
    if (n === 0) return "0";
    var neg = n < 0;
    n = Math.abs(n);
    var whole = Math.floor(n / d);
    var rem = n % d;
    var t = neg ? "-" : "";
    if (whole && rem) return t + whole + " " + rem + "/" + d;
    if (whole) return t + String(whole);
    return t + rem + "/" + d;
  }

  function mixedHtml(whole, n, d) {
    return valueHtml(whole * d + n, d);
  }

  function pickDen() {
    return randomInt(2, 12);
  }

  function pickProper(d) {
    return randomInt(1, d - 1);
  }

  /** {kind:'p'|'i'|'m', n, d} 统一成假分数分子 */
  function toImproper(v) {
    if (v.kind === "m") return v.whole * v.d + v.n;
    return v.n;
  }

  function renderOperand(v) {
    if (v.kind === "m") return mixedHtml(v.whole, v.n, v.d);
    return fracHtml(v.n, v.d);
  }

  function pickProperVal() {
    var d = pickDen();
    return { kind: "p", n: pickProper(d), d: d };
  }

  function pickImproperVal() {
    var d = pickDen();
    var n = d + randomInt(1, d * 3);
    if (n % d === 0) n += 1;
    return { kind: "i", n: n, d: d };
  }

  function pickMixedVal() {
    var d = pickDen();
    return { kind: "m", whole: randomInt(1, 5), n: pickProper(d), d: d };
  }

  function pickOperandMix() {
    var r = Math.random();
    if (r < 0.34) return pickProperVal();
    if (r < 0.67) return pickImproperVal();
    return pickMixedVal();
  }

  function q(promptHtml, answerHtml, answerText, section, extra) {
    var o = {
      promptHtml: promptHtml,
      answerHtml: answerHtml,
      answer: answerText,
      prompt: answerText,
      section: section,
    };
    var k;
    if (extra) {
      for (k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
      }
    }
    return o;
  }

  function uniquePush(list, item, key, seen) {
    if (seen[key]) return false;
    seen[key] = 1;
    list.push(item);
    return true;
  }

  function fillSection(n, factory) {
    var list = [];
    var seen = Object.create(null);
    var guard = 0;
    while (list.length < n && guard < n * 80) {
      guard += 1;
      factory(list, seen);
    }
    return shuffleArray(list).slice(0, n);
  }

  function buildSimplify() {
    return fillSection(SECTION_SIZE, function (list, seen) {
      var d0 = randomInt(2, 9);
      var n0 = pickProper(d0);
      var k = randomInt(2, 6);
      var n = n0 * k;
      var d = d0 * k;
      if (d > 36) return;
      if (gcd(n, d) === 1) return;
      var s = simplify(n, d);
      uniquePush(
        list,
        q(fracHtml(n, d) + " =", valueHtml(s.n, s.d), valueText(s.n, s.d), "约分"),
        n + "/" + d,
        seen
      );
    });
  }

  function buildConvert() {
    return fillSection(SECTION_SIZE, function (list, seen) {
      if (Math.random() < 0.5) {
        var d = pickDen();
        var n = d + randomInt(1, Math.min(20, d * 4));
        if (n % d === 0) n += 1;
        uniquePush(
          list,
          q(fracHtml(n, d) + " =", valueHtml(n, d), valueText(n, d), "假分数与带分数"),
          "i-" + n + "/" + d,
          seen
        );
      } else {
        var d2 = pickDen();
        var w = randomInt(1, 6);
        var n2 = pickProper(d2);
        var imp = w * d2 + n2;
        uniquePush(
          list,
          q(mixedHtml(w, n2, d2) + " =", fracHtml(imp, d2), imp + "/" + d2, "假分数与带分数"),
          "m-" + w + "-" + n2 + "/" + d2,
          seen
        );
      }
    });
  }

  function buildCommonDen() {
    return fillSection(SECTION_SIZE, function (list, seen) {
      var d1 = pickDen();
      var d2 = pickDen();
      if (d1 === d2) d2 = d1 === 12 ? 8 : d1 + 1;
      var n1 = pickProper(d1);
      var n2 = pickProper(d2);
      var L = lcm(d1, d2);
      if (L > 60) return;
      var a1 = n1 * (L / d1);
      var a2 = n2 * (L / d2);
      var html =
        fracHtml(n1, d1) +
        " 与 " +
        fracHtml(n2, d2) +
        " 通分：";
      var ansHtml = fracHtml(a1, L) + "，" + fracHtml(a2, L);
      var ansText = a1 + "/" + L + ", " + a2 + "/" + L;
      uniquePush(list, q(html, ansHtml, ansText, "通分"), n1 + "/" + d1 + "|" + n2 + "/" + d2, seen);
    });
  }

  function buildCompare() {
    return fillSection(SECTION_SIZE, function (list, seen) {
      var A = pickProperVal();
      var B = pickProperVal();
      var left = A.n * B.d;
      var right = B.n * A.d;
      var mark = left === right ? "=" : left > right ? ">" : "<";
      var html = fracHtml(A.n, A.d) + ' <span class="jml-ws-frac-blank">____</span> ' + fracHtml(B.n, B.d);
      uniquePush(
        list,
        q(html, mark, mark, "比大小"),
        A.n + "/" + A.d + mark + B.n + "/" + B.d,
        seen
      );
    });
  }

  function buildSameDenOp() {
    return fillSection(SECTION_SIZE, function (list, seen) {
      var op = Math.random() < 0.5 ? "+" : "−";
      var A = pickOperandMix();
      var B;
      var tries = 0;
      do {
        B = pickOperandMix();
        B.d = A.d;
        if (B.kind === "p" || B.kind === "i") {
          if (B.kind === "p") B.n = pickProper(A.d);
          else {
            B.n = A.d + randomInt(1, A.d * 3);
            if (B.n % A.d === 0) B.n += 1;
          }
        } else B.n = pickProper(A.d);
        tries += 1;
      } while (tries < 20 && toImproper(A) === toImproper(B) && op === "−");
      var an = toImproper(A);
      var bn = toImproper(B);
      var d = A.d;
      if (op === "−" && an < bn) {
        var tmp = A;
        A = B;
        B = tmp;
        an = toImproper(A);
        bn = toImproper(B);
      }
      var resN = op === "+" ? an + bn : an - bn;
      uniquePush(
        list,
        q(
          renderOperand(A) + " " + op + " " + renderOperand(B) + " =",
          valueHtml(resN, d),
          valueText(resN, d),
          "同分母加减"
        ),
        renderOperand(A) + op + renderOperand(B),
        seen
      );
    });
  }

  function densRelated() {
    var small = randomInt(2, 6);
    var k = randomInt(2, 4);
    var big = small * k;
    if (big > 12) {
      small = 2;
      big = randomInt(2, 6) * 2;
      if (big > 12) big = 12;
    }
    return Math.random() < 0.5 ? [small, big] : [big, small];
  }

  function densGeneral() {
    var pairs = [
      [2, 3],
      [2, 5],
      [3, 4],
      [3, 5],
      [4, 5],
      [3, 7],
      [4, 7],
      [5, 6],
      [2, 7],
      [3, 8],
    ];
    return pairs[randomInt(0, pairs.length - 1)].slice();
  }

  function buildUnlikeOp() {
    var relatedQuota = 8;
    var iRel = 0;
    return fillSection(SECTION_SIZE, function (list, seen) {
      var wantRel = iRel < relatedQuota;
      var dens = wantRel ? densRelated() : densGeneral();
      var op = Math.random() < 0.5 ? "+" : "−";
      var A = pickOperandMix();
      var B = pickOperandMix();
      A.d = dens[0];
      B.d = dens[1];
      if (A.kind === "p") A.n = pickProper(A.d);
      else if (A.kind === "i") {
        A.n = A.d + randomInt(1, A.d * 2);
        if (A.n % A.d === 0) A.n += 1;
      } else A.n = pickProper(A.d);
      if (B.kind === "p") B.n = pickProper(B.d);
      else if (B.kind === "i") {
        B.n = B.d + randomInt(1, B.d * 2);
        if (B.n % B.d === 0) B.n += 1;
      } else B.n = pickProper(B.d);
      var L = lcm(A.d, B.d);
      var an = toImproper(A) * (L / A.d);
      var bn = toImproper(B) * (L / B.d);
      if (op === "−" && an < bn) {
        var tmp = A;
        A = B;
        B = tmp;
        var t2 = an;
        an = bn;
        bn = t2;
      }
      var resN = op === "+" ? an + bn : an - bn;
      var item = q(
        renderOperand(A) + " " + op + " " + renderOperand(B) + " =",
        valueHtml(resN, L),
        valueText(resN, L),
        "异分母加减"
      );
      if (uniquePush(list, item, item.promptHtml, seen) && wantRel) iRel += 1;
    });
  }

  function maybeMixedMul() {
    if (Math.random() < 0.3) return pickMixedVal();
    return Math.random() < 0.5 ? pickProperVal() : pickImproperVal();
  }

  function buildMul() {
    var iInt = 0;
    return fillSection(SECTION_SIZE, function (list, seen) {
      var wantInt = iInt < 6;
      var A = maybeMixedMul();
      var resN;
      var resD;
      var html;
      if (wantInt) {
        var k = randomInt(2, 9);
        resN = toImproper(A) * k;
        resD = A.d;
        html = renderOperand(A) + " × " + k + " =";
      } else {
        var B = maybeMixedMul();
        resN = toImproper(A) * toImproper(B);
        resD = A.d * B.d;
        html = renderOperand(A) + " × " + renderOperand(B) + " =";
      }
      var item = q(html, valueHtml(resN, resD), valueText(resN, resD), "乘法");
      if (uniquePush(list, item, html, seen) && wantInt) iInt += 1;
    });
  }

  function buildDiv() {
    var kinds = [];
    var i;
    for (i = 0; i < 4; i += 1) kinds.push(0, 1, 2);
    kinds = shuffleArray(kinds);
    var ki = 0;
    return fillSection(SECTION_SIZE, function (list, seen) {
      var kind = kinds[Math.min(ki, kinds.length - 1)];
      var A;
      var B;
      var html;
      var resN;
      var resD;
      var k;
      if (kind === 0) {
        A = maybeMixedMul();
        k = randomInt(2, 9);
        resN = toImproper(A);
        resD = A.d * k;
        html = renderOperand(A) + " ÷ " + k + " =";
      } else if (kind === 1) {
        k = randomInt(2, 9);
        B = pickProperVal();
        resN = k * B.d;
        resD = B.n;
        html = k + " ÷ " + renderOperand(B) + " =";
      } else {
        A = maybeMixedMul();
        B = pickProperVal();
        resN = toImproper(A) * B.d;
        resD = A.d * B.n;
        html = renderOperand(A) + " ÷ " + renderOperand(B) + " =";
      }
      var item = q(html, valueHtml(resN, resD), valueText(resN, resD), "除法");
      if (uniquePush(list, item, html, seen)) ki += 1;
    });
  }

  var SECTION_BUILDERS = [
    [buildSimplify, buildConvert],
    [buildCommonDen, buildCompare],
    [buildSameDenOp, buildUnlikeOp],
    [buildMul, buildDiv],
  ];

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    if (count == null || count === "") count = QUESTIONS_PER_PAGE;
    count = Math.max(0, Math.floor(Number(count) || 0));
    var builders = SECTION_BUILDERS[levelIndex];
    var topN = Math.min(SECTION_SIZE, Math.ceil(count / 2));
    var botN = Math.max(0, count - topN);
    var top = builders[0]().slice(0, topN);
    var bot = builders[1]().slice(0, botN);
    while (top.length < topN) top = top.concat(builders[0]()).slice(0, topN);
    while (bot.length < botN) bot = bot.concat(builders[1]()).slice(0, botN);
    return top.concat(bot);
  }

  function buildQuestion(levelIndex) {
    var run = buildRun(levelIndex, 2);
    return run[0] || buildRun(levelIndex, 24)[0];
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    return (level.id || "") + " · " + String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
  });

  global.JmlFraction = {
    LEVEL_COUNT: LEVEL_DEFS.length,
    QUESTIONS_PER_PAGE: QUESTIONS_PER_PAGE,
    SECTION_SIZE: SECTION_SIZE,
    LEVEL_LABELS: LEVEL_LABELS,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
