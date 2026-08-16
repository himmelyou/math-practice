/**
 * 标准软键盘卡片：反馈区 + 按键区、布局挂载、绑定、i18n
 */
(function (global) {
  var LAYOUT_KEYS = {
    decimal: ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"],
    integer: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "spacer", "0", "back"],
  };

  function shouldLockForTouch() {
    try {
      if (global.matchMedia && global.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    try {
      if (typeof global.navigator !== "undefined" && Number(global.navigator.maxTouchPoints) > 0) return true;
    } catch (e2) {}
    return false;
  }

  function backspace(s) {
    if (!s) return "";
    return String(s).slice(0, -1);
  }

  function append(current, ch, allowDecimal) {
    current = String(current || "");
    if (ch === ".") {
      if (!allowDecimal) return current;
      if (current.includes(".")) return current;
      if (current === "" || current === "-") return current === "-" ? "-0." : "0.";
    }
    return current + ch;
  }

  function resolveT(explicitT) {
    if (typeof explicitT === "function") return explicitT;
    if (typeof global.__JML_EXPAND_T__ === "function") return global.__JML_EXPAND_T__;
    return null;
  }

  function resolveLayout(cardEl, explicitLayout) {
    if (explicitLayout && LAYOUT_KEYS[explicitLayout]) return explicitLayout;
    var fromAttr = cardEl && cardEl.getAttribute("data-jml-soft-kbd-layout");
    if (fromAttr && LAYOUT_KEYS[fromAttr]) return fromAttr;
    return "integer";
  }

  function resolveCard(el) {
    if (!el) return null;
    if (el.classList && el.classList.contains("soft-kbd-card")) return el;
    if (el.closest) {
      var card = el.closest(".soft-kbd-card");
      if (card) return card;
    }
    if (el.classList && el.classList.contains("soft-kbd")) {
      var parent = el.parentElement;
      if (parent && parent.classList && parent.classList.contains("soft-kbd-card")) return parent;
    }
    return null;
  }

  function getFeedbackEl(cardEl) {
    var card = resolveCard(cardEl);
    return card ? card.querySelector("[data-jml-soft-kbd-feedback]") : null;
  }

  function getKeysEl(cardEl) {
    var card = resolveCard(cardEl);
    return card ? card.querySelector("[data-jml-soft-kbd-keys]") : null;
  }

  function renderKey(k) {
    if (k === "back") {
      return '<button type="button" class="soft-kbd-key soft-kbd-key-back" data-key="back"></button>';
    }
    if (k === "spacer") {
      return '<span class="soft-kbd-key-spacer" aria-hidden="true"></span>';
    }
    return '<button type="button" class="soft-kbd-key" data-key="' + k + '">' + k + "</button>";
  }

  function renderKeysHtml(layout) {
    var keys = LAYOUT_KEYS[layout] || LAYOUT_KEYS.integer;
    var gridHtml = keys.map(renderKey).join("");
    return (
      '<div class="soft-kbd" data-jml-soft-kbd-keys>' +
      '<div class="soft-kbd-grid">' +
      gridHtml +
      '</div><div class="soft-kbd-enter-row"><button type="button" class="soft-kbd-enter" data-key="enter"></button></div>' +
      "</div>"
    );
  }

  function applyI18n(cardEl, t) {
    var card = resolveCard(cardEl);
    if (!card || typeof t !== "function") return;
    var kbdEl = getKeysEl(card);
    if (!kbdEl) return;
    kbdEl.setAttribute("aria-label", t("softkbd.aria"));
    var back = kbdEl.querySelector('.soft-kbd-key[data-key="back"]');
    if (back) back.textContent = t("softkbd.delete");
    var enter = kbdEl.querySelector('.soft-kbd-enter[data-key="enter"]');
    if (enter) enter.textContent = t("softkbd.confirm");
  }

  function applyI18nAfterMount(cardEl, t) {
    applyI18n(cardEl, resolveT(t));
  }

  function ensureMounted(cardEl, layout, t) {
    var card = resolveCard(cardEl);
    if (!card) return;
    layout = resolveLayout(card, layout);
    var mounted = card.getAttribute("data-jml-soft-kbd-mounted") === "1";
    var mountedLayout = card.getAttribute("data-jml-soft-kbd-layout");
    if (mounted && mountedLayout === layout) {
      applyI18nAfterMount(card, t);
      return;
    }
    card.innerHTML =
      '<div class="soft-kbd-feedback" data-jml-soft-kbd-feedback role="status" aria-live="polite"></div>' +
      renderKeysHtml(layout);
    card.setAttribute("data-jml-soft-kbd-mounted", "1");
    card.setAttribute("data-jml-soft-kbd-layout", layout);
    card.__jmlSoftKbdBound = false;
    applyI18nAfterMount(card, t);
  }

  function applyI18nAll(t) {
    if (typeof t !== "function") return;
    var list = global.document ? global.document.querySelectorAll(".soft-kbd-card[data-jml-soft-kbd-mounted='1']") : [];
    for (var i = 0; i < list.length; i += 1) {
      applyI18n(list[i], t);
    }
  }

  function setCardVisible(cardEl, visible) {
    var card = resolveCard(cardEl);
    if (!card) return;
    card.style.display = visible ? "flex" : "none";
  }

  function setFeedback(cardEl, message, type) {
    var el = getFeedbackEl(cardEl);
    if (!el) return;
    el.textContent = "";
    el.classList.remove("correct", "incorrect");
    if (!message) return;
    el.innerHTML = message;
    if (type === "correct") el.classList.add("correct");
    if (type === "incorrect") el.classList.add("incorrect");
  }

  function bind(options) {
    options = options || {};
    var cardEl = resolveCard(options.cardEl || options.kbdEl);
    var inputEl = options.inputEl;
    var onEnter = options.onEnter;
    if (!cardEl) return null;
    var wantLayout =
      options.layout && LAYOUT_KEYS[options.layout] ? options.layout : resolveLayout(cardEl, options.layout);
    var mountedLayout = cardEl.getAttribute("data-jml-soft-kbd-layout");
    // 已绑定且布局未变：只刷新文案；布局切换时 remount 并重新绑定
    if (cardEl.__jmlSoftKbdBound && mountedLayout === wantLayout) {
      applyI18nAfterMount(cardEl, options.t);
      return cardEl;
    }
    ensureMounted(cardEl, wantLayout, options.t);
    var layout = resolveLayout(cardEl, wantLayout);
    var allowDecimal = layout === "decimal" && options.allowDecimal !== false;
    var kbdEl = getKeysEl(cardEl);
    if (!kbdEl) return cardEl;

    kbdEl.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-key]") : null;
      if (!btn || !inputEl) return;
      var k = btn.getAttribute("data-key");
      if (k === "back") {
        inputEl.value = backspace(inputEl.value);
        return;
      }
      if (k === "enter") {
        if (typeof onEnter === "function") onEnter();
        return;
      }
      if (/^[0-9]$/.test(k) || (k === "." && allowDecimal)) {
        inputEl.value = append(inputEl.value, k, allowDecimal);
      }
    });
    cardEl.__jmlSoftKbdBound = true;
    return cardEl;
  }

  global.JmlSoftKeyboard = {
    LAYOUT_KEYS: LAYOUT_KEYS,
    shouldLockForTouch: shouldLockForTouch,
    backspace: backspace,
    append: append,
    resolveCard: resolveCard,
    getFeedbackEl: getFeedbackEl,
    ensureMounted: ensureMounted,
    setCardVisible: setCardVisible,
    applyI18n: applyI18n,
    applyI18nAll: applyI18nAll,
    setFeedback: setFeedback,
    bind: bind,
  };
})(typeof window !== "undefined" ? window : globalThis);
