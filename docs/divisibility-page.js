/**
 * 整除模式：双选项 UI（仿质数壳）+ 升降级（仿平方数 / JmlSpecialModeRunOutcome）
 * 24 题/局，错题不回库；Z5（L5）零错通关进整除达人榜（用时最短）。
 */
(function (global) {
  const DIV_SCORE_PER_CORRECT = 5;
  const DIV_SCORE_PER_WRONG = 5;

  let deps = null;
  let divLevel = 0;
  let divRunStartLevel = 0;
  let divUnlockedMaxBeforeRun = 0;
  let divPrestartLevel = 0;
  let divRunDeck = [];
  let divAnswered = 0;
  let divWrongCount = 0;
  let divScore = 0;
  let divAttempts = [];
  let divWrongItems = [];
  let divStartTs = 0;
  let divTimerId = null;
  let divFeedbackTimerId = null;
  let divCurrent = null;
  let divChoicesLocked = false;
  let divQuestionShownAt = 0;

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

  function divMaxLevel() {
    const m = global.JmlDivisibility && global.JmlDivisibility.DIV_MAX_LEVEL;
    return typeof m === "number" ? m : 4;
  }

  function questionsPerRun(level) {
    if (global.JmlDivisibility && global.JmlDivisibility.questionsPerRun) {
      return global.JmlDivisibility.questionsPerRun(level);
    }
    return 24;
  }

  function buildRunForLevel(level) {
    return global.JmlDivisibility.buildRun(level);
  }

  function formatElapsedSec(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function formatDivProgress() {
    return divAnswered + " / " + questionsPerRun(divLevel);
  }

  function levelLabel(levelIndex) {
    return "L" + (Math.max(0, Math.floor(Number(levelIndex) || 0)) + 1);
  }

  function getDivisibilityCurrentLevel() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const v = user.levelDivisibilityCurrentLevel;
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(divMaxLevel(), Math.max(0, Math.floor(v)))
      : 0;
  }

  function getDivisibilityStoredUnlockedMax() {
    const user = deps.getCurrentUser();
    if (!user) return 0;
    deps.ensureUserProgressDefault(user);
    const current = getDivisibilityCurrentLevel();
    const cap = divMaxLevel() + 1;
    const stored =
      typeof user.levelDivisibilityUnlockedMax === "number" &&
      Number.isFinite(user.levelDivisibilityUnlockedMax)
        ? Math.min(cap, Math.max(0, Math.floor(user.levelDivisibilityUnlockedMax)))
        : current;
    return Math.max(current, stored);
  }

  function getDivisibilityUnlockedMaxLevel() {
    return Math.min(divMaxLevel(), getDivisibilityStoredUnlockedMax());
  }

  function resolveDivRunOutcome(startLevel, wrongCount, unlockedMaxBefore) {
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
      maxLevel: divMaxLevel(),
    });
  }

  async function saveDivisibilityProgress(currentLevel, unlockedMax) {
    currentLevel = Math.min(divMaxLevel(), Math.max(0, Math.floor(Number(currentLevel) || 0)));
    unlockedMax = Math.min(
      divMaxLevel() + 1,
      Math.max(currentLevel, Math.floor(Number(unlockedMax) || 0))
    );
    if (inGuestMode()) return;
    const name = deps.loadCurrentUsername();
    if (!name) return;
    try {
      await deps.apiPutUser(name, {
        levelDivisibilityCurrentLevel: currentLevel,
        levelDivisibilityUnlockedMax: unlockedMax,
      });
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelDivisibilityCurrentLevel = currentLevel;
        deps.getCachedUser().levelDivisibilityUnlockedMax = unlockedMax;
      }
    } catch (e) {
      console.warn("同步整除等级失败", e);
      if (deps.getCachedUser()) {
        deps.getCachedUser().levelDivisibilityCurrentLevel = currentLevel;
        deps.getCachedUser().levelDivisibilityUnlockedMax = unlockedMax;
      }
    }
  }

  function syncDivLevelTexts() {
    const label = levelLabel(divLevel);
    if (dom().divLevelText) dom().divLevelText.textContent = label;
    if (dom().divCurrentLevelName) dom().divCurrentLevelName.textContent = label;
    if (dom().divIdleLevelName) dom().divIdleLevelName.textContent = label;
    const lk = "div.level.L" + (divLevel + 1);
    const desc = t(lk) || "";
    if (dom().divLevelDesc) {
      dom().divLevelDesc.textContent = desc;
      dom().divLevelDesc.title = desc;
      if (dom().divLevelSelect && dom().divLevelSelect.style.display !== "none") {
        dom().divLevelDesc.style.display = desc ? "" : "none";
      }
    }
    const intro = document.getElementById("div-idle-intro");
    if (intro && !(deps.getIsPlaying && deps.getIsPlaying())) {
      intro.textContent = t("div.intro") || "";
    }
    if (deps.scheduleSyncAllRuleHints) deps.scheduleSyncAllRuleHints();
  }

  function setDivLevelPickerVisible(visible) {
    if (dom().divLevelSelect) dom().divLevelSelect.style.display = visible ? "" : "none";
    if (dom().divIdleLevelName) dom().divIdleLevelName.style.display = visible ? "none" : "";
    if (dom().divLevelDesc) {
      dom().divLevelDesc.style.display = visible ? "" : "none";
      if (!visible) {
        dom().divLevelDesc.textContent = "";
        dom().divLevelDesc.title = "";
      }
    }
  }

  function renderDivLevelSelect() {
    if (!dom().divLevelSelect) return;
    const unlockedMax = getDivisibilityUnlockedMaxLevel();
    if (divLevel > unlockedMax) divLevel = unlockedMax;
    const opts = [];
    for (let lv = 0; lv <= unlockedMax; lv += 1) {
      const selected = lv === divLevel ? " selected" : "";
      opts.push('<option value="' + lv + '"' + selected + ">" + levelLabel(lv) + "</option>");
    }
    dom().divLevelSelect.innerHTML = opts.join("");
    dom().divLevelSelect.value = String(divLevel);
    dom().divLevelSelect.disabled = !!deps.getIsPlaying && deps.getIsPlaying();
  }

  function setDivPanel(mode) {
    const idle = document.getElementById("div-panel-idle");
    const playing = document.getElementById("div-panel-playing");
    const finished = document.getElementById("div-panel-finished");
    if (idle) idle.style.display = mode === "idle" ? "" : "none";
    if (playing) playing.style.display = mode === "playing" ? "" : "none";
    if (finished) finished.style.display = mode === "finished" ? "" : "none";
  }

  function resetDivChoiceButtons() {
    const btnA = document.getElementById("div-btn-a");
    const btnB = document.getElementById("div-btn-b");
    [btnA, btnB].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove("prime-choice-wrong", "div-choice-wrong");
    });
    divChoicesLocked = false;
  }

  function updateDivStatusStrip() {
    if (dom().divProgressText) dom().divProgressText.textContent = formatDivProgress();
    if (dom().divScoreText) dom().divScoreText.textContent = String(divScore);
    if (dom().divWrongText) dom().divWrongText.textContent = String(divWrongCount);
    if (dom().divLevelText) dom().divLevelText.textContent = levelLabel(divLevel);
    if (dom().divElapsed) {
      const sec = divStartTs ? Math.floor((Date.now() - divStartTs) / 1000) : 0;
      dom().divElapsed.textContent = formatElapsedSec(sec);
    }
  }

  function startDivTimer() {
    divStartTs = Date.now();
    if (divTimerId) clearInterval(divTimerId);
    divTimerId = setInterval(function () {
      if (dom().divElapsed) {
        dom().divElapsed.textContent = formatElapsedSec(Math.floor((Date.now() - divStartTs) / 1000));
      }
    }, 250);
  }

  function stopDivTimer() {
    if (divTimerId) clearInterval(divTimerId);
    divTimerId = null;
    if (divFeedbackTimerId) {
      clearTimeout(divFeedbackTimerId);
      divFeedbackTimerId = null;
    }
  }

  function renderDivRecentRunsTable(runs) {
    if (!dom().divHistoryBody || !dom().divHistoryEmpty) return;
    const list = Array.isArray(runs) ? runs.slice(0, 10) : [];
    dom().divHistoryBody.innerHTML = "";
    if (!list.length) {
      dom().divHistoryEmpty.style.display = "block";
      return;
    }
    dom().divHistoryEmpty.style.display = "none";
    dom().divHistoryBody.innerHTML = list
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

  async function renderDivisibilityRecentRuns() {
    const user = deps.getCurrentUser();
    if (!user) {
      renderDivRecentRunsTable([]);
      return;
    }
    deps.ensureUserProgressDefault(user);
    let runs = Array.isArray(user.recentDivisibilityRuns) ? user.recentDivisibilityRuns.slice() : [];
    // 有缓存也尽量用全量 runs 对齐（避免 sync 漏写导致列表过期）
    if (deps.fetchUserRuns) {
      try {
        const all = await deps.fetchUserRuns();
        const fromApi = (all || [])
          .filter(function (r) {
            return r && String(r.mode || "").toLowerCase() === "divisibility" && r.comboOnly !== true;
          })
          .slice(0, 10);
        if (fromApi.length) {
          runs = fromApi;
          if (deps.getCachedUser()) deps.getCachedUser().recentDivisibilityRuns = fromApi.slice();
        }
      } catch (e) {
        /* keep cached runs */
      }
    }
    renderDivRecentRunsTable(runs);
  }

  function showDivisibilityPrestart(opts) {
    const keepLevel = !!(opts && opts.keepLevel);
    stopDivTimer();
    deps.setIsPlaying(false);
    deps.setGameOver(false);
    divAnswered = 0;
    divWrongCount = 0;
    divScore = 0;
    divAttempts = [];
    divWrongItems = [];
    divCurrent = null;
    divRunDeck = [];
    resetDivChoiceButtons();

    if (keepLevel) {
      divLevel = Math.min(
        Math.max(typeof divPrestartLevel === "number" ? divPrestartLevel : divLevel, 0),
        divMaxLevel()
      );
    } else {
      divLevel = Math.min(Math.max(getDivisibilityCurrentLevel(), 0), divMaxLevel());
      divPrestartLevel = divLevel;
    }

    renderDivLevelSelect();
    setDivLevelPickerVisible(true);
    syncDivLevelTexts();
    updateDivStatusStrip();
    if (dom().divElapsed) dom().divElapsed.textContent = "0:00";
    setDivPanel("idle");
    const recent = document.getElementById("div-recent-card");
    if (recent) recent.style.display = "";
    void renderDivisibilityRecentRuns();
    deps.updateGlobalBackButtonState();
  }

  function renderDivQuestion() {
    const q = divRunDeck[0];
    divCurrent = q || null;
    divQuestionShownAt = Date.now();
    resetDivChoiceButtons();
    const promptEl = document.getElementById("div-question-prompt");
    const btnA = document.getElementById("div-btn-a");
    const btnB = document.getElementById("div-btn-b");
    if (!q) {
      if (promptEl) promptEl.textContent = "—";
      if (btnA) btnA.textContent = "—";
      if (btnB) btnB.textContent = "—";
      return;
    }
    const stem =
      q.promptStem ||
      ("以下哪个整数可以被 " + (q.divisor != null ? q.divisor : "?") + " 整除？");
    const qNum = divAnswered + 1;
    if (promptEl) {
      promptEl.textContent = tf("div.questionNum", { n: qNum, stem: stem });
    }
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
    updateDivStatusStrip();
  }

  function advanceAfterAnswer() {
    divRunDeck.shift();
    divAnswered += 1;
    updateDivStatusStrip();
    if (divAnswered >= questionsPerRun(divRunStartLevel) || !divRunDeck.length) {
      void endDivisibilityGame();
    } else {
      renderDivQuestion();
    }
  }

  function chooseDivOption(letter) {
    if (deps.getGameMode() !== "divisibility") return;
    if (!deps.getIsPlaying() || deps.getGameOver()) return;
    if (divChoicesLocked) return;
    const q = divCurrent || divRunDeck[0];
    if (!q) return;

    const correctLetter = q.answerLetter === "B" ? "B" : "A";
    const correct = letter === correctLetter;
    const timeSpentMs = Math.max(0, Date.now() - (divQuestionShownAt || Date.now()));
    const heatLv =
      global.JmlDivisibility && typeof global.JmlDivisibility.heatLevelIndexFromDivisor === "function"
        ? global.JmlDivisibility.heatLevelIndexFromDivisor(q.divisor)
        : null;
    divAttempts.push({
      // 热图档：按除数归入 Z1–Z4（L5 混合局拆分）；解锁/排行榜用局级 maxLevel，不读此字段
      levelIndex:
        heatLv != null
          ? heatLv
          : Math.min(3, Math.max(0, Math.floor(Number(divRunStartLevel) || 0))),
      runLevelIndex: divRunStartLevel,
      correct: correct,
      timeSpentMs: timeSpentMs,
      divisor: q.divisor,
    });

    if (correct) {
      divScore += DIV_SCORE_PER_CORRECT;
      advanceAfterAnswer();
      return;
    }

    divScore -= DIV_SCORE_PER_WRONG;
    divWrongCount += 1;
    divWrongItems.push({
      divisor: q.divisor,
      picked: letter === "A" ? q.optionA != null ? q.optionA : null : q.optionB != null ? q.optionB : null,
      correct: q.correctValue,
      prompt: q.promptStem || q.prompt || q.text,
    });
    divChoicesLocked = true;
    const wrongBtn = document.getElementById(letter === "A" ? "div-btn-a" : "div-btn-b");
    if (wrongBtn) wrongBtn.classList.add("div-choice-wrong");
    const btnA = document.getElementById("div-btn-a");
    const btnB = document.getElementById("div-btn-b");
    if (btnA) btnA.disabled = true;
    if (btnB) btnB.disabled = true;
    updateDivStatusStrip();
    divFeedbackTimerId = setTimeout(function () {
      divFeedbackTimerId = null;
      if (wrongBtn) wrongBtn.classList.remove("div-choice-wrong");
      advanceAfterAnswer();
    }, 980);
  }

  function startDivisibilityGame() {
    if (deps.getGameMode() !== "divisibility") return;
    if (!global.JmlDivisibility || typeof global.JmlDivisibility.buildRun !== "function") {
      deps.showToast(t("toast.divBankLoadFail"));
      return;
    }
    if (dom().divLevelSelect && dom().divLevelSelect.value !== "") {
      const picked = Number(dom().divLevelSelect.value);
      if (Number.isFinite(picked)) {
        divLevel = Math.max(0, Math.min(divMaxLevel(), Math.floor(picked)));
      }
    }
    divRunStartLevel = divLevel;
    divUnlockedMaxBeforeRun = getDivisibilityStoredUnlockedMax();
    deps.setIsPlaying(true);
    deps.setGameOver(false);
    divAnswered = 0;
    divWrongCount = 0;
    divScore = 0;
    divAttempts = [];
    divWrongItems = [];
    divRunDeck = buildRunForLevel(divLevel);
    divCurrent = null;

    if (dom().divLevelSelect) dom().divLevelSelect.disabled = true;
    setDivLevelPickerVisible(false);
    syncDivLevelTexts();
    updateDivStatusStrip();
    setDivPanel("playing");
    const recent = document.getElementById("div-recent-card");
    if (recent) recent.style.display = "none";
    startDivTimer();
    deps.updateGlobalBackButtonState();
    renderDivQuestion();
  }

  function renderDivWrongReview() {
    const host = document.getElementById("div-finish-wrong-list");
    const hint = document.getElementById("div-wrong-review-hint");
    if (!host) return;
    host.innerHTML = "";
    if (!divWrongItems.length) {
      if (hint) hint.style.display = "none";
      return;
    }
    if (hint) hint.style.display = "";
    host.innerHTML = divWrongItems
      .map(function (w) {
        return (
          '<div class="prime-wrong-item">' +
          deps.escapeHtml(String(w.prompt || "")) +
          " → " +
          deps.escapeHtml(String(w.correct)) +
          "</div>"
        );
      })
      .join("");
  }

  async function endDivisibilityGame() {
    if (deps.getGameMode() !== "divisibility") return;
    deps.setIsPlaying(false);
    stopDivTimer();
    const durationSec = Math.floor((Date.now() - (divStartTs || Date.now())) / 1000);
    const startLevel = divRunStartLevel;
    const outcome = resolveDivRunOutcome(startLevel, divWrongCount, divUnlockedMaxBeforeRun);
    divPrestartLevel = outcome.playAgainLevel;
    divLevel = outcome.playAgainLevel;

    const awardedScore = Math.max(0, divScore);
    await deps.appendRun(
      durationSec,
      awardedScore,
      startLevel,
      divWrongCount,
      "divisibility",
      divAttempts.slice()
    );
    saveDivisibilityProgress(outcome.savedCurrent, outcome.savedUnlockedMax);

    if (deps.getCachedUser()) {
      deps.getCachedUser().levelDivisibilityCurrentLevel = outcome.savedCurrent;
      deps.getCachedUser().levelDivisibilityUnlockedMax = outcome.savedUnlockedMax;
      if (!Array.isArray(deps.getCachedUser().recentDivisibilityRuns)) {
        deps.getCachedUser().recentDivisibilityRuns = [];
      }
      // appendRun 的 sync 路径若漏写 recent，这里兜底保证本局立刻出现在列表
      const list = deps.getCachedUser().recentDivisibilityRuns;
      const latestTs = list.length && list[0] && list[0].ts != null ? Number(list[0].ts) : 0;
      const nowTs = Date.now();
      if (!list.length || latestTs < nowTs - 2000) {
        list.unshift({
          survivalTimeSec: durationSec,
          score: awardedScore,
          maxLevel: startLevel,
          wrongCount: divWrongCount,
          ts: nowTs,
          mode: "divisibility",
          attempts: divAttempts.slice(),
        });
        if (list.length > 10) list.length = 10;
      }
    }

    setDivPanel("finished");
    const recent = document.getElementById("div-recent-card");
    if (recent) recent.style.display = "";

    if (dom().divFinishTitle) dom().divFinishTitle.textContent = t("expand.end.title");
    if (dom().divFinishCorrect) {
      dom().divFinishCorrect.textContent = String(Math.max(0, questionsPerRun(startLevel) - divWrongCount));
    }
    if (dom().divFinishWrong) dom().divFinishWrong.textContent = String(divWrongCount);
    if (dom().divFinishTime) {
      dom().divFinishTime.textContent = deps.formatCompactRunTime(durationSec);
    }
    if (dom().divFinishLevel) dom().divFinishLevel.textContent = levelLabel(startLevel);
    if (dom().divFinishResult) {
      dom().divFinishResult.textContent = t("expand.result." + outcome.resultKey);
    }
    renderDivWrongReview();
    renderDivLevelSelect();
    syncDivLevelTexts();
    updateDivStatusStrip();
    deps.setGameOver(true);
    deps.updateGlobalBackButtonState();
    void renderDivisibilityRecentRuns();
  }

  function abandonDivisibilityGame() {
    if (deps.getGameMode() !== "divisibility") return;
    const durationSec = Math.floor((Date.now() - (divStartTs || Date.now())) / 1000);
    void deps.appendRun(
      durationSec,
      0,
      divRunStartLevel,
      divWrongCount,
      "divisibility",
      divAttempts.slice(),
      false,
      true
    );
    deps.setIsPlaying(false);
    deps.setGameOver(true);
    stopDivTimer();
    resetDivChoiceButtons();
    setDivPanel("finished");
    const recent = document.getElementById("div-recent-card");
    if (recent) recent.style.display = "";
    if (dom().divFinishTitle) dom().divFinishTitle.textContent = t("expand.end.title");
    if (dom().divFinishCorrect) dom().divFinishCorrect.textContent = "-";
    if (dom().divFinishWrong) dom().divFinishWrong.textContent = String(divWrongCount);
    if (dom().divFinishTime) dom().divFinishTime.textContent = "-";
    if (dom().divFinishLevel) dom().divFinishLevel.textContent = levelLabel(divRunStartLevel);
    if (dom().divFinishResult) dom().divFinishResult.textContent = t("expand.go.abandoned");
    divWrongItems = [];
    renderDivWrongReview();
    deps.updateGlobalBackButtonState();
    void renderDivisibilityRecentRuns();
  }

  function hideDivisibilitySection() {
    const sec = document.getElementById("divisibility-section");
    if (sec) {
      sec.style.display = "none";
      sec.classList.remove("visible");
    }
    stopDivTimer();
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
  }

  function showDivisibilitySection() {
    hideOtherGameSections();
    const sec = document.getElementById("divisibility-section");
    if (sec) {
      sec.style.display = "flex";
      sec.classList.add("visible");
    }
    showDivisibilityPrestart({ keepLevel: false });
    deps.updateTopTitleForCurrentView(false);
  }

  function handleModeDivisibility() {
    if (inGuestMode()) {
      deps.showToast(t("toast.guestNeedLogin"));
      return;
    }
    deps.setGameMode("divisibility");
    showDivisibilitySection();
  }

  function isDivisibilityPlayingNow() {
    return deps.getGameMode() === "divisibility" && deps.getIsPlaying() && !deps.getGameOver();
  }

  function bindEvents() {
    if (dom().divStartBtn) dom().divStartBtn.addEventListener("click", startDivisibilityGame);
    if (dom().divAgainBtn) {
      dom().divAgainBtn.addEventListener("click", function () {
        showDivisibilityPrestart({ keepLevel: true });
      });
    }
    if (dom().divLevelSelect) {
      dom().divLevelSelect.addEventListener("change", function () {
        if (deps.getIsPlaying && deps.getIsPlaying()) return;
        const v = Number(dom().divLevelSelect.value);
        if (!Number.isFinite(v)) return;
        divLevel = Math.max(0, Math.min(divMaxLevel(), Math.floor(v)));
        syncDivLevelTexts();
        updateDivStatusStrip();
      });
    }
    const btnA = document.getElementById("div-btn-a");
    const btnB = document.getElementById("div-btn-b");
    if (btnA) btnA.addEventListener("click", function () {
      chooseDivOption("A");
    });
    if (btnB) btnB.addEventListener("click", function () {
      chooseDivOption("B");
    });
  }

  function init(injectedDeps) {
    deps = injectedDeps;
    bindEvents();
  }

  global.JmlDivisibilityPage = {
    init: init,
    hideDivisibilitySection: hideDivisibilitySection,
    showDivisibilitySection: showDivisibilitySection,
    handleModeDivisibility: handleModeDivisibility,
    isDivisibilityPlayingNow: isDivisibilityPlayingNow,
    abandonDivisibilityGame: abandonDivisibilityGame,
    renderDivisibilityRecentRuns: renderDivisibilityRecentRuns,
    showDivisibilityPrestart: showDivisibilityPrestart,
  };
})(typeof window !== "undefined" ? window : globalThis);
