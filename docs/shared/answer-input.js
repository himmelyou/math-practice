/**
 * 标准答题输入框：placeholder i18n、触屏 readonly、Enter 提交
 */
(function (global) {
  function getShouldLock(options) {
    if (typeof options.getShouldLock === "function") return !!options.getShouldLock();
    if (global.JmlSoftKeyboard && global.JmlSoftKeyboard.shouldLockForTouch) {
      return global.JmlSoftKeyboard.shouldLockForTouch();
    }
    return false;
  }

  function syncInteractionMode(inputEl, options) {
    options = options || {};
    if (!inputEl) return;
    var lock = getShouldLock(options);
    var unlockedMode = options.inputModeWhenUnlocked || "decimal";
    if (lock) {
      inputEl.setAttribute("readonly", "readonly");
      inputEl.setAttribute("inputmode", "none");
    } else {
      inputEl.removeAttribute("readonly");
      inputEl.setAttribute("inputmode", unlockedMode);
    }
  }

  function syncPlaceholder(inputEl, t, key) {
    if (!inputEl || typeof t !== "function") return;
    inputEl.setAttribute("placeholder", t(key || "game.answer.placeholder"));
  }

  function bind(options) {
    options = options || {};
    var inputEl = options.inputEl;
    if (!inputEl || inputEl.__jmlAnswerInputBound) return inputEl;

    syncInteractionMode(inputEl, options);
    if (typeof options.t === "function") {
      syncPlaceholder(inputEl, options.t, options.placeholderKey);
    }

    inputEl.addEventListener("focus", function () {
      if (!getShouldLock(options)) return;
      try {
        inputEl.blur();
      } catch (e) {}
    });
    inputEl.addEventListener("click", function (e) {
      if (!getShouldLock(options)) return;
      e.preventDefault();
      try {
        inputEl.blur();
      } catch (e2) {}
    });
    if (typeof options.onSubmit === "function") {
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          options.onSubmit();
        }
      });
    }

    inputEl.__jmlAnswerInputBound = true;
    inputEl.__jmlAnswerInputOptions = options;
    return inputEl;
  }

  function refreshAll(documentRoot, t) {
    var root = documentRoot || (global.document ? global.document : null);
    if (!root) return;
    var list = root.querySelectorAll("input[data-jml-answer-input]");
    for (var i = 0; i < list.length; i += 1) {
      var el = list[i];
      var opts = el.__jmlAnswerInputOptions || {};
      if (t) opts.t = t;
      syncInteractionMode(el, opts);
      if (typeof opts.t === "function") syncPlaceholder(el, opts.t, opts.placeholderKey);
    }
  }

  global.JmlAnswerInput = {
    bind: bind,
    syncInteractionMode: syncInteractionMode,
    syncPlaceholder: syncPlaceholder,
    refreshAll: refreshAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
