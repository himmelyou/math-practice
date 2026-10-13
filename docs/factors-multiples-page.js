/**
 * 因数倍数模式：Y1–Y2 双选项；Y3–Y6 整数填空 + 软键盘。
 * 24 题/局，错题不回库；升降级走 JmlSpecialModeRunOutcome。
 */
(function (global) {
  const FM_SCORE_PER_CORRECT = 5;
  const FM_SCORE_PER_WRONG = 5;

  let deps = null;
  let fmLevel = 0;
  let fmRunStartLevel = 0;
  let fmUnlockedMaxBeforeRun = 0;
  let fmPrestartLevel = 0;
  let fmRunDeck = [];
  let fmAnswered = 0;
  let fmWrongCount = 0;
  let fmScore = 0;
  let fmAttempts = [];
  let fmWrongItems = [];
  let fmStartTs = 0;
  let fmTimerId = null;
  let fmFeedbackTimerId = null;
  let fmCurrent = null;
  let fmChoicesLocked = false;
  let fmFillSubmitLocked = false;
  let fmQuestionShownAt = 0;
  function dom() {
    return deps.dom;
  }

  function t(key) {
    return deps.t(key);
  }

  function tf(key, params) {
    if (deps.tf) return deps.tf(key, params);
    return t(key);
  }

  function inGuestMode() {
    if (!deps) return false;
    return !!(typeof deps.isGuestMode === "function" ? deps.isGuestMode() : deps.isGuestMode);
  }

  function fmMaxLevel() {
    const bank = global.JmlFactorsMultiples;
    if (bank && typeof bank.FM_MAX_LEVEL === "number" && Number.isFinite(bank.FM_MAX_LEVEL)) {
      return bank.FM_MAX_LEVEL;
    }
    const lc = bank && bank.LEVEL_COUNT;
    if (typeof lc === "number" && Number.isFinite(lc) && lc > 0) {
      return lc - 1;
    }
    return 5;
  }

  function questionsPerRun(level) {
    const bank = global.JmlFactorsMultiples;
    if (bank && typeof bank.questionsPerRun === "function") {
      return bank.questionsPerRun(level);
    }
    const qpr = bank && bank.QUESTIONS_PER_RUN;
    if (typeof qpr === "number" && Number.isFinite(qpr)) return qpr;
    return 24;
  }

  function buildRunForLevel(level) {
    return global.JmlFactorsMultiples.buildRun(level);
  }

  function isFmFillInQuestion(q) {
    if (q && q.fillIn === true) return true;
    return fmRunStartLevel >= 2;
  }

  function formatElapsedSec(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function formatFmProgress() {
    return fmAnswered + " / " + questionsPerRun(fmLevel);
  }

  function levelLabel(levelIndex) {
    return "L" + (Math.max(0, Math.floor(Number(levelIndex) || 0)) + 1);
  }

  function getFactorsMultiplesCurrentLevel() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const v = user.levelFactorsMultiplesCurrentLevel;
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(fmMaxLevel(), Math.max(0, Math.floor(v)))
      : 0;
  }

  function getFactorsMultiplesStoredUnlockedMax() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const current = getFactorsMultiplesCurrentLevel();
    const cap = fmMaxLevel() + 1;
    const stored =
      typeof user.levelFactorsMultiplesUnlockedMax === "number" &&
      Number.isFinite(user.levelFactorsMultiplesUnlockedMax)
        ? Math.min(cap, Math.max(0, Math.floor(user.levelFactorsMultiplesUnlockedMax)))
        : current;
    return Math.max(current, stored);
  }

  function getFactorsMultiplesUnlockedMaxLevel() {
    return Math.min(fmMaxLevel(), getFactorsMultiplesStoredUnlockedMax());
  }

  function resolveFmRunOutcome(startLevel, wrongCount, unlockedMaxBefore) {
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
      maxLevel: fmMaxLevel(),
    });
  }

  async function saveFactorsMultiplesProgress(currentLevel, unlockedMax) {
    currentLevel = Math.min(fmMaxLevel(), Math.max(0, Math.floor(Number(currentLevel) || 0)));
    unlockedMax = Math.min(
      fmMaxLevel() + 1,
      Math.max(currentLevel, Math.floor(Number(unlockedMax) || 0))
    );
    if (inGuestMode()) return;
    const name = deps.loadCurrentUsername();
    if (!name) return;
    try {
      await deps.apiPutUser(name, {
        levelFactorsMultiplesCurrentLevel: currentLevel,
        levelFactorsMultiplesUnlockedMax: unlockedMax,
      });
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelFactorsMultiplesCurrentLevel = currentLevel;
        deps.getCachedUser().levelFactorsMultiplesUnlockedMax = unlockedMax;
      }
    } catch (e) {
      console.warn("同步因数倍数等级失败", e);
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelFactorsMultiplesCurrentLevel = currentLevel;
        deps.getCachedUser().levelFactorsMultiplesUnlockedMax = unlockedMax;
      }
    }
  }

  function syncFmLevelTexts() {
    const label = levelLabel(fmLevel);
    if (dom().fmLevelText) dom().fmLevelText.textContent = label;
    if (dom().fmCurrentLevelName) dom().fmCurrentLevelName.textContent = label;
    if (dom().fmIdleLevelName) dom().fmIdleLevelName.textContent = label;
    const lk = "fm.level.L" + (fmLevel + 1);
    const desc = t(lk) || "";
    if (dom().fmLevelDesc) {
      dom().fmLevelDesc.textContent = desc;
      dom().fmLevelDesc.title = desc;
      if (dom().fmLevelSelect && dom().fmLevelSelect.style.display !== "none") {
        dom().fmLevelDesc.style.display = desc ? "" : "none";
      }
    }
    const intro = document.getElementById("fm-idle-intro");
    if (intro && !(deps.getIsPlaying && deps.getIsPlaying())) {
      intro.textContent = t("fm.intro") || "";
    }
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function setFmLevelPickerVisible(visible) {
    if (dom().fmLevelSelect) dom().fmLevelSelect.style.display = visible ? "" : "none";
    if (dom().fmIdleLevelName) dom().fmIdleLevelName.style.display = visible ? "none" : "";
    if (dom().fmLevelDesc) {
      dom().fmLevelDesc.style.display = visible ? "" : "none";
      if (!visible) {
        dom().fmLevelDesc.textContent = "";
        dom().fmLevelDesc.title = "";
      }
    }
  }

  function renderFmLevelSelect() {
    if (!dom().fmLevelSelect) return;
    const unlockedMax = getFactorsMultiplesUnlockedMaxLevel();
    if (fmLevel > unlockedMax) fmLevel = unlockedMax;
    const opts = [];
    for (let lv = 0; lv <= unlockedMax; lv += 1) {
      const selected = lv === fmLevel ? " selected" : "";
      opts.push('<option value="' + lv + '"' + selected + ">" + levelLabel(lv) + "</option>");
    }
    dom().fmLevelSelect.innerHTML = opts.join("");
    dom().fmLevelSelect.value = String(fmLevel);
    dom().fmLevelSelect.disabled = !!deps.getIsPlaying && deps.getIsPlaying();
  }

  function setFmPanel(mode) {
    const idle = document.getElementById("fm-panel-idle");
    const playing = document.getElementById("fm-panel-playing");
    const finished = document.getElementById("fm-panel-finished");
    const playBody = document.getElementById("fm-play-body");
    if (idle) idle.style.display = mode === "idle" ? "" : "none";
    if (playing) playing.style.display = mode === "playing" ? "" : "none";
    if (finished) finished.style.display = mode === "finished" ? "" : "none";
    if (mode !== "playing") {
      if (playing) playing.classList.remove("fm-panel-playing--fill");
      if (playBody) playBody.classList.remove("fm-play-body--kbd");
      if (dom().fmSoftKbdCard) {
        if (global.JmlSoftKeyboard && typeof global.JmlSoftKeyboard.setCardVisible === "function") {
          global.JmlSoftKeyboard.setCardVisible(dom().fmSoftKbdCard, false);
        } else {
          dom().fmSoftKbdCard.style.display = "none";
        }
      }
    }
  }

  function setFmAnswerSurface(kind) {
    const choice = kind === "choice";
    const fill = !choice;
    const playBody = document.getElementById("fm-play-body");
    const panel = document.getElementById("fm-panel-playing");
    if (dom().fmGameCardChoice) {
      dom().fmGameCardChoice.style.display = choice ? "" : "none";
    }
    if (dom().fmGameCardFill) {
      dom().fmGameCardFill.style.display = fill ? "" : "none";
    }
    if (panel) panel.classList.toggle("fm-panel-playing--fill", fill);
    if (playBody) playBody.classList.toggle("fm-play-body--kbd", fill);
    if (dom().fmSoftKbdCard) {
      if (global.JmlSoftKeyboard && typeof global.JmlSoftKeyboard.setCardVisible === "function") {
        global.JmlSoftKeyboard.setCardVisible(dom().fmSoftKbdCard, fill);
      } else {
        dom().fmSoftKbdCard.style.display = fill ? "flex" : "none";
      }
    }
    if (fill && dom().fmAnswerInput) {
      dom().fmAnswerInput.value = "";
      dom().fmAnswerInput.disabled = false;
    }
    if (dom().fmHeaderHintChoice) {
      dom().fmHeaderHintChoice.textContent = t("fm.headerHintChoice") || "";
    }
    if (dom().fmHeaderHintFill) {
      dom().fmHeaderHintFill.textContent = t("fm.headerHintFill") || "";
    }
  }

  function resetFmChoiceButtons() {
    const btnA = document.getElementById("fm-btn-a");
    const btnB = document.getElementById("fm-btn-b");
    [btnA, btnB].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove("prime-choice-wrong", "div-choice-wrong", "fm-choice-wrong");
    });
    fmChoicesLocked = false;
    fmFillSubmitLocked = false;
  }

  function updateFmStatusStrip() {
    if (dom().fmProgressText) dom().fmProgressText.textContent = formatFmProgress();
    const playing = deps.getIsPlaying && deps.getIsPlaying() && !(deps.getGameOver && deps.getGameOver());
    if (dom().fmScoreText) {
      dom().fmScoreText.textContent = playing ? "--" : String(fmScore);
    }
    if (dom().fmWrongText) dom().fmWrongText.textContent = String(fmWrongCount);
    if (dom().fmLevelText) dom().fmLevelText.textContent = levelLabel(fmLevel);
    if (dom().fmElapsed) {
      const sec = fmStartTs ? Math.floor((Date.now() - fmStartTs) / 1000) : 0;
      dom().fmElapsed.textContent = formatElapsedSec(sec);
    }
    const wrongRow = document.getElementById("fm-status-row-wrong");
    if (wrongRow) {
      const finished =
        document.getElementById("fm-panel-finished") &&
        document.getElementById("fm-panel-finished").style.display !== "none";
      wrongRow.style.display = playing || finished ? "none" : "";
    }
  }

  function setFmRecentPanelMode(mode) {
    const history = mode !== "wrongReview";
    if (dom().fmHistoryWrap) dom().fmHistoryWrap.style.display = history ? "" : "none";
    if (dom().fmWrongReviewWrap) dom().fmWrongReviewWrap.style.display = history ? "none" : "";
    if (dom().fmRecentTitle) {
      dom().fmRecentTitle.textContent = history
        ? t("fm.recentTitle")
        : t("fm.wrongReviewTitle");
    }
  }

  function showFmRecentHistory() {
    setFmRecentPanelMode("history");
    void renderFactorsMultiplesRecentRuns();
  }

  function renderFmRecentRunsTable(runs) {
    if (!dom().fmHistoryBody || !dom().fmHistoryEmpty) return;
    setFmRecentPanelMode("history");
    const list = Array.isArray(runs) ? runs.slice(0, 10) : [];
    dom().fmHistoryBody.innerHTML = "";
    if (!list.length) {
      dom().fmHistoryEmpty.style.display = "block";
      return;
    }
    dom().fmHistoryEmpty.style.display = "none";
    dom().fmHistoryBody.innerHTML = list
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
        const lvText = Number.isFinite(lvl) ? levelLabel(lvl) : "-";
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

  function startFmTimer(elapsedSec) {
    const elapsed = Math.max(0, Math.floor(Number(elapsedSec) || 0));
    fmStartTs = Date.now() - elapsed * 1000;
    if (fmTimerId) clearInterval(fmTimerId);
    fmTimerId = setInterval(function () {
      if (dom().fmElapsed) {
        dom().fmElapsed.textContent = formatElapsedSec(Math.floor((Date.now() - fmStartTs) / 1000));
      }
    }, 250);
  }

  function stopFmTimer() {
    if (fmTimerId) clearInterval(fmTimerId);
    fmTimerId = null;
    if (fmFeedbackTimerId) {
      clearTimeout(fmFeedbackTimerId);
      fmFeedbackTimerId = null;
    }
  }

  async function renderFactorsMultiplesRecentRuns() {
    const user = deps.getCurrentUser();
    if (!user) {
      renderFmRecentRunsTable([]);
      return;
    }
    deps.ensureUserProgressDefault(user);
    let runs = Array.isArray(user.recentFactorsMultiplesRuns)
      ? user.recentFactorsMultiplesRuns.slice()
      : [];
    if (deps.fetchUserRuns) {
      try {
        const all = await deps.fetchUserRuns();
        const fromApi = (all || [])
          .filter(function (r) {
            return r && String(r.mode || "").toLowerCase() === "factorsmultiples" && r.comboOnly !== true;
          })
          .slice(0, 10);
        if (fromApi.length) {
          runs = fromApi;
          if (deps.getCachedUser()) {
            deps.getCachedUser().recentFactorsMultiplesRuns = fromApi.slice();
          }
        }
      } catch (e) {
        /* keep cached runs */
      }
    }
    renderFmRecentRunsTable(runs);
  }

  async function fetchFmRunsForHeat() {
    if (typeof deps.fetchUserRuns === "function") {
      try {
        return await deps.fetchUserRuns();
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  async function fetchFmCohortForHeat() {
    if (typeof deps.fetchFactorsMultiplesCohort === "function") {
      try {
        return await deps.fetchFactorsMultiplesCohort();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * 模式下一关：登录走服务器；游客本地梯子/刷选兜底。
   * @param {number} [unlockedMaxHint]
   * @returns {Promise<number|null>}
   */
  async function resolveFmRecommendedLevel(unlockedMaxHint) {
    const unlockedHint =
      unlockedMaxHint != null
        ? Math.floor(Number(unlockedMaxHint) || 0)
        : getFactorsMultiplesStoredUnlockedMax();

    if (typeof deps.fetchFactorsMultiplesRecommendedLevel === "function") {
      try {
        const fromApi = await deps.fetchFactorsMultiplesRecommendedLevel(
          unlockedHint,
          fmMaxLevel()
        );
        if (fromApi === undefined) {
          /* fall through */
        } else if (fromApi != null && Number.isFinite(Number(fromApi))) {
          return Math.max(0, Math.min(fmMaxLevel(), Math.floor(Number(fromApi))));
        } else {
          return null;
        }
      } catch (e) {
        console.warn("因数倍数选关 API 失败，尝试本地兜底", e);
      }
    }

    const guest =
      typeof deps.isGuestMode === "function" ? deps.isGuestMode() : !!deps.isGuestMode;
    if (!guest) return null;

    const HM = global.JmlStatsHeatmap;
    if (!HM || typeof HM.buildHeatmapCells !== "function") return null;
    const playableMax = fmMaxLevel();
    const cleared = unlockedHint > playableMax;
    const cat = HM.getHeatmapCategory ? HM.getHeatmapCategory("factorsMultiples") : null;
    const levelCount = cat && cat.levelCount > 0 ? cat.levelCount : playableMax + 1;
    const modes = cat && cat.modes ? cat.modes : ["factorsMultiples"];
    const [runs, cohort] = await Promise.all([fetchFmRunsForHeat(), fetchFmCohortForHeat()]);
    const capMs = cohort && Number(cohort.timeSpentMsCap) ? Number(cohort.timeSpentMsCap) : 60 * 1000;
    const heat = HM.buildHeatmapCells({
      runs: runs || [],
      cohort: cohort && cohort.ok ? cohort : null,
      modes: modes,
      levelCount: levelCount,
      maxTimeSpentMs: capMs,
    });

    if (!cleared) {
      if (typeof HM.recommendSpecialModeLadderLevel !== "function") return null;
      const pick = HM.recommendSpecialModeLadderLevel({
        cellsResult: heat,
        unlockedMax: unlockedHint,
        playableMax: playableMax,
        runs: runs || [],
        mode: "factorsMultiples",
      });
      if (!pick || pick.levelIndex == null || !Number.isFinite(Number(pick.levelIndex))) return null;
      return Math.max(0, Math.min(playableMax, Math.floor(Number(pick.levelIndex))));
    }

    if (typeof HM.recommendUnlockedWeightedBrush !== "function") return null;
    const pickBrush = HM.recommendUnlockedWeightedBrush(heat, playableMax);
    if (!pickBrush || pickBrush.levelIndex == null || !Number.isFinite(Number(pickBrush.levelIndex))) {
      return null;
    }
    return Math.max(0, Math.min(playableMax, Math.floor(Number(pickBrush.levelIndex))));
  }

  let fmRecommendSeq = 0;

  async function applyRecommendedLevelOnPrestart() {
    const seq = ++fmRecommendSeq;
    let lv = null;
    try {
      lv = await resolveFmRecommendedLevel();
    } catch (e) {
      console.warn("因数倍数选关失败", e);
      return;
    }
    if (seq !== fmRecommendSeq) return;
    if (lv == null) return;
    if (deps.getIsPlaying && deps.getIsPlaying()) return;
    const finished = document.getElementById("fm-panel-finished");
    const playing = document.getElementById("fm-panel-playing");
    if (playing && playing.style.display !== "none") return;
    if (finished && finished.style.display !== "none") return;

    fmLevel = lv;
    fmPrestartLevel = lv;
    void saveFactorsMultiplesProgress(lv, getFactorsMultiplesStoredUnlockedMax());
    if (deps.getCachedUser()) {
      deps.getCachedUser().levelFactorsMultiplesCurrentLevel = lv;
    }
    renderFmLevelSelect();
    syncFmLevelTexts();
    updateFmStatusStrip();
  }

  function showFactorsMultiplesPrestart(opts) {
    const keepLevel = !!(opts && opts.keepLevel);
    stopFmTimer();
    deps.setIsPlaying(false);
    deps.setGameOver(false);
    fmAnswered = 0;
    fmWrongCount = 0;
    fmScore = 0;
    fmAttempts = [];
    fmWrongItems = [];
    fmCurrent = null;
    fmRunDeck = [];
    resetFmChoiceButtons();
    fmRecommendSeq += 1;

    if (keepLevel) {
      fmLevel = Math.min(
        Math.max(typeof fmPrestartLevel === "number" ? fmPrestartLevel : fmLevel, 0),
        fmMaxLevel()
      );
    } else {
      fmLevel = Math.min(Math.max(getFactorsMultiplesCurrentLevel(), 0), fmMaxLevel());
      fmPrestartLevel = fmLevel;
    }

    renderFmLevelSelect();
    setFmLevelPickerVisible(true);
    syncFmLevelTexts();
    updateFmStatusStrip();
    if (dom().fmElapsed) dom().fmElapsed.textContent = "0:00";
    setFmPanel("idle");
    setFmAnswerSurface("choice");
    const recent = document.getElementById("fm-recent-card");
    if (recent) recent.style.display = "";
    showFmRecentHistory();
    deps.updateGlobalBackButtonState();

    if (!keepLevel) {
      void applyRecommendedLevelOnPrestart();
    }
  }

  function renderFmQuestion() {
    const q = fmRunDeck[0];
    fmCurrent = q || null;
    fmQuestionShownAt = Date.now();
    resetFmChoiceButtons();
    const promptEl = document.getElementById("fm-question-prompt");
    const fillTextEl = document.getElementById("fm-fill-question-text");
    const btnA = document.getElementById("fm-btn-a");
    const btnB = document.getElementById("fm-btn-b");

    if (!q) {
      if (promptEl) promptEl.textContent = "—";
      if (fillTextEl) fillTextEl.textContent = "—";
      if (btnA) btnA.textContent = "—";
      if (btnB) btnB.textContent = "—";
      setFmAnswerSurface("choice");
      return;
    }

    const fillIn = isFmFillInQuestion(q);
    setFmAnswerSurface(fillIn ? "fill" : "choice");

    const stem = q.promptStem || q.prompt || q.text || "—";
    if (fillIn) {
      if (fillTextEl) fillTextEl.textContent = stem;
      if (promptEl) promptEl.textContent = "—";
      if (dom().fmAnswerInput) {
        dom().fmAnswerInput.value = "";
        dom().fmAnswerInput.disabled = false;
      }
      initFmSoftKeyboardIfNeeded();
    } else {
      if (promptEl) promptEl.textContent = stem;
      if (fillTextEl) fillTextEl.textContent = "—";
      const optA =
        q.optionA != null
          ? q.optionA
          : q.answerLetter === "A"
            ? q.correctValue
            : q.wrongValue;
      const optB =
        q.optionB != null
          ? q.optionB
          : q.answerLetter === "B"
            ? q.correctValue
            : q.wrongValue;
      if (btnA) btnA.textContent = String(optA);
      if (btnB) btnB.textContent = String(optB);
    }

    updateFmStatusStrip();
    if (typeof deps.persistRunDraft === "function") deps.persistRunDraft();
  }

  function pushFmAttempt(q, correct, timeSpentMs) {
    fmAttempts.push({
      levelIndex: fmRunStartLevel,
      runLevelIndex: fmRunStartLevel,
      correct: correct,
      timeSpentMs: timeSpentMs,
      op: q && q.op != null ? q.op : null,
    });
  }

  function advanceAfterAnswer() {
    fmRunDeck.shift();
    fmAnswered += 1;
    updateFmStatusStrip();
    if (fmAnswered >= questionsPerRun(fmRunStartLevel) || !fmRunDeck.length) {
      void endFactorsMultiplesGame();
    } else {
      renderFmQuestion();
    }
  }

  function recordFmWrongItem(q, studentAnswer, correctAnswer, prompt) {
    fmWrongItems.push({
      prompt: prompt,
      studentAnswer: studentAnswer,
      correctAnswer: correctAnswer,
      picked: studentAnswer,
      correct: correctAnswer,
    });
    if (typeof deps.recordWrongAnswer === "function") {
      deps.recordWrongAnswer(prompt, correctAnswer, studentAnswer, fmLevel, "factorsMultiples");
    }
  }

  function chooseFmOption(letter) {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (!deps.getIsPlaying() || deps.getGameOver()) return;
    if (fmChoicesLocked) return;
    const q = fmCurrent || fmRunDeck[0];
    if (!q || isFmFillInQuestion(q)) return;

    const correctLetter = q.answerLetter === "B" ? "B" : "A";
    const correct = letter === correctLetter;
    const timeSpentMs = Math.max(0, Date.now() - (fmQuestionShownAt || Date.now()));
    pushFmAttempt(q, correct, timeSpentMs);

    if (correct) {
      fmScore += FM_SCORE_PER_CORRECT;
      advanceAfterAnswer();
      return;
    }

    fmScore -= FM_SCORE_PER_WRONG;
    fmWrongCount += 1;
    const pickedVal =
      letter === "A"
        ? q.optionA != null
          ? q.optionA
          : q.wrongValue
        : q.optionB != null
          ? q.optionB
          : q.wrongValue;
    const prompt = q.promptStem || q.prompt || q.text;
    recordFmWrongItem(q, pickedVal, q.correctValue, prompt);
    updateFmStatusStrip();
    advanceAfterAnswer();
  }

  function evaluateFmFillAnswer(userNum) {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (!deps.getIsPlaying() || deps.getGameOver()) return;
    if (fmFillSubmitLocked) return;
    const q = fmCurrent || fmRunDeck[0];
    if (!q || !isFmFillInQuestion(q)) return;

    fmFillSubmitLocked = true;
    const timeSpentMs = Math.max(0, Date.now() - (fmQuestionShownAt || Date.now()));
    const correct = Number(userNum) === Number(q.answer);
    pushFmAttempt(q, correct, timeSpentMs);

    if (correct) {
      fmScore += FM_SCORE_PER_CORRECT;
      advanceAfterAnswer();
      return;
    }

    fmScore -= FM_SCORE_PER_WRONG;
    fmWrongCount += 1;
    const prompt = q.prompt || q.text || q.promptStem;
    recordFmWrongItem(q, String(userNum), q.answer, prompt);
    updateFmStatusStrip();
    advanceAfterAnswer();
  }

  function handleFmSubmit() {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (!deps.getIsPlaying() || deps.getGameOver()) return;
    const q = fmCurrent || fmRunDeck[0];
    if (!q || !isFmFillInQuestion(q)) return;
    const input = dom().fmAnswerInput;
    if (!input) return;
    const value = input.value.trim();
    if (value === "") {
      return;
    }
    const userNum = Number(value);
    if (!Number.isFinite(userNum)) {
      return;
    }
    input.value = "";
    evaluateFmFillAnswer(userNum);
  }

  function startFactorsMultiplesGame() {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (!global.JmlFactorsMultiples || typeof global.JmlFactorsMultiples.buildRun !== "function") {
      deps.showToast(t("toast.fmBankLoadFail"));
      return;
    }
    if (dom().fmLevelSelect && dom().fmLevelSelect.value !== "") {
      const picked = Number(dom().fmLevelSelect.value);
      if (Number.isFinite(picked)) {
        fmLevel = Math.max(0, Math.min(fmMaxLevel(), Math.floor(picked)));
      }
    }
    fmRunStartLevel = fmLevel;
    fmUnlockedMaxBeforeRun = getFactorsMultiplesStoredUnlockedMax();
    deps.setIsPlaying(true);
    deps.setGameOver(false);
    fmAnswered = 0;
    fmWrongCount = 0;
    fmScore = 0;
    fmAttempts = [];
    fmWrongItems = [];
    fmRunDeck = buildRunForLevel(fmLevel);
    fmCurrent = null;

    if (dom().fmLevelSelect) dom().fmLevelSelect.disabled = true;
    setFmLevelPickerVisible(false);
    syncFmLevelTexts();
    updateFmStatusStrip();
    setFmPanel("playing");
    const recent = document.getElementById("fm-recent-card");
    if (recent) recent.style.display = "none";
    startFmTimer();
    deps.updateGlobalBackButtonState();
    renderFmQuestion();
  }

  function renderFmWrongReview() {
    const listEl = dom().fmWrongReviewList;
    const emptyEl = dom().fmWrongReviewEmpty;
    if (!listEl || !emptyEl) return;
    setFmRecentPanelMode("wrongReview");
    if (!fmWrongItems.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      emptyEl.textContent = t("fm.wrongReviewEmpty");
      return;
    }
    emptyEl.style.display = "none";
    listEl.innerHTML = fmWrongItems
      .map(function (w) {
        const q = deps.escapeHtml(String((w && w.prompt) || ""));
        const yours = deps.escapeHtml(
          String(
            (w && (w.studentAnswer != null ? w.studentAnswer : w.picked)) != null
              ? w.studentAnswer != null
                ? w.studentAnswer
                : w.picked
              : ""
          )
        );
        const ok = deps.escapeHtml(
          String(
            (w && (w.correctAnswer != null ? w.correctAnswer : w.correct)) != null
              ? w.correctAnswer != null
                ? w.correctAnswer
                : w.correct
              : ""
          )
        );
        return (
          '<div class="training-run-wrong-item">' +
          '<div class="training-run-wrong-q">' +
          q +
          "</div>" +
          '<div class="training-run-wrong-meta">' +
          deps.escapeHtml(t("fm.yourAnswer")) +
          ' <span class="wrong-ans">' +
          yours +
          "</span> · " +
          deps.escapeHtml(t("fm.correctAnswer")) +
          ' <span class="correct-ans">' +
          ok +
          "</span></div></div>"
        );
      })
      .join("");
  }

  async function endFactorsMultiplesGame() {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (typeof deps.clearRunDraft === "function") deps.clearRunDraft();
    deps.setIsPlaying(false);
    stopFmTimer();
    const durationSec = Math.floor((Date.now() - (fmStartTs || Date.now())) / 1000);
    const startLevel = fmRunStartLevel;
    let outcome = resolveFmRunOutcome(startLevel, fmWrongCount, fmUnlockedMaxBeforeRun);

    const awardedScore = Math.max(0, fmScore);
    let speedMeta = null;
    if (typeof deps.buildSingleLevelSpeedMeta === "function") {
      try {
        speedMeta = await deps.buildSingleLevelSpeedMeta(
          "factorsMultiples",
          startLevel,
          fmAttempts.slice()
        );
      } catch (e) {
        console.warn("因数倍数局速度快照失败", e);
      }
    }
    await deps.appendRun(
      durationSec,
      awardedScore,
      startLevel,
      fmWrongCount,
      "factorsMultiples",
      fmAttempts.slice(),
      undefined,
      undefined,
      { trainingMeta: speedMeta || { pickedLevel: startLevel } }
    );

    let brushLv = null;
    try {
      brushLv = await resolveFmRecommendedLevel(
        Math.max(
          Math.floor(Number(outcome.savedUnlockedMax) || 0),
          Math.floor(Number(fmUnlockedMaxBeforeRun) || 0)
        )
      );
    } catch (e) {
      console.warn("因数倍数选关失败，沿用局末默认", e);
    }
    if (brushLv != null) {
      outcome = Object.assign({}, outcome, {
        playAgainLevel: brushLv,
        savedCurrent: brushLv,
      });
    }

    fmPrestartLevel = outcome.playAgainLevel;
    fmLevel = outcome.playAgainLevel;

    saveFactorsMultiplesProgress(outcome.savedCurrent, outcome.savedUnlockedMax);

    if (deps.getCachedUser()) {
      deps.getCachedUser().levelFactorsMultiplesCurrentLevel = outcome.savedCurrent;
      deps.getCachedUser().levelFactorsMultiplesUnlockedMax = outcome.savedUnlockedMax;
      if (!Array.isArray(deps.getCachedUser().recentFactorsMultiplesRuns)) {
        deps.getCachedUser().recentFactorsMultiplesRuns = [];
      }
      const list = deps.getCachedUser().recentFactorsMultiplesRuns;
      const latestTs = list.length && list[0] && list[0].ts != null ? Number(list[0].ts) : 0;
      const nowTs = Date.now();
      if (!list.length || latestTs < nowTs - 2000) {
        list.unshift({
          survivalTimeSec: durationSec,
          score: awardedScore,
          maxLevel: startLevel,
          wrongCount: fmWrongCount,
          ts: nowTs,
          mode: "factorsMultiples",
          attempts: fmAttempts.slice(),
        });
        if (list.length > 10) list.length = 10;
      }
    }

    setFmPanel("finished");
    const recent = document.getElementById("fm-recent-card");
    if (recent) recent.style.display = "";

    if (dom().fmFinishTitle) dom().fmFinishTitle.textContent = t("expand.end.title");
    if (dom().fmFinishCorrect) {
      dom().fmFinishCorrect.textContent = String(
        Math.max(0, questionsPerRun(startLevel) - fmWrongCount)
      );
    }
    if (dom().fmFinishWrong) dom().fmFinishWrong.textContent = String(fmWrongCount);
    if (dom().fmFinishTime) {
      dom().fmFinishTime.textContent = deps.formatCompactRunTime(durationSec);
    }
    if (dom().fmFinishLevel) dom().fmFinishLevel.textContent = levelLabel(startLevel);
    if (dom().fmFinishResult) {
      dom().fmFinishResult.textContent = t("expand.result." + outcome.resultKey);
    }
    renderFmWrongReview();
    renderFmLevelSelect();
    syncFmLevelTexts();
    updateFmStatusStrip();
    deps.setGameOver(true);
    deps.updateGlobalBackButtonState();
  }

  function abandonFactorsMultiplesGame() {
    if (deps.getGameMode() !== "factorsMultiples") return;
    if (typeof deps.clearRunDraft === "function") deps.clearRunDraft();
    const durationSec = Math.floor((Date.now() - (fmStartTs || Date.now())) / 1000);
    void deps.appendRun(
      durationSec,
      0,
      fmRunStartLevel,
      fmWrongCount,
      "factorsMultiples",
      fmAttempts.slice(),
      false,
      true
    );
    deps.setIsPlaying(false);
    deps.setGameOver(true);
    stopFmTimer();
    resetFmChoiceButtons();
    setFmPanel("finished");
    const recent = document.getElementById("fm-recent-card");
    if (recent) recent.style.display = "";
    if (dom().fmFinishTitle) dom().fmFinishTitle.textContent = t("expand.end.title");
    if (dom().fmFinishCorrect) dom().fmFinishCorrect.textContent = "-";
    if (dom().fmFinishWrong) dom().fmFinishWrong.textContent = String(fmWrongCount);
    if (dom().fmFinishTime) dom().fmFinishTime.textContent = "-";
    if (dom().fmFinishLevel) dom().fmFinishLevel.textContent = levelLabel(fmRunStartLevel);
    if (dom().fmFinishResult) dom().fmFinishResult.textContent = t("expand.go.abandoned");
    renderFmWrongReview();
    deps.updateGlobalBackButtonState();
  }

  function hideFactorsMultiplesSection() {
    const sec = document.getElementById("factors-multiples-section");
    if (sec) {
      sec.style.display = "none";
      sec.classList.remove("visible");
    }
    stopFmTimer();
  }

  function hideOtherGameSections() {
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
    const decSec = document.getElementById("decimal-section");
    if (decSec) {
      decSec.style.display = "none";
      decSec.classList.remove("visible");
    }
    const divSec = document.getElementById("divisibility-section");
    if (divSec) {
      divSec.style.display = "none";
      divSec.classList.remove("visible");
    }
  }

  function showFactorsMultiplesSection() {
    hideOtherGameSections();
    const sec = document.getElementById("factors-multiples-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    showFactorsMultiplesPrestart({ keepLevel: false });
    deps.updateTopTitleForCurrentView(false);
  }

  function handleModeFactorsMultiples() {
    if (inGuestMode()) {
      deps.showToast(t("toast.guestNeedLogin"));
      return;
    }
    deps.setGameMode("factorsMultiples");
    showFactorsMultiplesSection();
  }

  function isFactorsMultiplesPlayingNow() {
    return (
      deps.getGameMode() === "factorsMultiples" && deps.getIsPlaying() && !deps.getGameOver()
    );
  }

  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  function captureRunDraft() {
    if (!isFactorsMultiplesPlayingNow()) return null;
    const q = fmCurrent || (Array.isArray(fmRunDeck) ? fmRunDeck[0] : null);
    if (!q) return null;
    if (!Array.isArray(fmRunDeck) || !fmRunDeck.length) return null;
    const elapsedSec = fmStartTs
      ? Math.max(0, Math.floor((Date.now() - fmStartTs) / 1000))
      : 0;
    return {
      v: 1,
      special: true,
      mode: "factorsMultiples",
      updatedAt: Date.now(),
      elapsedSec: elapsedSec,
      level: fmLevel,
      runStartLevel: fmRunStartLevel,
      unlockedMaxBeforeRun: fmUnlockedMaxBeforeRun,
      score: fmScore,
      wrongCount: fmWrongCount,
      answered: fmAnswered,
      attempts: fmAttempts.slice(),
      wrongItems: Array.isArray(fmWrongItems) ? cloneJson(fmWrongItems) : [],
      runDeck: cloneJson(fmRunDeck),
      current: cloneJson(q),
    };
  }

  function showFactorsMultiplesSectionShellOnly() {
    hideOtherGameSections();
    const sec = document.getElementById("factors-multiples-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    deps.updateTopTitleForCurrentView(false);
  }

  function resumeFromRunDraft(d) {
    if (!d || d.mode !== "factorsMultiples") return false;
    const deck = Array.isArray(d.runDeck) ? cloneJson(d.runDeck) : null;
    const current = d.current ? cloneJson(d.current) : null;
    if (!deck || !deck.length || !current) return false;

    deps.setGameMode("factorsMultiples");
    showFactorsMultiplesSectionShellOnly();
    fmLevel = Math.max(0, Math.min(fmMaxLevel(), Math.floor(Number(d.level) || 0)));
    fmRunStartLevel = Math.max(
      0,
      Math.min(
        fmMaxLevel(),
        Math.floor(Number(d.runStartLevel != null ? d.runStartLevel : fmLevel) || 0)
      )
    );
    fmUnlockedMaxBeforeRun = Math.max(0, Math.floor(Number(d.unlockedMaxBeforeRun) || 0));
    fmPrestartLevel = fmLevel;
    fmScore = Math.floor(Number(d.score) || 0);
    fmWrongCount = Math.max(0, Math.floor(Number(d.wrongCount) || 0));
    fmAnswered = Math.max(0, Math.floor(Number(d.answered) || 0));
    fmAttempts = Array.isArray(d.attempts) ? d.attempts.slice() : [];
    fmWrongItems = Array.isArray(d.wrongItems) ? cloneJson(d.wrongItems) || [] : [];
    fmRunDeck = deck;
    fmRunDeck[0] = current;
    fmCurrent = current;
    fmChoicesLocked = false;
    fmFillSubmitLocked = false;

    deps.setIsPlaying(true);
    deps.setGameOver(false);
    if (dom().fmLevelSelect) {
      dom().fmLevelSelect.value = String(fmLevel);
      dom().fmLevelSelect.disabled = true;
    }
    setFmLevelPickerVisible(false);
    syncFmLevelTexts();
    setFmPanel("playing");
    const recent = document.getElementById("fm-recent-card");
    if (recent) recent.style.display = "none";
    startFmTimer(d.elapsedSec);
    renderFmQuestion();
    deps.updateGlobalBackButtonState();
    if (typeof deps.persistRunDraft === "function") deps.persistRunDraft();
    return true;
  }

  function initFmSoftKeyboardIfNeeded() {
    const card = dom().fmSoftKbdCard;
    const input = dom().fmAnswerInput;
    if (!card || !global.JmlSoftKeyboard) return;
    global.JmlSoftKeyboard.ensureMounted(card, "integer", t);
    global.JmlSoftKeyboard.bind({
      cardEl: card,
      inputEl: input,
      onEnter: handleFmSubmit,
      layout: "integer",
      t: t,
    });
    if (input && global.JmlAnswerInput) {
      global.JmlAnswerInput.bind({
        inputEl: input,
        t: t,
        inputModeWhenUnlocked: "numeric",
        onSubmit: handleFmSubmit,
        getShouldLock: function () {
          return global.JmlSoftKeyboard ? global.JmlSoftKeyboard.shouldLockForTouch() : false;
        },
      });
    }
  }

  function bindEvents() {
    if (dom().fmStartBtn) dom().fmStartBtn.addEventListener("click", startFactorsMultiplesGame);
    if (dom().fmAgainBtn) {
      dom().fmAgainBtn.addEventListener("click", function () {
        showFactorsMultiplesPrestart({ keepLevel: true });
      });
    }
    if (dom().fmLevelSelect) {
      dom().fmLevelSelect.addEventListener("change", function () {
        if (deps.getIsPlaying && deps.getIsPlaying()) return;
        const v = Number(dom().fmLevelSelect.value);
        if (!Number.isFinite(v)) return;
        fmLevel = Math.max(0, Math.min(fmMaxLevel(), Math.floor(v)));
        syncFmLevelTexts();
        updateFmStatusStrip();
      });
    }
    const btnA = document.getElementById("fm-btn-a");
    const btnB = document.getElementById("fm-btn-b");
    if (btnA) {
      btnA.addEventListener("click", function () {
        chooseFmOption("A");
      });
    }
    if (btnB) {
      btnB.addEventListener("click", function () {
        chooseFmOption("B");
      });
    }
    initFmSoftKeyboardIfNeeded();
  }

  function init(injectedDeps) {
    deps = injectedDeps;
    bindEvents();
  }

  function getAbandonProgress() {
    return {
      answered: Math.max(0, Math.floor(Number(fmAnswered) || 0)),
      total: Math.max(0, Math.floor(Number(questionsPerRun(fmRunStartLevel)) || 0)),
    };
  }

  global.JmlFactorsMultiplesPage = {
    init: init,
    hideFactorsMultiplesSection: hideFactorsMultiplesSection,
    showFactorsMultiplesSection: showFactorsMultiplesSection,
    handleModeFactorsMultiples: handleModeFactorsMultiples,
    isFactorsMultiplesPlayingNow: isFactorsMultiplesPlayingNow,
    abandonFactorsMultiplesGame: abandonFactorsMultiplesGame,
    getAbandonProgress: getAbandonProgress,
    renderFactorsMultiplesRecentRuns: renderFactorsMultiplesRecentRuns,
    showFactorsMultiplesPrestart: showFactorsMultiplesPrestart,
    captureRunDraft: captureRunDraft,
    resumeFromRunDraft: resumeFromRunDraft,
  };
})(typeof window !== "undefined" ? window : globalThis);
