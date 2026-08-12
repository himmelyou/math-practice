/**
 * 整除热图档位：仅 Z1–Z4。Z5 混合局按除数归入对应基础档。
 * 排行榜 / 解锁仍用局级 maxLevel（可为 4），与此无关。
 */
"use strict";

/** 热图展示档数（不含 Z5） */
const DIVISIBILITY_HEATMAP_LEVEL_COUNT = 4;

const DIVISOR_TO_HEAT_LEVEL = {
  2: 0,
  5: 0,
  3: 1,
  9: 1,
  4: 2,
  8: 2,
  6: 3,
  12: 3,
};

/**
 * @param {number|string} divisor
 * @returns {number|null} 0–3，无法映射则 null
 */
function heatLevelIndexFromDivisor(divisor) {
  const d = Math.floor(Number(divisor));
  if (!Number.isFinite(d)) return null;
  if (Object.prototype.hasOwnProperty.call(DIVISOR_TO_HEAT_LEVEL, d)) {
    return DIVISOR_TO_HEAT_LEVEL[d];
  }
  return null;
}

/**
 * 从 attempt 解析热图档位（优先 divisor；兼容旧数据 levelIndex 0–3；纯旧 L5 无 divisor 则丢弃）
 * @param {{ levelIndex?: number, divisor?: number }} a
 * @returns {number|null}
 */
function heatLevelIndexFromAttempt(a) {
  if (!a || typeof a !== "object") return null;
  const fromDiv = heatLevelIndexFromDivisor(a.divisor);
  if (fromDiv != null) return fromDiv;
  const li = Math.floor(Number(a.levelIndex));
  if (Number.isFinite(li) && li >= 0 && li < DIVISIBILITY_HEATMAP_LEVEL_COUNT) return li;
  return null;
}

module.exports = {
  DIVISIBILITY_HEATMAP_LEVEL_COUNT,
  DIVISOR_TO_HEAT_LEVEL,
  heatLevelIndexFromDivisor,
  heatLevelIndexFromAttempt,
};
