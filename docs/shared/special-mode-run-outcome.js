/**
 * 拆括号 / 平方数 / 小数 / 整除：局末升降级与再玩选关（只升不降，解锁不写 runs）
 * unlockedMax 可到 maxLevel+1，表示全模式通关（Report：u > maxLevel → 通关）
 *
 * 前沿：下一档解锁目标 > 已存 unlockedMax（用 raw，含通关位）。
 * 顶关的「下一档」即 maxLevel+1，与中间关同一套判断，无需 atMax 特例。
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
    startLevel = Math.min(startLevel, maxLevel);

    function finish(outcome) {
      outcome.savedUnlockedMax = Math.max(
        unlockedMaxBeforeRaw,
        Math.min(outcome.savedUnlockedMax, clearedUnlockMax)
      );
      return outcome;
    }

    // 下一档解锁目标（顶关为通关位 maxLevel+1）
    var unlockTarget = Math.min(startLevel + 1, clearedUnlockMax);
    var frontier = unlockTarget > unlockedMaxBeforeRaw;
    // 可玩等级上限
    var playableNext = Math.min(unlockTarget, maxLevel);

    if (wrongCount === 0) {
      if (frontier) {
        return finish({
          resultKey: "unlockNew",
          savedCurrent: playableNext,
          savedUnlockedMax: unlockTarget,
          playAgainLevel: playableNext,
        });
      }
      // 非前沿 0 错：共享模块仍偏向「冲下一关」；小数局末会用热图覆盖
      if (startLevel >= maxLevel) {
        return finish({
          resultKey: "perfect",
          savedCurrent: startLevel,
          savedUnlockedMax: clearedUnlockMax,
          playAgainLevel: startLevel,
        });
      }
      return finish({
        resultKey: "perfect",
        savedCurrent: playableNext,
        savedUnlockedMax: Math.max(unlockedMaxBeforeRaw, playableNext),
        playAgainLevel: playableNext,
      });
    }

    if (wrongCount === 1 && frontier) {
      return finish({
        resultKey: "unlockNew",
        savedCurrent: startLevel,
        savedUnlockedMax: unlockTarget,
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
