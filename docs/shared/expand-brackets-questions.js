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
    const L1_NUM_MAX = 12;
    const L1_WRONG_PER_QUESTION = 3;

    function l1PickQuestionType() {
      return Math.random() < L1_T1_SHARE ? L1_TYPE_T1 : L1_TYPE_T2;
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
      const questionType = l1PickQuestionType();
      const outerMinus = questionType === L1_TYPE_T1;
      const A = randomInt(L1_NUM_MIN, L1_NUM_MAX);
      const B = randomInt(L1_NUM_MIN, L1_NUM_MAX);
      const C = randomInt(L1_NUM_MIN, L1_NUM_MAX);
      const innerPlus = Math.random() < 0.5;
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

    function l2PickAB() {
      const A = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      let B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      while (B === A) B = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      return [A, B];
    }

    function l2InnerPm(A, B, innerPlus) {
      return innerPlus ? `${A} + ${B}` : `${A} - ${B}`;
    }

    function l2BuildT1(k, A, B) {
      const innerPlus = Math.random() < 0.5;
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

    function l2BuildT2(k, A, B) {
      const innerTimes = Math.random() < 0.5;
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

    function l2BuildT3(k, A, B) {
      const innerPlus = Math.random() < 0.5;
      const inner = l2InnerPm(A, B, innerPlus);
      const prompt = `${k} ÷ (${inner})`;
      const correctText = L2_CANNOT_REMOVE;
      const t2sign = innerPlus ? `${k} ÷ ${B}` : `- ${k} ÷ ${B}`;
      const fullWrongPool = [
        {
          text: ebJoinSum([`${k} ÷ ${A}`, t2sign]),
          explain: "强行分配两项。",
          causeNo: 1,
        },
        { text: ebJoinSum([`${k} ÷ ${A}`]), explain: "只「分配」了一项。", causeNo: 2 },
        { text: `${k} ÷ (${A} × ${B})`, explain: "把括号内 ± 看成 ×。", causeNo: 3 },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT4(k, A, B) {
      const innerTimes = Math.random() < 0.5;
      const innerOp = innerTimes ? "×" : "÷";
      const prompt = `${k} ÷ (${A} ${innerOp} ${B})`;
      const correctText = innerTimes ? `${k} ÷ ${A} ÷ ${B}` : `${k} ÷ ${A} × ${B}`;
      const fullWrongPool = [
        { text: `${k} ÷ ${A} × ${k} ÷ ${B}`, explain: "误用「分别除」式分配。", causeNo: 1 },
        innerTimes
          ? {
              text: `${k} ÷ ${A} + ${k} ÷ ${B}`,
              explain: "把内层乘除误当加减分配。",
              causeNo: 2,
            }
          : {
              text: `${k} ÷ ${A} ÷ ${B}`,
              explain: "内层是 A ÷ B 时，÷ 没变 ×。",
              causeNo: 2,
            },
        innerTimes
          ? { text: `${k} ÷ ${B} ÷ ${A}`, explain: "内层是 A × B 时项顺序写反。", causeNo: 3 }
          : { text: `${k} ÷ ${B} × ${A}`, explain: "内层是 A ÷ B 时符号或顺序衔接错误。", causeNo: 3 },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT5(k, A, B) {
      const innerPlus = Math.random() < 0.5;
      const inner = l2InnerPm(A, B, innerPlus);
      const prompt = `(${inner}) ÷ ${k}`;
      const t1 = `${A} ÷ ${k}`;
      const t2 = innerPlus ? `${B} ÷ ${k}` : `- ${B} ÷ ${k}`;
      const correctText = ebJoinSum([t1, t2]);
      const fullWrongPool = [
        { text: `(${A} × ${B}) ÷ ${k}`, explain: "把括号内 ± 看成 ×。", causeNo: 1 },
        {
          text: innerPlus ? ebJoinSum([t1, `- ${B} ÷ ${k}`]) : ebJoinSum([t1, `${B} ÷ ${k}`]),
          explain: "括号内是 + 却按 − 去分配。",
          causeNo: 2,
        },
        {
          text: innerPlus ? `${A} + ${B} ÷ ${k}` : `${A} - ${B} ÷ ${k}`,
          explain: "第一项漏 ÷ k。",
          causeNo: 3,
        },
        { text: `${A} ÷ ${k} + ${B}`, explain: "第二项漏 ÷ k。", causeNo: 4 },
        {
          text: innerPlus ? `${A} × ${k} + ${B} × ${k}` : `${A} × ${k} - ${B} × ${k}`,
          explain: "把括号外 ÷ 当成 ×。",
          causeNo: 5,
        },
      ];
      return { prompt, correctText, fullWrongPool };
    }

    function l2BuildT6(k, A, B) {
      const innerTimes = Math.random() < 0.5;
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

    function l2BuildByType(questionType, k, A, B) {
      if (questionType === L2_TYPE_T1) return l2BuildT1(k, A, B);
      if (questionType === L2_TYPE_T2) return l2BuildT2(k, A, B);
      if (questionType === L2_TYPE_T3) return l2BuildT3(k, A, B);
      if (questionType === L2_TYPE_T4) return l2BuildT4(k, A, B);
      if (questionType === L2_TYPE_T5) return l2BuildT5(k, A, B);
      return l2BuildT6(k, A, B);
    }

    function buildExpandQuestion_L2() {
      const questionType = l2PickQuestionType();
      const k = randomInt(L2_NUM_MIN, L2_NUM_MAX);
      const [A, B] = l2PickAB();
      const built = l2BuildByType(questionType, k, A, B);
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
    const L3_LAYOUT_A_LEFT = 0.8;
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
      return params.aLeft ? `${aStr} ${outer} ${bracket}` : `${bracket} ${outer} ${aStr}`;
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
            : params.aLeft
              ? "minus"
              : "plus";
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
      if (params.aLeft) return [aTerm, e1, e2];
      if (params.outerPlus) return [e1, e2, aTerm];
      return [e1, e2, l3NegTerm(aTerm)];
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
        const noFlip = params.aLeft ? "plus" : "minusDist";
        const half1 = params.aLeft ? "minusFirst" : "minusFirst";
        const half2 = params.aLeft ? "minusSecond" : "minusSecond";
        return [
          {
            text: l3AnswerText(params, {}, noFlip),
            explain: "括号外是减号，但括号里两项都没变号。",
            causeNo: 1,
          },
          {
            text: l3AnswerText(params, {}, half1),
            explain: "括号外是减号，但只变了第一项的符号。",
            causeNo: 2,
          },
          {
            text: l3AnswerText(params, {}, half2),
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
          text: l3AnswerText(
            params,
            { innerPlus: !innerPlus },
            params.aLeft ? "plus" : "minusDist"
          ),
          explain: "外「减」、内「减」时变号规则全错。",
          causeNo: 1,
        },
        {
          text: l3AnswerText(params, { innerPlus: !innerPlus }, "minusFirst"),
          explain: "只变一项，或内层减号看错。",
          causeNo: 2,
        },
        {
          text: l3AnswerText(params, { innerPlus: !innerPlus }, "minusSecond"),
          explain: "只变一项，或内层减号看错。",
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
          aLeft: Math.random() < L3_LAYOUT_A_LEFT,
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
        aLeft: true,
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
    'L3 · 分配并算积',
    'L4 · 系数×括号',
    'L5 · 综合'
  ];

  global.JmlExpandBrackets = {
    buildQuestion: buildExpandBracketsQuestion,
    formatExpandedTerms: formatExpandedTerms,
    LEVEL_LABELS: LEVEL_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
