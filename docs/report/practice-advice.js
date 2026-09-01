/**
 * 练习建议 v0：年级先验 × 热图阶段。只读推荐，不改训练开局。
 * 规则见《练习建议规则说明》§十；暂定项 Q1/Q2 见案例 01。
 */
(function (root) {
  var RULE_VERSION = "0.2-provisional";
  var LEVEL_COUNT = 16;
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_YELLOW = 0.95;
  /** Q1 暂定：超前档算「会了」的最低题数 */
  var AHEAD_MASTERED_N = 80;

  var PRIOR_LABEL = {
    learned: "已学",
    current: "同步",
    ahead: "超前",
    unknown: "年级未填",
  };
  var STAGE_LABEL = {
    no_data: "无数据",
    weak: "不会/很生",
    shaky: "不熟",
    thin: "样本薄",
    mastered: "会了",
  };

  function clampLevel(i) {
    var n = Math.floor(Number(i) || 0);
    if (n < 0) return 0;
    if (n > LEVEL_COUNT - 1) return LEVEL_COUNT - 1;
    return n;
  }

  function levelLabel(levelIndex) {
    return "L" + (clampLevel(levelIndex) + 1);
  }

  /**
   * 校内先验（v0 只按年级、不管月份）。对照人教版大致进度，不是死帽。
   */
  function curriculumPrior(grade, levelIndex) {
    var L = clampLevel(levelIndex) + 1;
    if (grade === null || grade === undefined || grade === "") return "unknown";
    var g = Number(grade);
    if (!Number.isInteger(g) || g < 0 || g > 12) return "unknown";
    if (g === 0) return L <= 4 ? "current" : "ahead";
    if (g === 1) {
      if (L <= 6) return "learned";
      if (L <= 9) return "current";
      return "ahead";
    }
    if (g === 2) {
      if (L <= 9) return "learned";
      if (L <= 11) return "current";
      if (L === 12) return "learned";
      return "ahead";
    }
    if (g === 3) {
      if (L <= 12) return "learned";
      return "ahead";
    }
    if (g === 4) {
      if (L <= 14) return "learned";
      return "current";
    }
    return "learned";
  }

  function heatBand(cell) {
    if (!cell || !cell.active) return "inactive";
    var p = cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
    if (p == null) return "unknown";
    if (p < HEAT_P_ORANGE || cell.tooSlow === true) return "orange";
    if (p < HEAT_P_YELLOW) return "yellow";
    return "fluent";
  }

  function classifyStage(cell, prior) {
    var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
    if (!cell || !cell.active || n <= 0) return "no_data";
    var band = heatBand(cell);
    if (band === "orange") return "weak";
    if (band === "yellow") return "shaky";
    if (band !== "fluent") return "shaky";
    if (prior === "ahead" && n < AHEAD_MASTERED_N) return "thin";
    return "mastered";
  }

  function getCell(cells, levelIndex) {
    var list = Array.isArray(cells) ? cells : [];
    var k = clampLevel(levelIndex);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].levelIndex === k) return list[i];
    }
    return list[k] || { levelIndex: k, active: false, n: 0, p: null, tooSlow: false, fluent: false };
  }

  function holeScore(row) {
    var p = row.p != null && Number.isFinite(Number(row.p)) ? Number(row.p) : 0;
    if (row.stage === "weak") return 2000 + (1 - p) * 1000 + (row.tooSlow ? 80 : 0);
    if (row.stage === "shaky") return 1000 + (1 - p) * 1000;
    return 0;
  }

  function pickWorstHole(rows) {
    var best = null;
    for (var i = 0; i < rows.length; i += 1) {
      if (!best || holeScore(rows[i]) > holeScore(best) + 1e-9) best = rows[i];
    }
    return best;
  }

  function pctText(p) {
    if (p == null || !Number.isFinite(Number(p))) return "—";
    return Math.round(Number(p) * 1000) / 10 + "%";
  }

  function inSchoolPrior(prior) {
    return prior === "learned" || prior === "current" || prior === "unknown";
  }

  function buildRows(grade, cells) {
    var rows = [];
    for (var i = 0; i < LEVEL_COUNT; i += 1) {
      var cell = getCell(cells, i);
      var prior = curriculumPrior(grade, i);
      var n = cell && Number.isFinite(Number(cell.n)) ? Number(cell.n) : 0;
      var p = cell && cell.p != null && Number.isFinite(Number(cell.p)) ? Number(cell.p) : null;
      rows.push({
        levelIndex: i,
        L: i + 1,
        levelLabel: levelLabel(i),
        prior: prior,
        priorLabel: PRIOR_LABEL[prior] || prior,
        stage: classifyStage(cell, prior),
        stageLabel: STAGE_LABEL[classifyStage(cell, prior)] || classifyStage(cell, prior),
        n: n,
        p: p,
        pPct: pctText(p),
        tooSlow: !!(cell && cell.tooSlow),
        fluent: !!(cell && cell.fluent),
        band: heatBand(cell),
        timePct: cell && cell.timePct != null && Number.isFinite(Number(cell.timePct)) ? Number(cell.timePct) : null,
      });
    }
    rows.forEach(function (r) {
      r.stageLabel = STAGE_LABEL[r.stage] || r.stage;
    });
    return rows;
  }

  function reason(ruleId, code, evidence, note) {
    return { ruleId: ruleId, code: code, evidence: evidence || "", note: note || "" };
  }

  function computePracticeAdvice(opts) {
    opts = opts || {};
    var grade = opts.grade;
    var cells = opts.cells;
    var systemPick = opts.systemPick || null;
    var rows = buildRows(grade, cells);
    var reasons = [];
    var unresolved = [
      "Q1 超前「会了」暂定 n≥" + AHEAD_MASTERED_N + "，本案例无法标定",
      "Q2 已学/同步黄橙暂定永远压过超前，见矛盾再改",
    ];

    var schoolHoles = rows.filter(function (r) {
      return inSchoolPrior(r.prior) && (r.stage === "weak" || r.stage === "shaky");
    });
    var aheadNoData = rows.filter(function (r) {
      return r.prior === "ahead" && r.stage === "no_data";
    });
    var aheadMastered = rows.filter(function (r) {
      return r.prior === "ahead" && r.stage === "mastered";
    });
    var aheadThin = rows.filter(function (r) {
      return r.prior === "ahead" && (r.stage === "thin" || r.stage === "shaky");
    });
    var schoolMastered = rows.filter(function (r) {
      return inSchoolPrior(r.prior) && r.stage === "mastered";
    });

    var primaryRow = null;
    var pickNote = "";
    var alternatives = [];

    if (schoolHoles.length) {
      primaryRow = pickWorstHole(schoolHoles);
      pickNote = "in_school_hole";
      reasons.push(
        reason(
          "R-main-hole",
          "learned_or_current_hole",
          primaryRow.levelLabel +
            " " +
            primaryRow.priorLabel +
            " · " +
            primaryRow.stageLabel +
            " 准" +
            primaryRow.pPct +
            " n=" +
            primaryRow.n,
          "Q2 暂定：已学/同步短板优先于超前"
        )
      );
      schoolHoles.forEach(function (r) {
        if (r.levelIndex !== primaryRow.levelIndex) {
          alternatives.push({
            action: "training",
            levelIndex: r.levelIndex,
            levelLabel: r.levelLabel,
            title: "次要短板 " + r.levelLabel,
            detail: r.priorLabel + " · " + r.stageLabel + " 准" + r.pPct,
          });
        }
      });
      aheadThin.forEach(function (r) {
        alternatives.push({
          action: "training",
          levelIndex: r.levelIndex,
          levelLabel: r.levelLabel,
          title: "可以练但不是主线 " + r.levelLabel,
          detail: r.priorLabel + " · " + r.stageLabel + " n=" + r.n,
        });
      });
    } else if (aheadMastered.length) {
      primaryRow = aheadMastered[0];
      for (var am = 1; am < aheadMastered.length; am += 1) {
        if (aheadMastered[am].levelIndex < primaryRow.levelIndex) primaryRow = aheadMastered[am];
      }
      pickNote = "ahead_mastered";
      reasons.push(
        reason(
          "R-ahead-ok",
          "ahead_mastered_main",
          primaryRow.levelLabel + " 超前且 n=" + primaryRow.n + "≥" + AHEAD_MASTERED_N + " 已会了",
          "已学/同步无黄橙；仍不开无数据的下一档超前"
        )
      );
    } else {
      schoolMastered.sort(function (a, b) {
        var ta = a.timePct == null ? -1 : a.timePct;
        var tb = b.timePct == null ? -1 : b.timePct;
        return tb - ta;
      });
      if (schoolMastered.length) {
        primaryRow = schoolMastered[0];
        pickNote = "school_slowest";
        reasons.push(
          reason(
            "R-no-hole-slow",
            "learned_slowest_fluent",
            primaryRow.levelLabel + " 已学已流畅，相对最慢（timePct=" + (primaryRow.timePct != null ? primaryRow.timePct : "—") + "）",
            "超前尚未达到 Q1 会了门槛，不当主线"
          )
        );
      } else if (aheadThin.length) {
        primaryRow = aheadThin[0];
        for (var at = 1; at < aheadThin.length; at += 1) {
          if (aheadThin[at].levelIndex < primaryRow.levelIndex) primaryRow = aheadThin[at];
        }
        pickNote = "ahead_thin_only";
        reasons.push(
          reason(
            "R-ahead-thin",
            "ahead_thin_not_main_ideal",
            primaryRow.levelLabel + " 超前样本薄 n=" + primaryRow.n + "，仅点缀",
            "Q1 暂定未达会了"
          )
        );
      } else {
        var openable = rows.filter(function (r) {
          return (r.prior === "current" || r.prior === "unknown") && r.stage === "no_data";
        });
        if (openable.length) {
          primaryRow = openable[0];
          pickNote = "open_current";
          reasons.push(
            reason("R-open-current", "current_no_data_open", "同步档 " + primaryRow.levelLabel + " 无数据，可开作主线", "")
          );
        }
      }
      aheadThin.forEach(function (r) {
        if (!primaryRow || r.levelIndex !== primaryRow.levelIndex) {
          alternatives.push({
            action: "training",
            levelIndex: r.levelIndex,
            levelLabel: r.levelLabel,
            title: "可以练但不是主线 " + r.levelLabel,
            detail: r.priorLabel + " · " + r.stageLabel + " n=" + r.n,
          });
        }
      });
    }

    aheadNoData.forEach(function (r) {
      reasons.push(
        reason(
          "R-ahead-nodata",
          "ahead_no_data_block",
          r.levelLabel + " 超前且无数据，先别开",
          "不拿开局去试超纲"
        )
      );
    });

    var dontLabels = aheadNoData.map(function (r) {
      return r.levelLabel;
    });
    var dontCopy = "";
    if (dontLabels.length === 1) dontCopy = dontLabels[0];
    else if (dontLabels.length > 1) dontCopy = dontLabels[0] + " 及以上";

    var sysLevel =
      systemPick && systemPick.levelIndex != null && Number.isFinite(Number(systemPick.levelIndex))
        ? clampLevel(systemPick.levelIndex)
        : systemPick && systemPick.pickedL != null
          ? clampLevel(Number(systemPick.pickedL) - 1)
          : null;

    var diverges =
      primaryRow && sysLevel != null ? primaryRow.levelIndex !== sysLevel : false;

    var parentCopy = "";
    var title = "";
    var detail = "";
    if (!primaryRow) {
      title = "暂无主建议";
      parentCopy = "热图或年级信号不足，无法按当前规则给出主线。";
      detail = parentCopy;
    } else {
      title = "今日主线 · 训练 " + primaryRow.levelLabel;
      parentCopy =
        "建议练 " +
        primaryRow.levelLabel +
        "（" +
        primaryRow.priorLabel +
        " · " +
        primaryRow.stageLabel +
        "，准" +
        primaryRow.pPct +
        "）。";
      if (dontCopy) parentCopy += "不要开 " + dontCopy + "。";
      detail =
        primaryRow.levelLabel +
        " " +
        primaryRow.priorLabel +
        "/" +
        primaryRow.stageLabel +
        " n=" +
        primaryRow.n +
        " 准" +
        primaryRow.pPct +
        (primaryRow.tooSlow ? " 过慢" : "");
    }

    return {
      ruleVersion: RULE_VERSION,
      grade: grade,
      primary: primaryRow
        ? {
            action: "training",
            mode: "training",
            levelIndex: primaryRow.levelIndex,
            levelLabel: primaryRow.levelLabel,
            overwriteTrainingPick: true,
            title: title,
            parentCopy: parentCopy,
            detail: detail,
            prior: primaryRow.prior,
            stage: primaryRow.stage,
            pickNote: pickNote,
          }
        : {
            action: "insufficient_data",
            mode: "training",
            levelIndex: null,
            levelLabel: "",
            overwriteTrainingPick: false,
            title: title,
            parentCopy: parentCopy,
            detail: detail,
            pickNote: "none",
          },
      alternatives: alternatives,
      dontOpen: dontLabels,
      dontOpenLabel: dontCopy,
      reasons: reasons,
      rows: rows,
      systemPick: systemPick,
      divergesFromSystemPick: diverges,
      provisional: {
        Q1_aheadMasteredN: AHEAD_MASTERED_N,
        Q2_schoolHolesBeatAhead: true,
      },
      unresolved: unresolved,
    };
  }

  var api = {
    RULE_VERSION: RULE_VERSION,
    AHEAD_MASTERED_N: AHEAD_MASTERED_N,
    curriculumPrior: curriculumPrior,
    classifyStage: classifyStage,
    heatBand: heatBand,
    computePracticeAdvice: computePracticeAdvice,
    PRIOR_LABEL: PRIOR_LABEL,
    STAGE_LABEL: STAGE_LABEL,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JmlPracticeAdvice = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
