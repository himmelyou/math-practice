/**
 * 标准软键盘：布局挂载、按键绑定、i18n、反馈区
 */
(function (global) {
  var LAYOUT_KEYS = {
    decimal: ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"],
    integer: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "back"],
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

  function resolveLayout(kbdEl, explicitLayout) {
    if (explicitLayout && LAYOUT_KEYS[explicitLayout]) return explicitLayout;
    var fromAttr = kbdEl && kbdEl.getAttribute("data-jml-soft-kbd-layout");
    if (fromAttr && LAYOUT_KEYS[fromAttr]) return fromAttr;
    return "decimal";
  }

  function ensureMounted(kbdEl, layout) {
    if (!kbdEl || kbdEl.getAttribute("data-jml-soft-kbd-mounted") === "1") return;
    layout = resolveLayout(kbdEl, layout);
    var keys = LAYOUT_KEYS[layout] || LAYOUT_KEYS.decimal;
    var gridHtml = keys
      .map(function (k) {
        if (k === "back") {
          return '<button type="button" class="soft-kbd-key soft-kbd-key-back" data-key="back"></button>';
        }
        return '<button type="button" class="soft-kbd-key" data-key="' + k + '">' + k + "</button>";
      })
      .join("");
    kbdEl.innerHTML =
      '<div class="soft-kbd-grid">' +
      gridHtml +
      '</div><div class="soft-kbd-enter-row"><button type="button" class="soft-kbd-enter" data-key="enter"></button></div>';
    kbdEl.setAttribute("data-jml-soft-kbd-mounted", "1");
    kbdEl.setAttribute("data-jml-soft-kbd-layout", layout);
  }

  function applyI18n(kbdEl, t) {
    if (!kbdEl || typeof t !== "function") return;
    kbdEl.setAttribute("aria-label", t("softkbd.aria"));
    var back = kbdEl.querySelector('.soft-kbd-key[data-key="back"]');
    if (back) back.textContent = t("softkbd.delete");
    var enter = kbdEl.querySelector('.soft-kbd-enter[data-key="enter"]');
    if (enter) enter.textContent = t("softkbd.confirm");
  }

  function applyI18nAll(t) {
    if (typeof t !== "function") return;
    var list = global.document ? global.document.querySelectorAll(".soft-kbd") : [];
    for (var i = 0; i < list.length; i += 1) {
      applyI18n(list[i], t);
    }
  }

  function setFeedback(el, message, type) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("correct", "incorrect");
    if (!message) return;
    el.innerHTML = message;
    el.classList.add("soft-kbd-feedback");
    if (type === "correct") el.classList.add("correct");
    if (type === "incorrect") el.classList.add("incorrect");
  }

  function bind(options) {
    options = options || {};
    var kbdEl = options.kbdEl;
    var inputEl = options.inputEl;
    var onEnter = options.onEnter;
    if (!kbdEl || kbdEl.__jmlSoftKbdBound) return kbdEl;
    ensureMounted(kbdEl, options.layout);
    var layout = resolveLayout(kbdEl, options.layout);
    var allowDecimal = layout === "decimal" && options.allowDecimal !== false;

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
    kbdEl.__jmlSoftKbdBound = true;
    return kbdEl;
  }

  global.JmlSoftKeyboard = {
    LAYOUT_KEYS: LAYOUT_KEYS,
    shouldLockForTouch: shouldLockForTouch,
    backspace: backspace,
    append: append,
    ensureMounted: ensureMounted,
    applyI18n: applyI18n,
    applyI18nAll: applyI18nAll,
    setFeedback: setFeedback,
    bind: bind,
  };
})(typeof window !== "undefined" ? window : globalThis);
