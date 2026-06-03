/**
 * 四则运算 L1–L16 出题（与主站 docs/index.html 内联块同源，合并前请 diff）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
          name: "第 2 级 · 一位数加法进阶",
          description: "一位数加法，包含进位，熟练 10 以内凑整。",
          operations: ["+"],
          min: 2,
          max: 9,
          generateQuestion() {
            const a = randomInt(this.min, this.max);
            let b;
            if (a <= 4) {
              b = randomInt(6, this.max);
            } else {
              const minB = Math.max(this.min, 10 - a);
              b = randomInt(minB, this.max);
            }
            const answer = a + b;
            const text = `${a} + ${b} = ?`;
            return { a, b, op: "+", text, answer, baseLevelId: this.id };
          }
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
          generateQuestion() {
            const divisor = randomInt(this.min, this.max);
            const quotient = randomInt(2, 9);
            const dividend = divisor * quotient;
            const answer = quotient;
            const text = `${dividend} ÷ ${divisor} = ?`;
            return { a: dividend, b: divisor, op: "÷", text, answer, baseLevelId: this.id };
          }
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
          description: "3 个数 2 个运算符，先乘除后加减，单步难度至 L11。",
          operations: ["+", "-", "×", "÷"],
          min: 1,
          max: 99,
          generateQuestion() {
            const templates = [
              () => { const b = randomInt(2, 9); const c = randomInt(2, 9); const a = randomInt(0, Math.min(99, 100 - b * c)); return { text: `${a} + ${b} × ${c} = ?`, answer: a + b * c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(0, Math.min(99, 100 - a * b)); return { text: `${a} × ${b} + ${c} = ?`, answer: a * b + c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(0, Math.min(99, 100 - b / c)); return { text: `${a} + ${b} ÷ ${c} = ?`, answer: a + b / c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(0, Math.min(99, 100 - a / b)); return { text: `${a} ÷ ${b} + ${c} = ?`, answer: a / b + c }; },
              () => { const b = randomInt(2, 9); const c = randomInt(2, 9); const a = randomInt(b * c, Math.min(99, 100)); return { text: `${a} − ${b} × ${c} = ?`, answer: a - b * c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(0, a * b); return { text: `${a} × ${b} − ${c} = ?`, answer: a * b - c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(b / c, 99); return { text: `${a} − ${b} ÷ ${c} = ?`, answer: a - b / c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(0, a / b); return { text: `${a} ÷ ${b} − ${c} = ?`, answer: a / b - c }; },
              () => { const a = randomInt(0, 50); const b = randomInt(0, Math.min(50, 100 - a)); const c = randomInt(0, Math.min(50, 100 - a - b)); return { text: `${a} + ${b} + ${c} = ?`, answer: a + b + c }; },
              () => { const a = randomInt(20, 99); const b = randomInt(0, Math.min(50, a)); const c = randomInt(0, Math.min(50, a - b)); return { text: `${a} − ${b} − ${c} = ?`, answer: a - b - c }; },
              () => { const a = randomInt(2, 4); const b = randomInt(2, 4); const maxC = Math.min(4, Math.floor(81 / (a * b))); if (maxC < 2) return null; const c = randomInt(2, maxC); return { text: `${a} × ${b} × ${c} = ?`, answer: a * b * c }; },
              () => { const c = randomInt(2, 9); const b = randomInt(2, 9); const a = b * c * randomInt(2, 4); if (a > 81) return null; return { text: `${a} ÷ ${b} ÷ ${c} = ?`, answer: a / b / c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(2, 9); if ((a * b) % c !== 0) return null; return { text: `${a} × ${b} ÷ ${c} = ?`, answer: a * b / c }; },
              () => { const b = randomInt(2, 9); const a = b * randomInt(2, 9); if (a > 81) return null; const c = randomInt(2, 9); return { text: `${a} ÷ ${b} × ${c} = ?`, answer: a / b * c }; },
              () => { const a = randomInt(0, 50); const b = randomInt(0, 50); const c = randomInt(0, Math.min(99, a + b)); return { text: `${a} + ${b} − ${c} = ?`, answer: a + b - c }; },
              () => { const a = randomInt(10, 99); const b = randomInt(0, a); const c = randomInt(0, 99); return { text: `${a} − ${b} + ${c} = ?`, answer: a - b + c }; }
            ];
            for (let i = 0; i < 20; i++) {
              const t = templates[randomInt(0, templates.length - 1)];
              const r = t();
              if (r && Number.isInteger(r.answer) && r.answer >= 0) return { a: 0, b: 0, op: "+", text: r.text, answer: r.answer, baseLevelId: this.id };
            }
            const fallback = templates[0]();
            return { a: 0, b: 0, op: "+", text: (fallback && fallback.text) || "1 + 2 + 3 = ?", answer: (fallback && fallback.answer) || 6, baseLevelId: this.id };
          }
        },
        {
          id: "L16",
          name: "第 16 级 · 带括号的四则运算",
          description: "3 个数 2 个运算符，一对括号改变运算顺序，单步难度至 L11。",
          operations: ["+", "-", "×", "÷"],
          min: 1,
          max: 99,
          generateQuestion() {
            const templates = [
              () => { const a = randomInt(1, 8); const b = randomInt(1, 9 - a); const c = randomInt(2, 9); return { text: `(${a} + ${b}) × ${c} = ?`, answer: (a + b) * c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(1, a - 1); const c = randomInt(2, 9); return { text: `(${a} − ${b}) × ${c} = ?`, answer: (a - b) * c }; },
              () => { const c = randomInt(2, 9); const quotient = randomInt(2, 9); const sum = c * quotient; if (sum < 10 || sum > 18) return null; const a = randomInt(1, sum - 1); const b = sum - a; return { text: `(${a} + ${b}) ÷ ${c} = ?`, answer: (a + b) / c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(1, a - 1); const c = randomInt(2, 9); if ((a - b) % c !== 0) return null; return { text: `(${a} − ${b}) ÷ ${c} = ?`, answer: (a - b) / c }; },
              () => { const a = randomInt(2, 9); const b = randomInt(1, 8); const c = randomInt(1, 9 - b); return { text: `${a} × (${b} + ${c}) = ?`, answer: a * (b + c) }; },
              () => { const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(1, b - 1); return { text: `${a} × (${b} − ${c}) = ?`, answer: a * (b - c) }; },
              () => { const bc = randomInt(2, 9); const a = bc * randomInt(2, 9); if (a > 81) return null; const b = randomInt(1, bc - 1); const c = bc - b; return { text: `${a} ÷ (${b} + ${c}) = ?`, answer: a / (b + c) }; },
              () => { const bc = randomInt(2, 9); const a = bc * randomInt(2, 9); if (a > 81) return null; const b = randomInt(bc + 1, 9); const c = b - bc; return { text: `${a} ÷ (${b} − ${c}) = ?`, answer: a / (b - c) }; },
              () => { const a = randomInt(0, 90); const b = randomInt(2, 9); const c = randomInt(2, 9); return { text: `${a} + (${b} × ${c}) = ?`, answer: a + b * c }; },
              () => { const b = randomInt(2, 9); const c = randomInt(2, 9); const a = randomInt(b * c, 99); return { text: `${a} − (${b} × ${c}) = ?`, answer: a - b * c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(0, 100 - b / c); return { text: `${a} + (${b} ÷ ${c}) = ?`, answer: a + b / c }; },
              () => { const c = randomInt(2, 9); const b = c * randomInt(2, 9); if (b > 81) return null; const a = randomInt(b / c, 99); return { text: `${a} − (${b} ÷ ${c}) = ?`, answer: a - b / c }; }
            ];
            for (let i = 0; i < 20; i++) {
              const t = templates[randomInt(0, templates.length - 1)];
              const r = t();
              if (r && Number.isInteger(r.answer) && r.answer >= 0) return { a: 0, b: 0, op: "+", text: r.text, answer: r.answer, baseLevelId: this.id };
            }
            return { a: 2, b: 2, op: "+", text: "(2 + 2) × 2 = ?", answer: 8, baseLevelId: this.id };
          }
        }
      ];

  function clampLevelIndex(i) {
    return Math.max(0, Math.min(LEVEL_DEFS.length - 1, Math.floor(Number(i) || 0)));
  }

  var L1_LEVEL_INDEX = 0;
  var L1_NO_CARRY_POOL_SIZE = 20;
  var L1_CARRY_POOL_SIZE = 25;
  var L10_LEVEL_INDEX = 9;
  var L10_POOL_SIZE = 36;
  var l1Deck = [];
  var l1SegmentCount = 30;
  var l10Deck = [];
  var lastBuiltLevelIndex = null;

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

  function resetLevelDeck(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    if (levelIndex === L1_LEVEL_INDEX) {
      if (count != null && !Number.isNaN(Number(count))) {
        l1SegmentCount = Math.max(0, Math.floor(Number(count)));
      }
      l1Deck = buildL1RunDeck(l1SegmentCount);
      lastBuiltLevelIndex = L1_LEVEL_INDEX;
      return;
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      l10Deck = shuffleArray(buildL10Pool());
      lastBuiltLevelIndex = L10_LEVEL_INDEX;
    }
  }

  function buildL1Question() {
    if (l1Deck.length === 0) {
      l1Deck = buildL1RunDeck(l1SegmentCount);
    }
    return materializeL1Question(l1Deck.pop());
  }

  function buildL10Question() {
    if (l10Deck.length === 0) {
      l10Deck = shuffleArray(buildL10Pool());
    }
    return materializeL10Question(l10Deck.pop());
  }

  function buildQuestion(levelIndex) {
    levelIndex = clampLevelIndex(levelIndex);
    if (levelIndex === L1_LEVEL_INDEX) {
      if (lastBuiltLevelIndex !== L1_LEVEL_INDEX) {
        resetLevelDeck(L1_LEVEL_INDEX);
      }
      lastBuiltLevelIndex = levelIndex;
      return buildL1Question();
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      if (lastBuiltLevelIndex !== L10_LEVEL_INDEX) {
        resetLevelDeck(L10_LEVEL_INDEX);
      }
      lastBuiltLevelIndex = levelIndex;
      return buildL10Question();
    }
    lastBuiltLevelIndex = levelIndex;
    var level = LEVEL_DEFS[levelIndex];
    return level.generateQuestion.call(level);
  }

  function buildRun(levelIndex, count) {
    levelIndex = clampLevelIndex(levelIndex);
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (levelIndex === L1_LEVEL_INDEX) {
      resetLevelDeck(levelIndex, count);
      lastBuiltLevelIndex = levelIndex;
      var l1Run = [];
      for (var k = 0; k < count; k += 1) {
        l1Run.push(buildL1Question());
      }
      return l1Run;
    }
    if (levelIndex === L10_LEVEL_INDEX) {
      resetLevelDeck(levelIndex);
      lastBuiltLevelIndex = levelIndex;
      var l10Run = [];
      for (var i = 0; i < count; i += 1) {
        l10Run.push(buildL10Question());
      }
      return l10Run;
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
    L10_LEVEL_INDEX: L10_LEVEL_INDEX,
    L10_POOL_SIZE: L10_POOL_SIZE,
    buildQuestion: buildQuestion,
    buildRun: buildRun,
    resetLevelDeck: resetLevelDeck,
    getDifficultyLevels: getDifficultyLevels,
    getLevelMeta: function (levelIndex) {
      return LEVEL_DEFS[clampLevelIndex(levelIndex)];
    },
  };
})(typeof window !== "undefined" ? window : this);
