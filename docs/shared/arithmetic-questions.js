/**
 * 四则运算 L1–L16 出题（与主站 docs/index.html 内联块同源，合并前请 diff）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  var L16_TYPES = [
    { op1: "+", op2: "×", order: "back" },
    { op1: "+", op2: "÷", order: "back" },
    { op1: "−", op2: "×", order: "back" },
    { op1: "−", op2: "÷", order: "back" },
    { op1: "−", op2: "+", order: "front" },
    { op1: "×", op2: "+", order: "front" },
    { op1: "×", op2: "−", order: "front" },
    { op1: "÷", op2: "+", order: "front" },
    { op1: "÷", op2: "−", order: "front" },
    { op1: "÷", op2: "×", order: "front" },
    { op1: "−", op2: "−", order: "front" },
    { op1: "÷", op2: "÷", order: "front" }
  ];

  function l16OpEval(op) {
    if (op === "+") return function (x, y) { return x + y; };
    if (op === "−") return function (x, y) { return x - y; };
    if (op === "×") return function (x, y) { return x * y; };
    return function (x, y) { return x / y; };
  }

  function l16IsHigh(op) {
    return op === "×" || op === "÷";
  }

  function l16ValidSteps(steps) {
    for (var i = 0; i < steps.length; i++) {
      if (!Number.isInteger(steps[i]) || steps[i] < 0) return false;
    }
    return true;
  }

  function l16EvalNatural(a, b, c, op1, op2) {
    var f = l16OpEval(op1);
    var g = l16OpEval(op2);
    var mid;
    var ans;
    if (l16IsHigh(op2) && !l16IsHigh(op1)) {
      mid = g(b, c);
      if (!Number.isInteger(mid)) return null;
      ans = f(a, mid);
      if (!Number.isInteger(ans)) return null;
      return { steps: [mid, ans], answer: ans };
    }
    if (l16IsHigh(op1) && !l16IsHigh(op2)) {
      mid = f(a, b);
      if (!Number.isInteger(mid)) return null;
      ans = g(mid, c);
      if (!Number.isInteger(ans)) return null;
      return { steps: [mid, ans], answer: ans };
    }
    mid = f(a, b);
    if (!Number.isInteger(mid)) return null;
    ans = g(mid, c);
    if (!Number.isInteger(ans)) return null;
    return { steps: [mid, ans], answer: ans };
  }

  function l16EvalBracketed(a, b, c, op1, op2, side) {
    var f = l16OpEval(op1);
    var g = l16OpEval(op2);
    var mid;
    var ans;
    if (side === "left") {
      mid = f(a, b);
      if (!Number.isInteger(mid)) return null;
      ans = g(mid, c);
      if (!Number.isInteger(ans)) return null;
      return { steps: [mid, ans], answer: ans };
    }
    mid = g(b, c);
    if (!Number.isInteger(mid)) return null;
    ans = f(a, mid);
    if (!Number.isInteger(ans)) return null;
    return { steps: [mid, ans], answer: ans };
  }

  function l16Render(a, b, c, op1, op2, bracketSide) {
    if (bracketSide === "left") return "(" + a + " " + op1 + " " + b + ") " + op2 + " " + c + " = ?";
    if (bracketSide === "right") return a + " " + op1 + " (" + b + " " + op2 + " " + c + ") = ?";
    return a + " " + op1 + " " + b + " " + op2 + " " + c + " = ?";
  }

  /** L16 乘法：约 55% 口诀 2～9、30% 为 10～20、15% 整十/末 5；积 ≤ 99 */
  var L16_MUL_PRODUCT_MAX = 99;
  var L16_MUL_SPECIAL = [10, 15, 20, 25, 30, 40];

  function pickL16MulFactor() {
    var r = Math.random();
    if (r < 0.55) return randomInt(2, 9);
    if (r < 0.85) return randomInt(10, 20);
    return L16_MUL_SPECIAL[randomInt(0, L16_MUL_SPECIAL.length - 1)];
  }

  function pickL16MulDigitFor(factor) {
    factor = Math.floor(Number(factor) || 0);
    if (factor < 1) return null;
    var maxD = Math.min(9, Math.floor(L16_MUL_PRODUCT_MAX / factor));
    if (maxD < 2) return null;
    return randomInt(2, maxD);
  }

  /** { u, v } 且 u×v ≤ 99；可交换次序 */
  function pickL16MulPair() {
    var i;
    var u;
    var v;
    for (i = 0; i < 24; i += 1) {
      u = pickL16MulFactor();
      v = pickL16MulDigitFor(u);
      if (v == null) continue;
      if (Math.random() < 0.5) return { u: u, v: v };
      return { u: v, v: u };
    }
    u = randomInt(2, 9);
    v = randomInt(2, 9);
    return { u: u, v: v };
  }

  function l16ConstructOperands(op1, op2, withBracket) {
    var key = op1 + op2;
    var b;
    var c;
    var a;
    var q;
    var sum;
    var product;
    var inner;
    var q1;
    var q2;
    var k;
    var pair;
    switch (key) {
      case "+×":
        if (withBracket) {
          inner = pickL16MulFactor();
          c = pickL16MulDigitFor(inner);
          if (c == null || inner < 2) return null;
          a = randomInt(1, inner - 1);
          b = inner - a;
          if (inner * c === a + b * c) return null;
          return { a: a, b: b, c: c };
        }
        pair = pickL16MulPair();
        b = pair.u;
        c = pair.v;
        product = b * c;
        a = randomInt(0, Math.min(99, 100 - product));
        return { a: a, b: b, c: c };
      case "+÷":
        c = randomInt(2, 9);
        if (withBracket) {
          q = randomInt(2, Math.min(9, Math.floor(18 / c)));
          sum = c * q;
          if (sum < 4 || sum > 18) return null;
          a = randomInt(1, sum - 1);
          return { a: a, b: sum - a, c: c };
        }
        q = randomInt(2, 9);
        b = c * q;
        if (b > 81) return null;
        a = randomInt(0, Math.min(99, 100 - q));
        return { a: a, b: b, c: c };
      case "−×":
        if (withBracket) {
          inner = pickL16MulFactor();
          c = pickL16MulDigitFor(inner);
          if (c == null || inner < 1) return null;
          b = randomInt(1, Math.max(1, 99 - inner));
          a = b + inner;
          if (inner * c === a - b * c) return null;
          return { a: a, b: b, c: c };
        }
        pair = pickL16MulPair();
        b = pair.u;
        c = pair.v;
        product = b * c;
        a = randomInt(product, Math.min(99, 100));
        return { a: a, b: b, c: c };
      case "−÷":
        c = randomInt(2, 9);
        if (withBracket) {
          q = randomInt(2, 9);
          k = randomInt(2, 9);
          b = c * k;
          if (b > 81) return null;
          a = b + c * q;
          if (a > 99) return null;
          return { a: a, b: b, c: c };
        }
        q = randomInt(2, 9);
        b = c * q;
        if (b > 81) return null;
        a = randomInt(q, 99);
        return { a: a, b: b, c: c };
      case "−+":
        if (withBracket) {
          b = randomInt(1, 40);
          c = randomInt(1, 40);
          a = randomInt(b + c, 99);
          return { a: a, b: b, c: c };
        }
        a = randomInt(10, 99);
        b = randomInt(0, a);
        c = randomInt(0, 99);
        return { a: a, b: b, c: c };
      case "×+":
        if (withBracket) {
          pair = pickL16MulPair();
          a = pair.u;
          inner = pair.v;
          if (inner < 2) return null;
          b = randomInt(1, inner - 1);
          c = inner - b;
          return { a: a, b: b, c: c };
        }
        pair = pickL16MulPair();
        a = pair.u;
        b = pair.v;
        c = randomInt(0, Math.min(99, 100 - a * b));
        return { a: a, b: b, c: c };
      case "×−":
        if (withBracket) {
          pair = pickL16MulPair();
          a = pair.u;
          inner = pair.v;
          if (inner < 1) return null;
          c = randomInt(1, Math.max(1, 40));
          b = c + inner;
          return { a: a, b: b, c: c };
        }
        pair = pickL16MulPair();
        a = pair.u;
        b = pair.v;
        c = randomInt(0, a * b);
        return { a: a, b: b, c: c };
      case "÷+":
        b = randomInt(2, 9);
        if (withBracket) {
          c = randomInt(1, 7);
          inner = b + c;
          q = randomInt(2, Math.min(9, Math.floor(81 / inner)));
          a = inner * q;
          if (a > 81) return null;
          return { a: a, b: b, c: c };
        }
        q = randomInt(2, 9);
        a = b * q;
        if (a > 81) return null;
        c = randomInt(0, Math.min(99, 100 - q));
        return { a: a, b: b, c: c };
      case "÷−":
        b = randomInt(2, 9);
        if (withBracket) {
          c = randomInt(1, 8);
          inner = randomInt(c + 1, 9);
          a = inner * b;
          if (a > 81) return null;
          return { a: a, b: b, c: c };
        }
        q = randomInt(2, 9);
        a = b * q;
        if (a > 81) return null;
        c = randomInt(0, q);
        return { a: a, b: b, c: c };
      case "÷×":
        if (withBracket) {
          pair = pickL16MulPair();
          b = pair.u;
          c = pair.v;
          inner = b * c;
          if (inner > 81) return null;
          q = randomInt(2, Math.min(9, Math.floor(81 / inner)));
          a = q * inner;
          if (a > 81) return null;
          return { a: a, b: b, c: c };
        }
        q = randomInt(2, 9);
        c = pickL16MulFactor();
        if (q * c > L16_MUL_PRODUCT_MAX) c = pickL16MulDigitFor(q);
        if (c == null) return null;
        b = randomInt(2, 9);
        a = b * q;
        if (a > 81) return null;
        return { a: a, b: b, c: c };
      case "−−":
        c = randomInt(1, 8);
        b = randomInt(c + 1, 9);
        a = randomInt(b + c, 99);
        return { a: a, b: b, c: c };
      case "÷÷":
        c = randomInt(2, 9);
        if (withBracket) {
          inner = randomInt(2, 9);
          b = c * inner;
          if (b > 81) return null;
          q = c * randomInt(2, Math.min(9, Math.floor(81 / b)));
          a = q * b;
          if (a > 81) return null;
          return { a: a, b: b, c: c };
        }
        q2 = randomInt(2, 9);
        q1 = c * q2;
        b = randomInt(2, 9);
        a = b * q1;
        if (a > 81) return null;
        return { a: a, b: b, c: c };
      default:
        return null;
    }
  }

  function l16BuildQuestion(type, withBracket) {
    var operands = l16ConstructOperands(type.op1, type.op2, withBracket);
    if (!operands) return null;
    var a = operands.a;
    var b = operands.b;
    var c = operands.c;
    var natural = l16EvalNatural(a, b, c, type.op1, type.op2);
    if (!natural || !l16ValidSteps(natural.steps)) return null;
    var bracketSide = withBracket ? (type.order === "back" ? "left" : "right") : "none";
    if (withBracket) {
      var bracketed = l16EvalBracketed(a, b, c, type.op1, type.op2, bracketSide);
      if (!bracketed || !l16ValidSteps(bracketed.steps)) return null;
      if (bracketed.answer === natural.answer) return null;
      return { text: l16Render(a, b, c, type.op1, type.op2, bracketSide), answer: bracketed.answer };
    }
    return { text: l16Render(a, b, c, type.op1, type.op2, "none"), answer: natural.answer };
  }

  var LEVEL_DEFS = [
        {
          id: "L1",
          name: "第 1 级 · 一位数加法入门",
          description: "9 以内一位数加法，无进位与进位各半，适合作为热身。",
          operations: ["+"],
          min: 1,
          max: 9,
        },
        {
          id: "L2",
          name: "第 2 级 · 20 以内加法",
          description: "1～10 与 10～19 相加，和不超过 20。",
          operations: ["+"],
          min: 1,
          max: 19,
        },
        {
          id: "L3",
          name: "第 3 级 · 一位数加减混合",
          description: "9 以内加减混合，巩固“凑整”和“退整”的概念。",
          operations: ["+", "-"],
          min: 1,
          max: 9,
          generateQuestion() {
            const op = Math.random() < 0.5 ? "+" : "-";
            let a, b, answer;
            if (op === "+") {
              a = randomInt(this.min, this.max);
              const minB = Math.max(this.min, 10 - a);
              b = randomInt(minB, this.max);
              answer = a + b;
            } else {
              a = randomInt(4, this.max);
              b = randomInt(this.min, Math.min(a, 9));
              answer = a - b;
            }
            const text = `${a} ${op} ${b} = ?`;
            return { a, b, op, text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L4",
          name: "第 4 级 · 两位数加减基础",
          description: "20 以内两位数加减，包含简单进退位，迈向笔算。",
          operations: ["+", "-"],
          min: 6,
          max: 20,
          generateQuestion() {
            const op = Math.random() < 0.5 ? "+" : "-";
            let a, b, answer;
            if (op === "+") {
              // 对齐小程序：确保结果 ≤ 20，并且 b 下限为 4
              for (let i = 0; i < 50; i++) {
                a = randomInt(6, 15);
                const maxB = Math.min(9, 20 - a);
                if (maxB >= 4) {
                  b = randomInt(4, maxB);
                  break;
                }
              }
              if (typeof a !== "number" || typeof b !== "number") {
                a = 11;
                b = 9;
              }
              answer = a + b;
            } else {
              a = randomInt(11, 20);
              b = randomInt(2, 9);
              if (a % 10 >= b && Math.random() < 0.4) {
                // no-op
              } else {
                const tenPart = Math.floor(a / 10) * 10;
                const unit = randomInt(0, 4);
                a = tenPart + unit;
                b = randomInt(unit + 1, 9);
              }
              answer = a - b;
            }
            const text = `${a} ${op} ${b} = ?`;
            return { a, b, op, text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L5",
          name: "第 5 级 · 两位数加一位数/整十数",
          description: "两位数加一位数或整十数，整十数巩固位值，一位数侧重进位。",
          operations: ["+"],
          min: 20,
          max: 99,
          generateQuestion() {
            // 对齐小程序：整十数 : 一位数 ≈ 4 : 6；一位数部分约 75% 保证个位进位
            let a, b, answer;
            if (Math.random() < 0.4) {
              a = randomInt(20, 99);
              b = randomInt(1, 9) * 10;
            } else {
              const wantCarry = Math.random() < 0.75;
              if (wantCarry) {
                for (let i = 0; i < 50; i++) {
                  a = randomInt(20, 99);
                  const aUnit = a % 10;
                  if (aUnit === 0) continue;
                  const minB = Math.max(4, 10 - aUnit);
                  if (minB <= 9) {
                    b = randomInt(minB, 9);
                    break;
                  }
                }
                if (typeof a !== "number" || typeof b !== "number") {
                  a = 27;
                  b = 6;
                }
              } else {
                a = randomInt(20, 99);
                b = randomInt(4, 9);
              }
            }
            answer = a + b;
            const text = `${a} + ${b} = ?`;
            return { a, b, op: "+", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L6",
          name: "第 6 级 · 两位数减一位数/整十数",
          description: "两位数减一位数或整十数，整十数巩固位值，一位数侧重退位。",
          operations: ["-"],
          min: 20,
          max: 99,
          generateQuestion() {
            let a, b, answer;
            if (Math.random() < 0.4) {
              a = randomInt(20, 99);
              const maxTen = Math.floor(a / 10);
              b = randomInt(1, maxTen) * 10;
            } else {
              if (Math.random() < 0.75) {
                const ten = randomInt(2, 9);
                const unitA = randomInt(0, 7);
                b = randomInt(unitA + 1, 9);
                a = ten * 10 + unitA;
              } else {
                b = randomInt(2, 9);
                const unitA = randomInt(b, 9);
                const ten = randomInt(2, 9);
                a = ten * 10 + unitA;
              }
            }
            answer = a - b;
            const text = `${a} - ${b} = ?`;
            return { a, b, op: "-", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L7",
          name: "第 7 级 · 两位数加两位数（进位）",
          description: "两位数加两位数，进位为主，结果不超过 100，与 L8 衔接。",
          operations: ["+"],
          min: 10,
          max: 99,
          generateQuestion() {
            // 对齐小程序 + 修复“边界逼值”问题：不使用 b = 100 - a 的兜底，改为重抽
            const wantCarry = Math.random() < 0.8;
            let a, b, answer;
            for (let i = 0; i < 80; i++) {
              if (wantCarry) {
                const tenA = randomInt(1, 8);
                const unitA = randomInt(1, 9);
                a = tenA * 10 + unitA;
                const unitB = randomInt(10 - unitA, 9);
                const minTenB = 1;
                const maxTenB = Math.floor((100 - a - unitB) / 10);
                if (maxTenB >= minTenB) {
                  const tenB = randomInt(minTenB, maxTenB);
                  b = tenB * 10 + unitB;
                } else {
                  continue;
                }
              } else {
                a = randomInt(10, 99);
                const maxB = Math.min(99, 100 - a);
                if (maxB < 10) continue;
                b = randomInt(10, maxB);
              }
              if (typeof a !== "number" || typeof b !== "number") continue;
              if (b < 10) continue;
              if (a + b > 100) continue;
              // wantCarry 时确保个位进位
              if (wantCarry && ((a % 10) + (b % 10) < 10)) continue;
              answer = a + b;
              const text = `${a} + ${b} = ?`;
              return { a, b, op: "+", text, answer, baseLevelId: this.id };
            }
            // 兜底：给一个合理的非边界组合（避免答案 100 偏多）
            a = 47;
            b = 38; // 85
            answer = a + b;
            const text = `${a} + ${b} = ?`;
            return { a, b, op: "+", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L8",
          name: "第 8 级 · 两位数减两位数（退位）",
          description: "两位数减两位数，退位为主，巩固“借一当十”。",
          operations: ["-"],
          min: 20,
          max: 99,
          generateQuestion() {
            let a, b, answer;
            if (Math.random() < 0.8) {
              const ten = randomInt(3, 9);
              const unitA = randomInt(0, 8);
              const unitB = randomInt(unitA + 1, 9);
              a = ten * 10 + unitA;
              b = randomInt(1, ten - 1) * 10 + unitB;
            } else {
              a = randomInt(20, 99);
              b = randomInt(10, a - 1);
            }
            if (b > a) [a, b] = [b, a];
            answer = a - b;
            const text = `${a} - ${b} = ?`;
            return { a, b, op: "-", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L9",
          name: "第 9 级 · 两位数加减混合",
          description: "两位数加减混合，进位与退位交替出现，结果不超过 100。",
          operations: ["+", "-"],
          min: 10,
          max: 99,
          generateQuestion() {
            const op = Math.random() < 0.5 ? "+" : "-";
            let a, b, answer;
            if (op === "+") {
              // 对齐小程序 + 修复“边界逼值”问题：不使用 b = 100 - a 的兜底，改为重抽
              const wantCarry = Math.random() < 0.7;
              for (let i = 0; i < 80; i++) {
                if (wantCarry) {
                  const tenA = randomInt(1, 8);
                  const unitA = randomInt(1, 9);
                  a = tenA * 10 + unitA;
                  const unitB = randomInt(10 - unitA, 9);
                  const minTenB = 1;
                  const maxTenB = Math.floor((100 - a - unitB) / 10);
                  if (maxTenB >= minTenB) {
                    const tenB = randomInt(minTenB, maxTenB);
                    b = tenB * 10 + unitB;
                  } else {
                    continue;
                  }
                } else {
                  a = randomInt(10, 99);
                  const maxB = Math.min(99, 100 - a);
                  if (maxB < 10) continue;
                  b = randomInt(10, maxB);
                }
                if (b < 10) continue;
                if (a + b > 100) continue;
                if (wantCarry && ((a % 10) + (b % 10) < 10)) continue;
                answer = a + b;
                const text = `${a} + ${b} = ?`;
                return { a, b, op: "+", text, answer, baseLevelId: this.id };
              }
              a = 63;
              b = 28;
              answer = a + b;
            } else {
              // 倾向出现退位
              if (Math.random() < 0.7) {
                const ten = randomInt(3, 9);
                const unitA = randomInt(0, 8);
                const unitB = randomInt(unitA + 1, 9);
                a = ten * 10 + unitA;
                b = randomInt(1, ten - 1) * 10 + unitB;
              } else {
                a = randomInt(20, 99);
                b = randomInt(10, a - 1);
              }
              if (b > a) [a, b] = [b, a];
              answer = a - b;
            }
            const text = `${a} ${op} ${b} = ?`;
            return { a, b, op, text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L10",
          name: "第 10 级 · 乘法口诀基础",
          description: "2 到 9 的乘法口诀（不含 ×1），打牢乘法基础。",
          operations: ["×"],
          min: 2,
          max: 9,
        },
        {
          id: "L11",
          name: "第 11 级 · 两位除一位整除",
          description: "两位数除以一位数，结果为整数，巩固乘除互逆（乘法口诀的逆运算）。",
          operations: ["÷"],
          min: 2,
          max: 9,
        },
        {
          id: "L12",
          name: "第 12 级 · 两位数加两位数（结果超100）",
          description: "两位数加两位数，结果超过 100，引入三位数，衔接乘法。",
          operations: ["+"],
          min: 10,
          max: 99,
          generateQuestion() {
            let a, b, answer;
            a = randomInt(10, 99);
            const minB = Math.max(10, 101 - a);
            if (Math.random() < 0.8) {
              const aUnit = a % 10;
              const minUnitB = Math.max(1, 10 - aUnit);
              const unitB = randomInt(minUnitB, 9);
              const needTenB = Math.ceil((minB - unitB) / 10);
              const maxTenB = Math.floor((99 - unitB) / 10);
              if (maxTenB >= needTenB) {
                const tenB = randomInt(needTenB, maxTenB);
                b = tenB * 10 + unitB;
              } else {
                b = randomInt(minB, 99);
              }
            } else {
              b = randomInt(minB, 99);
            }
            answer = a + b;
            const text = `${a} + ${b} = ?`;
            return { a, b, op: "+", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L13",
          name: "第 13 级 · 两位乘一位",
          description: "两位数乘一位数，结果不超过 100，为多位数乘法竖式打基础。",
          operations: ["×"],
          min: 2,
          max: 9,
          generateQuestion() {
            let a, b, answer;
            b = randomInt(this.min, this.max);
            const maxA = Math.floor(99 / b);
            const minA = 11;
            a = maxA >= minA ? randomInt(minA, maxA) : minA;
            answer = a * b;
            const text = `${a} × ${b} = ?`;
            return { a, b, op: "×", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L14",
          name: "第 14 级 · 两位乘一位的逆运算",
          description: "两位数或三位数除以一位数，商为两位数，对应两位乘一位的除法。",
          operations: ["÷"],
          min: 2,
          max: 9,
          generateQuestion() {
            const divisor = randomInt(this.min, this.max);
            const quotient = randomInt(11, 99);
            const dividend = divisor * quotient;
            const answer = quotient;
            const text = `${dividend} ÷ ${divisor} = ?`;
            return { a: dividend, b: divisor, op: "÷", text, answer, baseLevelId: this.id };
          }
        },
        {
          id: "L15",
          name: "第 15 级 · 不带括号的四则运算",
          description: "3 个数 2 个运算符，12 种混合形态（无连加连减连乘连除），单步难度至 L11。",
          operations: ["+", "-", "×", "÷"],
          min: 1,
          max: 99,
          generateQuestion() {
            const precedenceFirst = [
              () => { const b = randomInt(2, 9); const c = randomInt(2, 9); const a = randomInt(0, Math.min(99, 100 - b * c)); return { text: `${a} + ${b} × ${c} = ?`, answer: a + b * c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(0, Math.min(99, 100 - b / c)); return { text: `${a} + ${b} ÷ ${c} = ?`, answer: a + b / c }; },
              () => { const b = randomInt(2, 9); const c = randomInt(2, 9); const a = randomInt(b * c, Math.min(99, 100)); return { text: `${a} − ${b} × ${c} = ?`, answer: a - b * c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(b / c, 99); return { text: `${a} − ${b} ÷ ${c} = ?`, answer: a - b / c }; }
            ];
            const leftFirst = [
              () => { const a = randomInt(0, 50); const b = randomInt(0, Math.min(50, 100 - a)); const c = randomInt(0, Math.min(50, 100 - a - b)); return { text: `${a} + ${b} − ${c} = ?`, answer: a + b - c }; },
              () => { const a = randomInt(10, 99); const b = randomInt(0, a); const c = randomInt(0, 99); return { text: `${a} − ${b} + ${c} = ?`, answer: a - b + c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(0, Math.min(99, 100 - a * b)); return { text: `${a} × ${b} + ${c} = ?`, answer: a * b + c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(0, a * b); return { text: `${a} × ${b} − ${c} = ?`, answer: a * b - c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(2, 9); if ((a * b) % c !== 0) return null; return { text: `${a} × ${b} ÷ ${c} = ?`, answer: a * b / c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(0, Math.min(99, 100 - a / b)); return { text: `${a} ÷ ${b} + ${c} = ?`, answer: a / b + c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(0, a / b); return { text: `${a} ÷ ${b} − ${c} = ?`, answer: a / b - c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(2, 9); return { text: `${a} ÷ ${b} × ${c} = ?`, answer: a / b * c }; }
            ];
            for (let i = 0; i < 20; i++) {
              const pool = Math.random() < 0.5 ? precedenceFirst : leftFirst;
              const r = pool[randomInt(0, pool.length - 1)]();
              if (r && Number.isInteger(r.answer) && r.answer >= 0) return { a: 0, b: 0, op: "+", text: r.text, answer: r.answer, baseLevelId: this.id };
            }
            const fallback = precedenceFirst[0]();
            return { a: 0, b: 0, op: "+", text: (fallback && fallback.text) || "3 + 4 × 5 = ?", answer: (fallback && fallback.answer) || 23, baseLevelId: this.id };
          }
        },
        {
          id: "L16",
          name: "第 16 级 · 带括号的四则运算",
          description: "12 种四则形态，约 70% 加括号；乘法含友好两位（10～20/整十/末 5），积≤99；约 30% 无括号混淆。",
          operations: ["+", "-", "×", "÷"],
          min: 1,
          max: 99,
          generateQuestion() {
            for (var i = 0; i < 80; i++) {
              var type = L16_TYPES[randomInt(0, L16_TYPES.length - 1)];
              var withBracket = Math.random() < 0.7;
              var r = l16BuildQuestion(type, withBracket);
              if (r && Number.isInteger(r.answer) && r.answer >= 0) {
                return { a: 0, b: 0, op: "+", text: r.text, answer: r.answer, baseLevelId: this.id };
              }
            }
            var fallback = l16BuildQuestion(L16_TYPES[0], true);
            return {
              a: 0, b: 0, op: "+",
              text: (fallback && fallback.text) || "(2 + 3) × 4 = ?",
              answer: (fallback && fallback.answer) || 20,
              baseLevelId: this.id
            };
          }
        }
      ];

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  var L1_LEVEL_INDEX = 0;
  var L1_NO_CARRY_POOL_SIZE = 20;
  var L1_CARRY_POOL_SIZE = 25;
  var L2_LEVEL_INDEX = 1;
  var L2_POOL_SIZE = 55;
  var L10_LEVEL_INDEX = 9;
  var L10_POOL_SIZE = 36;
  var L3_LEVEL_INDEX = 2;
  var L3_ADD_POOL_SIZE = 25;
  var L3_SUB_POOL_SIZE = 39;
  var L4_LEVEL_INDEX = 3;
  var L4_ADD_POOL_SIZE = 50;
  var L4_SUB_POOL_SIZE = 80;
  var L11_LEVEL_INDEX = 10;
  var L11_POOL_SIZE = 56;
  var L13_LEVEL_INDEX = 12;
  var L13_POOL_SIZE = 98;
  var L14_LEVEL_INDEX = 13;
  var L14_QUOTIENT_MIN = 11;
  var L14_QUOTIENT_MAX = 99;
  var DEDUP_LEVEL_INDICES = [4, 5, 6, 7, 8, 11, 14, 15];
  var DEDUP_MAX_RETRIES = 100;
  var DEFAULT_SEGMENT_COUNT = 30;
  var l1Deck = [];
  var l1SegmentCount = DEFAULT_SEGMENT_COUNT;
  var l2Deck = [];
  var l3Deck = [];
  var l3SegmentCount = DEFAULT_SEGMENT_COUNT;
  var l4Deck = [];
  var l4SegmentCount = DEFAULT_SEGMENT_COUNT;
  var l10Deck = [];
  var l11Deck = [];
  var l13Deck = [];
  var l14Deck = [];
  var l14SegmentCount = DEFAULT_SEGMENT_COUNT;
  var segmentSeenKeys = null;
  var segmentLevelIndex = null;
  var lastBuiltLevelIndex = null;

  function isDedupLevel(levelIndex) {
    return DEDUP_LEVEL_INDICES.indexOf(levelIndex) >= 0;
  }

  function isDualDeckLevel(levelIndex) {
    return levelIndex === L1_LEVEL_INDEX || levelIndex === L3_LEVEL_INDEX || levelIndex === L4_LEVEL_INDEX;
  }

  function resolveSegmentCount(count) {
    if (count != null && !Number.isNaN(Number(count))) {
      return Math.max(0, Math.floor(Number(count)));
    }
    return DEFAULT_SEGMENT_COUNT;
  }

  function clearSegmentDedup(levelIndex) {
    segmentLevelIndex = levelIndex;
    segmentSeenKeys = new Set();
  }

  function questionDedupKey(q) {
    return q && q.text != null ? String(q.text) : "";
  }

  function buildDualRunDeck(addPoolBuilder, subPoolBuilder, count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    var addCount = Math.floor(count / 2);
    var subCount = count - addCount;
    var add = shuffleArray(addPoolBuilder()).slice(0, addCount);
    var sub = shuffleArray(subPoolBuilder()).slice(0, subCount);
    return shuffleArray(add.concat(sub));
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function buildL1Pool(carry) {
    var pool = [];
    for (var i = 1; i <= 9; i += 1) {
      for (var j = i; j <= 9; j += 1) {
        var sum = i + j;
        if (carry) {
          if (sum >= 10) pool.push({ a: i, b: j, answer: sum });
        } else if (sum <= 9) {
          pool.push({ a: i, b: j, answer: sum });
        }
      }
    }
    return pool;
  }

  function buildL1RunDeck(count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    var noCarryCount = Math.floor(count / 2);
    var carryCount = count - noCarryCount;
    var noCarry = shuffleArray(buildL1Pool(false)).slice(0, noCarryCount);
    var carry = shuffleArray(buildL1Pool(true)).slice(0, carryCount);
    return shuffleArray(noCarry.concat(carry));
  }

  function materializeL1Question(item) {
    var a = item.a;
    var b = item.b;
    if (Math.random() < 0.5) {
      var swap = a;
      a = b;
      b = swap;
    }
    return {
      a: a,
      b: b,
      op: "+",
      text: a + " + " + b + " = ?",
      answer: item.answer,
      baseLevelId: "L1",
    };
  }

  function buildL2Pool() {
    var pool = [];
    for (var a = 1; a <= 10; a += 1) {
      for (var b = 10; b <= 19; b += 1) {
        if (a + b > 20) continue;
        pool.push({ a: a, b: b, answer: a + b });
      }
    }
    return pool;
  }

  function materializeL2Question(item) {
    var a = item.a;
    var b = item.b;
    if (a !== b && Math.random() < 0.5) {
      var swap = a;
      a = b;
      b = swap;
    }
    return {
      a: a,
      b: b,
      op: "+",
      text: a + " + " + b + " = ?",
      answer: item.answer,
      baseLevelId: "L2",
    };
  }

  function buildL11Pool() {
    var pool = [];
    for (var divisor = 2; divisor <= 9; divisor += 1) {
      for (var quotient = 2; quotient <= 9; quotient += 1) {
        if (divisor === quotient) continue;
        var dividend = divisor * quotient;
        pool.push({ dividend: dividend, divisor: divisor, quotient: quotient });
      }
    }
    return pool;
  }

  function materializeL11Question(item) {
    return {
      a: item.dividend,
      b: item.divisor,
      op: "÷",
      text: item.dividend + " ÷ " + item.divisor + " = ?",
      answer: item.quotient,
      baseLevelId: "L11",
    };
  }

  function buildL10Pool() {
    var pool = [];
    for (var i = 2; i <= 9; i += 1) {
      for (var j = i; j <= 9; j += 1) {
        pool.push({ a: i, b: j, answer: i * j });
      }
    }
    return pool;
  }

  function materializeL10Question(item) {
    var a = item.a;
    var b = item.b;
    if (Math.random() < 0.5) {
      var swap = a;
      a = b;
      b = swap;
    }
    return {
      a: a,
      b: b,
      op: "×",
      text: a + " × " + b + " = ?",
      answer: item.answer,
      baseLevelId: "L10",
    };
  }

  function buildL3AddPool() {
    var pool = [];
    for (var i = 1; i <= 9; i += 1) {
      for (var j = i; j <= 9; j += 1) {
        if (i + j >= 10) pool.push({ op: "+", a: i, b: j, answer: i + j });
      }
    }
    return pool;
  }

  function buildL3SubPool() {
    var pool = [];
    for (var a = 4; a <= 9; a += 1) {
      for (var b = 1; b <= a; b += 1) {
        pool.push({ op: "-", a: a, b: b, answer: a - b });
      }
    }
    return pool;
  }

  function materializeL3Question(item) {
    var op = item.op;
    var a = item.a;
    var b = item.b;
    if (op === "+" && a !== b && Math.random() < 0.5) {
      var swap = a;
      a = b;
      b = swap;
    }
    return {
      a: a,
      b: b,
      op: op,
      text: a + " " + op + " " + b + " = ?",
      answer: item.answer,
      baseLevelId: "L3",
    };
  }

  function buildL4AddPool() {
    var pool = [];
    for (var a = 6; a <= 15; a += 1) {
      var maxB = Math.min(9, 20 - a);
      if (maxB < 4) continue;
      for (var b = 4; b <= maxB; b += 1) {
        pool.push({ op: "+", a: a, b: b, answer: a + b });
      }
    }
    return pool;
  }

  function buildL4SubPool() {
    var pool = [];
    for (var a = 11; a <= 20; a += 1) {
      for (var b = 2; b <= 9; b += 1) {
        pool.push({ op: "-", a: a, b: b, answer: a - b });
      }
    }
    return pool;
  }

  function materializeL4Question(item) {
    var op = item.op;
    var a = item.a;
    var b = item.b;
    return {
      a: a,
      b: b,
      op: op,
      text: a + " " + op + " " + b + " = ?",
      answer: item.answer,
      baseLevelId: "L4",
    };
  }

  function buildL13Pool() {
    var pool = [];
    for (var b = 2; b <= 9; b += 1) {
      var maxA = Math.floor(99 / b);
      for (var a = 11; a <= maxA; a += 1) {
        pool.push({ a: a, b: b, answer: a * b });
      }
    }
    return pool;
  }

  function materializeL13Question(item) {
    return {
      a: item.a,
      b: item.b,
      op: "×",
      text: item.a + " × " + item.b + " = ?",
      answer: item.answer,
      baseLevelId: "L13",
    };
  }

  function buildL14BalancedDivisors(count) {
    var divisors = [];
    var base = Math.floor(count / 8);
    var extra = count % 8;
    var d;
    var i;
    for (d = 2; d <= 9; d += 1) {
      for (i = 0; i < base; i += 1) {
        divisors.push(d);
      }
    }
    for (i = 0; i < extra; i += 1) {
      divisors.push(randomInt(2, 9));
    }
    return shuffleArray(divisors);
  }

  function l14QuestionText(divisor, quotient) {
    return divisor * quotient + " ÷ " + divisor + " = ?";
  }

  function buildL14RunDeck(count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count === 0) return [];
    var divisors = buildL14BalancedDivisors(count);
    var seen = new Set();
    var deck = [];
    var idx;
    for (idx = 0; idx < divisors.length; idx += 1) {
      var divisor = divisors[idx];
      var item = null;
      var attempt;
      for (attempt = 0; attempt < 120; attempt += 1) {
        var quotient = randomInt(L14_QUOTIENT_MIN, L14_QUOTIENT_MAX);
        var text = l14QuestionText(divisor, quotient);
        if (!seen.has(text)) {
          seen.add(text);
          item = { divisor: divisor, quotient: quotient, dividend: divisor * quotient };
          break;
        }
      }
      if (!item) {
        var q;
        for (q = L14_QUOTIENT_MIN; q <= L14_QUOTIENT_MAX; q += 1) {
          var fallbackText = l14QuestionText(divisor, q);
          if (!seen.has(fallbackText)) {
            seen.add(fallbackText);
            item = { divisor: divisor, quotient: q, dividend: divisor * q };
            break;
          }
        }
      }
      if (item) deck.push(item);
    }
    return shuffleArray(deck);
  }

  function materializeL14Question(item) {
    return {
      a: item.dividend,
      b: item.divisor,
      op: "÷",
      text: l14QuestionText(item.divisor, item.quotient),
      answer: item.quotient,
      baseLevelId: "L14",
    };
  }

  function buildQuestionWithDedup(levelIndex) {
    var level = LEVEL_DEFS[levelIndex];
    var seen = segmentSeenKeys;
    for (var i = 0; i < DEDUP_MAX_RETRIES; i += 1) {
      var q = level.generateQuestion.call(level);
      var key = questionDedupKey(q);
      if (!seen || !seen.has(key)) {
        if (seen) seen.add(key);
        return q;
      }
    }
    var fallback = level.generateQuestion.call(level);
    if (seen) seen.add(questionDedupKey(fallback));
    return fallback;
  }

  function resetLevelDeck(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    var segCount = resolveSegmentCount(count);
    segmentSeenKeys = null;
    segmentLevelIndex = null;

    if (levelIndex === L1_LEVEL_INDEX) {
      l1SegmentCount = segCount;
      l1Deck = buildL1RunDeck(l1SegmentCount);
      lastBuiltLevelIndex = L1_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L3_LEVEL_INDEX) {
      l3SegmentCount = segCount;
      l3Deck = buildDualRunDeck(buildL3AddPool, buildL3SubPool, l3SegmentCount);
      lastBuiltLevelIndex = L3_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L4_LEVEL_INDEX) {
      l4SegmentCount = segCount;
      l4Deck = buildDualRunDeck(buildL4AddPool, buildL4SubPool, l4SegmentCount);
      lastBuiltLevelIndex = L4_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L2_LEVEL_INDEX) {
      l2Deck = shuffleArray(buildL2Pool());
      lastBuiltLevelIndex = L2_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      l10Deck = shuffleArray(buildL10Pool());
      lastBuiltLevelIndex = L10_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L11_LEVEL_INDEX) {
      l11Deck = shuffleArray(buildL11Pool());
      lastBuiltLevelIndex = L11_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L13_LEVEL_INDEX) {
      l13Deck = shuffleArray(buildL13Pool());
      lastBuiltLevelIndex = L13_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L14_LEVEL_INDEX) {
      l14SegmentCount = segCount;
      l14Deck = buildL14RunDeck(l14SegmentCount);
      lastBuiltLevelIndex = L14_LEVEL_INDEX;
      return;
    }
    if (isDedupLevel(levelIndex)) {
      clearSegmentDedup(levelIndex);
      lastBuiltLevelIndex = levelIndex;
    }
  }

  function buildL1Question() {
    if (l1Deck.length === 0) {
      l1Deck = buildL1RunDeck(l1SegmentCount);
    }
    return materializeL1Question(l1Deck.pop());
  }

  function buildL3Question() {
    if (l3Deck.length === 0) {
      l3Deck = buildDualRunDeck(buildL3AddPool, buildL3SubPool, l3SegmentCount);
    }
    return materializeL3Question(l3Deck.pop());
  }

  function buildL4Question() {
    if (l4Deck.length === 0) {
      l4Deck = buildDualRunDeck(buildL4AddPool, buildL4SubPool, l4SegmentCount);
    }
    return materializeL4Question(l4Deck.pop());
  }

  function buildL13Question() {
    if (l13Deck.length === 0) {
      l13Deck = shuffleArray(buildL13Pool());
    }
    return materializeL13Question(l13Deck.pop());
  }

  function buildL14Question() {
    if (l14Deck.length === 0) {
      l14Deck = buildL14RunDeck(l14SegmentCount);
    }
    return materializeL14Question(l14Deck.pop());
  }

  function buildL2Question() {
    if (l2Deck.length === 0) {
      l2Deck = shuffleArray(buildL2Pool());
    }
    return materializeL2Question(l2Deck.pop());
  }

  function buildL11Question() {
    if (l11Deck.length === 0) {
      l11Deck = shuffleArray(buildL11Pool());
    }
    return materializeL11Question(l11Deck.pop());
  }

  function buildL10Question() {
    if (l10Deck.length === 0) {
      l10Deck = shuffleArray(buildL10Pool());
    }
    return materializeL10Question(l10Deck.pop());
  }

  function ensureSegmentReady(levelIndex) {
    if (lastBuiltLevelIndex !== levelIndex) {
      resetLevelDeck(levelIndex);
    } else if (isDedupLevel(levelIndex) && (segmentLevelIndex !== levelIndex || !segmentSeenKeys)) {
      clearSegmentDedup(levelIndex);
    }
  }

  function buildQuestion(levelIndex) {
    levelIndex = clampLevelIndex(levelIndex);
    if (levelIndex === L1_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL1Question();
    }
    if (levelIndex === L2_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL2Question();
    }
    if (levelIndex === L3_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL3Question();
    }
    if (levelIndex === L4_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL4Question();
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL10Question();
    }
    if (levelIndex === L11_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL11Question();
    }
    if (levelIndex === L13_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL13Question();
    }
    if (levelIndex === L14_LEVEL_INDEX) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildL14Question();
    }
    if (isDedupLevel(levelIndex)) {
      ensureSegmentReady(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      return buildQuestionWithDedup(levelIndex);
    }
    lastBuiltLevelIndex = levelIndex;
    var level = LEVEL_DEFS[levelIndex];
    return level.generateQuestion.call(level);
  }

  function buildDeckRun(levelIndex, count, drawFn) {
    resetLevelDeck(levelIndex, count);
    lastBuiltLevelIndex = levelIndex;
    var run = [];
    for (var i = 0; i < count; i += 1) {
      run.push(drawFn());
    }
    return run;
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (levelIndex === L1_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL1Question);
    }
    if (levelIndex === L2_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL2Question);
    }
    if (levelIndex === L3_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL3Question);
    }
    if (levelIndex === L4_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL4Question);
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL10Question);
    }
    if (levelIndex === L11_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL11Question);
    }
    if (levelIndex === L13_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL13Question);
    }
    if (levelIndex === L14_LEVEL_INDEX) {
      return buildDeckRun(levelIndex, count, buildL14Question);
    }
    if (isDedupLevel(levelIndex)) {
      resetLevelDeck(levelIndex, count);
      lastBuiltLevelIndex = levelIndex;
      var dedupRun = [];
      for (var d = 0; d < count; d += 1) {
        dedupRun.push(buildQuestionWithDedup(levelIndex));
      }
      return dedupRun;
    }
    var level = LEVEL_DEFS[levelIndex];
    var run = [];
    for (var j = 0; j < count; j += 1) {
      run.push(level.generateQuestion.call(level));
    }
    lastBuiltLevelIndex = levelIndex;
    return run;
  }

  function getDifficultyLevels() {
    return LEVEL_DEFS;
  }

  var LEVEL_LABELS = LEVEL_DEFS.map(function (level) {
    var shortName = String(level.name || "").replace(/^第\s*\d+\s*级\s*·\s*/, "");
    return (level.id || "") + " · " + shortName;
  });

  global.JmlArithmetic = {
    LEVEL_COUNT: LEVEL_DEFS.length,
    LEVEL_LABELS: LEVEL_LABELS,
    L1_LEVEL_INDEX: L1_LEVEL_INDEX,
    L1_NO_CARRY_POOL_SIZE: L1_NO_CARRY_POOL_SIZE,
    L1_CARRY_POOL_SIZE: L1_CARRY_POOL_SIZE,
    L2_LEVEL_INDEX: L2_LEVEL_INDEX,
    L2_POOL_SIZE: L2_POOL_SIZE,
    L10_LEVEL_INDEX: L10_LEVEL_INDEX,
    L10_POOL_SIZE: L10_POOL_SIZE,
    L11_LEVEL_INDEX: L11_LEVEL_INDEX,
    L11_POOL_SIZE: L11_POOL_SIZE,
    L3_LEVEL_INDEX: L3_LEVEL_INDEX,
    L3_ADD_POOL_SIZE: L3_ADD_POOL_SIZE,
    L3_SUB_POOL_SIZE: L3_SUB_POOL_SIZE,
    L4_LEVEL_INDEX: L4_LEVEL_INDEX,
    L4_ADD_POOL_SIZE: L4_ADD_POOL_SIZE,
    L4_SUB_POOL_SIZE: L4_SUB_POOL_SIZE,
    L13_LEVEL_INDEX: L13_LEVEL_INDEX,
    L13_POOL_SIZE: L13_POOL_SIZE,
    L14_LEVEL_INDEX: L14_LEVEL_INDEX,
    DEDUP_LEVEL_INDICES: DEDUP_LEVEL_INDICES.slice(),
    isDualDeckLevel: isDualDeckLevel,
    isDedupLevel: isDedupLevel,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    resetLevelDeck: resetLevelDeck,
    getDifficultyLevels: getDifficultyLevels,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
