/**
 * 拆括号 / 平方数：局末升降级与再玩选关（只升不降，解锁不写 runs）
 */
(function (global) {
  /**
   * @param {object} opts
   * @param {number} opts.startLevel 本局等级 0-based
   * @param {number} opts.wrongCount 本局错题数
   * @param {number} opts.unlockedMaxBefore 开局前可选最高等级 index
   * @param {number} opts.maxLevel 模式最高等级 index
   * @returns {{ resultKey: string, savedCurrent: number, savedUnlockedMax: number, playAgainLevel: number }}
   */
  function resolveSpecialModeRunOutcome(opts) {
    var startLevel = Math.max(0, Math.floor(Number(opts.startLevel) || 0));
    var wrongCount = Math.max(0, Math.floor(Number(opts.wrongCount) || 0));
    var unlockedMaxBefore = Math.max(0, Math.floor(Number(opts.unlockedMaxBefore) || 0));
    var maxLevel = Math.max(0, Math.floor(Number(opts.maxLevel) || 0));
    startLevel = Math.min(startLevel, maxLevel);
    unlockedMaxBefore = Math.min(unlockedMaxBefore, maxLevel);

    var atMax = startLevel >= maxLevel;
    var next = startLevel + 1;
    var hasNext = !atMax;
    var frontier = hasNext && next > unlockedMaxBefore;

    if (wrongCount === 0) {
      if (frontier) {
        return {
          resultKey: "unlockNew",
          savedCurrent: next,
          savedUnlockedMax: next,
          playAgainLevel: next,
        };
      }
      return {
        resultKey: "perfect",
        savedCurrent: hasNext ? next : startLevel,
        savedUnlockedMax: hasNext ? next : startLevel,
        playAgainLevel: hasNext ? next : startLevel,
      };
    }

    if (wrongCount === 1 && frontier) {
      return {
        resultKey: "unlockNew",
        savedCurrent: startLevel,
        savedUnlockedMax: next,
        playAgainLevel: startLevel,
      };
    }

    return {
      resultKey: "keepGoing",
      savedCurrent: startLevel,
      savedUnlockedMax: unlockedMaxBefore,
      playAgainLevel: startLevel,
    };
  }

  global.JmlSpecialModeRunOutcome = {
    resolve: resolveSpecialModeRunOutcome,
  };
})(typeof window !== "undefined" ? window : this);
