/**
 * 玩家等级：总经验 totalXp 仅系统记账；对外展示 level + 本级 xpInLevel/xpToNext。
 * 曲线：Lv1–10 150/级，11–25 180，26–40 240，41–60 300，61+ 360。
 */
(function (global) {
  function xpToNextForLevel(level) {
    level = Math.max(1, Math.floor(Number(level) || 1));
    if (level < 10) return 150;
    if (level < 25) return 180;
    if (level < 40) return 240;
    if (level < 60) return 300;
    return 360;
  }

  function computeFromTotalXp(totalXp) {
    totalXp = Math.max(0, Math.floor(Number(totalXp) || 0));
    let level = 1;
    let remaining = totalXp;
    while (true) {
      const xpToNext = xpToNextForLevel(level);
      if (remaining < xpToNext) {
        return {
          level,
          xpInLevel: remaining,
          xpToNext,
          progress: xpToNext > 0 ? remaining / xpToNext : 0,
          totalXp,
        };
      }
      remaining -= xpToNext;
      level += 1;
    }
  }

  global.JmlPlayerLevel = {
    xpToNextForLevel: xpToNextForLevel,
    computeFromTotalXp: computeFromTotalXp,
    levelForTotalXp: function (totalXp) {
      return computeFromTotalXp(totalXp).level;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
