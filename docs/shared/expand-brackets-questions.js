/**
 * 拆括号 L1–L5 出题（与主站 docs/index.html 内联块同源，合并前请与此文件 diff）
 *
 * 与 index.html 差异（2025-05 核对）：仅 L2「无法去括号」文案——主站用 t("expand.choice.cannotRemoveBrackets")。
 * 本文件经 resolveExpandChoiceText：无钩子时用简体 fallback；合并主站时可设
 *   window.__JML_EXPAND_T__ = t
 * 与主站 i18n 一致。管理端/打印不设置钩子即可。
 */
(function (global) {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** 与主站 t(key)||fallback 对齐；管理端无 t() 时仅用 fallback */
  function resolveExpandChoiceText(key, fallback) {
    var fn = global.__JML_EXPAND_T__;
    if (typeof fn === "function") {
      var s = fn(key);
      if (s != null && String(s).trim() !== "") return String(s);
    }
    return fallback;
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

    /** 去掉与正确答案重复的错误项 */
    function ebDedupeWrongPool(correctText, wrongPool) {
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

    /** 从错因池随机取最多 maxCount 条（规格：每题 3 个错误选项） */
    function ebPickWrongPoolEntries(wrongPool, maxCount) {
      if (!Array.isArray(wrongPool) || !wrongPool.length) return [];
      const n = Math.min(maxCount, wrongPool.length);
      if (wrongPool.length <= n) return wrongPool.slice();
      return shuffleInPlace(wrongPool.slice()).slice(0, n);
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

    /** L1 题型 + 错因（与《拆括号等级说明.md》L1 正文一致） */
    const L1_TYPE_T1 = "L1-T1";
    const L1_TYPE_T2 = "L1-T2";
    const L1_T1_SHARE = 0.8;
    const L1_NUM_MIN = 1;
    const L1_NUM_MAX = 99;
    const L1_WRONG_PER_QUESTION = 3;

    function l1PickQuestionType() {
      return Math.random() < L1_T1_SHARE ? L1_TYPE_T1 : L1_TYPE_T2;
    }

    function l1InnerValue(B, C, innerPlus) {
      return innerPlus ? B + C : B - C;
    }

    function l1WholeValue(questionType, A, B, C, innerPlus) {
      const inner = l1InnerValue(B, C, innerPlus);
      return questionType === L1_TYPE_T1 ? A - inner : A + inner;
    }

    /** 括号内与整式按数值求值均为正（学员未学负数） */
    function l1ParamsPositive(questionType, A, B, C, innerPlus) {
      const inner = l1InnerValue(B, C, innerPlus);
      if (inner <= 0) return false;
      return l1WholeValue(questionType, A, B, C, innerPlus) > 0;
    }

    /** 括号内两项去括号前的带符号值：[B, ±C] */
    function l1SignedInnerPair(B, C, innerPlus) {
      return [B, innerPlus ? C : -C];
    }

    function l1CorrectTerms(questionType, A, B, C, innerPlus) {
      if (questionType === L1_TYPE_T1) {
        return innerPlus ? [A, -B, -C] : [A, -B, C];
      }
      return innerPlus ? [A, B, C] : [A, B, -C];
    }

    function l1WrongPoolForType(questionType, A, innerFirst, innerSecond) {
      const fmt = formatExpandedTerms;
      if (questionType === L1_TYPE_T1) {
        return [
          {
            text: fmt([A, innerFirst, innerSecond]),
            explain: "括号外是减号，但括号里两项都没变号。",
            causeNo: 1,
          },
          {
            text: fmt([A, -innerFirst, innerSecond]),
            explain: "括号外是减号，但只变了第一项的符号。",
            causeNo: 2,
          },
          {
            text: fmt([A, innerFirst, -innerSecond]),
            explain: "括号外是减号，但只变了第二项的符号。",
            causeNo: 3,
          },
        ];
      }
      return [
        {
          text: fmt([A, -innerFirst, -innerSecond]),
          explain: "括号外是加号，却把括号里两项都变号了。",
          causeNo: 1,
        },
        {
          text: fmt([A, -innerFirst, innerSecond]),
          explain: "括号外是加号，却只改了第一项的符号。",
          causeNo: 2,
        },
        {
          text: fmt([A, innerFirst, -innerSecond]),
          explain: "括号外是加号，却只改了第二项的符号。",
          causeNo: 3,
        },
      ];
    }

    function buildExpandQuestion_L1() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const questionType = l1PickQuestionType();
        const outerMinus = questionType === L1_TYPE_T1;
        const A = randomInt(L1_NUM_MIN, L1_NUM_MAX);
        const B = randomInt(L1_NUM_MIN, L1_NUM_MAX);
        const C = randomInt(L1_NUM_MIN, L1_NUM_MAX);
        const innerPlus = Math.random() < 0.5;
        if (!l1ParamsPositive(questionType, A, B, C, innerPlus)) continue;
        const innerOp = innerPlus ? "+" : "-";
        const prompt = outerMinus
          ? `${A} - (${B} ${innerOp} ${C})`
          : `${A} + (${B} ${innerOp} ${C})`;
        const [innerFirst, innerSecond] = l1SignedInnerPair(B, C, innerPlus);
        const correctTerms = l1CorrectTerms(questionType, A, B, C, innerPlus);
        const correctText = formatExpandedTerms(correctTerms);
        const wrongPool = ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l1WrongPoolForType(questionType, A, innerFirst, innerSecond)),
          L1_WRONG_PER_QUESTION
        );

        return {
          expandKind: "L1",
          questionType,
          prompt,
          correctTerms,
          correctText,
          wrongPool,
          presetWrong: [],
          outerMinus,
        };
      }
      const questionType = L1_TYPE_T1;
      const outerMinus = true;
      const A = 50;
      const B = 20;
      const C = 10;
      const innerPlus = true;
      const innerOp = "+";
      const prompt = `${A} - (${B} ${innerOp} ${C})`;
      const [innerFirst, innerSecond] = l1SignedInnerPair(B, C, innerPlus);
      const correctTerms = l1CorrectTerms(questionType, A, B, C, innerPlus);
      const correctText = formatExpandedTerms(correctTerms);
      return {
        expandKind: "L1",
        questionType,
        prompt,
        correctTerms,
        correctText,
        wrongPool: ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l1WrongPoolForType(questionType, A, innerFirst, innerSecond)),
          L1_WRONG_PER_QUESTION
        ),
        presetWrong: [],
        outerMinus,
      };
    }

    /** L2 题型 + 错因（与《拆括号等级说明.md》L2 正文一致） */
    const L2_TYPE_T1 = "L2-T1";
    const L2_TYPE_T2 = "L2-T2";
    const L2_TYPE_T3 = "L2-T3";
    const L2_TYPE_T4 = "L2-T4";
    const L2_TYPE_T5 = "L2-T5";
    const L2_TYPE_T6 = "L2-T6";
    const L2_TYPE_WEIGHTS = [
      { id: L2_TYPE_T1, weight: 0.2 },
      { id: L2_TYPE_T2, weight: 0.1 },
      { id: L2_TYPE_T3, weight: 0.2 },
      { id: L2_TYPE_T4, weight: 0.2 },
      { id: L2_TYPE_T5, weight: 0.2 },
      { id: L2_TYPE_T6, weight: 0.1 },
    ];
    const L2_NUM_MIN = 1;
    const L2_NUM_MAX = 12;
    const L2_WRONG_PER_QUESTION = 3;
    const L2_CANNOT_REMOVE = resolveExpandChoiceText(
      "expand.choice.cannotRemoveBrackets",
      "此类情况无法去除括号"
    );

    function l2PickQuestionType() {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < L2_TYPE_WEIGHTS.length; i += 1) {
        acc += L2_TYPE_WEIGHTS[i].weight;
        if (r < acc) return L2_TYPE_WEIGHTS[i].id;
      }
      return L2_TYPE_T6;
    }

    function l2IsInnerPm(questionType) {
      return (
        questionType === L2_TYPE_T1 ||
        questionType === L2_TYPE_T3 ||
        questionType === L2_TYPE_T5
      );
    }

    /** 括号内按数值求值为正整数（减时 A>B；除时 A 被 B 整除） */
    function l2InnerNumericValid(A, B, innerIsPm, innerPlusOrTimes) {
      if (innerIsPm) {
        if (innerPlusOrTimes) return true;
        return A > B;
      }
      if (innerPlusOrTimes) return true;
      return A % B === 0;
    }

    function l2PickABForInner(innerIsPm, innerPlusOrTimes) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const A = randomInt(L2_NUM_MIN, L2_NUM_MAX);
        let B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
        while (B === A) B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
        if (l2InnerNumericValid(A, B, innerIsPm, innerPlusOrTimes)) return [A, B];
      }
      return null;
    }

    function l2PickAB() {
      const A = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      let B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      while (B === A) B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      return [A, B];
    }

    function l2InnerPm(A, B, innerPlus) {
      return innerPlus ? `${A} + ${B}` : `${A} - ${B}`;
    }

    function l2BuildT1(k, A, B, innerPlus) {
      const inner = l2InnerPm(A, B, innerPlus);
      const kLeft = Math.random() < 0.5;
      const prompt = kLeft ? `${k} × (${inner})` : `(${inner}) × ${k}`;
      let t1;
      let t2;
      if (kLeft) {
        t1 = `${k} × ${A}`;
        t2 = innerPlus ? `${k} × ${B}` : `- ${k} × ${B}`;
      } else {
        t1 = `${A} × ${k}`;
        t2 = innerPlus ? `${B} × ${k}` : `- ${B} × ${k}`;
      }
      const correctText = ebJoinSum([t1, t2]);
      const wrong3 = kLeft
        ? innerPlus
          ? ebJoinSum([t1, `- ${k} × ${B}`])
          : ebJoinSum([t1, `${k} × ${B}`])
        : innerPlus
          ? ebJoinSum([t1, `- ${B} × ${k}`])
          : ebJoinSum([t1, `${B} × ${k}`]);
      const wrong4 = kLeft ? `${k} × (${A} × ${B})` : `(${A} × ${B}) × ${k}`;
      const fullWrongPool = [
        { text: ebJoinSum([t2]), explain: "分配时漏乘第一项。", causeNo: 1 },
        { text: ebJoinSum([t1]), explain: "分配时漏乘第二项。", causeNo: 2 },
        { text: wrong3, explain: "分配时第二项符号看错。", causeNo: 3 },
        { text: wrong4, explain: "把括号内加减看成乘除。", causeNo: 4 },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT2(k, A, B, innerTimes) {
      const innerOp = innerTimes ? "×" : "÷";
      const inner = `${A} ${innerOp} ${B}`;
      const kLeft = Math.random() < 0.5;
      const prompt = kLeft ? `${k} × (${inner})` : `(${inner}) × ${k}`;
      let correctText;
      if (kLeft) {
        correctText = innerTimes ? `${k} × ${A} × ${B}` : `${k} × ${A} ÷ ${B}`;
      } else {
        correctText = innerTimes ? `${A} × ${B} × ${k}` : `${A} ÷ ${B} × ${k}`;
      }
      const w1 = kLeft
        ? `${k} × ${A} ${innerOp} ${k} × ${B}`
        : `${A} × ${k} ${innerOp} ${B} × ${k}`;
      const w2 = kLeft ? `${k} × ${A} + ${k} × ${B}` : `${A} × ${k} + ${B} × ${k}`;
      const w3 = kLeft ? `${k} × ${A} + ${B}` : `${A} + ${B} × ${k}`;
      const fullWrongPool = [
        { text: w1, explain: "误用乘法分配，对两项都乘 k 却没去掉括号。", causeNo: 1 },
        { text: w2, explain: "把内层 × / ÷ 看成 + / − 去分配。", causeNo: 2 },
        { text: w3, explain: "把内层看成 ± 且只去了一半括号。", causeNo: 3 },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT3(k, A, B, innerPlus) {
      const inner = l2InnerPm(A, B, innerPlus);
      const prompt = `${k} ÷ (${inner})`;
      const correctText = L2_CANNOT_REMOVE;
      const t2sign = innerPlus ? `${k} ÷ ${B}` : `- ${k} ÷ ${B}`;
      const fullWrongPool = [
        {
          text: ebJoinSum([`${k} ÷ ${A}`, t2sign]),
          explain: "强行对两项分配除法。",
          causeNo: 1,
        },
        {
          text: innerPlus ? `${k} ÷ ${A} + ${B}` : `${k} ÷ ${A} - ${B}`,
          explain: "仅去掉括号，内层 ± 不变。",
          causeNo: 2,
        },
        {
          text: innerPlus ? `${k} ÷ ${A} - ${B}` : `${k} ÷ ${A} + ${B}`,
          explain: "去括号时误把内层 ± 变号。",
          causeNo: 3,
        },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT4(k, A, B, innerTimes) {
      const innerOp = innerTimes ? "×" : "÷";
      const prompt = `${k} ÷ (${A} ${innerOp} ${B})`;
      const correctText = innerTimes ? `${k} ÷ ${A} ÷ ${B}` : `${k} ÷ ${A} × ${B}`;
      const fullWrongPool = [
        { text: `${k} ÷ ${A} × ${k} ÷ ${B}`, explain: "误用「分别除」式分配。", causeNo: 1 },
        innerTimes
          ? {
              text: `${k} ÷ ${A} × ${B}`,
              explain: "内层是 A × B 时，× 没去成 ÷。",
              causeNo: 2,
            }
          : {
              text: `${k} ÷ ${A} ÷ ${B}`,
              explain: "内层是 A ÷ B 时，÷ 没变 ×。",
              causeNo: 2,
            },
        {
          text: L2_CANNOT_REMOVE,
          explain: "内层是乘除，其实可以去括号。",
          causeNo: 3,
        },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT5(k, A, B, innerPlus) {
      const inner = l2InnerPm(A, B, innerPlus);
      const prompt = `(${inner}) ÷ ${k}`;
      const t1 = `${A} ÷ ${k}`;
      const t2 = innerPlus ? `${B} ÷ ${k}` : `- ${B} ÷ ${k}`;
      const correctText = ebJoinSum([t1, t2]);
      const fullWrongPool = [
        {
          text: innerPlus ? ebJoinSum([t1, `- ${B} ÷ ${k}`]) : ebJoinSum([t1, `${B} ÷ ${k}`]),
          explain: "括号内是 + 却按 − 去分配（或反之）。",
          causeNo: 1,
        },
        {
          text: innerPlus ? `${A} + ${B} ÷ ${k}` : `${A} - ${B} ÷ ${k}`,
          explain: "第一项漏 ÷ k。",
          causeNo: 2,
        },
        {
          text: L2_CANNOT_REMOVE,
          explain: "除法对括号内加减可以分配，其实可以去括号。",
          causeNo: 3,
        },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT6(k, A, B, innerTimes) {
      const innerOp = innerTimes ? "×" : "÷";
      const prompt = `(${A} ${innerOp} ${B}) ÷ ${k}`;
      const correctText = innerTimes ? `${A} × ${B} ÷ ${k}` : `${A} ÷ ${B} ÷ ${k}`;
      const fullWrongPool = [
        {
          text: ebJoinSum([`${A} ÷ ${k} × ${B} ÷ ${k}`]),
          explain: "对 (A × B) ÷ k 误用加减分配。",
          causeNo: 1,
        },
        { text: `${A} × ${k} ÷ ${B}`, explain: "(A × B) ÷ k 拆写混乱。", causeNo: 2 },
        {
          text: ebJoinSum([`${A} ÷ ${k}`, `${B} ÷ ${k}`]),
          explain: "把内层 × / ÷ 当成 ± 去分配。",
          causeNo: 3,
        },
        { text: `${B} × ${A} ÷ ${k}`, explain: "乘除号顺序写反。", causeNo: 4 },
      ];
      if (!innerTimes) {
        fullWrongPool[1] = {
          text: `${A} ÷ ${k} + ${B} ÷ ${k}`,
          explain: "对 (A ÷ B) ÷ k 误用加减分配。",
          causeNo: 1,
        };
        fullWrongPool[3] = {
          text: `${B} ÷ ${A} ÷ ${k}`,
          explain: "乘除号顺序写反。",
          causeNo: 4,
        };
      }
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildByType(questionType, k, A, B, innerPlusOrTimes) {
      if (questionType === L2_TYPE_T1) return l2BuildT1(k, A, B, innerPlusOrTimes);
      if (questionType === L2_TYPE_T2) return l2BuildT2(k, A, B, innerPlusOrTimes);
      if (questionType === L2_TYPE_T3) return l2BuildT3(k, A, B, innerPlusOrTimes);
      if (questionType === L2_TYPE_T4) return l2BuildT4(k, A, B, innerPlusOrTimes);
      if (questionType === L2_TYPE_T5) return l2BuildT5(k, A, B, innerPlusOrTimes);
      return l2BuildT6(k, A, B, innerPlusOrTimes);
    }

    function buildExpandQuestion_L2() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const questionType = l2PickQuestionType();
        const innerIsPm = l2IsInnerPm(questionType);
        const innerPlusOrTimes = Math.random() < 0.5;
        const ab = l2PickABForInner(innerIsPm, innerPlusOrTimes);
        if (!ab) continue;
        const A = ab[0];
        const B = ab[1];
        const k = randomInt(L2_NUM_MIN, L2_NUM_MAX);
        const built = l2BuildByType(questionType, k, A, B, innerPlusOrTimes);
        const wrongPool = ebPickWrongPoolEntries(
          ebDedupeWrongPool(built.correctText, built.fullWrongPool),
          L2_WRONG_PER_QUESTION
        );
        return {
          expandKind: "L2",
          questionType,
          prompt: built.prompt,
          correctText: built.correctText,
          wrongPool,
          presetWrong: [],
        };
      }
      const questionType = L2_TYPE_T1;
      const k = 6;
      const A = 8;
      const B = 3;
      const built = l2BuildT1(k, A, B, false);
      const wrongPool = ebPickWrongPoolEntries(
        ebDedupeWrongPool(built.correctText, built.fullWrongPool),
        L2_WRONG_PER_QUESTION
      );
      return {
        expandKind: "L2",
        questionType,
        prompt: built.prompt,
        correctText: built.correctText,
        wrongPool,
        presetWrong: [],
      };
    }

    /** L3 题型 + 错因（与《拆括号等级说明.md》L3 正文一致） */
    const L3_TYPE_T1 = "L3-T1";
    const L3_TYPE_T2 = "L3-T2";
    const L3_TYPE_T3 = "L3-T3";
    const L3_TYPE_T4 = "L3-T4";
    const L3_TYPE_WEIGHTS = [
      { id: L3_TYPE_T1, weight: 0.25 },
      { id: L3_TYPE_T2, weight: 0.25 },
      { id: L3_TYPE_T3, weight: 0.25 },
      { id: L3_TYPE_T4, weight: 0.25 },
    ];
    const L3_K_MIN = 2;
    const L3_NUM_MIN = 1;
    const L3_NUM_MAX = 12;
    const L3_WRONG_PER_QUESTION = 3;

    function l3PickQuestionType() {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < L3_TYPE_WEIGHTS.length; i += 1) {
        acc += L3_TYPE_WEIGHTS[i].weight;
        if (r < acc) return L3_TYPE_WEIGHTS[i].id;
      }
      return L3_TYPE_T4;
    }

    function l3TypeFlags(questionType) {
      return {
        outerPlus: questionType === L3_TYPE_T1 || questionType === L3_TYPE_T2,
        innerPlus: questionType === L3_TYPE_T1 || questionType === L3_TYPE_T3,
      };
    }

    function l3FmtX(coeff) {
      return coeff === 1 ? "x" : `${coeff}x`;
    }

    function l3FmtA(aIsX, aMag) {
      return aIsX ? l3FmtX(aMag) : String(aMag);
    }

    function l3TermToStr(t) {
      const body = t.kind === "n" ? String(t.mag) : l3FmtX(t.mag);
      return t.sign < 0 ? "-" + body : body;
    }

    function l3NegTerm(t) {
      return { kind: t.kind, mag: t.mag, sign: -t.sign };
    }

    function l3JoinTerms(terms) {
      return ebJoinSum(terms.map(l3TermToStr));
    }

    function l3BracketInner(term1, term2, innerPlus) {
      const op = innerPlus ? "+" : "-";
      const left = term1.kind === "n" ? String(term1.mag) : l3FmtX(term1.mag);
      const right = term2.kind === "n" ? String(term2.mag) : l3FmtX(term2.mag);
      return `${left} ${op} ${right}`;
    }

    function l3BracketPart(k, term1, term2, innerPlus) {
      const inner = l3BracketInner(term1, term2, innerPlus);
      return `${k}(${inner})`;
    }

    function l3BuildPrompt(params) {
      const bracket = l3BracketPart(params.k, params.term1, params.term2, params.innerPlus);
      const outer = params.outerPlus ? "+" : "-";
      const aStr = l3FmtA(params.aIsX, params.aMag);
      return `${aStr} ${outer} ${bracket}`;
    }

    /** 括号内从左到右分配后的两项（已乘 k，尚未处理外连接符） */
    function l3DistPair(k, term1, term2, innerPlus, opts) {
      const o = opts || {};
      const multFirst = o.multFirst !== false;
      const multSecond = o.multSecond !== false;
      const useInnerPlus = o.innerPlus != null ? o.innerPlus : innerPlus;
      let mag1 = multFirst ? k * term1.mag : term1.mag;
      let mag2 = multSecond ? k * term2.mag : term2.mag;
      if (o.xMag != null) {
        if (term1.kind === "x") mag1 = o.xMag;
        if (term2.kind === "x") mag2 = o.xMag;
      }
      if (o.nMag != null) {
        if (term1.kind === "n") mag1 = o.nMag;
        if (term2.kind === "n") mag2 = o.nMag;
      }
      return [
        { kind: term1.kind, mag: mag1, sign: 1 },
        { kind: term2.kind, mag: mag2, sign: useInnerPlus ? 1 : -1 },
      ];
    }

    function l3OrderAnswer(params, d1, d2, outerApply) {
      const aTerm = { kind: params.aIsX ? "x" : "n", mag: params.aMag, sign: 1 };
      let e1 = d1;
      let e2 = d2;
      const mode =
        outerApply != null
          ? outerApply
          : params.outerPlus
            ? "plus"
            : "minus";
      if (mode === "minus") {
        e1 = l3NegTerm(e1);
        e2 = l3NegTerm(e2);
      } else if (mode === "minusFirst") {
        e1 = l3NegTerm(e1);
      } else if (mode === "minusSecond") {
        e2 = l3NegTerm(e2);
      } else if (mode === "minusDist") {
        e1 = l3NegTerm(e1);
        e2 = l3NegTerm(e2);
      }
      return [aTerm, e1, e2];
    }

    function l3AnswerText(params, distOpts, outerApply) {
      const pair = l3DistPair(
        params.k,
        params.term1,
        params.term2,
        params.innerPlus,
        distOpts || {}
      );
      return l3JoinTerms(l3OrderAnswer(params, pair[0], pair[1], outerApply));
    }

    function l3AltMag(mag, delta) {
      let v = mag + delta;
      if (v < L3_NUM_MIN) v = L3_NUM_MIN;
      if (v > L3_NUM_MAX) v = L3_NUM_MAX;
      if (v === mag) v = mag === L3_NUM_MAX ? mag - 1 : mag + 1;
      return v;
    }

    function l3WrongPoolForType(questionType, params) {
      const outerPlus = params.outerPlus;
      const innerPlus = params.innerPlus;
      const k = params.k;
      const xCoeff = params.term1.kind === "x" ? params.term1.mag : params.term2.mag;

      if (outerPlus) {
        return [
          {
            text: l3AnswerText(params, { multFirst: true, multSecond: false }),
            explain: "第二项忘了乘括号外的 k。",
            causeNo: 1,
          },
          {
            text: l3AnswerText(params, { multFirst: false, multSecond: false }),
            explain: "括号内两项都忘了乘 k。",
            causeNo: 2,
          },
          {
            text: l3AnswerText(params, { innerPlus: !innerPlus }),
            explain: innerPlus
              ? "内层应是「加」却按「减」分配。"
              : "内层应是「减」却按「加」分配。",
            causeNo: 3,
          },
          {
            text: l3AnswerText(params, { xMag: k * l3AltMag(xCoeff, 1) }),
            explain: "k 与 x 的系数相乘算错。",
            causeNo: 4,
          },
        ];
      }

      if (questionType === L3_TYPE_T3) {
        return [
          {
            text: l3AnswerText(params, {}, "plus"),
            explain: "括号外是减号，但括号里两项都没变号。",
            causeNo: 1,
          },
          {
            text: l3AnswerText(params, {}, "minusFirst"),
            explain: "括号外是减号，但只变了第一项的符号。",
            causeNo: 2,
          },
          {
            text: l3AnswerText(params, {}, "minusSecond"),
            explain: "括号外是减号，但只变了第二项的符号。",
            causeNo: 2,
          },
          {
            text: l3AnswerText(params, { multFirst: true, multSecond: false }),
            explain: "变号对但第二项忘了乘 k。",
            causeNo: 3,
          },
          {
            text: l3AnswerText(params, { multFirst: false, multSecond: false }),
            explain: "变号对但两项都忘了乘 k。",
            causeNo: 4,
          },
        ];
      }

      return [
        {
          text: l3AnswerText(params, {}, "plus"),
          explain: "外「减」、内「减」时变号规则全错。",
          causeNo: 1,
        },
        {
          text: l3AnswerText(params, {}, "minusFirst"),
          explain: "只变一项，或内层减号看错。",
          causeNo: 2,
        },
        {
          text: l3AnswerText(params, {}, "minusSecond"),
          explain: "只变一项，或内层减号看错。",
          causeNo: 2,
        },
        {
          text: l3AnswerText(params, { innerPlus: !innerPlus }),
          explain: innerPlus
            ? "内层应是「加」却按「减」分配。"
            : "内层应是「减」却按「加」分配。",
          causeNo: 2,
        },
        {
          text: l3AnswerText(params, { multFirst: true, multSecond: false }),
          explain: "变号对但第二项忘了乘 k。",
          causeNo: 3,
        },
        {
          text: l3AnswerText(params, { xMag: k * l3AltMag(xCoeff, 1) }),
          explain: "变号、乘 k 都试了但算积错。",
          causeNo: 4,
        },
      ];
    }

    function l3PickInnerPair() {
      let innerN = randomInt(L3_NUM_MIN, L3_NUM_MAX);
      let xCoeff = randomInt(L3_NUM_MIN, L3_NUM_MAX);
      while (xCoeff === innerN) xCoeff = randomInt(L3_NUM_MIN, L3_NUM_MAX);
      const constFirst = Math.random() < 0.5;
      const term1 = constFirst ? { kind: "n", mag: innerN } : { kind: "x", mag: xCoeff };
      const term2 = constFirst ? { kind: "x", mag: xCoeff } : { kind: "n", mag: innerN };
      return { term1, term2, constFirst };
    }

    function buildExpandQuestion_L3() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const questionType = l3PickQuestionType();
        const { outerPlus, innerPlus } = l3TypeFlags(questionType);
        const k = randomInt(L3_K_MIN, L3_NUM_MAX);
        const inner = l3PickInnerPair();
        const aIsX = Math.random() < 0.5;
        const aMag = randomInt(L3_NUM_MIN, L3_NUM_MAX);
        const params = {
          questionType,
          k,
          term1: inner.term1,
          term2: inner.term2,
          innerPlus,
          outerPlus,
          constFirst: inner.constFirst,
          aIsX,
          aMag,
        };
        const prompt = l3BuildPrompt(params);
        const correctText = l3AnswerText(params);
        const wrongPool = ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l3WrongPoolForType(questionType, params)),
          L3_WRONG_PER_QUESTION
        );
        if (wrongPool.length >= L3_WRONG_PER_QUESTION) {
          return {
            expandKind: "L3",
            questionType,
            prompt,
            correctText,
            wrongPool,
            presetWrong: [],
          };
        }
      }
      const questionType = L3_TYPE_T1;
      const k = 2;
      const params = {
        questionType,
        k,
        term1: { kind: "n", mag: 3 },
        term2: { kind: "x", mag: 4 },
        innerPlus: true,
        outerPlus: true,
        constFirst: true,
        aIsX: false,
        aMag: 5,
      };
      return {
        expandKind: "L3",
        questionType,
        prompt: l3BuildPrompt(params),
        correctText: l3AnswerText(params),
        wrongPool: ebPickWrongPoolEntries(
          ebDedupeWrongPool(l3AnswerText(params), l3WrongPoolForType(questionType, params)),
          L3_WRONG_PER_QUESTION
        ),
        presetWrong: [],
      };
    }

    /** L4 题型 + 错因（与《拆括号等级说明.md》L4 正文一致） */
    const L4_TYPE_T1 = "L4-T1";
    const L4_TYPE_T2 = "L4-T2";
    const L4_TYPE_T3 = "L4-T3";
    const L4_TYPE_T4 = "L4-T4";
    const L4_TYPE_WEIGHTS = [
      { id: L4_TYPE_T1, weight: 0.25 },
      { id: L4_TYPE_T2, weight: 0.25 },
      { id: L4_TYPE_T3, weight: 0.25 },
      { id: L4_TYPE_T4, weight: 0.25 },
    ];
    const L4_B_MIN = 2;
    const L4_NUM_MIN = 1;
    const L4_NUM_MAX = 12;
    const L4_NEG_CHANCE = 0.4;
    const L4_LAYOUT_A_LEFT = 0.8;
    const L4_WRONG_PER_QUESTION = 3;

    function l4PickQuestionType() {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < L4_TYPE_WEIGHTS.length; i += 1) {
        acc += L4_TYPE_WEIGHTS[i].weight;
        if (r < acc) return L4_TYPE_WEIGHTS[i].id;
      }
      return L4_TYPE_T4;
    }

    function l4TypeFlags(questionType) {
      return {
        outerPlus: questionType === L4_TYPE_T1 || questionType === L4_TYPE_T2,
        innerPlus: questionType === L4_TYPE_T1 || questionType === L4_TYPE_T3,
      };
    }

    function l4FmtX(coeff) {
      return coeff === 1 ? "x" : `${coeff}x`;
    }

    function l4FmtX2(coeff) {
      return coeff === 1 ? "x²" : `${coeff}x²`;
    }

    function l4FmtTerm(t) {
      let body;
      if (t.kind === "n") body = String(t.mag);
      else if (t.kind === "x") body = l4FmtX(t.mag);
      else body = l4FmtX2(t.mag);
      return t.sign < 0 ? "-" + body : body;
    }

    function l4NegTerm(t) {
      return { kind: t.kind, mag: t.mag, sign: -t.sign };
    }

    function l4JoinTerms(terms) {
      return ebJoinSum(terms.map(l4FmtTerm));
    }

    function l4FmtB(B) {
      return B.kind === "n" ? String(B.mag) : l4FmtX(B.mag);
    }

    function l4MaybeNegSign() {
      return Math.random() < L4_NEG_CHANCE ? -1 : 1;
    }

    function l4PickA(allowLeadingNegative) {
      const isX = Math.random() < 0.5;
      return {
        kind: isX ? "x" : "n",
        mag: randomInt(L4_NUM_MIN, L4_NUM_MAX),
        sign: allowLeadingNegative && Math.random() < L4_NEG_CHANCE ? -1 : 1,
      };
    }

    /** 题面右侧的 A 不用前缀负号，负号只由段间 ± 表达 */
    function l4FmtAForPrompt(A, aLeft) {
      if (aLeft) return l4FmtTerm(A);
      return A.kind === "n" ? String(A.mag) : l4FmtX(A.mag);
    }

    function l4PickB() {
      const isX = Math.random() < 0.5;
      return {
        kind: isX ? "x" : "n",
        mag: randomInt(L4_B_MIN, L4_NUM_MAX),
      };
    }

    function l4PickInnerPair() {
      let innerN = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      let xCoeff = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      while (xCoeff === innerN) xCoeff = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      const constFirst = Math.random() < 0.5;
      const term1 = constFirst
        ? { kind: "n", mag: innerN, sign: l4MaybeNegSign() }
        : { kind: "x", mag: xCoeff, sign: l4MaybeNegSign() };
      const term2 = constFirst
        ? { kind: "x", mag: xCoeff, sign: 1 }
        : { kind: "n", mag: innerN, sign: 1 };
      return { term1, term2 };
    }

    function l4BracketInner(term1, term2, innerPlus) {
      const op = innerPlus ? "+" : "-";
      return `${l4FmtTerm(term1)} ${op} ${l4FmtTerm(term2)}`;
    }

    function l4BracketPart(B, term1, term2, innerPlus) {
      return `${l4FmtB(B)}(${l4BracketInner(term1, term2, innerPlus)})`;
    }

    /** 段间减号紧挨 B(…) 前（减整段 B），与布局无关；T3/T4 为 true */
    function l4BSegMinus(params) {
      return !params.outerPlus;
    }

    function l4BuildPrompt(params) {
      const bracket = l4BracketPart(params.B, params.term1, params.term2, params.innerPlus);
      const aStr = l4FmtAForPrompt(params.A, params.aLeft);
      if (params.aLeft) {
        const outer = params.outerPlus ? "+" : "-";
        return `${aStr} ${outer} ${bracket}`;
      }
      if (params.outerPlus) {
        return `${bracket} + ${aStr}`;
      }
      return `- ${bracket} + ${aStr}`;
    }

    function l4Mul(B, term, doMul) {
      if (!doMul) {
        return { kind: term.kind, mag: term.mag, sign: term.sign };
      }
      if (B.kind === "n") {
        if (term.kind === "n") {
          return { kind: "n", mag: B.mag * term.mag, sign: term.sign };
        }
        return { kind: "x", mag: B.mag * term.mag, sign: term.sign };
      }
      if (term.kind === "n") {
        return { kind: "x", mag: B.mag * term.mag, sign: term.sign };
      }
      return { kind: "x2", mag: B.mag * term.mag, sign: term.sign };
    }

    function l4InnerSecondTerm(term2, innerPlus) {
      return { kind: term2.kind, mag: term2.mag, sign: innerPlus ? 1 : -1 };
    }

    function l4DistPair(B, term1, term2, innerPlus, opts) {
      const o = opts || {};
      const multFirst = o.multFirst !== false;
      const multSecond = o.multSecond !== false;
      const useInnerPlus = o.innerPlus != null ? o.innerPlus : innerPlus;
      let d1 = l4Mul(B, term1, multFirst);
      let d2 = l4Mul(B, l4InnerSecondTerm(term2, useInnerPlus), multSecond);
      if (o.nMag != null) {
        if (d1.kind === "n") d1 = { kind: "n", mag: o.nMag, sign: d1.sign };
        if (d2.kind === "n") d2 = { kind: "n", mag: o.nMag, sign: d2.sign };
      }
      if (o.xMag != null) {
        if (d1.kind === "x") d1 = { kind: "x", mag: o.xMag, sign: d1.sign };
        if (d2.kind === "x") d2 = { kind: "x", mag: o.xMag, sign: d2.sign };
      }
      if (o.x2Mag != null) {
        if (d1.kind === "x2") d1 = { kind: "x2", mag: o.x2Mag, sign: d1.sign };
        if (d2.kind === "x2") d2 = { kind: "x2", mag: o.x2Mag, sign: d2.sign };
      }
      return [d1, d2];
    }

    function l4OrderAnswer(params, d1, d2, outerApply) {
      const aTerm = { kind: params.A.kind, mag: params.A.mag, sign: params.A.sign };
      let e1 = d1;
      let e2 = d2;
      const bSegMinus = l4BSegMinus(params);
      const mode =
        outerApply != null
          ? outerApply
          : bSegMinus
            ? "minus"
            : "plus";
      if (mode === "minus") {
        e1 = l4NegTerm(e1);
        e2 = l4NegTerm(e2);
      } else if (mode === "minusFirst") {
        e1 = l4NegTerm(e1);
      } else if (mode === "minusSecond") {
        e2 = l4NegTerm(e2);
      } else if (mode === "minusDist") {
        e1 = l4NegTerm(e1);
        e2 = l4NegTerm(e2);
      }
      if (params.aLeft) return [aTerm, e1, e2];
      const aTermRight = { kind: params.A.kind, mag: params.A.mag, sign: 1 };
      return [e1, e2, aTermRight];
    }

    function l4AnswerText(params, distOpts, outerApply) {
      const pair = l4DistPair(
        params.B,
        params.term1,
        params.term2,
        params.innerPlus,
        distOpts || {}
      );
      return l4JoinTerms(l4OrderAnswer(params, pair[0], pair[1], outerApply));
    }

    function l4AltMag(mag, delta) {
      let v = mag + delta;
      if (v < L4_NUM_MIN) v = L4_NUM_MIN;
      if (v > L4_NUM_MAX) v = L4_NUM_MAX;
      if (v === mag) v = mag === L4_NUM_MAX ? mag - 1 : mag + 1;
      return v;
    }

    function l4WrongMagOpts(params) {
      const pair = l4DistPair(params.B, params.term1, params.term2, params.innerPlus, {});
      const t = pair[1];
      if (t.kind === "x2") return { x2Mag: l4AltMag(t.mag, 1) };
      if (t.kind === "x") return { xMag: l4AltMag(t.mag, 1) };
      return { nMag: l4AltMag(t.mag, 1) };
    }

    function l4WrongPoolForType(questionType, params) {
      const outerPlus = params.outerPlus;
      const innerPlus = params.innerPlus;

      if (outerPlus) {
        return [
          {
            text: l4AnswerText(params, { multFirst: true, multSecond: false }),
            explain: "第二项忘了乘括号外的 B。",
            causeNo: 1,
          },
          {
            text: l4AnswerText(params, { multFirst: false, multSecond: false }),
            explain: "括号内两项都忘了乘 B。",
            causeNo: 2,
          },
          {
            text: l4AnswerText(params, { innerPlus: !innerPlus }),
            explain: innerPlus
              ? "内层应是「加」却按「减」分配。"
              : "内层应是「减」却按「加」分配。",
            causeNo: 3,
          },
          {
            text: l4AnswerText(params, l4WrongMagOpts(params)),
            explain: "乘积算错。",
            causeNo: 4,
          },
        ];
      }

      if (questionType === L4_TYPE_T3) {
        return [
          {
            text: l4AnswerText(params, {}, "plus"),
            explain: "括号外是减号，但括号里两项都没变号。",
            causeNo: 1,
          },
          {
            text: l4AnswerText(params, {}, "minusFirst"),
            explain: "括号外是减号，但只变了第一项的符号。",
            causeNo: 2,
          },
          {
            text: l4AnswerText(params, {}, "minusSecond"),
            explain: "括号外是减号，但只变了第二项的符号。",
            causeNo: 2,
          },
          {
            text: l4AnswerText(params, { multFirst: true, multSecond: false }),
            explain: "变号对但第二项忘了乘 B。",
            causeNo: 3,
          },
          {
            text: l4AnswerText(params, { multFirst: false, multSecond: false }),
            explain: "变号对但两项都忘了乘 B。",
            causeNo: 4,
          },
        ];
      }

      return [
        {
          text: l4AnswerText(params, {}, "plus"),
          explain: "外「减」、内「减」时变号规则全错。",
          causeNo: 1,
        },
        {
          text: l4AnswerText(params, {}, "minusFirst"),
          explain: "只变一项，或内层减号看错。",
          causeNo: 2,
        },
        {
          text: l4AnswerText(params, {}, "minusSecond"),
          explain: "只变一项，或内层减号看错。",
          causeNo: 2,
        },
        {
          text: l4AnswerText(params, { innerPlus: !innerPlus }),
          explain: innerPlus
            ? "内层应是「加」却按「减」分配。"
            : "内层应是「减」却按「加」分配。",
          causeNo: 2,
        },
        {
          text: l4AnswerText(params, { multFirst: true, multSecond: false }),
          explain: "变号对但第二项忘了乘 B。",
          causeNo: 3,
        },
        {
          text: l4AnswerText(params, l4WrongMagOpts(params)),
          explain: "变号、乘 B 都试了但算积错。",
          causeNo: 4,
        },
      ];
    }

    function buildExpandQuestion_L4() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const questionType = l4PickQuestionType();
        const { outerPlus, innerPlus } = l4TypeFlags(questionType);
        const inner = l4PickInnerPair();
        const aLeft = Math.random() < L4_LAYOUT_A_LEFT;
        const params = {
          questionType,
          aLeft,
          A: l4PickA(aLeft),
          B: l4PickB(),
          term1: inner.term1,
          term2: inner.term2,
          innerPlus,
          outerPlus,
        };
        const prompt = l4BuildPrompt(params);
        const correctText = l4AnswerText(params);
        const wrongPool = ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l4WrongPoolForType(questionType, params)),
          L4_WRONG_PER_QUESTION
        );
        if (wrongPool.length >= L4_WRONG_PER_QUESTION) {
          return {
            expandKind: "L4",
            questionType,
            prompt,
            correctText,
            wrongPool,
            presetWrong: [],
          };
        }
      }
      const questionType = L4_TYPE_T1;
      const params = {
        questionType,
        A: { kind: "n", mag: 5, sign: -1 },
        B: { kind: "x", mag: 2 },
        term1: { kind: "n", mag: 3, sign: 1 },
        term2: { kind: "x", mag: 4, sign: 1 },
        innerPlus: true,
        outerPlus: true,
        aLeft: true,
      };
      return {
        expandKind: "L4",
        questionType,
        prompt: l4BuildPrompt(params),
        correctText: l4AnswerText(params),
        wrongPool: ebPickWrongPoolEntries(
          ebDedupeWrongPool(l4AnswerText(params), l4WrongPoolForType(questionType, params)),
          L4_WRONG_PER_QUESTION
        ),
        presetWrong: [],
      };
    }

    /** L5 两括号相乘（与《拆括号等级说明.md》L5 正文一致） */
    const L5_WRONG_PER_QUESTION = 3;

    function l5PickBracketPair() {
      let innerN = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      let xCoeff = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      while (xCoeff === innerN) xCoeff = randomInt(L4_NUM_MIN, L4_NUM_MAX);
      const constFirst = Math.random() < 0.5;
      const term1 = constFirst
        ? { kind: "n", mag: innerN, sign: l4MaybeNegSign() }
        : { kind: "x", mag: xCoeff, sign: l4MaybeNegSign() };
      const term2 = constFirst
        ? { kind: "x", mag: xCoeff, sign: 1 }
        : { kind: "n", mag: innerN, sign: 1 };
      return { term1, term2 };
    }

    function l5BracketInner(term1, term2, innerPlus) {
      const op = innerPlus ? "+" : "-";
      return `${l4FmtTerm(term1)} ${op} ${l4FmtTerm(term2)}`;
    }

    function l5SignedPair(term1, term2, innerPlus) {
      return [
        { kind: term1.kind, mag: term1.mag, sign: term1.sign },
        { kind: term2.kind, mag: term2.mag, sign: innerPlus ? 1 : -1 },
      ];
    }

    function l5MulTerm(a, b) {
      const sign = a.sign * b.sign;
      const mag = a.mag * b.mag;
      if (a.kind === "n" && b.kind === "n") {
        return { kind: "n", mag, sign };
      }
      if (a.kind === "x" && b.kind === "x") {
        return { kind: "x2", mag, sign };
      }
      return { kind: "x", mag, sign };
    }

    function l5FoilTerms(p1, p2, q1, q2) {
      return [l5MulTerm(p1, q1), l5MulTerm(p1, q2), l5MulTerm(p2, q1), l5MulTerm(p2, q2)];
    }

    function l5JoinTerms(terms) {
      return ebJoinSum(terms.map(l4FmtTerm));
    }

    function l5BuildPrompt(left, right, opAB, opCD) {
      const L = l5BracketInner(left.term1, left.term2, opAB);
      const R = l5BracketInner(right.term1, right.term2, opCD);
      return `(${L})(${R})`;
    }

    function l5AnswerText(left, right, opAB, opCD, foilOpts) {
      const [p1, p2] = l5SignedPair(left.term1, left.term2, opAB);
      const [q1, q2] = l5SignedPair(right.term1, right.term2, opCD);
      const o = foilOpts || {};
      let terms = l5FoilTerms(p1, p2, q1, q2);
      if (o.wrongIndex != null && o.wrongMag != null) {
        const i = o.wrongIndex;
        const t = terms[i];
        terms = terms.slice();
        terms[i] = { kind: t.kind, mag: o.wrongMag, sign: t.sign };
      }
      return l5JoinTerms(terms);
    }

    function l5WrongPool(params) {
      const { left, right, opAB, opCD } = params;
      const [p1, p2] = l5SignedPair(left.term1, left.term2, opAB);
      const [q1, q2] = l5SignedPair(right.term1, right.term2, opCD);
      const order = l5FoilTerms(p1, p2, q1, q2);
      const p1n = l4NegTerm(p1);
      const p2n = l4NegTerm(p2);
      const q1n = l4NegTerm(q1);
      const q2n = l4NegTerm(q2);
      const wrongIdx = randomInt(0, 3);
      const wrongMag = l4AltMag(order[wrongIdx].mag, 1);

      return [
        {
          text: l5JoinTerms([order[0], order[1]]),
          explain: "漏乘左括第二项（只展开 A 与 C、D 的积）。",
          causeNo: 1,
        },
        {
          text: l5JoinTerms([order[0], order[2]]),
          explain: "漏乘右括第二项（只展开 A、B 与 C 的积）。",
          causeNo: 2,
        },
        {
          text: l5JoinTerms(order.slice(0, 3)),
          explain: "漏掉 AC / AD / BC / BD 中某一项。",
          causeNo: 3,
        },
        {
          text: l5JoinTerms([
            l5MulTerm(p1n, q1),
            l5MulTerm(p1n, q2),
            order[2],
            order[3],
          ]),
          explain: "左括内某项符号在分配时弄错。",
          causeNo: 4,
        },
        {
          text: l5JoinTerms([
            order[0],
            order[1],
            l5MulTerm(p2n, q1),
            l5MulTerm(p2n, q2),
          ]),
          explain: "左括内某项符号在分配时弄错。",
          causeNo: 4,
        },
        {
          text: l5JoinTerms([
            l5MulTerm(p1n, q1n),
            l5MulTerm(p1n, q2n),
            l5MulTerm(p2n, q1n),
            l5MulTerm(p2n, q2n),
          ]),
          explain: "左括内两项符号在分配时整体弄反。",
          causeNo: 5,
        },
        {
          text: l5JoinTerms([
            l5MulTerm(p1, q1n),
            l5MulTerm(p1, q2n),
            order[2],
            order[3],
          ]),
          explain: "右括内某项符号在分配时弄错。",
          causeNo: 6,
        },
        {
          text: l5JoinTerms([
            order[0],
            order[1],
            l5MulTerm(p2, q1n),
            l5MulTerm(p2, q2n),
          ]),
          explain: "右括内某项符号在分配时弄错。",
          causeNo: 6,
        },
        {
          text: l5JoinTerms([l5MulTerm(p1, q1n), l5MulTerm(p1, q2n), l5MulTerm(p2, q1n), l5MulTerm(p2, q2n)]),
          explain: "右括内两项符号在分配时整体弄反。",
          causeNo: 7,
        },
        {
          text: l5JoinTerms([order[0], order[3]]),
          explain: "漏掉交叉项（只做了 AC 和 BD）。",
          causeNo: 8,
        },
        {
          text: l5AnswerText(left, right, opAB, opCD, {
            wrongIndex: wrongIdx,
            wrongMag,
          }),
          explain: "四项乘积中某一项算错。",
          causeNo: 9,
        },
      ];
    }

    function buildExpandQuestion_L5() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const left = l5PickBracketPair();
        const right = l5PickBracketPair();
        const opAB = Math.random() < 0.5;
        const opCD = Math.random() < 0.5;
        const params = { left, right, opAB, opCD };
        const prompt = l5BuildPrompt(left, right, opAB, opCD);
        const correctText = l5AnswerText(left, right, opAB, opCD);
        const wrongPool = ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l5WrongPool(params)),
          L5_WRONG_PER_QUESTION
        );
        if (wrongPool.length >= L5_WRONG_PER_QUESTION) {
          return {
            expandKind: "L5",
            prompt,
            correctText,
            wrongPool,
            presetWrong: [],
          };
        }
      }
      const left = {
        term1: { kind: "x", mag: 2, sign: 1 },
        term2: { kind: "n", mag: 3, sign: 1 },
      };
      const right = {
        term1: { kind: "n", mag: 4, sign: 1 },
        term2: { kind: "x", mag: 5, sign: 1 },
      };
      const opAB = true;
      const opCD = true;
      const correctText = l5AnswerText(left, right, opAB, opCD);
      return {
        expandKind: "L5",
        prompt: l5BuildPrompt(left, right, opAB, opCD),
        correctText,
        wrongPool: ebPickWrongPoolEntries(
          ebDedupeWrongPool(correctText, l5WrongPool({ left, right, opAB, opCD })),
          L5_WRONG_PER_QUESTION
        ),
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
    'L3 · 分配并算积',
    'L4 · 分配并算积（进阶）',
    'L5 · 两括号相乘'
  ];

  global.JmlExpandBrackets = {
    buildQuestion: buildExpandBracketsQuestion,
    formatExpandedTerms: formatExpandedTerms,
    LEVEL_LABELS: LEVEL_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
