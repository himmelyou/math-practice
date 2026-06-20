/**
 * 与 docs/shared/player-level.js 曲线一致（服务端头像解锁等）
 */
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

function levelForTotalXp(totalXp) {
  return computeFromTotalXp(totalXp).level;
}

module.exports = {
  xpToNextForLevel,
  computeFromTotalXp,
  levelForTotalXp,
};
