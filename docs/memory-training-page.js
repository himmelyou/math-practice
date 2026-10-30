/**
 * 记忆训练（拓展）：瞬时记忆 / 工作记忆（倒背）/ 加法训练。
 * 下拉自由切换；不进错题本、不写热图；落盘 runs + recentMemoryTrainingRuns。
 */
(function (global) {
  var MODE = "memoryTraining";
  var QUESTIONS_PER_RUN = 10;
  var L12_LEVEL_INDEX = 11;
  var TIME_CAP_MS = 60 * 1000;
  var DIGIT_SHOW_MS = 750;
  var DIGIT_BLANK_MS = 250;
  var SPAN_MIN = 2;
  var SPAN_MAX = 12;
  var KIND_KEY = "jml_mt_kind_v1";
  var KINDS = ["instant", "working", "addition"];

  var deps = null;
  var mtStartTs = 0;
  var mtTimerId = null;
  var mtDigitTimerId = null;
  var mtMastered = 0;
  var mtWrongCount = 0;
  var mtScore = 0;
  var mtAttempts = [];
  var mtCurrent = null;
  var mtPhase = "idle"; // idle | showFirst | answer | digitShow | digitAnswer
  var mtQuestionShownAt = 0;
  var mtInputLocked = false;
  var mtHistoryStats = null;
  var mtEndCompareHtml = "";
  var mtKind = "instant";
  var mtSpanLen = SPAN_MIN;
  var mtLevelStreak = 0;
  var mtLevelWrong = 0;
  var mtSuccessSpan = 0;
  var mtPriorBest = 0;
  var mtDigits = [];

  function dom() {
    return deps.dom;
  }

  function t(key) {
    return deps.t(key);
  }

  function inGuestMode() {
    return !!(typeof deps.isGuestMode === "function" ? deps.isGuestMode() : deps.isGuestMode);
  }

  function isDigitKind(kind) {
    return kind === "instant" || kind === "working";
  }

  function normalizeKind(raw) {
    var k = String(raw || "");
    if (k === "instant" || k === "working" || k === "addition") return k;
    if (k === "workingMemory") return "addition";
    return "instant";
  }

  function runMemoryKind(r) {
    if (!r) return "addition";
    var tm = r.trainingMeta && typeof r.trainingMeta === "object" ? r.trainingMeta : {};
    if (tm.memoryKind) return normalizeKind(tm.memoryKind);
    if (tm.memoryLevel === "workingMemory") return "addition";
    return "addition";
  }

  function loadSavedKind() {
    try {
      return normalizeKind(localStorage.getItem(KIND_KEY));
    } catch (e) {
      return "instant";
    }
  }

  function saveKind(kind) {
    mtKind = normalizeKind(kind);
    try {
      localStorage.setItem(KIND_KEY, mtKind);
    } catch (e) {
      /* ignore */
    }
  }

  function kindLabel(kind) {
    var k = normalizeKind(kind);
    if (k === "instant") return t("memoryTraining.kind.instant");
    if (k === "working") return t("memoryTraining.kind.working");
    return t("memoryTraining.kind.addition");
  }

  function formatElapsedSec(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function formatSec1(sec) {
    if (sec == null || !Number.isFinite(Number(sec))) return "—";
    return (Math.round(Number(sec) * 10) / 10).toFixed(1).replace(/\.0$/, "") + "s";
  }

  function formatPct1(rate) {
    if (rate == null || !Number.isFinite(Number(rate))) return "—";
    return (Math.round(Number(rate) * 1000) / 10).toFixed(1).replace(/\.0$/, "") + "%";
  }

  function setMtFeedback(message, type) {
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setFeedback(dom().mtSoftKbdCard, message, type);
    }
  }

  function setMtSoftKeyboardVisible(visible) {
    var body = document.getElementById("mt-play-body");
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setCardVisible(dom().mtSoftKbdCard, visible);
    } else if (dom().mtSoftKbdCard) {
      dom().mtSoftKbdCard.style.display = visible ? "flex" : "none";
    }
    if (dom().mtRecentCard) dom().mtRecentCard.style.display = visible ? "none" : "flex";
    if (body) body.classList.toggle("game-play-body--kbd", !!visible);
    if (typeof global.scheduleSyncPlayCompact === "function") global.scheduleSyncPlayCompact();
  }

  function syncMtAnswerInputMode() {
    if (global.JmlAnswerInput && dom().mtAnswerInput) {
      global.JmlAnswerInput.syncInteractionMode(dom().mtAnswerInput, {
        t: t,
        inputModeWhenUnlocked: "numeric",
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
      global.JmlAnswerInput.syncPlaceholder(dom().mtAnswerInput, t);
    }
  }

  function setMtGameCardGameOver(active) {
    var card = document.getElementById("mt-game-card");
    if (card) card.classList.toggle("game-over-active", !!active);
  }

  function setMtHistoryVisible(visible) {
    if (dom().mtRecentCard) dom().mtRecentCard.style.display = visible ? "flex" : "none";
  }

  function setMtGameCardLayoutMode(mode) {
    var card = document.getElementById("mt-game-card");
    if (!card) return;
    card.classList.toggle("game-card--prestart", mode === "prestart");
    card.classList.toggle("game-card--playing", mode === "playing");
  }

  function setMtPlayBodyMode(mode) {
    var body = document.getElementById("mt-play-body");
    if (!body) return;
    body.classList.toggle("run-mode-play-body--playing", mode === "playing");
  }

  function clearDigitTimer() {
    if (mtDigitTimerId) {
      clearTimeout(mtDigitTimerId);
      mtDigitTimerId = null;
    }
  }

  /** start | reveal | answer | none */
  function setMtCardActionSlot(mode) {
    if (mode === "start") {
      setMtGameCardLayoutMode("prestart");
      setMtPlayBodyMode("prestart");
      setMtSoftKeyboardVisible(false);
      if (dom().mtAnswerForm) dom().mtAnswerForm.style.display = "";
      if (dom().mtStartRow) dom().mtStartRow.style.display = "";
      if (dom().mtNextRow) dom().mtNextRow.style.display = "none";
      if (dom().mtAnswerInputRow) dom().mtAnswerInputRow.style.display = "none";
      return;
    }
    if (mode === "reveal") {
      setMtGameCardLayoutMode("playing");
      setMtPlayBodyMode("playing");
      setMtSoftKeyboardVisible(false);
      if (dom().mtAnswerForm) dom().mtAnswerForm.style.display = "";
      if (dom().mtStartRow) dom().mtStartRow.style.display = "none";
      if (dom().mtNextRow) dom().mtNextRow.style.display = "";
      if (dom().mtAnswerInputRow) dom().mtAnswerInputRow.style.display = "none";
      return;
    }
    if (mode === "answer") {
      setMtGameCardLayoutMode("playing");
      setMtPlayBodyMode("playing");
      if (dom().mtAnswerForm) dom().mtAnswerForm.style.display = "";
      if (dom().mtStartRow) dom().mtStartRow.style.display = "none";
      if (dom().mtNextRow) dom().mtNextRow.style.display = "none";
      if (dom().mtAnswerInputRow) dom().mtAnswerInputRow.style.display = "";
      setMtSoftKeyboardVisible(true);
      return;
    }
    if (dom().mtAnswerForm) dom().mtAnswerForm.style.display = "none";
    if (dom().mtStartRow) dom().mtStartRow.style.display = "none";
    if (dom().mtNextRow) dom().mtNextRow.style.display = "none";
    if (dom().mtAnswerInputRow) dom().mtAnswerInputRow.style.display = "none";
    setMtSoftKeyboardVisible(false);
  }

  function startMtTimer(elapsedSec) {
    var elapsed = Math.max(0, Math.floor(Number(elapsedSec) || 0));
    mtStartTs = Date.now() - elapsed * 1000;
    if (mtTimerId) clearInterval(mtTimerId);
    mtTimerId = setInterval(function () {
      var sec = Math.floor((Date.now() - mtStartTs) / 1000);
      if (dom().mtTimerValue) dom().mtTimerValue.textContent = formatElapsedSec(sec);
    }, 250);
  }

  function stopMtTimer() {
    if (mtTimerId) clearInterval(mtTimerId);
    mtTimerId = null;
  }

  function generateL12Question() {
    var Ar = global.JmlArithmetic;
    if (!Ar || typeof Ar.buildQuestion !== "function") {
      throw new Error("arithmetic_missing");
    }
    var q = Ar.buildQuestion(L12_LEVEL_INDEX);
    var a = Number(q && q.a);
    var b = Number(q && q.b);
    var answer = Number(q && q.answer);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(answer)) {
      throw new Error("bad_l12_question");
    }
    return {
      a: a,
      b: b,
      answer: answer,
      equation: a + " + " + b + " = " + answer,
      levelIndex: 0,
    };
  }

  function generateDigitSequence(len) {
    var n = Math.max(SPAN_MIN, Math.min(SPAN_MAX, Math.floor(Number(len) || SPAN_MIN)));
    var out = [];
    var prev = -1;
    for (var i = 0; i < n; i++) {
      var d = Math.floor(Math.random() * 10);
      var guard = 0;
      while (d === prev && guard < 20) {
        d = Math.floor(Math.random() * 10);
        guard += 1;
      }
      out.push(d);
      prev = d;
    }
    return out;
  }

  function expectedDigitAnswer(digits, kind) {
    var seq = Array.isArray(digits) ? digits.slice() : [];
    if (kind === "working") seq.reverse();
    return seq.join("");
  }

  /** 历史均值：错误率=错题/作答；速度=答对用时几何均（秒），剔 >cap */
  function computeStatsFromRuns(runs) {
    var list = Array.isArray(runs) ? runs : [];
    var wrong = 0;
    var total = 0;
    var sumLn = 0;
    var nLn = 0;
    list.forEach(function (r) {
      if (!r || r.comboOnly === true || r.abandoned === true) return;
      var attempts = Array.isArray(r.attempts) ? r.attempts : [];
      attempts.forEach(function (a) {
        if (!a) return;
        total += 1;
        if (a.correct === true) {
          var ms = Number(a.timeSpentMs);
          if (Number.isFinite(ms) && ms > 0 && ms <= TIME_CAP_MS) {
            sumLn += Math.log(ms);
            nLn += 1;
          }
        } else {
          wrong += 1;
        }
      });
    });
    return {
      sampleAttempts: total,
      errorRate: total > 0 ? wrong / total : null,
      avgSec: nLn > 0 ? Math.exp(sumLn / nLn) / 1000 : null,
    };
  }

  function computeStatsFromAttempts(attempts) {
    return computeStatsFromRuns([{ attempts: attempts, comboOnly: false }]);
  }

  function getRecentRuns() {
    var user = typeof deps.getCachedUser === "function" ? deps.getCachedUser() : null;
    if (!user) return [];
    if (typeof deps.ensureUserProgressDefault === "function") deps.ensureUserProgressDefault(user);
    return Array.isArray(user.recentMemoryTrainingRuns) ? user.recentMemoryTrainingRuns : [];
  }

  function getRunsForKind(kind) {
    var want = normalizeKind(kind);
    return getRecentRuns().filter(function (r) {
      return runMemoryKind(r) === want;
    });
  }

  function bestSpanForKind(kind) {
    var user = typeof deps.getCachedUser === "function" ? deps.getCachedUser() : null;
    var fromUser = 0;
    if (user) {
      if (kind === "instant") fromUser = Number(user.bestMemoryInstantSpan) || 0;
      if (kind === "working") fromUser = Number(user.bestMemoryWorkingSpan) || 0;
    }
    var best = fromUser;
    getRunsForKind(kind).forEach(function (r) {
      if (!r || r.abandoned === true || r.comboOnly === true) return;
      var tm = r.trainingMeta || {};
      var s = Number(tm.successSpan);
      if (!Number.isFinite(s) || s <= 0) s = Number(r.maxLevel) || 0;
      if (s > best) best = s;
    });
    return best > 0 ? best : 0;
  }

  function clearMtPrestartChrome() {
    var card = document.getElementById("mt-game-card");
    if (card) card.classList.remove("training-brush-prestart");
    if (dom().mtQuestionText) {
      dom().mtQuestionText.classList.remove("training-brush-stat", "rule-hint");
    }
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.classList.remove("training-brush-stat");
    }
  }

  function syncKindSelectOptions() {
    var sel = dom().mtKindSelect;
    if (!sel) return;
    var cur = mtKind;
    sel.innerHTML = "";
    KINDS.forEach(function (k) {
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = kindLabel(k);
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function setKindChrome(playing) {
    var sel = dom().mtKindSelect;
    var label = dom().mtPromptLabel;
    if (sel) {
      sel.style.display = playing ? "none" : "";
      sel.disabled = !!playing;
    }
    if (label) {
      label.style.display = playing ? "" : "none";
      label.textContent = kindLabel(mtKind);
    }
    if (dom().mtLevelText) dom().mtLevelText.textContent = kindLabel(mtKind);
    if (dom().mtModeName) dom().mtModeName.textContent = t("home.mode.memoryTraining");
  }

  function syncHistoryHeaders() {
    var digit = isDigitKind(mtKind);
    if (dom().mtThWrong) {
      dom().mtThWrong.textContent = digit
        ? t("memoryTraining.th.successSpan")
        : t("expand.th.wrong");
    }
    if (dom().mtThErr) {
      dom().mtThErr.textContent = digit
        ? t("memoryTraining.th.result")
        : t("stats.th.errorRate");
    }
    if (dom().mtRecentTitle) {
      dom().mtRecentTitle.textContent =
        t("memoryTraining.recentTitlePrefix") + kindLabel(mtKind);
    }
  }

  function paintPrestartStats() {
    clearMtPrestartChrome();
    var card = document.getElementById("mt-game-card");
    if (card) card.classList.add("training-brush-prestart");
    var main = "";
    var sub = "";
    if (isDigitKind(mtKind)) {
      mtPriorBest = bestSpanForKind(mtKind);
      if (mtPriorBest > 0) {
        main = t("memoryTraining.prestart.bestSpan") + " " + mtPriorBest;
        sub =
          mtKind === "working"
            ? t("memoryTraining.prestart.hintWorking")
            : t("memoryTraining.prestart.hintInstant");
      } else {
        main = t("memoryTraining.prestart.noRecord");
        sub =
          mtKind === "working"
            ? t("memoryTraining.prestart.hintWorking")
            : t("memoryTraining.prestart.hintInstant");
      }
    } else {
      mtHistoryStats = computeStatsFromRuns(getRunsForKind("addition"));
      if (!mtHistoryStats.sampleAttempts) {
        main = t("memoryTraining.prestart.empty");
        sub = t("memoryTraining.prestart.hintAddition");
      } else {
        main =
          t("memoryTraining.prestart.avgError") +
          " " +
          formatPct1(mtHistoryStats.errorRate);
        sub =
          t("memoryTraining.prestart.avgSpeed") +
          " " +
          formatSec1(mtHistoryStats.avgSec);
      }
    }
    if (dom().mtQuestionText) {
      dom().mtQuestionText.style.display = "";
      dom().mtQuestionText.classList.add("training-brush-stat");
      dom().mtQuestionText.textContent = main;
    }
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.textContent = sub;
      if (sub) {
        dom().mtQuestionSubtext.classList.add("training-brush-stat");
        dom().mtQuestionSubtext.style.display = "";
      } else {
        dom().mtQuestionSubtext.style.display = "none";
      }
    }
    setKindChrome(false);
    syncHistoryHeaders();
  }

  function buildEndCompareMessage(runStats, histStats) {
    if (!histStats || !histStats.sampleAttempts) {
      return t("memoryTraining.end.first");
    }
    var betterErr =
      runStats.errorRate != null &&
      histStats.errorRate != null &&
      runStats.errorRate < histStats.errorRate - 0.001;
    var betterSpd =
      runStats.avgSec != null &&
      histStats.avgSec != null &&
      runStats.avgSec < histStats.avgSec * 0.97;
    var worseErr =
      runStats.errorRate != null &&
      histStats.errorRate != null &&
      runStats.errorRate > histStats.errorRate + 0.001;
    var worseSpd =
      runStats.avgSec != null &&
      histStats.avgSec != null &&
      runStats.avgSec > histStats.avgSec * 1.03;
    if (betterErr || betterSpd) {
      if (!(worseErr && worseSpd)) return t("memoryTraining.end.improved");
    }
    if (worseErr || worseSpd) return t("memoryTraining.end.keepTrying");
    return t("memoryTraining.end.steady");
  }

  function renderMtRecentRunsTable(runs) {
    if (!dom().mtHistoryBody || !dom().mtHistoryEmpty) return;
    var list = Array.isArray(runs) ? runs.slice(0, 10) : [];
    dom().mtHistoryBody.innerHTML = "";
    if (!list.length) {
      dom().mtHistoryEmpty.style.display = "";
      return;
    }
    dom().mtHistoryEmpty.style.display = "none";
    var digit = isDigitKind(mtKind);
    list.forEach(function (r) {
      var tr = document.createElement("tr");
      var ts = Number(r && r.ts) || 0;
      var dt = "";
      try {
        dt = ts ? new Date(ts).toLocaleString() : "";
      } catch (e) {
        dt = "";
      }
      var timeLabel =
        typeof deps.formatCompactRunTime === "function"
          ? deps.formatCompactRunTime(r.survivalTimeSec || 0)
          : String(r.survivalTimeSec || 0);
      var esc = typeof deps.escapeHtml === "function" ? deps.escapeHtml : function (x) {
        return String(x == null ? "" : x);
      };
      var c3 = "";
      var c4 = "";
      if (digit) {
        var tm = r.trainingMeta || {};
        var span = Number(tm.successSpan);
        if (!Number.isFinite(span) || span <= 0) span = Number(r.maxLevel) || 0;
        c3 = span > 0 ? String(span) : "—";
        c4 =
          tm.brokeRecord === true
            ? t("memoryTraining.end.brokeRecord")
            : "—";
      } else {
        c3 = r.wrongCount != null ? String(r.wrongCount) : "0";
        c4 = formatPct1(computeStatsFromAttempts(r.attempts || []).errorRate);
      }
      tr.innerHTML =
        "<td>" +
        esc(dt) +
        "</td><td>" +
        esc(timeLabel) +
        "</td><td>" +
        esc(c3) +
        "</td><td>" +
        esc(c4) +
        "</td>";
      dom().mtHistoryBody.appendChild(tr);
    });
  }

  function renderMemoryTrainingRecentRuns() {
    renderMtRecentRunsTable(getRunsForKind(mtKind));
  }

  function updateDigitStatus() {
    if (dom().mtProgressText) {
      dom().mtProgressText.textContent =
        t("memoryTraining.status.span") + " " + mtSpanLen;
    }
    if (dom().mtWrongText) dom().mtWrongText.textContent = String(mtLevelWrong);
    if (dom().mtScoreText) dom().mtScoreText.textContent = String(mtSuccessSpan);
  }

  function showMemoryTrainingPrestart() {
    deps.setIsPlaying(false);
    deps.setGameOver(false);
    mtPhase = "idle";
    mtCurrent = null;
    mtDigits = [];
    mtInputLocked = false;
    mtEndCompareHtml = "";
    clearDigitTimer();
    stopMtTimer();
    if (dom().mtTimerValue) dom().mtTimerValue.textContent = "0:00";
    if (dom().mtProgressText) {
      dom().mtProgressText.textContent = isDigitKind(mtKind)
        ? t("memoryTraining.status.span") + " " + SPAN_MIN
        : "0 / " + QUESTIONS_PER_RUN;
    }
    if (dom().mtWrongText) dom().mtWrongText.textContent = "0";
    if (dom().mtScoreText) dom().mtScoreText.textContent = "0";
    if (dom().mtGameOverPanel) dom().mtGameOverPanel.style.display = "none";
    setMtGameCardGameOver(false);
    setMtCardActionSlot("start");
    setMtHistoryVisible(true);
    syncKindSelectOptions();
    paintPrestartStats();
    renderMemoryTrainingRecentRuns();
    deps.updateGlobalBackButtonState();
  }

  function nextAdditionQuestion() {
    if (mtMastered + mtWrongCount >= QUESTIONS_PER_RUN) {
      void endMemoryTrainingGame();
      return;
    }
    try {
      mtCurrent = generateL12Question();
    } catch (e) {
      console.warn("memory training question", e);
      deps.showToast(t("memoryTraining.fail.question"));
      return;
    }
    mtPhase = "showFirst";
    mtQuestionShownAt = Date.now();
    mtInputLocked = false;
    clearMtPrestartChrome();
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.style.display = "";
      dom().mtQuestionSubtext.textContent = t("memoryTraining.prompt.sum");
    }
    if (dom().mtQuestionText) {
      dom().mtQuestionText.style.display = "";
      dom().mtQuestionText.textContent = String(mtCurrent.a);
    }
    if (dom().mtProgressText) {
      dom().mtProgressText.textContent =
        mtMastered + mtWrongCount + " / " + QUESTIONS_PER_RUN;
    }
    if (dom().mtAnswerInput) {
      dom().mtAnswerInput.value = "";
      dom().mtAnswerInput.disabled = true;
    }
    setMtFeedback("", null);
    setMtCardActionSlot("reveal");
  }

  function beginDigitTrial() {
    clearDigitTimer();
    mtDigits = generateDigitSequence(mtSpanLen);
    mtCurrent = {
      digits: mtDigits.slice(),
      answerStr: expectedDigitAnswer(mtDigits, mtKind),
      spanLen: mtSpanLen,
    };
    mtPhase = "digitShow";
    mtQuestionShownAt = Date.now();
    mtInputLocked = false;
    clearMtPrestartChrome();
    updateDigitStatus();
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.style.display = "";
      dom().mtQuestionSubtext.textContent =
        mtKind === "working"
          ? t("memoryTraining.prompt.reverse")
          : t("memoryTraining.prompt.forward");
    }
    if (dom().mtAnswerInput) {
      dom().mtAnswerInput.value = "";
      dom().mtAnswerInput.disabled = true;
    }
    setMtFeedback("", null);
    setMtSoftKeyboardVisible(false);
    setMtCardActionSlot("none");
    if (dom().mtAnswerForm) dom().mtAnswerForm.style.display = "none";
    setMtGameCardLayoutMode("playing");
    setMtPlayBodyMode("playing");
    showDigitAt(0);
  }

  function showDigitAt(index) {
    if (deps.getGameMode() !== MODE || !deps.getIsPlaying() || deps.getGameOver()) return;
    if (mtPhase !== "digitShow" || !mtCurrent) return;
    if (index >= mtCurrent.digits.length) {
      enterDigitAnswer();
      return;
    }
    if (dom().mtQuestionText) {
      dom().mtQuestionText.style.display = "";
      dom().mtQuestionText.textContent = String(mtCurrent.digits[index]);
    }
    clearDigitTimer();
    mtDigitTimerId = setTimeout(function () {
      if (dom().mtQuestionText) dom().mtQuestionText.textContent = "";
      mtDigitTimerId = setTimeout(function () {
        showDigitAt(index + 1);
      }, DIGIT_BLANK_MS);
    }, DIGIT_SHOW_MS);
  }

  function enterDigitAnswer() {
    if (!mtCurrent) return;
    mtPhase = "digitAnswer";
    if (dom().mtQuestionText) {
      dom().mtQuestionText.style.display = "";
      dom().mtQuestionText.textContent = "?";
    }
    if (dom().mtAnswerInput) {
      dom().mtAnswerInput.disabled = false;
      dom().mtAnswerInput.value = "";
    }
    setMtCardActionSlot("answer");
    syncMtAnswerInputMode();
    try {
      if (dom().mtAnswerInput) dom().mtAnswerInput.focus();
    } catch (e) {
      /* ignore */
    }
  }

  function handleMtRevealNext() {
    if (deps.getGameMode() !== MODE) return;
    if (!deps.getIsPlaying() || deps.getGameOver()) return;
    if (mtKind !== "addition") return;
    if (mtPhase !== "showFirst" || !mtCurrent) return;
    mtPhase = "answer";
    if (dom().mtQuestionText) {
      dom().mtQuestionText.textContent = String(mtCurrent.b);
    }
    if (dom().mtAnswerInput) {
      dom().mtAnswerInput.disabled = false;
      dom().mtAnswerInput.value = "";
    }
    setMtCardActionSlot("answer");
    syncMtAnswerInputMode();
    try {
      if (dom().mtAnswerInput) dom().mtAnswerInput.focus();
    } catch (e) {
      /* ignore */
    }
  }

  function evaluateAdditionAnswer(userAnswer) {
    if (!mtCurrent || mtInputLocked || mtPhase !== "answer") return;
    mtInputLocked = true;
    if (dom().mtAnswerInput) dom().mtAnswerInput.disabled = true;
    var timeSpentMs = mtQuestionShownAt ? Date.now() - mtQuestionShownAt : 0;
    var correct = userAnswer === mtCurrent.answer;
    mtAttempts.push({
      levelIndex: 0,
      correct: correct,
      timeSpentMs: timeSpentMs,
      a: mtCurrent.a,
      b: mtCurrent.b,
      memoryKind: "addition",
    });

    if (correct) {
      mtMastered += 1;
      mtScore += 5;
      if (dom().mtScoreText) dom().mtScoreText.textContent = String(mtScore);
      if (dom().mtProgressText) {
        dom().mtProgressText.textContent =
          mtMastered + mtWrongCount + " / " + QUESTIONS_PER_RUN;
      }
      setMtFeedback(t("game.feedback.correctSurvival"), "correct");
      setTimeout(function () {
        if (mtMastered + mtWrongCount >= QUESTIONS_PER_RUN) {
          void endMemoryTrainingGame();
        } else {
          nextAdditionQuestion();
        }
      }, 350);
      return;
    }

    mtWrongCount += 1;
    if (dom().mtWrongText) dom().mtWrongText.textContent = String(mtWrongCount);
    if (dom().mtProgressText) {
      dom().mtProgressText.textContent =
        mtMastered + mtWrongCount + " / " + QUESTIONS_PER_RUN;
    }
    setMtFeedback(
      t("game.feedback.incorrectPrefixHtml") +
        t("memoryTraining.feedback.equationLabel") +
        "<strong>" +
        mtCurrent.equation +
        "</strong>",
      "incorrect"
    );
    setTimeout(function () {
      if (mtMastered + mtWrongCount >= QUESTIONS_PER_RUN) {
        void endMemoryTrainingGame();
      } else {
        nextAdditionQuestion();
      }
    }, 900);
  }

  function evaluateDigitAnswer(userStr) {
    if (!mtCurrent || mtInputLocked || mtPhase !== "digitAnswer") return;
    mtInputLocked = true;
    if (dom().mtAnswerInput) dom().mtAnswerInput.disabled = true;
    var timeSpentMs = mtQuestionShownAt ? Date.now() - mtQuestionShownAt : 0;
    var expected = String(mtCurrent.answerStr || "");
    var correct = userStr === expected;
    mtAttempts.push({
      levelIndex: mtSpanLen,
      correct: correct,
      timeSpentMs: timeSpentMs,
      digits: (mtCurrent.digits || []).slice(),
      expected: expected,
      memoryKind: mtKind,
    });

    if (correct) {
      mtLevelStreak += 1;
      if (mtLevelStreak >= 2) {
        // 同级连对 2 次才算「成功该等级」；3 位没过则纪录仍为 2
        mtSuccessSpan = Math.max(mtSuccessSpan, mtSpanLen);
        mtScore = mtSuccessSpan;
        if (mtSpanLen < SPAN_MAX) {
          mtSpanLen += 1;
          mtLevelStreak = 0;
          mtLevelWrong = 0;
        } else {
          mtLevelStreak = 0;
        }
      }
      updateDigitStatus();
      setMtFeedback(t("game.feedback.correctSurvival"), "correct");
      setTimeout(function () {
        beginDigitTrial();
      }, 400);
      return;
    }

    mtLevelWrong += 1;
    updateDigitStatus();
    setMtFeedback(
      t("game.feedback.incorrectPrefixHtml") +
        t("memoryTraining.feedback.answerLabel") +
        "<strong>" +
        expected +
        "</strong>",
      "incorrect"
    );
    setTimeout(function () {
      if (mtLevelWrong >= 2) {
        void endMemoryTrainingGame();
      } else {
        mtLevelStreak = 0;
        beginDigitTrial();
      }
    }, 1100);
  }

  function handleMtSubmit() {
    if (deps.getGameMode() !== MODE) return;
    if (!deps.getIsPlaying() || deps.getGameOver() || !mtCurrent) return;
    var input = dom().mtAnswerInput;
    if (!input) return;
    var value = input.value.trim();
    if (value === "") {
      setMtFeedback(t("game.feedback.titleHtml") + t("game.feedback.needAnswer"), null);
      return;
    }

    if (isDigitKind(mtKind)) {
      if (mtPhase !== "digitAnswer") return;
      if (!/^\d+$/.test(value)) {
        setMtFeedback(t("game.feedback.titleHtml") + t("game.feedback.invalidNumber"), null);
        return;
      }
      input.value = "";
      evaluateDigitAnswer(value);
      return;
    }

    if (mtPhase !== "answer") return;
    var userAnswer = Number(value);
    if (!Number.isFinite(userAnswer) || !Number.isInteger(userAnswer)) {
      setMtFeedback(t("game.feedback.titleHtml") + t("game.feedback.invalidNumber"), null);
      return;
    }
    input.value = "";
    evaluateAdditionAnswer(userAnswer);
  }

  function startMemoryTrainingGame() {
    if (deps.getGameMode() !== MODE) return;
    setMtGameCardGameOver(false);
    deps.setIsPlaying(true);
    deps.setGameOver(false);
    mtMastered = 0;
    mtWrongCount = 0;
    mtScore = 0;
    mtAttempts = [];
    mtCurrent = null;
    mtDigits = [];
    mtInputLocked = false;
    mtSpanLen = SPAN_MIN;
    mtLevelStreak = 0;
    mtLevelWrong = 0;
    mtSuccessSpan = 0;
    mtPriorBest = isDigitKind(mtKind) ? bestSpanForKind(mtKind) : 0;
    if (mtKind === "addition") {
      mtHistoryStats = computeStatsFromRuns(getRunsForKind("addition"));
    }

    if (dom().mtGameOverPanel) dom().mtGameOverPanel.style.display = "none";
    if (dom().mtProgressText) {
      dom().mtProgressText.textContent = isDigitKind(mtKind)
        ? t("memoryTraining.status.span") + " " + SPAN_MIN
        : "0 / " + QUESTIONS_PER_RUN;
    }
    if (dom().mtScoreText) dom().mtScoreText.textContent = "0";
    if (dom().mtWrongText) dom().mtWrongText.textContent = "0";
    setKindChrome(true);
    setMtHistoryVisible(false);
    startMtTimer(0);
    deps.updateGlobalBackButtonState();
    if (isDigitKind(mtKind)) beginDigitTrial();
    else nextAdditionQuestion();
  }

  async function endMemoryTrainingGame() {
    if (deps.getGameMode() !== MODE) return;
    deps.setIsPlaying(false);
    clearDigitTimer();
    stopMtTimer();
    var durationSec = Math.floor((Date.now() - (mtStartTs || Date.now())) / 1000);
    var brokeRecord = false;
    var trainingMeta = { memoryKind: mtKind, pickedLevel: 0 };

    if (isDigitKind(mtKind)) {
      brokeRecord = mtSuccessSpan > 0 && mtSuccessSpan > mtPriorBest;
      trainingMeta.successSpan = mtSuccessSpan;
      trainingMeta.priorBest = mtPriorBest;
      trainingMeta.brokeRecord = brokeRecord;
      mtEndCompareHtml =
        "<div>" +
        t("memoryTraining.end.thisSpan") +
        " <strong>" +
        (mtSuccessSpan > 0 ? String(mtSuccessSpan) : "—") +
        "</strong></div><div style=\"margin-top:6px\">" +
        (mtSuccessSpan <= 0
          ? t("memoryTraining.end.noSuccess")
          : brokeRecord
            ? t("memoryTraining.end.brokeRecord")
            : t("memoryTraining.end.keepTrying")) +
        "</div>";
      mtWrongCount = mtLevelWrong;
      mtScore = mtSuccessSpan;
    } else {
      var runStats = computeStatsFromAttempts(mtAttempts);
      var compareMsg = buildEndCompareMessage(runStats, mtHistoryStats);
      mtEndCompareHtml =
        "<div>" +
        t("memoryTraining.end.thisError") +
        " <strong>" +
        formatPct1(runStats.errorRate) +
        "</strong> · " +
        t("memoryTraining.end.thisSpeed") +
        " <strong>" +
        formatSec1(runStats.avgSec) +
        "</strong></div><div style=\"margin-top:6px\">" +
        compareMsg +
        "</div>";
    }

    await deps.appendRun(
      durationSec,
      mtScore,
      isDigitKind(mtKind) ? mtSuccessSpan : 0,
      mtWrongCount,
      MODE,
      mtAttempts.slice(),
      undefined,
      undefined,
      { trainingMeta: trainingMeta }
    );

    var user = typeof deps.getCachedUser === "function" ? deps.getCachedUser() : null;
    if (user && isDigitKind(mtKind) && mtSuccessSpan > 0) {
      if (mtKind === "instant") {
        user.bestMemoryInstantSpan = Math.max(
          Number(user.bestMemoryInstantSpan) || 0,
          mtSuccessSpan
        );
      } else if (mtKind === "working") {
        user.bestMemoryWorkingSpan = Math.max(
          Number(user.bestMemoryWorkingSpan) || 0,
          mtSuccessSpan
        );
      }
    }

    setMtSoftKeyboardVisible(false);
    setMtGameCardGameOver(true);
    setMtCardActionSlot("none");
    if (dom().mtQuestionText) {
      dom().mtQuestionText.style.display = "none";
      dom().mtQuestionText.textContent = "";
    }
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.style.display = "none";
      dom().mtQuestionSubtext.textContent = "";
    }
    if (dom().mtGameOverPanel) dom().mtGameOverPanel.style.display = "";
    if (dom().mtGameOverTitle) dom().mtGameOverTitle.textContent = t("expand.end.title");
    if (dom().mtGoDurationLabel) dom().mtGoDurationLabel.textContent = t("expand.end.time");
    if (dom().mtGoDuration) {
      dom().mtGoDuration.textContent = deps.formatCompactRunTime(durationSec);
    }
    if (dom().mtGoWrongLabel) {
      dom().mtGoWrongLabel.textContent = isDigitKind(mtKind)
        ? t("memoryTraining.end.successSpan")
        : t("expand.end.wrong");
    }
    if (dom().mtGoWrong) {
      dom().mtGoWrong.textContent = isDigitKind(mtKind)
        ? mtSuccessSpan > 0
          ? String(mtSuccessSpan)
          : "—"
        : String(mtWrongCount);
    }
    if (dom().mtGoResultLabel) dom().mtGoResultLabel.textContent = t("memoryTraining.end.compare");
    if (dom().mtGoResult) dom().mtGoResult.innerHTML = mtEndCompareHtml;
    if (dom().mtPlayAgainBtn) dom().mtPlayAgainBtn.style.display = "";
    setKindChrome(false);
    setMtHistoryVisible(true);
    renderMemoryTrainingRecentRuns();
    deps.setGameOver(true);
    deps.updateGlobalBackButtonState();
  }

  function abandonMemoryTrainingGame() {
    if (deps.getGameMode() !== MODE) return;
    clearDigitTimer();
    var durationSec = Math.floor((Date.now() - (mtStartTs || Date.now())) / 1000);
    void deps.appendRun(
      durationSec,
      0,
      isDigitKind(mtKind) ? mtSuccessSpan : 0,
      isDigitKind(mtKind) ? mtLevelWrong : mtWrongCount,
      MODE,
      mtAttempts.slice(),
      false,
      true,
      { trainingMeta: { memoryKind: mtKind, abandoned: true, successSpan: mtSuccessSpan } }
    );
    deps.setIsPlaying(false);
    deps.setGameOver(true);
    stopMtTimer();
    setMtFeedback("", null);
    setMtSoftKeyboardVisible(false);
    setMtGameCardGameOver(true);
    setMtCardActionSlot("none");
    if (dom().mtQuestionText) {
      dom().mtQuestionText.textContent = "";
      dom().mtQuestionText.style.display = "none";
    }
    if (dom().mtQuestionSubtext) {
      dom().mtQuestionSubtext.textContent = "";
      dom().mtQuestionSubtext.style.display = "none";
    }
    setKindChrome(false);
    setMtHistoryVisible(true);
    if (dom().mtGameOverPanel) dom().mtGameOverPanel.style.display = "";
    if (dom().mtGameOverTitle) dom().mtGameOverTitle.textContent = t("game.over.abandonedTitle");
    if (dom().mtGoDuration) {
      dom().mtGoDuration.textContent = deps.formatCompactRunTime(durationSec);
    }
    if (dom().mtGoWrong) {
      dom().mtGoWrong.textContent = isDigitKind(mtKind)
        ? mtSuccessSpan > 0
          ? String(mtSuccessSpan)
          : "—"
        : String(mtWrongCount);
    }
    if (dom().mtGoResult) dom().mtGoResult.textContent = "—";
    renderMemoryTrainingRecentRuns();
    deps.updateGlobalBackButtonState();
  }

  function hideMemoryTrainingSection() {
    clearDigitTimer();
    var sec = document.getElementById("memory-training-section");
    if (sec) {
      sec.style.display = "none";
      sec.classList.remove("visible");
    }
  }

  function showMemoryTrainingSection() {
    deps.setTopActionsVisible(false);
    if (dom().homeSection) dom().homeSection.classList.add("hidden");
    if (dom().gameSection) dom().gameSection.classList.remove("visible");
    if (dom().expandSection) {
      dom().expandSection.classList.remove("visible");
      dom().expandSection.style.display = "none";
    }
    if (dom().wrongbookSection) dom().wrongbookSection.style.display = "none";
    var statsSection = document.getElementById("stats-section");
    if (statsSection) statsSection.classList.remove("visible");
    var rankingSection = document.getElementById("ranking-section");
    if (rankingSection) rankingSection.style.display = "none";
    var achievementWallSection = document.getElementById("achievement-wall-section");
    if (achievementWallSection) achievementWallSection.style.display = "none";
    var primeSection = document.getElementById("prime-composite-section");
    if (primeSection) {
      primeSection.style.display = "none";
      primeSection.classList.remove("visible");
    }
    if (deps.primeCompositeResetToIdle) deps.primeCompositeResetToIdle();
    var avatarPickerSec = document.getElementById("avatar-picker-section");
    if (avatarPickerSec) avatarPickerSec.style.display = "none";
    ["perfect-square-section", "divisibility-section", "factors-multiples-section", "decimal-section"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.classList.remove("visible");
        }
      }
    );
    var sec = document.getElementById("memory-training-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    mtKind = loadSavedKind();
    showMemoryTrainingPrestart();
    deps.updateTopTitleForCurrentView(false);
  }

  function handleModeMemoryTraining() {
    if (inGuestMode()) {
      deps.showToast(t("toast.guestNeedLogin"));
      return;
    }
    deps.setGameMode(MODE);
    showMemoryTrainingSection();
  }

  function isMemoryTrainingPlayingNow() {
    return deps.getGameMode() === MODE && deps.getIsPlaying() && !deps.getGameOver();
  }

  function getAbandonProgress() {
    if (isDigitKind(mtKind)) {
      return {
        answered: Array.isArray(mtAttempts) ? mtAttempts.length : 0,
        total: Math.max((Array.isArray(mtAttempts) ? mtAttempts.length : 0) + 1, 1),
      };
    }
    return {
      answered: Array.isArray(mtAttempts) ? mtAttempts.length : 0,
      total: QUESTIONS_PER_RUN,
    };
  }

  function initMtSoftKeyboardIfNeeded() {
    var card = dom().mtSoftKbdCard;
    var input = dom().mtAnswerInput;
    if (!card || !global.JmlSoftKeyboard) return;
    global.JmlSoftKeyboard.ensureMounted(card, "integer", t);
    global.JmlSoftKeyboard.bind({
      cardEl: card,
      inputEl: input,
      onEnter: handleMtSubmit,
      layout: "integer",
      t: t,
    });
    if (input && global.JmlAnswerInput) {
      global.JmlAnswerInput.bind({
        inputEl: input,
        t: t,
        inputModeWhenUnlocked: "numeric",
        onSubmit: handleMtSubmit,
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
    }
    syncMtAnswerInputMode();
  }

  function onKindSelectChange() {
    if (deps.getIsPlaying() && !deps.getGameOver()) return;
    var sel = dom().mtKindSelect;
    if (!sel) return;
    saveKind(sel.value);
    showMemoryTrainingPrestart();
  }

  function bindEvents() {
    if (dom().mtStartBtn) dom().mtStartBtn.addEventListener("click", startMemoryTrainingGame);
    if (dom().mtNextBtn) dom().mtNextBtn.addEventListener("click", handleMtRevealNext);
    if (dom().mtPlayAgainBtn) {
      dom().mtPlayAgainBtn.addEventListener("click", function () {
        showMemoryTrainingPrestart();
      });
    }
    if (dom().mtKindSelect) {
      dom().mtKindSelect.addEventListener("change", onKindSelectChange);
    }
    initMtSoftKeyboardIfNeeded();
  }

  function init(injectedDeps) {
    deps = injectedDeps;
    mtKind = loadSavedKind();
    bindEvents();
  }

  global.JmlMemoryTrainingPage = {
    init: init,
    hideMemoryTrainingSection: hideMemoryTrainingSection,
    showMemoryTrainingSection: showMemoryTrainingSection,
    handleModeMemoryTraining: handleModeMemoryTraining,
    isMemoryTrainingPlayingNow: isMemoryTrainingPlayingNow,
    abandonMemoryTrainingGame: abandonMemoryTrainingGame,
    getAbandonProgress: getAbandonProgress,
    renderMemoryTrainingRecentRuns: renderMemoryTrainingRecentRuns,
    showMemoryTrainingPrestart: showMemoryTrainingPrestart,
  };
})(typeof window !== "undefined" ? window : globalThis);
