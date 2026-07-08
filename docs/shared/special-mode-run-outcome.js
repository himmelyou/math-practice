/**
 * 拆括号 / 平方数 / 小数：局末升降级与再玩选关（只升不降，解锁不写 runs）
 * unlockedMax 可到 maxLevel+1，表示全模式通关（Report：u > maxLevel → 通关）
 */
(function (global) {
  /**
   * @param {object} opts
   * @param {number} opts.startLevel 本局等级 0-based
   * @param {number} opts.wrongCount 本局错题数
   * @param {number} opts.unlockedMaxBefore 开局前已存 unlockedMax（含通关态 maxLevel+1）
   * @param {number} opts.maxLevel 模式最高等级 index
   * @returns {{ resultKey: string, savedCurrent: number, savedUnlockedMax: number, playAgainLevel: number }}
   */
  function resolveSpecialModeRunOutcome(opts) {
    var startLevel = Math.max(0, Math.floor(Number(opts.startLevel) || 0));
    var wrongCount = Math.max(0, Math.floor(Number(opts.wrongCount) || 0));
    var maxLevel = Math.max(0, Math.floor(Number(opts.maxLevel) || 0));
    var clearedUnlockMax = maxLevel + 1;
    var unlockedMaxBeforeRaw = Math.max(0, Math.floor(Number(opts.unlockedMaxBefore) || 0));
    unlockedMaxBeforeRaw = Math.min(unlockedMaxBeforeRaw, clearedUnlockMax);
    var unlockedMaxBefore = Math.min(unlockedMaxBeforeRaw, maxLevel);
    startLevel = Math.min(startLevel, maxLevel);

    function finish(outcome) {
      outcome.savedUnlockedMax = Math.max(
        unlockedMaxBeforeRaw,
        Math.min(outcome.savedUnlockedMax, clearedUnlockMax)
      );
      return outcome;
    }

    var atMax = startLevel >= maxLevel;
    var next = startLevel + 1;
    var hasNext = !atMax;
    var frontier = hasNext && next > unlockedMaxBefore;

    if (wrongCount === 0) {
      if (frontier) {
        return finish({
          resultKey: "unlockNew",
          savedCurrent: next,
          savedUnlockedMax: next,
          playAgainLevel: next,
        });
      }
      if (atMax) {
        return finish({
          resultKey: "perfect",
          savedCurrent: startLevel,
          savedUnlockedMax: clearedUnlockMax,
          playAgainLevel: startLevel,
        });
      }
      return finish({
        resultKey: "perfect",
        savedCurrent: next,
        savedUnlockedMax: next,
        playAgainLevel: next,
      });
    }

    if (wrongCount === 1 && frontier) {
      return finish({
        resultKey: "unlockNew",
        savedCurrent: startLevel,
        savedUnlockedMax: next,
        playAgainLevel: startLevel,
      });
    }

    if (wrongCount === 1 && atMax) {
      return finish({
        resultKey: "unlockNew",
        savedCurrent: startLevel,
        savedUnlockedMax: clearedUnlockMax,
        playAgainLevel: startLevel,
      });
    }

    return finish({
      resultKey: "keepGoing",
      savedCurrent: startLevel,
      savedUnlockedMax: unlockedMaxBeforeRaw,
      playAgainLevel: startLevel,
    });
  }

  global.JmlSpecialModeRunOutcome = {
    resolve: resolveSpecialModeRunOutcome,
  };
})(typeof window !== "undefined" ? window : this);
