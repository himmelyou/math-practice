/**
 * 拆括号 L1-L5 出题（与主站 docs/index.html 同源）
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

    function shuffleInPlace(arr) {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    }

    // ===== 拆括号 L1–L5（见项目根目录《拆括号等级说明.md》）=====
    const EB_LETTERS = ["a", "b", "x", "y"];

    function ebPickAtom() {
      if (Math.random() < 0.48) return { type: "n", v: randomInt(1, 15) };
      return { type: "l", ch: EB_LETTERS[randomInt(0, 3)] };
    }

    function ebFmtAtom(at) {
      return at.type === "n" ? String(at.v) : at.ch;
    }

    function ebTermSignedAtom(s, at) {
      if (at.type === "n") return String(s * at.v);
      return s === 1 ? at.ch : "-" + at.ch;
    }

    /** 常数×字母：省略乘号；系数 1 不写 1 */
    function ebFormatNumTimesLetter(k, letterCh) {
      const ch =
        typeof letterCh === "string"
          ? letterCh
          : letterCh && typeof letterCh.ch === "string"
            ? letterCh.ch
            : "";
      if (!ch) return String(k);
      if (k === 1) return ch;
      if (k === -1) return "-" + ch;
      if (k === 0) return "0";
      if (k > 0) return `${k}${ch}`;
      return `-${Math.abs(k)}${ch}`;
    }

    /** 两字母乘积：字母表序连接；相同字母写作 字母^2 */
    function ebFormatTwoLettersProduct(sign, ch1, ch2) {
      const a = String(ch1 || "");
      const b = String(ch2 || "");
      let body;
      if (a === b) body = `${a}²`;
      else {
        const sorted = [a, b].sort();
        body = sorted[0] + sorted[1];
      }
      if (sign < 0) return "-" + body;
      return body;
    }

    /** 两正整数乘积的展示：数×数保留乘号，整体符号提到最前 */
    function ebFormatTwoNumberProduct(sign, u1, u2) {
      const core = `${Math.abs(u1)} × ${Math.abs(u2)}`;
      return sign < 0 ? "-" + core : core;
    }

    /** 段内两带符号原子相乘（L5c FOIL 一项）；遵循数×数 / 数×字母 / 字母×字母 书写约定 */
    function ebProductPair(pa, pb) {
      const [s1, a1] = pa;
      const [s2, a2] = pb;
      if (a1.type === "n" && a2.type === "n") {
        const prod = s1 * a1.v * s2 * a2.v;
        return ebFormatTwoNumberProduct(prod < 0 ? -1 : 1, a1.v, a2.v);
      }
      if (a1.type === "n" && a2.type === "l") {
        return ebFormatNumTimesLetter(s1 * a1.v * s2, a2.ch);
      }
      if (a1.type === "l" && a2.type === "n") {
        return ebFormatNumTimesLetter(s2 * a2.v * s1, a1.ch);
      }
      return ebFormatTwoLettersProduct(s1 * s2, a1.ch, a2.ch);
    }

    /** 外原子 ×（内带符号原子），用于 L5a 分配展开每一项 */
    function ebAtomTimesSignedTerm(A, s, at) {
      if (A.type === "n" && at.type === "n") {
        const v2 = s * at.v;
        const prod = A.v * v2;
        return ebFormatTwoNumberProduct(prod < 0 ? -1 : 1, Math.abs(A.v), Math.abs(v2));
      }
      if (A.type === "n" && at.type === "l") {
        return ebFormatNumTimesLetter(A.v * s, at.ch);
      }
      if (A.type === "l" && at.type === "n") {
        return ebFormatNumTimesLetter(at.v * s, A.ch);
      }
      return ebFormatTwoLettersProduct(s, A.ch, at.ch);
    }

    function ebJoinSum(strs) {
      if (!strs.length) return "0";
      let out = strs[0];
      for (let i = 1; i < strs.length; i++) {
        const t = strs[i];
        if (t.charAt(0) === "-") out += " - " + t.slice(1);
        else out += " + " + t;
      }
      return out;
    }

    /** k × (带符号原子)，用于 L4 分配 */
    function ebKTimesTerm(k, s, at) {
      const kk = k * s;
      if (at.type === "n") {
        const v = at.v;
        if (kk >= 0) return `${kk} × ${v}`;
        return `-${Math.abs(kk)} × ${v}`;
      }
      if (kk === 1) return at.ch;
      if (kk === -1) return "-" + at.ch;
      if (kk === 0) return "0";
      if (kk > 0) return `${kk}${at.ch}`;
      return `-${Math.abs(kk)}${at.ch}`;
    }

    /** 段内 (±A ± B)：返回两个 [sign, atom] */
    function ebSegPair(signA, A, opAB, B) {
      const sb = opAB === "+" ? 1 : -1;
      return [
        [signA, A],
        [sb, B],
      ];
    }

    function ebNegPair([s, a]) {
      return [-s, a];
    }

    function ebCombineSegs(seg1, seg2, mid) {
      const [p1, p2] = seg1;
      const [q1, q2] = seg2;
      if (mid === "+") return [p1, p2, q1, q2];
      return [p1, p2, ebNegPair(q1), ebNegPair(q2)];
    }

    function ebPairsToSum(pairs) {
      const strs = pairs.map(([s, at]) => ebTermSignedAtom(s, at));
      return ebJoinSum(strs);
    }

    function ebBracketPrompt(signA, A, opAB, B) {
      const first =
        A.type === "n"
          ? String(signA * A.v)
          : signA === 1
            ? A.ch
            : "-" + A.ch;
      return "(" + first + " " + opAB + " " + ebFmtAtom(B) + ")";
    }

    function formatExpandedTerms(terms) {
      const nums = Array.isArray(terms) ? terms.map((x) => Number(x) || 0) : [];
      if (nums.length === 0) return "0";
      let out = String(nums[0]);
      for (let i = 1; i < nums.length; i += 1) {
        const v = nums[i];
        if (v >= 0) out += " + " + v;
        else out += " - " + Math.abs(v);
      }
      return out;
    }

    function buildExpandQuestion_L1() {
      const minusOuter = Math.random() < 0.8;
      const A = randomInt(1, 12);
      const B = randomInt(1, 12);
      const C = randomInt(1, 12);
      const innerOp = Math.random() < 0.5 ? "+" : "-";
      const prompt = minusOuter ? `${A} - (${B} ${innerOp} ${C})` : `${A} + (${B} ${innerOp} ${C})`;
      let correctTerms;
      const innerTerms = [B, innerOp === "+" ? C : -C];
      if (minusOuter) {
        if (innerOp === "+") correctTerms = [A, -B, -C];
        else correctTerms = [A, -B, C];
      } else {
        if (innerOp === "+") correctTerms = [A, B, C];
        else correctTerms = [A, B, -C];
      }
      return {
        expandKind: "L1",
        prompt,
        correctTerms,
        innerTerms,
        outerMinus: minusOuter,
        correctText: formatExpandedTerms(correctTerms),
        wrongPool: minusOuter
          ? [
              {
                text: formatExpandedTerms([A, innerTerms[0], innerTerms[1]]),
                explain: "括号外为「−」时：整体未按规则变号。",
                causeNo: 1,
              },
              {
                text: formatExpandedTerms([A, -innerTerms[0], innerTerms[1]]),
                explain: "括号外为「−」时：只变第一项，第二项未跟着变号。",
                causeNo: 2,
              },
              {
                text: formatExpandedTerms([A, innerTerms[0], -innerTerms[1]]),
                explain: "括号外为「−」时：只变第二项，第一项未跟着变号。",
                causeNo: 3,
              },
            ]
          : [
              {
                text: formatExpandedTerms([A, -innerTerms[0], -innerTerms[1]]),
                explain: "括号外为「+」时：整体都变号。",
                causeNo: 4,
              },
              {
                text: formatExpandedTerms([A, -innerTerms[0], innerTerms[1]]),
                explain: "括号外为「+」时：无故改变第一项符号，第二项不变号。",
                causeNo: 5,
              },
              {
                text: formatExpandedTerms([A, innerTerms[0], -innerTerms[1]]),
                explain: "括号外为「+」时：无故改变第二项符号，第一项不变号。",
                causeNo: 6,
              },
            ],
      };
    }

    function buildExpandQuestion_L2() {
      const k = randomInt(1, 12);
      const A = randomInt(1, 12);
      const B = randomInt(1, 12);
      const innerOp = Math.random() < 0.5 ? "+" : "-";
      const inner = innerOp === "+" ? `${A} + ${B}` : `${A} - ${B}`;
      const layout = randomInt(0, 7);
      let prompt;
      let correctText;
      let wrongPool = [];

      if (layout <= 1) {
        const leftK = layout === 0;
        prompt = leftK ? `${k} × (${inner})` : `(${inner}) × ${k}`;
        const t1 = `${k} × ${A}`;
        const t2 = innerOp === "+" ? `${k} × ${B}` : `- ${k} × ${B}`;
        correctText = ebJoinSum([t1, t2]);
        wrongPool = [
          { text: ebJoinSum([t2]), explain: "乘法分配时漏乘括号内第一项。", causeNo: 1 },
          { text: ebJoinSum([t1]), explain: "乘法分配时漏乘括号内第二项。", causeNo: 2 },
          {
            text: innerOp === "+" ? ebJoinSum([t1, `- ${k} × ${B}`]) : ebJoinSum([t1, `${k} × ${B}`]),
            explain: "乘法分配时，当括号内符号为加号或减号时，错看原有符号，导致分配后第二项符号错误。",
            causeNo: 3,
          },
          {
            text: innerOp === "+" ? `${k} + ${A} + ${B}` : `${k} - ${A} + ${B}`,
            explain: "对于 `k × (A op B)` 或 `(A op B) × k`，且 op 为加号或减号时，将中间乘号看成 op 进行分配。",
            causeNo: 4,
          },
          {
            text: innerOp === "+" ? `${k} × ${A} + ${k} × ${B}` : `${k} × ${A} - ${k} × ${B}`,
            explain: "对于 `k × (A op B)` 或 `(A op B) × k`，且 op 为乘号时，将 op 看成加号导致误用加法分配律。",
            causeNo: 5,
          },
        ];
      } else if (layout <= 3) {
        const leftP = layout === 2;
        prompt = leftP ? `(${inner}) ÷ ${k}` : `${k} ÷ (${inner})`;
        if (!leftP) {
          correctText = "此类情况无法去除括号";
          const w2 = innerOp === "+" ? `${k} ÷ ${B}` : `- ${k} ÷ ${B}`;
          wrongPool = [
            { text: ebJoinSum([`${k} ÷ ${A}`, `${k} ÷ ${B}`]), explain: "对于 `k ÷ (A ± B)` 时，对括号内强行分配所有项。", causeNo: 8 },
            { text: ebJoinSum([`${k} ÷ ${A}`]), explain: "对于 `k ÷ (A ± B)` 时，对括号内强行分配，且只分配部分项。", causeNo: 9 },
            { text: `${k} ÷ ${A} + ${B}`, explain: "对于 `k ÷ (A ± B)` 时，强行展开但项衔接错误。", causeNo: 8 },
            { text: `${k} ÷ ${A} - ${B}`, explain: "对于 `k ÷ (A ± B)` 时，强行展开且符号处理错误。", causeNo: 9 },
          ];
        } else {
          const t1 = `${A} ÷ ${k}`;
          const t2 = innerOp === "+" ? `${B} ÷ ${k}` : `- ${B} ÷ ${k}`;
          correctText = ebJoinSum([t1, t2]);
          wrongPool = [
            {
              text: innerOp === "+" ? ebJoinSum([t1, `- ${B} ÷ ${k}`]) : ebJoinSum([t1, `${B} ÷ ${k}`]),
              explain: "对于 `(A ± B) ÷ k`，分配后对于原括号内的符号分配错误（例如加号变减号等）。",
              causeNo: 15,
            },
            {
              text: innerOp === "+" ? `${A} + ${B} ÷ ${k}` : `${A} - ${B} ÷ ${k}`,
              explain: "对于 `(A ± B) op k`，op 为除时，只除第二项，第一项照抄。",
              causeNo: 12,
            },
            {
              text: innerOp === "+" ? `${A} ÷ ${k} + ${B}` : `${A} ÷ ${k} - ${B}`,
              explain: "对于 `(A ± B) op k`，op 为除时，只除第一项，第二项照抄。",
              causeNo: 11,
            },
            { text: ebJoinSum([t1]), explain: "对于 `(A ± B) op k`，op 为除时，只除第一项，第二项漏抄。", causeNo: 13 },
            { text: ebJoinSum([t2]), explain: "对于 `(A ± B) op k`，op 为除时，只除第二项，第一项漏抄。", causeNo: 14 },
            { text: `${A} + ${B} ÷ ${k}`, explain: "除法只作用在括号内其中一项，书写顺序错误。", causeNo: 99 },
          ];
        }
      } else if (layout === 4) {
        const opIn = Math.random() < 0.5 ? "×" : "÷";
        prompt = `${k} × (${A} ${opIn} ${B})`;
        if (opIn === "×") {
          correctText = `${k} × ${A} × ${B}`;
          wrongPool = [
            { text: `${k} × ${A} + ${k} × ${B}`, explain: "对于 `k × (A op B)` 且 op 为乘号时，将 op 看成加号导致误用加法分配律。", causeNo: 5 },
            { text: `${k} + ${A} + ${B}`, explain: "对于 `k × (A op B)` 或 `(A op B) × k`，且 op 为加号或减号时，将中间乘号看成 op 进行分配。", causeNo: 4 },
            { text: `${A} × ${B} + ${k}`, explain: "运算顺序或拆写错误。", causeNo: 99 },
          ];
        } else {
          correctText = `${k} × ${A} ÷ ${B}`;
          wrongPool = [
            { text: `${k} × ${A} ÷ ${k} × ${B}`, explain: "对于 `k × (A ÷ B)` 或 `(A ÷ B) × k`，写成 `k × A ÷ k × B` 的错误分配。", causeNo: 6 },
            { text: `${k} × ${A} + ${k} × ${B}`, explain: "括号内为除号时误用加法分配律拆开。", causeNo: 5 },
            { text: `${k} × ${A} + ${k} ÷ ${B}`, explain: "括号内为除号时，拆写衔接错误。", causeNo: 99 },
            { text: `${A} × ${B} + ${k}`, explain: "运算顺序或拆写错误。", causeNo: 99 },
          ];
        }
      } else if (layout === 5) {
        const opIn = Math.random() < 0.5 ? "×" : "÷";
        prompt = `(${A} ${opIn} ${B}) × ${k}`;
        if (opIn === "×") {
          correctText = `${A} × ${B} × ${k}`;
          wrongPool = [
            { text: `${k} × ${A} + ${k} × ${B}`, explain: "对于 `k × (A op B)` 且 op 为乘号时，将 op 看成加号导致误用加法分配律。", causeNo: 5 },
            { text: `${A} × ${k} + ${B}`, explain: "对于 `(A ± B) op k`，op 为乘时，只乘第一项，第二项照抄。", causeNo: 11 },
            { text: `${A} + ${B} × ${k}`, explain: "对于 `(A ± B) op k`，op 为乘时，只乘第二项，第一项照抄。", causeNo: 12 },
            { text: `${A} × ${B} + ${k}`, explain: "对于 `(A ± B) op k`，op 为乘时，只乘第一项，第二项漏抄。", causeNo: 13 },
            { text: `${B} × ${k}`, explain: "对于 `(A ± B) op k`，op 为乘时，只乘第二项，第一项漏抄。", causeNo: 14 },
          ];
        } else {
          correctText = `${A} ÷ ${B} × ${k}`;
          wrongPool = [
            { text: `${k} × ${A} ÷ ${k} × ${B}`, explain: "对于 `k × (A ÷ B)` 或 `(A ÷ B) × k`，写成 `k × A ÷ k × B` 的错误分配。", causeNo: 6 },
            { text: `${A} ÷ ${k} + ${B}`, explain: "对于 `(A ± B) op k`，op 为除时，只除第一项，第二项照抄。", causeNo: 11 },
            { text: `${A} + ${B} ÷ ${k}`, explain: "对于 `(A ± B) op k`，op 为除时，只除第二项，第一项照抄。", causeNo: 12 },
            { text: `${A} ÷ ${B}`, explain: "对于 `(A ± B) op k`，op 为除时，只除第一项，第二项漏抄。", causeNo: 13 },
            { text: `${B} ÷ ${k}`, explain: "对于 `(A ± B) op k`，op 为除时，只除第二项，第一项漏抄。", causeNo: 14 },
          ];
        }
      } else {
        const opIn = Math.random() < 0.5 ? "×" : "÷";
        prompt = `(${A} ${opIn} ${B}) ÷ ${k}`;
        if (opIn === "×") {
          correctText = `${A} × ${B} ÷ ${k}`;
          wrongPool = [
            { text: `${A} ÷ ${k} + ${B} ÷ ${k}`, explain: "括号内为乘除时误用加减拆括号。", causeNo: 99 },
            { text: `${k} ÷ ${A} × ${k} ÷ ${B}`, explain: "对于 `k ÷ (A × B)` 或 `(A × B) ÷ k`，写成 `k ÷ A × k ÷ B` 的错误分配。", causeNo: 7 },
            { text: `${A} × ${k} ÷ ${B}`, explain: "除法与括号衔接或运算顺序错误。", causeNo: 99 },
            { text: `${A} ÷ ${k} × ${B}`, explain: "除法与括号衔接或运算顺序错误。", causeNo: 99 },
          ];
        } else {
          correctText = `${A} ÷ ${B} ÷ ${k}`;
          wrongPool = [
            { text: `${A} ÷ ${k} + ${B} ÷ ${k}`, explain: "括号内为乘除时误用加减拆括号。", causeNo: 99 },
            { text: `${k} ÷ ${A} ÷ ${k} ÷ ${B}`, explain: "对于 `k ÷ (A ÷ B)` 时对括号内强行分配。", causeNo: 10 },
            { text: `${A} ÷ ${B} × ${k}`, explain: "除法与括号衔接错误。", causeNo: 99 },
            { text: `${A} × ${B} ÷ ${k}`, explain: "除法与括号衔接错误。", causeNo: 99 },
          ];
        }
      }

      return { expandKind: "L2", prompt, correctText, wrongPool, presetWrong: [] };
    }

    function buildExpandQuestion_L3() {
      const A = ebPickAtom();
      const B = ebPickAtom();
      const C = ebPickAtom();
      const D = ebPickAtom();
      const sA = Math.random() < 0.5 ? 1 : -1;
      const opAB = Math.random() < 0.5 ? "+" : "-";
      const sC = Math.random() < 0.5 ? 1 : -1;
      const opCD = Math.random() < 0.5 ? "+" : "-";
      const mid = Math.random() < 0.5 ? "+" : "-";
      const prompt = ebBracketPrompt(sA, A, opAB, B) + " " + mid + " " + ebBracketPrompt(sC, C, opCD, D);
      const seg1 = ebSegPair(sA, A, opAB, B);
      const seg2 = ebSegPair(sC, C, opCD, D);
      const pairs = ebCombineSegs(seg1, seg2, mid);
      const correctText = ebPairsToSum(pairs);
      const [p1, p2, q1, q2] = pairs;
      const wrongPool = [];

      if (mid === "-") {
        wrongPool.push({
          text: ebPairsToSum([p1, p2, seg2[0], seg2[1]]),
          explain: "段间为「−」时，第二段整体忘变号。",
          causeNo: 1,
        });
        wrongPool.push({
          text: ebPairsToSum([p1, p2, ebNegPair(q1), q2]),
          explain: "段间为「−」时，第二段只变第一项符号，第二项未变号。",
          causeNo: 2,
        });
        wrongPool.push({
          text: ebPairsToSum([p1, p2, q1, ebNegPair(q2)]),
          explain: "段间为「−」时，第二段只变第二项符号，第一项未变号。",
          causeNo: 3,
        });
      }
      wrongPool.push({
        text: ebPairsToSum([p1, p2, q2]),
        explain: "段间为「− / +」时，第二段漏抄第一项。",
        causeNo: 4,
      });
      wrongPool.push({
        text: ebPairsToSum([p1, p2, q1]),
        explain: "段间为「− / +」时，第二段漏抄第二项。",
        causeNo: 5,
      });
      if (mid === "+") {
        wrongPool.push({
          text: ebPairsToSum([p1, p2, ebNegPair(q1), ebNegPair(q2)]),
          explain: "段间为「+」时，第二段无故整体变号。",
          causeNo: 6,
        });
        wrongPool.push({
          text: ebPairsToSum([p1, p2, ebNegPair(q1), q2]),
          explain: "段间为「+」时，第二段无故仅改变第一项符号。",
          causeNo: 7,
        });
        wrongPool.push({
          text: ebPairsToSum([p1, p2, q1, ebNegPair(q2)]),
          explain: "段间为「+」时，第二段无故仅改变第二项符号。",
          causeNo: 8,
        });
      }
      wrongPool.push({
        text: ebPairsToSum([ebNegPair(p1), p2, q1, q2]),
        explain: "某段首项前的「+ / −」被吃掉或重复变号；或第一段展开后第一项符号错误。",
        causeNo: 13,
      });
      wrongPool.push({
        text: ebPairsToSum([q1, q2, p1, p2]),
        explain: "第一段与第二段符号混抄、段界不清。",
        causeNo: 10,
      });
      wrongPool.push({
        text: ebPairsToSum([p2, q1, q2]),
        explain: "第一段漏抄第一项。",
        causeNo: 11,
      });
      wrongPool.push({
        text: ebPairsToSum([p1, q1, q2]),
        explain: "第一段漏抄第二项。",
        causeNo: 12,
      });
      wrongPool.push({
        text: ebPairsToSum([p1, ebNegPair(p2), q1, q2]),
        explain: "第一段展开后第二项符号错误。",
        causeNo: 14,
      });

      const seen = new Set([correctText]);
      const deduped = [];
      for (let i = 0; i < wrongPool.length; i += 1) {
        const w = wrongPool[i];
        if (!w || !w.text || seen.has(w.text)) continue;
        seen.add(w.text);
        deduped.push(w);
      }

      return { expandKind: "L3", prompt, correctText, wrongPool: deduped, presetWrong: [] };
    }

    function buildExpandQuestion_L4() {
      const dual = Math.random() < 0.5;
      const k = randomInt(1, 12);
      const k1 = randomInt(1, 12);
      const k2 = randomInt(1, 12);
      let wrongPool = [];
      let prompt;
      let correctText;

      if (!dual) {
        const A = ebPickAtom();
        const B = ebPickAtom();
        const C = ebPickAtom();
        const signA = Math.random() < 0.5 ? 1 : -1;
        const opK = Math.random() < 0.5 ? "+" : "-";
        const innerOp = Math.random() < 0.5 ? "+" : "-";
        prompt =
          ebTermSignedAtom(signA, A) +
          " " +
          opK +
          " " +
          k +
          "(" +
          ebFmtAtom(B) +
          " " +
          innerOp +
          " " +
          ebFmtAtom(C) +
          ")";
        const innerP = ebSegPair(1, B, innerOp, C);
        const kfac = opK === "+" ? 1 : -1;
        const parts = [];
        parts.push(ebTermSignedAtom(signA, A));
        innerP.forEach(([s, at]) => {
          parts.push(ebKTimesTerm(k * kfac, s, at));
        });
        correctText = ebJoinSum(parts);
        wrongPool = [
          {
            text: ebJoinSum([parts[0], ebKTimesTerm(k * kfac, 1, B)]),
            explain: "对于含 `± k (± B ± C)`，`± k` 只乘括号内第一项。",
            causeNo: 2,
          },
          {
            text: ebJoinSum([parts[0], ebKTimesTerm(k * kfac, 1, C)]),
            explain: "对于含 `± k (± B ± C)`，`± k` 只乘括号内第二项。",
            causeNo: 3,
          },
          {
            text: ebJoinSum([parts[0], ebFmtAtom(B), ebFmtAtom(C)]),
            explain: "对于含 `± k (± B ± C)`，系数 `± k` 直接被遗忘，得到结果为 `± B ± C`（错形）。",
            causeNo: 5,
          },
          {
            text: ebJoinSum([parts[0], ebKTimesTerm(k * kfac, -1, B), ebKTimesTerm(k * kfac, 1, C)]),
            explain: "对于含 `± k (± B ± C)`，分配时将括号内 `B` 或 `C` 的符号弄错。",
            causeNo: 4,
          },
          {
            text: ebJoinSum([ebKTimesTerm(k * kfac, 1, B), ebKTimesTerm(k * kfac, 1, C)]),
            explain: "对于含 `± A ± k (± B ± C)`，遗忘 `± A`。",
            causeNo: 8,
          },
          {
            text: ebJoinSum([`${ebFmtAtom(A)} × ${ebFmtAtom(B)}`, ebKTimesTerm(k * kfac, 1, C)]),
            explain: "对于含 `± A ± k (± B ± C)`，误将 `A` 当成系数与括号内项错误相乘（错形）。",
            causeNo: 7,
          },
          {
            text: ebJoinSum([parts[0], `${k}`, ebFmtAtom(B), ebFmtAtom(C)]),
            explain: "对于含 `± k (± B ± C)`，分配时把 `k` 当作普通加减项插入（错形）。",
            causeNo: 6,
          },
          {
            text: ebJoinSum([`${k} × ${ebFmtAtom(B)}`, `${k} + ${ebFmtAtom(C)}`]),
            explain: "含括号的展开后分配时计算错误（如把 `k × (A ± B)` 错成 `(k × A) ± (k ± B)` 一类错形）。",
            causeNo: 19,
          },
        ];
      } else {
        const A = ebPickAtom();
        const B = ebPickAtom();
        const C = ebPickAtom();
        const D = ebPickAtom();
        const sA = Math.random() < 0.5 ? 1 : -1;
        const opAB = Math.random() < 0.5 ? "+" : "-";
        const sC = Math.random() < 0.5 ? 1 : -1;
        const opCD = Math.random() < 0.5 ? "+" : "-";
        const mid = Math.random() < 0.5 ? "+" : "-";
        prompt =
          k1 +
          ebBracketPrompt(sA, A, opAB, B) +
          " " +
          mid +
          " " +
          k2 +
          ebBracketPrompt(sC, C, opCD, D);
        const seg1 = ebSegPair(sA, A, opAB, B);
        const seg2 = ebSegPair(sC, C, opCD, D);
        const sm = mid === "+" ? 1 : -1;
        const leftParts = seg1.map(([s, at]) => ebKTimesTerm(k1, s, at));
        const rightParts = seg2.map(([s, at]) => ebKTimesTerm(k2, sm * s, at));
        const rawRight = seg2.map(([s, at]) => ebKTimesTerm(k2, s, at));
        correctText = ebJoinSum(leftParts.concat(rightParts));
        wrongPool = [
          {
            text: ebJoinSum(leftParts.concat(rightParts.slice(0, 1))),
            explain: "双段中，段间或段首为「− / +」时，第二段漏抄第二项。",
            causeNo: 14,
          },
          {
            text: ebJoinSum(leftParts.concat([rightParts[1]])),
            explain: "双段中，段间或段首为「− / +」时，第二段漏抄第一项。",
            causeNo: 13,
          },
          {
            text: ebJoinSum(leftParts.map((p, i) => (i === 0 ? p + " " : p)).concat(rightParts)),
            explain: "某段首项前的「+ / −」被吃掉或重复变号；或双段符号衔接有误。",
            causeNo: 18,
          },
          {
            text: ebJoinSum(leftParts.concat(rawRight)),
            explain: "双段中，段间或段首为「−」时，第二段整体忘变号。",
            causeNo: 10,
          },
        ];
        if (mid === "-") {
          wrongPool.push({
            text: ebJoinSum(leftParts.concat([rawRight[0], rightParts[1]])),
            explain: "双段中，段间或段首为「−」时，第二段只变第一项符号，第二项未变号。",
            causeNo: 11,
          });
          wrongPool.push({
            text: ebJoinSum(leftParts.concat([rightParts[0], rawRight[1]])),
            explain: "双段中，段间或段首为「−」时，第二段只变第二项符号，第一项未变号。",
            causeNo: 12,
          });
        }
        if (mid === "+") {
          wrongPool.push({
            text: ebJoinSum(leftParts.concat(seg2.map(([s, at]) => ebKTimesTerm(k2, -s, at)))),
            explain: "双段中，段间或段首为「+」时，第二段无故整体变号。",
            causeNo: 15,
          });
          wrongPool.push({
            text: ebJoinSum(leftParts.concat([ebKTimesTerm(k2, -seg2[0][0], seg2[0][1]), rightParts[1]])),
            explain: "双段中，段间或段首为「+」时，第二段无故仅改变第一项符号。",
            causeNo: 16,
          });
          wrongPool.push({
            text: ebJoinSum(leftParts.concat([rightParts[0], ebKTimesTerm(k2, -seg2[1][0], seg2[1][1])])),
            explain: "双段中，段间或段首为「+」时，第二段无故仅改变第二项符号。",
            causeNo: 17,
          });
        }
        wrongPool.push({
          text: ebJoinSum([leftParts[1], leftParts[0], rightParts[0], rightParts[1]]),
          explain: "第一段与第二段符号混抄、段界不清。",
          causeNo: 20,
        });
        wrongPool.push({
          text: ebJoinSum([`${k1} × ${ebFmtAtom(A)}`, `${k1} × ${ebFmtAtom(B)}`, rightParts[0], rightParts[1]]),
          explain: "含括号的展开后分配时计算错误（错形）。",
          causeNo: 19,
        });
        wrongPool.push({
          text: ebJoinSum(leftParts.slice(0, 1).concat(rightParts)),
          explain: "漏写含 `x`、`y` 的项，或漏写常数 `a`、`b` 项（错形）。",
          causeNo: 21,
        });
      }

      const seen = new Set([correctText]);
      const deduped = [];
      for (let i = 0; i < wrongPool.length; i += 1) {
        const w = wrongPool[i];
        if (!w || !w.text || seen.has(w.text)) continue;
        seen.add(w.text);
        deduped.push(w);
      }

      return { expandKind: "L4", prompt, correctText, wrongPool: deduped, presetWrong: [] };
    }

    function buildExpandQuestion_L5() {
      function dedupeExpandWrongPool(correctText, wrongPool) {
        const seen = new Set([correctText]);
        const deduped = [];
        for (let i = 0; i < wrongPool.length; i += 1) {
          const w = wrongPool[i];
          if (!w || !w.text || seen.has(w.text)) continue;
          seen.add(w.text);
          deduped.push(w);
        }
        return deduped;
      }

      /** L5a：题面最左「±A」乘入括号时，把展开项整体变号（分配律下的外符号） */
      function ebL5aApplyOuter(outer, frag) {
        if (outer === 1) return frag;
        if (!frag) return frag;
        if (frag.charAt(0) === "-") return frag.slice(1);
        return "-" + frag;
      }

      const r = Math.random() * 4;
      const t = r < 1 ? 1 : r < 2 ? 2 : 3;
      if (t === 1) {
        const A = ebPickAtom();
        const B = ebPickAtom();
        const C = ebPickAtom();
        const innerOp = Math.random() < 0.5 ? "+" : "-";
        const outerS = Math.random() < 0.5 ? 1 : -1;
        const prompt = ebTermSignedAtom(outerS, A) + " × " + ebBracketPrompt(1, B, innerOp, C);
        const seg = ebSegPair(1, B, innerOp, C);
        const parts = seg.map(([s, at]) => ebL5aApplyOuter(outerS, ebAtomTimesSignedTerm(A, s, at)));
        const correctText = ebJoinSum(parts);
        const innerSum = ebJoinSum([ebTermSignedAtom(seg[0][0], seg[0][1]), ebTermSignedAtom(seg[1][0], seg[1][1])]);
        const wrongPool = [
          {
            text: ebJoinSum(seg.map(([s, at]) => ebAtomTimesSignedTerm(A, s, at))),
            explain: "对于 `± A × (± B ± C)`，`± A` 分配时将 `A` 前的 `±` 符号遗忘。",
            causeNo: 1,
          },
          {
            text: parts[0],
            explain: "对于 `± A × (± B ± C)`，`± A` 只乘括号内第一项。",
            causeNo: 2,
          },
          {
            text: parts[1],
            explain: "对于 `± A × (± B ± C)`，`± A` 只乘括号内第二项。",
            causeNo: 3,
          },
          {
            text: ebJoinSum([
              ebL5aApplyOuter(outerS, ebAtomTimesSignedTerm(A, -seg[0][0], seg[0][1])),
              parts[1],
            ]),
            explain: "对于 `± A × (± B ± C)`，分配时将 `B` 或 `C` 的符号弄错。",
            causeNo: 4,
          },
          {
            text: ebJoinSum([
              parts[0],
              ebL5aApplyOuter(outerS, ebAtomTimesSignedTerm(A, -seg[1][0], seg[1][1])),
            ]),
            explain: "对于 `± A × (± B ± C)`，分配时将 `B` 或 `C` 的符号弄错。",
            causeNo: 4,
          },
          {
            text: innerSum,
            explain: "对于 `± A × (± B ± C)`，遗忘 `± A`，直接显示结果为 `± B ± C`。",
            causeNo: 5,
          },
          {
            text: ebJoinSum([parts[0], ebTermSignedAtom(outerS, A), ebTermSignedAtom(seg[1][0], seg[1][1])]),
            explain:
              "对于 `± A × (± B ± C)`，分配时运算符号错误，例如 `± A × (± B) ± A + (± C)` 或者 `± A + (± B) ± A × (± C)`。",
            causeNo: 6,
          },
        ];
        return {
          expandKind: "L5a",
          prompt,
          correctText,
          wrongPool: dedupeExpandWrongPool(correctText, wrongPool),
          presetWrong: [],
        };
      }
      if (t === 2) {
        const B = ebPickAtom();
        const C = ebPickAtom();
        const A = ebPickAtom();
        const innerOp = Math.random() < 0.5 ? "+" : "-";
        const prompt = ebBracketPrompt(1, B, innerOp, C) + " ÷ " + ebFmtAtom(A);
        const seg = ebSegPair(1, B, innerOp, C);
        const divA = " ÷ " + ebFmtAtom(A);
        const parts = seg.map(([s, at]) => ebTermSignedAtom(s, at) + divA);
        const correctText = ebJoinSum(parts);
        const wrongPool = [
          {
            text: ebJoinSum([parts[0], ebTermSignedAtom(seg[1][0], seg[1][1])]),
            explain: "对于 `(± B ± C) ÷ A`，只除括号内第一项，第二项未除。",
            causeNo: 7,
          },
          {
            text: ebJoinSum([ebTermSignedAtom(seg[0][0], seg[0][1]), parts[1]]),
            explain: "对于 `(± B ± C) ÷ A`，只除括号内第二项，第一项未除。",
            causeNo: 8,
          },
          {
            text: ebJoinSum([
              ebTermSignedAtom(seg[1][0], seg[0][1]) + divA,
              ebTermSignedAtom(seg[0][0], seg[1][1]) + divA,
            ]),
            explain: "对于 `(± B ± C) ÷ A`，除法分配时将括号内第一项 `B` 前符号与第二项 `C` 前符号两者弄混。",
            causeNo: 9,
          },
          {
            text: ebJoinSum([ebTermSignedAtom(-seg[0][0], seg[0][1]) + divA, parts[1]]),
            explain: "对于 `(± B ± C) ÷ A`，除法分配时将括号内第一项 `B` 前符号或第二项 `C` 前符号看错。",
            causeNo: 10,
          },
          {
            text: ebJoinSum([parts[0], ebTermSignedAtom(-seg[1][0], seg[1][1]) + divA]),
            explain: "对于 `(± B ± C) ÷ A`，除法分配时将括号内第一项 `B` 前符号或第二项 `C` 前符号看错。",
            causeNo: 10,
          },
        ];
        return {
          expandKind: "L5b",
          prompt,
          correctText,
          wrongPool: dedupeExpandWrongPool(correctText, wrongPool),
          presetWrong: [],
        };
      }
      const A = ebPickAtom();
      const B = ebPickAtom();
      const C = ebPickAtom();
      const D = ebPickAtom();
      const sA = Math.random() < 0.5 ? 1 : -1;
      const opAB = Math.random() < 0.5 ? "+" : "-";
      const sC = Math.random() < 0.5 ? 1 : -1;
      const opCD = Math.random() < 0.5 ? "+" : "-";
      const prompt = ebBracketPrompt(sA, A, opAB, B) + " × " + ebBracketPrompt(sC, C, opCD, D);
      const seg1 = ebSegPair(sA, A, opAB, B);
      const seg2 = ebSegPair(sC, C, opCD, D);
      const p1 = seg1[0];
      const p2 = seg1[1];
      const q1 = seg2[0];
      const q2 = seg2[1];
      const order = [
        ebProductPair(p1, q1),
        ebProductPair(p1, q2),
        ebProductPair(p2, q1),
        ebProductPair(p2, q2),
      ];
      const correctText = ebJoinSum(order);
      const p1n = ebNegPair(p1);
      const p2n = ebNegPair(p2);
      const q1n = ebNegPair(q1);
      const q2n = ebNegPair(q2);
      const wrongPool = [
        {
          text: ebJoinSum([ebProductPair(p1, q1), ebProductPair(p1, q2)]),
          explain: "对于 `(± A ± B) × (± C ± D)`，乘法分配时漏乘第一个或第二个括号中某项。",
          causeNo: 11,
        },
        {
          text: ebJoinSum([ebProductPair(p1, q1), ebProductPair(p2, q1)]),
          explain: "对于 `(± A ± B) × (± C ± D)`，乘法分配时漏乘第一个或第二个括号中某项。",
          causeNo: 11,
        },
        {
          text: ebJoinSum([order[0], order[1], order[3]]),
          explain: "对于 `(± A ± B) × (± C ± D)`，乘法分配时漏乘某一括号中某项。",
          causeNo: 12,
        },
        {
          text: ebJoinSum([ebProductPair(p1n, q1), ebProductPair(p1n, q2), ebProductPair(p2, q1), ebProductPair(p2, q2)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第一个括号内某项符号（即 `A` 与 `B` 前的符号在分配时某一个被改变）。",
          causeNo: 13,
        },
        {
          text: ebJoinSum([ebProductPair(p1, q1), ebProductPair(p1, q2), ebProductPair(p2n, q1), ebProductPair(p2n, q2)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第一个括号内某项符号（即 `A` 与 `B` 前的符号在分配时某一个被改变）。",
          causeNo: 13,
        },
        {
          text: ebJoinSum([ebProductPair(p1n, q1), ebProductPair(p1n, q2), ebProductPair(p2n, q1), ebProductPair(p2n, q2)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第一个括号内整体符号（即 `A` 与 `B` 前的符号在分配时均被改变）。",
          causeNo: 14,
        },
        {
          text: ebJoinSum([ebProductPair(p1, q1n), ebProductPair(p1, q2), ebProductPair(p2, q1n), ebProductPair(p2, q2)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第二个括号内某项符号（即 `C` 与 `D` 前的符号在分配时某一个被改变）。",
          causeNo: 15,
        },
        {
          text: ebJoinSum([ebProductPair(p1, q1), ebProductPair(p1, q2n), ebProductPair(p2, q1), ebProductPair(p2, q2n)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第二个括号内某项符号（即 `C` 与 `D` 前的符号在分配时某一个被改变）。",
          causeNo: 15,
        },
        {
          text: ebJoinSum([ebProductPair(p1, q1n), ebProductPair(p1, q2n), ebProductPair(p2, q1n), ebProductPair(p2, q2n)]),
          explain:
            "对于 `(± A ± B) × (± C ± D)`，乘法分配时改变第二个括号内整体符号（即 `C` 与 `D` 前的符号在分配时均被改变）。",
          causeNo: 16,
        },
        {
          text: ebJoinSum([order[0], order[3]]),
          explain: "对于 `(± A ± B) × (± C ± D)`，漏掉交叉项（只做了 `AC` 和 `BD`）。",
          causeNo: 17,
        },
        {
          text: ebJoinSum(order.slice(0, 3)),
          explain: "对于 `(± A ± B) × (± C ± D)`，漏掉 `AC` / `AD` / `BC` / `BD` 中某一项（一项，非多项）。",
          causeNo: 18,
        },
        {
          text: ebJoinSum(order.slice(1)),
          explain: "对于 `(± A ± B) × (± C ± D)`，漏掉 `AC` / `AD` / `BC` / `BD` 中某一项（一项，非多项）。",
          causeNo: 18,
        },
        {
          text: ebJoinSum([order[0], order[2], order[3]]),
          explain: "对于 `(± A ± B) × (± C ± D)`，漏掉 `AC` / `AD` / `BC` / `BD` 中某一项（一项，非多项）。",
          causeNo: 18,
        },
        {
          text: ebJoinSum([order[0], order[0], order[1], order[2], order[3]]),
          explain: "对于 `(± A ± B) × (± C ± D)`，弄错分配后 `AC` / `AD` / `BC` / `BD` 中某一项前的系数（一项，非多项）。",
          causeNo: 19,
        },
        {
          text: ebJoinSum([order[0], order[1], order[1], order[2], order[3]]),
          explain: "对于 `(± A ± B) × (± C ± D)`，弄错分配后 `AC` / `AD` / `BC` / `BD` 中某一项前的系数（一项，非多项）。",
          causeNo: 19,
        },
      ];
      return {
        expandKind: "L5c",
        prompt,
        correctText,
        wrongPool: dedupeExpandWrongPool(correctText, wrongPool),
        presetWrong: [],
      };
    }

  function buildExpandBracketsQuestion(level) {
    var lv = Math.min(4, Math.max(0, Math.floor(Number(level) || 0)));
    if (lv === 0) return buildExpandQuestion_L1();
    if (lv === 1) return buildExpandQuestion_L2();
    if (lv === 2) return buildExpandQuestion_L3();
    if (lv === 3) return buildExpandQuestion_L4();
    return buildExpandQuestion_L5();
  }

  var LEVEL_LABELS = [
    'L1 · 一层括号（整数）',
    'L2 · 乘除去括号',
    'L3 · 两段括号',
    'L4 · 系数×括号',
    'L5 · 综合'
  ];

  global.JmlExpandBrackets = {
    buildQuestion: buildExpandBracketsQuestion,
    LEVEL_LABELS: LEVEL_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
