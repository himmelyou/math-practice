/**
 * 平方数模式页面逻辑（由 docs/index.html 在 DOM 就绪后调用 JmlPerfectSquarePage.init(deps)）
 */
(function (global) {
  const PS_SCORE_PER_CORRECT = 5;

  let deps = null;
  let psLevel = 0;
  let psRunStartLevel = 0;
  let psUnlockedMaxBeforeRun = 0;
  let psPrestartLevel = 0;
  let psRunDeck = [];
  let psMastered = 0;
  let psWrongCount = 0;
  let psScore = 0;
  let psAttempts = [];
  let psStartTs = 0;
  let psTimerId = null;
  let psCurrent = null;
  let psQuestionShownAt = 0;
  let psInputLocked = false;

  function dom() {
    return deps.dom;
  }

  function t(key) {
    return deps.t(key);
  }

  function inGuestMode() {
    if (!deps) return false;
    return !!(typeof deps.isGuestMode === "function" ? deps.isGuestMode() : deps.isGuestMode);
  }

  function psMaxLevel() {
    const m = global.JmlPerfectSquare && global.JmlPerfectSquare.PS_MAX_LEVEL;
    return typeof m === "number" ? m : 3;
  }

  function psL4LevelIndex() {
    return global.JmlPerfectSquare && typeof global.JmlPerfectSquare.L4_LEVEL_INDEX === "number"
      ? global.JmlPerfectSquare.L4_LEVEL_INDEX
      : 3;
  }

  function psMasterTarget(level) {
    const lv = typeof level === "number" ? level : psLevel;
    if (global.JmlPerfectSquare && global.JmlPerfectSquare.questionsPerRun) {
      return global.JmlPerfectSquare.questionsPerRun(lv);
    }
    return 20;
  }

  function buildRunForLevel(level) {
    return global.JmlPerfectSquare.buildRun(level);
  }

  function formatPsProgress() {
    return psMastered + " / " + psMasterTarget();
  }

  function psRequeueWrongCard(card) {
    const tailLen = psRunDeck.length;
    if (tailLen === 0) {
      psRunDeck.push(card);
      return;
    }
    const insertAt = 1 + Math.floor(Math.random() * tailLen);
    psRunDeck.splice(insertAt, 0, card);
  }

  function materializePsQueueHead() {
    const card = psRunDeck[0];
    if (!card) return null;
    if (psLevel === psL4LevelIndex()) {
      return global.JmlPerfectSquare.materializeL4Question(card);
    }
    return card;
  }

  function formatElapsedSec(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function setPsFeedback(message, type) {
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setFeedback(dom().psSoftKbdCard, message, type);
    }
  }

  function setPsSoftKeyboardVisible(visible) {
    const body = document.getElementById("ps-play-body");
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setCardVisible(dom().psSoftKbdCard, visible);
    } else if (dom().psSoftKbdCard) {
      dom().psSoftKbdCard.style.display = visible ? "flex" : "none";
    }
    if (dom().psRecentCard) dom().psRecentCard.style.display = visible ? "none" : "flex";
    if (body) body.classList.toggle("game-play-body--kbd", !!visible);
  }

  function syncPsAnswerInputMode() {
    if (global.JmlAnswerInput && dom().psAnswerInput) {
      global.JmlAnswerInput.syncInteractionMode(dom().psAnswerInput, {
        t: t,
        inputModeWhenUnlocked: "numeric",
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
      global.JmlAnswerInput.syncPlaceholder(dom().psAnswerInput, t);
    }
  }

  function getPerfectSquareCurrentLevel() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const v = user.levelPerfectSquareCurrentLevel;
    return typeof v === "number" && Number.isFinite(v) ? Math.min(psMaxLevel(), Math.max(0, Math.floor(v))) : 0;
  }

  function getPerfectSquareStoredUnlockedMax() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const current = getPerfectSquareCurrentLevel();
    const cap = psMaxLevel() + 1;
    const stored =
      typeof user.levelPerfectSquareUnlockedMax === "number" && Number.isFinite(user.levelPerfectSquareUnlockedMax)
        ? Math.min(cap, Math.max(0, Math.floor(user.levelPerfectSquareUnlockedMax)))
        : current;
    return Math.max(current, stored);
  }

  function getPerfectSquareUnlockedMaxLevel() {
    return Math.min(psMaxLevel(), getPerfectSquareStoredUnlockedMax());
  }

  function resolvePsRunOutcome(startLevel, wrongCount, unlockedMaxBefore) {
    const R = global.JmlSpecialModeRunOutcome;
    if (!R || typeof R.resolve !== "function") {
      return {
        resultKey: "keepGoing",
        savedCurrent: startLevel,
        savedUnlockedMax: unlockedMaxBefore,
        playAgainLevel: startLevel,
      };
    }
    return R.resolve({
      startLevel: startLevel,
      wrongCount: wrongCount,
      unlockedMaxBefore: unlockedMaxBefore,
      maxLevel: psMaxLevel(),
    });
  }

  async function savePerfectSquareProgress(currentLevel, unlockedMax) {
    currentLevel = Math.min(psMaxLevel(), Math.max(0, Math.floor(Number(currentLevel) || 0)));
    unlockedMax = Math.min(psMaxLevel() + 1, Math.max(currentLevel, Math.floor(Number(unlockedMax) || 0)));
    if (inGuestMode()) return;
    const name = deps.loadCurrentUsername();
    if (!name) return;
    try {
      await deps.apiPutUser(name, {
        levelPerfectSquareCurrentLevel: currentLevel,
        levelPerfectSquareUnlockedMax: unlockedMax,
      });
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelPerfectSquareCurrentLevel = currentLevel;
        deps.getCachedUser().levelPerfectSquareUnlockedMax = unlockedMax;
      }
    } catch (e) {
      console.warn("同步平方数等级失败", e);
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelPerfectSquareCurrentLevel = currentLevel;
        deps.getCachedUser().levelPerfectSquareUnlockedMax = unlockedMax;
      }
    }
  }

  function hidePsQuestionSubtext() {
    if (!dom().psQuestionSubtext) return;
    dom().psQuestionSubtext.textContent = "";
    dom().psQuestionSubtext.style.display = "none";
  }

  function syncPsLevelTexts() {
    if (dom().psCurrentLevelName) dom().psCurrentLevelName.textContent = "L" + (psLevel + 1);
    if (dom().psLevelText) dom().psLevelText.textContent = "L" + (psLevel + 1);
    if (dom().psQuestionSubtext && dom().psStartRow && dom().psStartRow.style.display !== "none") {
      const lk = "ps.level.L" + (psLevel + 1);
      dom().psQuestionSubtext.textContent = t(lk) || "";
      dom().psQuestionSubtext.style.display = dom().psQuestionSubtext.textContent ? "" : "none";
    }
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function setPsLevelPickerVisible(visible) {
    if (dom().psLevelSelect) dom().psLevelSelect.style.display = visible ? "" : "none";
    if (dom().psCurrentLevelName) dom().psCurrentLevelName.style.display = visible ? "none" : "";
  }

  function renderPsLevelSelect() {
    if (!dom().psLevelSelect) return;
    const unlockedMax = getPerfectSquareUnlockedMaxLevel();
    if (psLevel > unlockedMax) psLevel = unlockedMax;
    const opts = [];
    for (let lv = 0; lv <= unlockedMax; lv += 1) {
      const selected = lv === psLevel ? " selected" : "";
      opts.push('<option value="' + lv + '"' + selected + ">L" + (lv + 1) + "</option>");
    }
    dom().psLevelSelect.innerHTML = opts.join("");
    dom().psLevelSelect.value = String(psLevel);
    dom().psLevelSelect.disabled = !!deps.getIsPlaying && deps.getIsPlaying();
  }

  function setPsGameCardGameOver(active) {
    const card = document.getElementById("ps-game-card");
    if (card) card.classList.toggle("game-over-active", !!active);
  }

  function setPsHistoryVisible(visible) {
    if (dom().psRecentCard) dom().psRecentCard.style.display = visible ? "flex" : "none";
  }

  function setPsGameCardLayoutMode(mode) {
    const card = document.getElementById("ps-game-card");
    if (!card) return;
    card.classList.toggle("game-card--prestart", mode === "prestart");
    card.classList.toggle("game-card--playing", mode === "playing");
  }

  function setPsPlayBodyMode(mode) {
    const body = document.getElementById("ps-play-body");
    if (!body) return;
    body.classList.toggle("run-mode-play-body--playing", mode === "playing");
  }

  function setPsCardActionSlot(mode) {
    if (mode === "start") {
      setPsGameCardLayoutMode("prestart");
      setPsPlayBodyMode("prestart");
      setPsSoftKeyboardVisible(false);
      if (dom().psAnswerForm) dom().psAnswerForm.style.display = "";
      if (dom().psStartRow) dom().psStartRow.style.display = "";
      if (dom().psAnswerInputRow) dom().psAnswerInputRow.style.display = "none";
      return;
    }
    if (mode === "playing") {
      setPsGameCardLayoutMode("playing");
      setPsPlayBodyMode("playing");
      if (dom().psAnswerForm) dom().psAnswerForm.style.display = "";
      if (dom().psStartRow) dom().psStartRow.style.display = "none";
      if (dom().psAnswerInputRow) dom().psAnswerInputRow.style.display = "";
      setPsSoftKeyboardVisible(true);
      return;
    }
    if (dom().psAnswerForm) dom().psAnswerForm.style.display = "none";
    if (dom().psStartRow) dom().psStartRow.style.display = "none";
    setPsSoftKeyboardVisible(false);
  }

  function startPsTimer() {
    psStartTs = Date.now();
    if (psTimerId) clearInterval(psTimerId);
    psTimerId = setInterval(function () {
      const sec = Math.floor((Date.now() - psStartTs) / 1000);
      if (dom().psTimerValue) dom().psTimerValue.textContent = formatElapsedSec(sec);
    }, 250);
  }

  function stopPsTimer() {
    if (psTimerId) clearInterval(psTimerId);
    psTimerId = null;
  }

  function renderPsRecentRunsTable(runs) {
    if (!dom().psHistoryBody || !dom().psHistoryEmpty) return;
    const list = Array.isArray(runs) ? runs.slice(0, 10) : [];
    dom().psHistoryBody.innerHTML = "";
    if (!list.length) {
      dom().psHistoryEmpty.style.display = "block";
      return;
    }
    dom().psHistoryEmpty.style.display = "none";
    dom().psHistoryBody.innerHTML = list
      .map(function (r) {
        const ts = r && r.ts ? new Date(r.ts) : null;
        const dt =
          ts && !Number.isNaN(ts.getTime())
            ? String(ts.getMonth() + 1).padStart(2, "0") +
              "-" +
              String(ts.getDate()).padStart(2, "0") +
              " " +
              String(ts.getHours()).padStart(2, "0") +
              ":" +
              String(ts.getMinutes()).padStart(2, "0")
            : "-";
        const sec = Number(r && r.survivalTimeSec) || 0;
        const time = sec ? deps.formatCompactRunTime(sec) : "-";
        const wrong = Number(r && r.wrongCount) || 0;
        const lvl = Number(r && r.maxLevel);
        const lvText = Number.isFinite(lvl) ? "L" + (Math.max(0, Math.floor(lvl)) + 1) : "-";
        return (
          "<tr>" +
          '<td style="white-space:nowrap;">' +
          deps.escapeHtml(dt) +
          "</td>" +
          '<td style="white-space:nowrap;text-align:center;">' +
          deps.escapeHtml(time) +
          "</td>" +
          '<td style="text-align:center;">' +
          wrong +
          "</td>" +
          '<td style="white-space:nowrap;text-align:center;">' +
          deps.escapeHtml(lvText) +
          "</td></tr>"
        );
      })
      .join("");
  }

  async function renderPerfectSquareRecentRuns() {
    const user = deps.getCurrentUser();
    if (!user) {
      renderPsRecentRunsTable([]);
      return;
    }
    deps.ensureUserProgressDefault(user);
    const runs = Array.isArray(user.recentPerfectSquareRuns) ? user.recentPerfectSquareRuns : [];
    renderPsRecentRunsTable(runs);
  }

  function showPerfectSquarePrestart(opts) {
    opts = opts || {};
    const keepLevel = opts.keepLevel === true;
    if (!keepLevel) {
      psLevel = Math.min(Math.max(getPerfectSquareCurrentLevel(), 0), psMaxLevel());
    } else {
      psLevel = Math.min(
        Math.max(typeof psPrestartLevel === "number" ? psPrestartLevel : psLevel, 0),
        psMaxLevel()
      );
    }
    deps.setGameOver(false);
    deps.setIsPlaying(false);
    psMastered = 0;
    psWrongCount = 0;
    psScore = 0;
    psAttempts = [];
    psRunDeck = [];
    psCurrent = null;
    psInputLocked = false;
    psStartTs = 0;
    stopPsTimer();
    setPsFeedback("", null);

    if (dom().psTimerValue) dom().psTimerValue.textContent = "0:00";
    renderPsLevelSelect();
    if (dom().psLevelSelect) dom().psLevelSelect.disabled = false;
    setPsLevelPickerVisible(true);
    if (dom().psProgressText) dom().psProgressText.textContent = formatPsProgress();
    if (dom().psScoreText) dom().psScoreText.textContent = "0";
    if (dom().psWrongText) dom().psWrongText.textContent = "0";
    if (dom().psAnswerInput) {
      dom().psAnswerInput.value = "";
      dom().psAnswerInput.disabled = false;
    }

    if (dom().psQuestionText) {
      dom().psQuestionText.textContent = t("ps.subtitle");
      dom().psQuestionText.classList.add("rule-hint");
      dom().psQuestionText.style.display = "";
    }
    syncPsLevelTexts();
    if (dom().psGameOverPanel) dom().psGameOverPanel.style.display = "none";
    setPsGameCardGameOver(false);
    setPsCardActionSlot("start");
    if (dom().psPlayAgainBtn) dom().psPlayAgainBtn.style.display = "none";
    setPsHistoryVisible(true);
    renderPerfectSquareRecentRuns();
    deps.updateGlobalBackButtonState();
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function nextPsQuestion() {
    if (psMastered >= psMasterTarget()) {
      void endPerfectSquareGame();
      return;
    }
    psCurrent = materializePsQueueHead();
    if (!psCurrent) {
      void endPerfectSquareGame();
      return;
    }
    psQuestionShownAt = Date.now();
    if (dom().psQuestionText) {
      dom().psQuestionText.style.display = "";
      dom().psQuestionText.textContent = psCurrent.prompt || psCurrent.text || "";
      dom().psQuestionText.classList.remove("rule-hint");
    }
    hidePsQuestionSubtext();
    if (dom().psProgressText) {
      dom().psProgressText.textContent = formatPsProgress();
    }
    if (dom().psAnswerInput) {
      dom().psAnswerInput.value = "";
      dom().psAnswerInput.disabled = false;
    }
    psInputLocked = false;
    setPsFeedback("", null);
  }

  function evaluatePsAnswer(userAnswer) {
    if (!psCurrent || psInputLocked) return;
    psInputLocked = true;
    if (dom().psAnswerInput) dom().psAnswerInput.disabled = true;
    const timeSpentMs = psQuestionShownAt ? Date.now() - psQuestionShownAt : 0;
    const correct = userAnswer === psCurrent.answer;
    psAttempts.push({ levelIndex: psLevel, correct: correct, timeSpentMs: timeSpentMs });
    const card = psRunDeck[0];

    if (correct) {
      psRunDeck.shift();
      psMastered += 1;
      psScore += PS_SCORE_PER_CORRECT;
      if (dom().psScoreText) dom().psScoreText.textContent = String(psScore);
      if (dom().psProgressText) dom().psProgressText.textContent = formatPsProgress();
      setPsFeedback(t("game.feedback.correctSurvival"), "correct");
      setTimeout(function () {
        if (psMastered >= psMasterTarget()) {
          void endPerfectSquareGame();
        } else {
          nextPsQuestion();
        }
      }, 350);
      return;
    }

    psWrongCount += 1;
    if (dom().psWrongText) dom().psWrongText.textContent = String(psWrongCount);
    deps.recordWrongAnswer(psCurrent.text || psCurrent.prompt, psCurrent.answer, userAnswer, psLevel, "perfectSquare");
    setPsFeedback(
      t("game.feedback.incorrectPrefixHtml") +
        t("game.feedback.correctAnswerLabel") +
        "<strong>" +
        psCurrent.answer +
        "</strong>",
      "incorrect"
    );
    setTimeout(function () {
      if (card) {
        psRunDeck.shift();
        psRequeueWrongCard(card);
      }
      psInputLocked = false;
      if (psMastered >= psMasterTarget()) {
        void endPerfectSquareGame();
      } else {
        nextPsQuestion();
      }
    }, 650);
  }

  function handlePsSubmit() {
    if (deps.getGameMode() !== "perfectSquare") return;
    if (!deps.getIsPlaying() || deps.getGameOver() || !psCurrent) return;
    const input = dom().psAnswerInput;
    if (!input) return;
    const value = input.value.trim();
    if (value === "") {
      setPsFeedback(t("game.feedback.titleHtml") + t("game.feedback.needAnswer"), null);
      return;
    }
    const userAnswer = Number(value);
    if (!Number.isFinite(userAnswer) || !Number.isInteger(userAnswer)) {
      setPsFeedback(t("game.feedback.titleHtml") + t("game.feedback.invalidNumber"), null);
      return;
    }
    input.value = "";
    evaluatePsAnswer(userAnswer);
  }

  function startPerfectSquareGame() {
    if (deps.getGameMode() !== "perfectSquare") return;
    if (dom().psLevelSelect && dom().psLevelSelect.value !== "") {
      const picked = Number(dom().psLevelSelect.value);
      if (Number.isFinite(picked)) psLevel = Math.max(0, Math.min(psMaxLevel(), Math.floor(picked)));
    }
    psRunStartLevel = psLevel;
    psUnlockedMaxBeforeRun = getPerfectSquareStoredUnlockedMax();
    setPsGameCardGameOver(false);
    deps.setIsPlaying(true);
    deps.setGameOver(false);
    psMastered = 0;
    psWrongCount = 0;
    psScore = 0;
    psAttempts = [];
    psRunDeck = buildRunForLevel(psLevel);
    psCurrent = null;
    psInputLocked = false;

    if (dom().psGameOverPanel) dom().psGameOverPanel.style.display = "none";
    if (dom().psLevelSelect) dom().psLevelSelect.disabled = true;
    setPsLevelPickerVisible(false);
    syncPsLevelTexts();
    if (dom().psProgressText) dom().psProgressText.textContent = formatPsProgress();
    if (dom().psScoreText) dom().psScoreText.textContent = "0";
    if (dom().psWrongText) dom().psWrongText.textContent = "0";
    setPsHistoryVisible(false);
    setPsCardActionSlot("playing");
    startPsTimer();
    deps.updateGlobalBackButtonState();
    nextPsQuestion();
  }

  async function endPerfectSquareGame() {
    if (deps.getGameMode() !== "perfectSquare") return;
    deps.setIsPlaying(false);
    stopPsTimer();
    const durationSec = Math.floor((Date.now() - (psStartTs || Date.now())) / 1000);
    const startLevel = psRunStartLevel;
    const outcome = resolvePsRunOutcome(startLevel, psWrongCount, psUnlockedMaxBeforeRun);
    psPrestartLevel = outcome.playAgainLevel;
    psLevel = outcome.playAgainLevel;

    await deps.appendRun(durationSec, psScore, startLevel, psWrongCount, "perfectSquare", psAttempts.slice());
    savePerfectSquareProgress(outcome.savedCurrent, outcome.savedUnlockedMax);

    setPsSoftKeyboardVisible(false);
    setPsGameCardGameOver(true);
    if (dom().psQuestionText) {
      dom().psQuestionText.textContent = "";
      dom().psQuestionText.style.display = "none";
    }
    hidePsQuestionSubtext();
    if (dom().psGameOverPanel) dom().psGameOverPanel.style.display = "";
    if (dom().psGameOverTitle) dom().psGameOverTitle.textContent = t("expand.end.title");
    if (dom().psGoDurationLabel) dom().psGoDurationLabel.textContent = t("expand.end.time");
    if (dom().psGoDuration) dom().psGoDuration.textContent = deps.formatCompactRunTime(durationSec);
    if (dom().psGoScoreLabel) dom().psGoScoreLabel.textContent = t("expand.end.level");
    if (dom().psGoScore) dom().psGoScore.textContent = "L" + (startLevel + 1);
    if (dom().psGoWrongLabel) dom().psGoWrongLabel.textContent = t("expand.end.wrong");
    if (dom().psGoWrong) dom().psGoWrong.textContent = String(psWrongCount);
    if (dom().psGoResultLabel) dom().psGoResultLabel.textContent = t("expand.end.result");
    if (dom().psGoResult) {
      dom().psGoResult.textContent = t("expand.result." + outcome.resultKey);
    }
    if (dom().psPlayAgainBtn) dom().psPlayAgainBtn.style.display = "";
    if (deps.getCachedUser()) {
      deps.getCachedUser().levelPerfectSquareCurrentLevel = outcome.savedCurrent;
      deps.getCachedUser().levelPerfectSquareUnlockedMax = outcome.savedUnlockedMax;
    }
    renderPsLevelSelect();
    syncPsLevelTexts();
    setPsHistoryVisible(true);
    renderPerfectSquareRecentRuns();
    deps.setGameOver(true);
    deps.updateGlobalBackButtonState();
  }

  function abandonPerfectSquareGame() {
    if (deps.getGameMode() !== "perfectSquare") return;
    const durationSec = Math.floor((Date.now() - (psStartTs || Date.now())) / 1000);
    void deps.appendRun(durationSec, 0, psRunStartLevel, psWrongCount, "perfectSquare", psAttempts.slice(), false, true);
    deps.setIsPlaying(false);
    deps.setGameOver(true);
    stopPsTimer();
    setPsFeedback("", null);
    setPsSoftKeyboardVisible(false);
    setPsGameCardGameOver(true);
    if (dom().psQuestionText) {
      dom().psQuestionText.textContent = "";
      dom().psQuestionText.style.display = "none";
    }
    hidePsQuestionSubtext();
    setPsHistoryVisible(true);
    if (dom().psGameOverPanel) dom().psGameOverPanel.style.display = "";
    if (dom().psGameOverTitle) dom().psGameOverTitle.textContent = t("expand.end.title");
    if (dom().psGoDurationLabel) dom().psGoDurationLabel.textContent = t("expand.end.time");
    if (dom().psGoDuration) dom().psGoDuration.textContent = "-";
    if (dom().psGoScoreLabel) dom().psGoScoreLabel.textContent = t("expand.end.level");
    if (dom().psGoScore) dom().psGoScore.textContent = "L" + (psLevel + 1);
    if (dom().psGoWrongLabel) dom().psGoWrongLabel.textContent = t("expand.end.wrong");
    if (dom().psGoWrong) dom().psGoWrong.textContent = String(psWrongCount);
    if (dom().psGoResultLabel) dom().psGoResultLabel.textContent = t("expand.end.result");
    if (dom().psGoResult) dom().psGoResult.textContent = t("expand.go.abandoned");
    if (dom().psPlayAgainBtn) dom().psPlayAgainBtn.style.display = "";
    deps.updateGlobalBackButtonState();
    renderPerfectSquareRecentRuns();
  }

  function hidePerfectSquareSection() {
    const sec = document.getElementById("perfect-square-section");
    if (sec) {
      sec.style.display = "none";
      sec.classList.remove("visible");
    }
    stopPsTimer();
    setPsSoftKeyboardVisible(false);
  }

  function showPerfectSquareSection() {
    deps.setTopActionsVisible(false);
    if (dom().homeSection) dom().homeSection.classList.add("hidden");
    if (dom().gameSection) dom().gameSection.classList.remove("visible");
    if (dom().expandSection) {
      dom().expandSection.classList.remove("visible");
      dom().expandSection.style.display = "none";
    }
    if (dom().wrongbookSection) dom().wrongbookSection.style.display = "none";
    const statsSection = document.getElementById("stats-section");
    if (statsSection) statsSection.classList.remove("visible");
    const rankingSection = document.getElementById("ranking-section");
    if (rankingSection) rankingSection.style.display = "none";
    const primeSection = document.getElementById("prime-composite-section");
    if (primeSection) {
      primeSection.style.display = "none";
      primeSection.classList.remove("visible");
    }
    if (deps.primeCompositeResetToIdle) deps.primeCompositeResetToIdle();
    const avatarPickerSec = document.getElementById("avatar-picker-section");
    if (avatarPickerSec) avatarPickerSec.style.display = "none";
    const decSec = document.getElementById("decimal-section");
    if (decSec) {
      decSec.style.display = "none";
      decSec.classList.remove("visible");
    }
    const sec = document.getElementById("perfect-square-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    showPerfectSquarePrestart({ keepLevel: false });
    deps.updateTopTitleForCurrentView(false);
  }

  function handleModePerfectSquare() {
    if (inGuestMode()) {
      deps.showToast(t("toast.guestNeedLogin"));
      return;
    }
    deps.setGameMode("perfectSquare");
    showPerfectSquareSection();
  }

  function isPerfectSquarePlayingNow() {
    return deps.getGameMode() === "perfectSquare" && deps.getIsPlaying() && !deps.getGameOver();
  }

  function initPsSoftKeyboardIfNeeded() {
    const card = dom().psSoftKbdCard;
    const input = dom().psAnswerInput;
    if (!card || !global.JmlSoftKeyboard) return;
    global.JmlSoftKeyboard.ensureMounted(card, "integer", t);
    global.JmlSoftKeyboard.bind({
      cardEl: card,
      inputEl: input,
      onEnter: handlePsSubmit,
      layout: "integer",
      t: t,
    });
    if (input && global.JmlAnswerInput) {
      global.JmlAnswerInput.bind({
        inputEl: input,
        t: t,
        inputModeWhenUnlocked: "numeric",
        onSubmit: handlePsSubmit,
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
    }
    syncPsAnswerInputMode();
  }

  function bindEvents() {
    if (dom().psStartBtn) dom().psStartBtn.addEventListener("click", startPerfectSquareGame);
    if (dom().psPlayAgainBtn) {
      dom().psPlayAgainBtn.addEventListener("click", function () {
        showPerfectSquarePrestart({ keepLevel: true });
      });
    }
    if (dom().psLevelSelect) {
      dom().psLevelSelect.addEventListener("change", function () {
        if (deps.getIsPlaying && deps.getIsPlaying()) return;
        const v = Number(dom().psLevelSelect.value);
        if (!Number.isFinite(v)) return;
        psLevel = Math.max(0, Math.min(psMaxLevel(), Math.floor(v)));
        if (dom().psProgressText && !(deps.getIsPlaying && deps.getIsPlaying())) {
          dom().psProgressText.textContent = formatPsProgress();
        }
        syncPsLevelTexts();
      });
    }
    initPsSoftKeyboardIfNeeded();
  }

  function init(injectedDeps) {
    deps = injectedDeps;
    bindEvents();
  }

  global.JmlPerfectSquarePage = {
    init: init,
    hidePerfectSquareSection: hidePerfectSquareSection,
    showPerfectSquareSection: showPerfectSquareSection,
    handleModePerfectSquare: handleModePerfectSquare,
    isPerfectSquarePlayingNow: isPerfectSquarePlayingNow,
    abandonPerfectSquareGame: abandonPerfectSquareGame,
    renderPerfectSquareRecentRuns: renderPerfectSquareRecentRuns,
    showPerfectSquarePrestart: showPerfectSquarePrestart,
  };
})(typeof window !== "undefined" ? window : globalThis);
