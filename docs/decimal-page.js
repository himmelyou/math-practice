/**
 * 小数运算模式页面逻辑（由 docs/index.html 在 DOM 就绪后调用 JmlDecimalPage.init(deps)）
 */
(function (global) {
  const DEC_SCORE_PER_CORRECT = 5;

  let deps = null;
  let decLevel = 0;
  let decRunStartLevel = 0;
  let decUnlockedMaxBeforeRun = 0;
  let decPrestartLevel = 0;
  let decRunDeck = [];
  let decQuestionIndex = 0;
  let decWrongCount = 0;
  let decScore = 0;
  let decAttempts = [];
  let decStartTs = 0;
  let decTimerId = null;
  let decCurrent = null;
  let decQuestionShownAt = 0;
  let decInputLocked = false;

  function d() {
    return deps;
  }

  function dom() {
    return deps.dom;
  }

  function t(key) {
    return deps.t(key);
  }

  function tf(key, vars) {
    return deps.tf(key, vars);
  }

  function inGuestMode() {
    if (!deps) return false;
    return !!(typeof deps.isGuestMode === "function" ? deps.isGuestMode() : deps.isGuestMode);
  }

  function decMaxLevel() {
    const m = global.JmlDecimal && global.JmlDecimal.DECIMAL_MAX_LEVEL;
    return typeof m === "number" ? m : 5;
  }

  function decQuestionsTotal() {
    if (global.JmlDecimal && global.JmlDecimal.questionsPerRun) {
      return global.JmlDecimal.questionsPerRun(decLevel);
    }
    return 20;
  }

  function buildRunForLevel(level) {
    return global.JmlDecimal.buildRun(level, decQuestionsTotal());
  }

  function formatDecProgress(index) {
    return index + " / " + decQuestionsTotal();
  }

  function formatElapsedSec(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function setDecFeedback(message, type) {
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setFeedback(dom().decSoftKbdCard, message, type);
    }
  }

  function setDecSoftKeyboardVisible(visible) {
    const body = document.getElementById("dec-play-body");
    if (global.JmlSoftKeyboard) {
      global.JmlSoftKeyboard.setCardVisible(dom().decSoftKbdCard, visible);
    } else if (dom().decSoftKbdCard) {
      dom().decSoftKbdCard.style.display = visible ? "flex" : "none";
    }
    if (dom().decRecentCard) dom().decRecentCard.style.display = visible ? "none" : "flex";
    if (body) body.classList.toggle("game-play-body--kbd", !!visible);
  }

  function syncDecAnswerInputMode() {
    if (global.JmlAnswerInput && dom().decAnswerInput) {
      global.JmlAnswerInput.syncInteractionMode(dom().decAnswerInput, {
        t: t,
        inputModeWhenUnlocked: "decimal",
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
      global.JmlAnswerInput.syncPlaceholder(dom().decAnswerInput, t);
    }
  }

  function getDecimalCurrentLevel() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const v = user.levelDecimalCurrentLevel;
    return typeof v === "number" && Number.isFinite(v) ? Math.min(decMaxLevel(), Math.max(0, Math.floor(v))) : 0;
  }

  function getDecimalStoredUnlockedMax() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const current = getDecimalCurrentLevel();
    const cap = decMaxLevel() + 1;
    const stored =
      typeof user.levelDecimalUnlockedMax === "number" && Number.isFinite(user.levelDecimalUnlockedMax)
        ? Math.min(cap, Math.max(0, Math.floor(user.levelDecimalUnlockedMax)))
        : current;
    return Math.max(current, stored);
  }

  function getDecimalUnlockedMaxLevel() {
    return Math.min(decMaxLevel(), getDecimalStoredUnlockedMax());
  }

  function resolveDecRunOutcome(startLevel, wrongCount, unlockedMaxBefore) {
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
      maxLevel: decMaxLevel(),
    });
  }

  async function saveDecimalProgress(currentLevel, unlockedMax) {
    currentLevel = Math.min(decMaxLevel(), Math.max(0, Math.floor(Number(currentLevel) || 0)));
    unlockedMax = Math.min(decMaxLevel() + 1, Math.max(currentLevel, Math.floor(Number(unlockedMax) || 0)));
    if (inGuestMode()) return;
    const name = deps.loadCurrentUsername();
    if (!name) return;
    try {
      await deps.apiPutUser(name, {
        levelDecimalCurrentLevel: currentLevel,
        levelDecimalUnlockedMax: unlockedMax,
      });
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelDecimalCurrentLevel = currentLevel;
        deps.getCachedUser().levelDecimalUnlockedMax = unlockedMax;
      }
    } catch (e) {
      console.warn("同步小数运算等级失败", e);
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelDecimalCurrentLevel = currentLevel;
        deps.getCachedUser().levelDecimalUnlockedMax = unlockedMax;
      }
    }
  }

  function hideDecQuestionSubtext() {
    if (!dom().decQuestionSubtext) return;
    dom().decQuestionSubtext.textContent = "";
    dom().decQuestionSubtext.style.display = "none";
  }

  function syncDecLevelTexts() {
    if (dom().decCurrentLevelName) dom().decCurrentLevelName.textContent = "L" + (decLevel + 1);
    if (dom().decLevelText) dom().decLevelText.textContent = "L" + (decLevel + 1);
    if (dom().decLevelDesc && dom().decStartRow && dom().decStartRow.style.display !== "none") {
      const lk = "dec.level.L" + (decLevel + 1);
      const desc = t(lk) || "";
      dom().decLevelDesc.textContent = desc;
      dom().decLevelDesc.title = desc;
      if (dom().decLevelSelect && dom().decLevelSelect.style.display !== "none") {
        dom().decLevelDesc.style.display = desc ? "" : "none";
      }
    }
    hideDecQuestionSubtext();
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function setDecLevelPickerVisible(visible) {
    if (dom().decLevelSelect) dom().decLevelSelect.style.display = visible ? "" : "none";
    if (dom().decCurrentLevelName) dom().decCurrentLevelName.style.display = visible ? "none" : "";
    if (dom().decLevelDesc) {
      dom().decLevelDesc.style.display = visible ? "" : "none";
      if (!visible) {
        dom().decLevelDesc.textContent = "";
        dom().decLevelDesc.title = "";
      }
    }
  }

  function renderDecLevelSelect() {
    if (!dom().decLevelSelect) return;
    const unlockedMax = getDecimalUnlockedMaxLevel();
    if (decLevel > unlockedMax) decLevel = unlockedMax;
    const opts = [];
    for (let lv = 0; lv <= unlockedMax; lv += 1) {
      const selected = lv === decLevel ? " selected" : "";
      opts.push('<option value="' + lv + '"' + selected + ">L" + (lv + 1) + "</option>");
    }
    dom().decLevelSelect.innerHTML = opts.join("");
    dom().decLevelSelect.value = String(decLevel);
    dom().decLevelSelect.disabled = !!deps.getIsPlaying && deps.getIsPlaying();
  }

  function setDecGameCardGameOver(active) {
    const card = document.getElementById("dec-game-card");
    if (card) card.classList.toggle("game-over-active", !!active);
  }

  function setDecHistoryVisible(visible) {
    if (dom().decRecentCard) dom().decRecentCard.style.display = visible ? "flex" : "none";
  }

  function setDecGameCardLayoutMode(mode) {
    const card = document.getElementById("dec-game-card");
    if (!card) return;
    card.classList.toggle("game-card--prestart", mode === "prestart");
    card.classList.toggle("game-card--playing", mode === "playing");
  }

  function setDecPlayBodyMode(mode) {
    const body = document.getElementById("dec-play-body");
    if (!body) return;
    body.classList.toggle("run-mode-play-body--playing", mode === "playing");
  }

  function setDecCardActionSlot(mode) {
    if (mode === "start") {
      setDecGameCardLayoutMode("prestart");
      setDecPlayBodyMode("prestart");
      setDecSoftKeyboardVisible(false);
      if (dom().decAnswerForm) dom().decAnswerForm.style.display = "";
      if (dom().decStartRow) dom().decStartRow.style.display = "";
      if (dom().decAnswerInputRow) dom().decAnswerInputRow.style.display = "none";
      return;
    }
    if (mode === "playing") {
      setDecGameCardLayoutMode("playing");
      setDecPlayBodyMode("playing");
      if (dom().decAnswerForm) dom().decAnswerForm.style.display = "";
      if (dom().decStartRow) dom().decStartRow.style.display = "none";
      if (dom().decAnswerInputRow) dom().decAnswerInputRow.style.display = "";
      setDecSoftKeyboardVisible(true);
      return;
    }
    if (dom().decAnswerForm) dom().decAnswerForm.style.display = "none";
    if (dom().decStartRow) dom().decStartRow.style.display = "none";
    setDecSoftKeyboardVisible(false);
  }

  function startDecTimer() {
    decStartTs = Date.now();
    if (decTimerId) clearInterval(decTimerId);
    decTimerId = setInterval(function () {
      const sec = Math.floor((Date.now() - decStartTs) / 1000);
      if (dom().decTimerValue) dom().decTimerValue.textContent = formatElapsedSec(sec);
    }, 250);
  }

  function stopDecTimer() {
    if (decTimerId) clearInterval(decTimerId);
    decTimerId = null;
  }

  function renderDecRecentRunsTable(runs) {
    if (!dom().decHistoryBody || !dom().decHistoryEmpty) return;
    const list = Array.isArray(runs) ? runs.slice(0, 10) : [];
    dom().decHistoryBody.innerHTML = "";
    if (!list.length) {
      dom().decHistoryEmpty.style.display = "block";
      return;
    }
    dom().decHistoryEmpty.style.display = "none";
    dom().decHistoryBody.innerHTML = list
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

  async function renderDecimalRecentRuns() {
    const user = deps.getCurrentUser();
    if (!user) {
      renderDecRecentRunsTable([]);
      return;
    }
    deps.ensureUserProgressDefault(user);
    const runs = Array.isArray(user.recentDecimalRuns) ? user.recentDecimalRuns : [];
    renderDecRecentRunsTable(runs);
  }

  function showDecimalPrestart(opts) {
    opts = opts || {};
    const keepLevel = opts.keepLevel === true;
    if (!keepLevel) {
      decLevel = Math.min(Math.max(getDecimalCurrentLevel(), 0), decMaxLevel());
    } else {
      decLevel = Math.min(
        Math.max(typeof decPrestartLevel === "number" ? decPrestartLevel : decLevel, 0),
        decMaxLevel()
      );
    }
    deps.setGameOver(false);
    deps.setIsPlaying(false);
    decQuestionIndex = 0;
    decWrongCount = 0;
    decScore = 0;
    decAttempts = [];
    decRunDeck = [];
    decCurrent = null;
    decInputLocked = false;
    decStartTs = 0;
    stopDecTimer();
    setDecFeedback("", null);

    if (dom().decTimerValue) dom().decTimerValue.textContent = "0:00";
    renderDecLevelSelect();
    if (dom().decLevelSelect) dom().decLevelSelect.disabled = false;
    setDecLevelPickerVisible(true);
    if (dom().decProgressText) dom().decProgressText.textContent = formatDecProgress(0);
    if (dom().decScoreText) dom().decScoreText.textContent = "0";
    if (dom().decWrongText) dom().decWrongText.textContent = "0";
    if (dom().decAnswerInput) {
      dom().decAnswerInput.value = "";
      dom().decAnswerInput.disabled = false;
    }

    if (dom().decQuestionText) {
      dom().decQuestionText.classList.remove("dec-question-frac");
      dom().decQuestionText.textContent = t("dec.subtitle");
      dom().decQuestionText.classList.add("rule-hint");
      dom().decQuestionText.style.display = "";
    }
    syncDecLevelTexts();
    if (dom().decGameOverPanel) dom().decGameOverPanel.style.display = "none";
    setDecGameCardGameOver(false);
    setDecCardActionSlot("start");
    if (dom().decPlayAgainBtn) dom().decPlayAgainBtn.style.display = "none";
    setDecHistoryVisible(true);
    renderDecimalRecentRuns();
    deps.updateGlobalBackButtonState();
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function escapeDecHtml(s) {
    if (deps.escapeHtml) return deps.escapeHtml(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** D4 单位分数：竖排真分数，不用斜杠 */
  function formatDecUnitFractionHtml(q) {
    var blankDenom = q && q.blankSide === "denom";
    var denText = blankDenom ? "?" : String(q && q.denom != null ? q.denom : "");
    var frac =
      '<span class="jml-frac" aria-hidden="true">' +
      '<span class="jml-frac-num">1</span>' +
      '<span class="jml-frac-bar"></span>' +
      '<span class="jml-frac-den">' +
      escapeDecHtml(denText) +
      "</span></span>";
    if (blankDenom) {
      return frac + '<span class="jml-frac-eq"> = </span><span class="jml-frac-rhs">' + escapeDecHtml(q.decimalText || "") + "</span>";
    }
    return frac + '<span class="jml-frac-eq"> = </span><span class="jml-frac-rhs">?</span>';
  }

  function renderDecQuestionPrompt(q) {
    const el = dom().decQuestionText;
    if (!el) return;
    el.style.display = "";
    el.classList.remove("rule-hint");
    if (q && q.displayKind === "unitFraction") {
      el.classList.add("dec-question-frac");
      el.innerHTML = formatDecUnitFractionHtml(q);
      return;
    }
    el.classList.remove("dec-question-frac");
    el.textContent = (q && (q.prompt || q.text)) || "";
  }

  function nextDecQuestion() {
    const total = decQuestionsTotal();
    if (decQuestionIndex >= total) {
      void endDecimalGame();
      return;
    }
    decCurrent = decRunDeck[decQuestionIndex] || null;
    if (!decCurrent) {
      void endDecimalGame();
      return;
    }
    decQuestionShownAt = Date.now();
    renderDecQuestionPrompt(decCurrent);
    hideDecQuestionSubtext();
    if (dom().decProgressText) {
      dom().decProgressText.textContent = formatDecProgress(decQuestionIndex + 1);
    }
    if (dom().decAnswerInput) {
      dom().decAnswerInput.value = "";
      dom().decAnswerInput.disabled = false;
    }
    decInputLocked = false;
    setDecFeedback("", null);
  }

  function advanceDecAfterAnswer() {
    decQuestionIndex += 1;
    if (decQuestionIndex >= decQuestionsTotal()) {
      void endDecimalGame();
      return;
    }
    nextDecQuestion();
  }

  function decimalAnswersEqual(userVal, expected) {
    const exp = parseFloat(String(expected));
    if (!Number.isFinite(exp) || !Number.isFinite(userVal)) return false;
    return Math.abs(userVal - exp) < 1e-6;
  }

  function evaluateDecAnswer(userAnswer) {
    if (!decCurrent || decInputLocked) return;
    decInputLocked = true;
    if (dom().decAnswerInput) dom().decAnswerInput.disabled = true;
    const timeSpentMs = decQuestionShownAt ? Date.now() - decQuestionShownAt : 0;
    const correct = decimalAnswersEqual(userAnswer, decCurrent.answer);
    decAttempts.push({ levelIndex: decLevel, correct: correct, timeSpentMs: timeSpentMs });

    if (correct) {
      decScore += DEC_SCORE_PER_CORRECT;
      if (dom().decScoreText) dom().decScoreText.textContent = String(decScore);
      setDecFeedback(t("game.feedback.correctSurvival"), "correct");
      setTimeout(function () {
        advanceDecAfterAnswer();
      }, 350);
      return;
    }

    decWrongCount += 1;
    if (dom().decWrongText) dom().decWrongText.textContent = String(decWrongCount);
    deps.recordWrongAnswer(decCurrent.text || decCurrent.prompt, decCurrent.answer, userAnswer, decLevel, "decimal");
    setDecFeedback(
      t("game.feedback.incorrectPrefixHtml") +
        t("game.feedback.correctAnswerLabel") +
        "<strong>" +
        decCurrent.answer +
        "</strong>",
      "incorrect"
    );
    setTimeout(function () {
      advanceDecAfterAnswer();
    }, 650);
  }

  function handleDecSubmit() {
    if (deps.getGameMode() !== "decimal") return;
    if (!deps.getIsPlaying() || deps.getGameOver() || !decCurrent) return;
    const input = dom().decAnswerInput;
    if (!input) return;
    const value = input.value.trim();
    if (value === "") {
      setDecFeedback(t("game.feedback.titleHtml") + t("game.feedback.needAnswer"), null);
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      setDecFeedback(t("game.feedback.titleHtml") + t("game.feedback.invalidNumber"), null);
      return;
    }
    const userAnswer = parseFloat(value);
    if (!Number.isFinite(userAnswer)) {
      setDecFeedback(t("game.feedback.titleHtml") + t("game.feedback.invalidNumber"), null);
      return;
    }
    input.value = "";
    evaluateDecAnswer(userAnswer);
  }

  function startDecimalGame() {
    if (deps.getGameMode() !== "decimal") return;
    if (dom().decLevelSelect && dom().decLevelSelect.value !== "") {
      const picked = Number(dom().decLevelSelect.value);
      if (Number.isFinite(picked)) decLevel = Math.max(0, Math.min(decMaxLevel(), Math.floor(picked)));
    }
    decRunStartLevel = decLevel;
    decUnlockedMaxBeforeRun = getDecimalStoredUnlockedMax();
    setDecGameCardGameOver(false);
    deps.setIsPlaying(true);
    deps.setGameOver(false);
    decQuestionIndex = 0;
    decWrongCount = 0;
    decScore = 0;
    decAttempts = [];
    decRunDeck = buildRunForLevel(decLevel);
    decCurrent = null;
    decInputLocked = false;

    if (dom().decGameOverPanel) dom().decGameOverPanel.style.display = "none";
    if (dom().decLevelSelect) dom().decLevelSelect.disabled = true;
    setDecLevelPickerVisible(false);
    syncDecLevelTexts();
    if (dom().decProgressText) dom().decProgressText.textContent = formatDecProgress(0);
    if (dom().decScoreText) dom().decScoreText.textContent = "0";
    if (dom().decWrongText) dom().decWrongText.textContent = "0";
    setDecHistoryVisible(false);
    setDecCardActionSlot("playing");
    startDecTimer();
    deps.updateGlobalBackButtonState();
    nextDecQuestion();
  }

  async function fetchDecimalRunsForHeat() {
    if (typeof deps.fetchUserRuns === "function") {
      try {
        return await deps.fetchUserRuns();
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  async function fetchDecimalCohortForHeat() {
    if (typeof deps.fetchDecimalCohort === "function") {
      try {
        return await deps.fetchDecimalCohort();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * 非前沿 0 错：在已解锁关里按加权正确率刷选（有 p 才参与）。
   * @returns {number|null} levelIndex
   */
  async function pickDecimalBrushLevel(unlockedPoolMax) {
    const HM = global.JmlStatsHeatmap;
    if (!HM || typeof HM.buildHeatmapCells !== "function" || typeof HM.recommendUnlockedWeightedBrush !== "function") {
      return null;
    }
    const cat = HM.getHeatmapCategory ? HM.getHeatmapCategory("decimal") : null;
    const levelCount = cat && cat.levelCount > 0 ? cat.levelCount : 5;
    const modes = cat && cat.modes ? cat.modes : ["decimal"];
    const poolMax = Math.max(
      0,
      Math.min(decMaxLevel(), levelCount - 1, Math.floor(Number(unlockedPoolMax) || 0))
    );
    const [runs, cohort] = await Promise.all([fetchDecimalRunsForHeat(), fetchDecimalCohortForHeat()]);
    const capMs = cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : 60 * 1000;
    const heat = HM.buildHeatmapCells({
      runs: runs || [],
      cohort: cohort && cohort.ok ? cohort : null,
      modes: modes,
      levelCount: levelCount,
      maxTimeSpentMs: capMs,
    });
    const pick = HM.recommendUnlockedWeightedBrush(heat, poolMax);
    if (!pick || pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) return null;
    return Math.max(0, Math.min(poolMax, Math.floor(Number(pick.levelIndex))));
  }

  async function endDecimalGame() {
    if (deps.getGameMode() !== "decimal") return;
    deps.setIsPlaying(false);
    stopDecTimer();
    const durationSec = Math.floor((Date.now() - (decStartTs || Date.now())) / 1000);
    const startLevel = decRunStartLevel;
    let outcome = resolveDecRunOutcome(startLevel, decWrongCount, decUnlockedMaxBeforeRun);

    // 先入库，再用含本局的 attempts 建小数热图
    // 非前沿（perfect / keepGoing）：不新开关时，再玩关与默认关都走刷选型热图
    // 前沿 unlockNew 不动（0 错进下一关 / 1 错留本关并解锁）
    await deps.appendRun(durationSec, decScore, startLevel, decWrongCount, "decimal", decAttempts.slice());

    if (outcome.resultKey === "perfect" || outcome.resultKey === "keepGoing") {
      const poolCap = Math.min(decMaxLevel(), Math.floor(Number(outcome.savedUnlockedMax) || 0));
      let brushLv = null;
      try {
        brushLv = await pickDecimalBrushLevel(poolCap);
      } catch (e) {
        console.warn("小数刷选型选关失败，留在本关", e);
      }
      outcome = Object.assign({}, outcome, {
        playAgainLevel: brushLv != null ? brushLv : startLevel,
        savedCurrent: brushLv != null ? brushLv : startLevel,
      });
    }

    decPrestartLevel = outcome.playAgainLevel;
    decLevel = outcome.playAgainLevel;

    saveDecimalProgress(outcome.savedCurrent, outcome.savedUnlockedMax);

    setDecSoftKeyboardVisible(false);
    setDecGameCardGameOver(true);
    if (dom().decQuestionText) {
      dom().decQuestionText.classList.remove("dec-question-frac");
      dom().decQuestionText.textContent = "";
      dom().decQuestionText.style.display = "none";
    }
    hideDecQuestionSubtext();
    if (dom().decGameOverPanel) dom().decGameOverPanel.style.display = "";
    if (dom().decGameOverTitle) dom().decGameOverTitle.textContent = t("expand.end.title");
    if (dom().decGoDurationLabel) dom().decGoDurationLabel.textContent = t("expand.end.time");
    if (dom().decGoDuration) dom().decGoDuration.textContent = deps.formatCompactRunTime(durationSec);
    if (dom().decGoScoreLabel) dom().decGoScoreLabel.textContent = t("expand.end.level");
    if (dom().decGoScore) dom().decGoScore.textContent = "L" + (startLevel + 1);
    if (dom().decGoWrongLabel) dom().decGoWrongLabel.textContent = t("expand.end.wrong");
    if (dom().decGoWrong) dom().decGoWrong.textContent = String(decWrongCount);
    if (dom().decGoResultLabel) dom().decGoResultLabel.textContent = t("expand.end.result");
    if (dom().decGoResult) {
      dom().decGoResult.textContent = t("expand.result." + outcome.resultKey);
    }
    if (dom().decPlayAgainBtn) dom().decPlayAgainBtn.style.display = "";
    if (deps.getCachedUser()) {
      deps.getCachedUser().levelDecimalCurrentLevel = outcome.savedCurrent;
      deps.getCachedUser().levelDecimalUnlockedMax = outcome.savedUnlockedMax;
    }
    renderDecLevelSelect();
    syncDecLevelTexts();
    setDecHistoryVisible(true);
    renderDecimalRecentRuns();
    deps.setGameOver(true);
    deps.updateGlobalBackButtonState();
  }

  function abandonDecimalGame() {
    if (deps.getGameMode() !== "decimal") return;
    const durationSec = Math.floor((Date.now() - (decStartTs || Date.now())) / 1000);
    void deps.appendRun(durationSec, 0, decRunStartLevel, decWrongCount, "decimal", decAttempts.slice(), false, true);
    deps.setIsPlaying(false);
    deps.setGameOver(true);
    stopDecTimer();
    setDecFeedback("", null);
    setDecSoftKeyboardVisible(false);
    setDecGameCardGameOver(true);
    if (dom().decQuestionText) {
      dom().decQuestionText.classList.remove("dec-question-frac");
      dom().decQuestionText.textContent = "";
      dom().decQuestionText.style.display = "none";
    }
    hideDecQuestionSubtext();
    setDecHistoryVisible(true);
    if (dom().decGameOverPanel) dom().decGameOverPanel.style.display = "";
    if (dom().decGameOverTitle) dom().decGameOverTitle.textContent = t("expand.end.title");
    if (dom().decGoDurationLabel) dom().decGoDurationLabel.textContent = t("expand.end.time");
    if (dom().decGoDuration) dom().decGoDuration.textContent = "-";
    if (dom().decGoScoreLabel) dom().decGoScoreLabel.textContent = t("expand.end.level");
    if (dom().decGoScore) dom().decGoScore.textContent = "L" + (decLevel + 1);
    if (dom().decGoWrongLabel) dom().decGoWrongLabel.textContent = t("expand.end.wrong");
    if (dom().decGoWrong) dom().decGoWrong.textContent = String(decWrongCount);
    if (dom().decGoResultLabel) dom().decGoResultLabel.textContent = t("expand.end.result");
    if (dom().decGoResult) dom().decGoResult.textContent = t("expand.go.abandoned");
    if (dom().decPlayAgainBtn) dom().decPlayAgainBtn.style.display = "";
    deps.updateGlobalBackButtonState();
    renderDecimalRecentRuns();
  }

  function hideDecimalSection() {
    const sec = document.getElementById("decimal-section");
    if (sec) {
      sec.style.display = "none";
      sec.classList.remove("visible");
    }
    stopDecTimer();
    setDecSoftKeyboardVisible(false);
  }

  function showDecimalSection() {
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
    const psSec = document.getElementById("perfect-square-section");
    if (psSec) {
      psSec.style.display = "none";
      psSec.classList.remove("visible");
    }
    const divSec = document.getElementById("divisibility-section");
    if (divSec) {
      divSec.style.display = "none";
      divSec.classList.remove("visible");
    }
    const sec = document.getElementById("decimal-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    showDecimalPrestart({ keepLevel: false });
    deps.updateTopTitleForCurrentView(false);
  }

  function handleModeDecimal() {
    if (inGuestMode()) {
      deps.showToast(t("toast.guestNeedLogin"));
      return;
    }
    deps.setGameMode("decimal");
    showDecimalSection();
  }

  function isDecimalPlayingNow() {
    return deps.getGameMode() === "decimal" && deps.getIsPlaying() && !deps.getGameOver();
  }

  function initDecSoftKeyboardIfNeeded() {
    const card = dom().decSoftKbdCard;
    const input = dom().decAnswerInput;
    if (!card || !global.JmlSoftKeyboard) return;
    global.JmlSoftKeyboard.ensureMounted(card, "decimal", t);
    global.JmlSoftKeyboard.bind({
      cardEl: card,
      inputEl: input,
      onEnter: handleDecSubmit,
      layout: "decimal",
      t: t,
    });
    if (input && global.JmlAnswerInput) {
      global.JmlAnswerInput.bind({
        inputEl: input,
        t: t,
        inputModeWhenUnlocked: "decimal",
        onSubmit: handleDecSubmit,
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
    }
    syncDecAnswerInputMode();
  }

  function bindEvents() {
    if (dom().decStartBtn) dom().decStartBtn.addEventListener("click", startDecimalGame);
    if (dom().decPlayAgainBtn) {
      dom().decPlayAgainBtn.addEventListener("click", function () {
        showDecimalPrestart({ keepLevel: true });
      });
    }
    if (dom().decLevelSelect) {
      dom().decLevelSelect.addEventListener("change", function () {
        if (deps.getIsPlaying && deps.getIsPlaying()) return;
        const v = Number(dom().decLevelSelect.value);
        if (!Number.isFinite(v)) return;
        decLevel = Math.max(0, Math.min(decMaxLevel(), Math.floor(v)));
        if (dom().decProgressText && !(deps.getIsPlaying && deps.getIsPlaying())) {
          dom().decProgressText.textContent = formatDecProgress(0);
        }
        syncDecLevelTexts();
      });
    }
    initDecSoftKeyboardIfNeeded();
  }

  function init(injectedDeps) {
    deps = injectedDeps;
    bindEvents();
  }

  global.JmlDecimalPage = {
    init: init,
    hideDecimalSection: hideDecimalSection,
    showDecimalSection: showDecimalSection,
    handleModeDecimal: handleModeDecimal,
    isDecimalPlayingNow: isDecimalPlayingNow,
    abandonDecimalGame: abandonDecimalGame,
    renderDecimalRecentRuns: renderDecimalRecentRuns,
    showDecimalPrestart: showDecimalPrestart,
  };
})(typeof window !== "undefined" ? window : globalThis);
