/**
 * 练习建议 v0：年级先验 × 热图阶段 × 分型队列。只读推荐，不改训练开局。
 * 规则见《练习建议规则说明》§十。
 */
(function (root) {
  var RULE_VERSION = "0.3-provisional";
  var LEVEL_COUNT = 16;
  var HEAT_P_ORANGE = 0.9;
  var HEAT_P_YELLOW = 0.95;
  var AHEAD_MASTERED_N = 80;
  /** Q3：绿快底板连续档数 */
  var FLOOR_MIN = 4;
  /** timePct 低于此视为「人群中不算慢」（越小越快） */
  var FAST_TIME_PCT = 50;
  /** Q4：平台型每练几局短板后插一次闯关 */
  var TRAIN_GAMES_BEFORE_SCAN = 3;
  /** 热图低段：L1–L9 */
  var LOW_BAND_MAX_INDEX = 8;

  var PRIOR_LABEL = {
    learned: "已学",
    current: "同步",
    ahead: "超前",
    unknown: "年级未填",
  };
  var PROFILE_LABEL = {
    skill_gaps: "底板型（前面能快，后面是弱项）",
    global_baseline: "平台型（整体底子，没有又绿又快的底板）",
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

  function stageLabelOf(row) {
    if (row.stage === "weak" && row.tooSlow && row.p != null && row.p >= HEAT_P_ORANGE) {
      return "会但过慢";
    }
    if (row.stage === "weak") return "不会/很生";
    if (row.stage === "shaky") return "不熟";
    if (row.stage === "thin") return "样本薄";
    if (row.stage === "mastered") return "会了";
    if (row.stage === "no_data") return "无数据";
    return row.stage;
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

  function sortHolesWorstFirst(rows) {
    return rows.slice().sort(function (a, b) {
      return holeScore(b) - holeScore(a);
    });
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
      var row = {
        levelIndex: i,
        L: i + 1,
        levelLabel: levelLabel(i),
        prior: prior,
        priorLabel: PRIOR_LABEL[prior] || prior,
        stage: classifyStage(cell, prior),
        n: n,
        p: p,
        pPct: pctText(p),
        tooSlow: !!(cell && cell.tooSlow),
        fluent: !!(cell && cell.fluent),
        band: heatBand(cell),
        timePct: cell && cell.timePct != null && Number.isFinite(Number(cell.timePct)) ? Number(cell.timePct) : null,
      };
      row.stageLabel = stageLabelOf(row);
      rows.push(row);
    }
    return rows;
  }

  function greenFastFloorLen(rows) {
    var n = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      if (r.band !== "fluent") break;
      if (r.timePct == null || r.timePct >= FAST_TIME_PCT) break;
      n += 1;
    }
    return n;
  }

  function classifyProfile(rows) {
    var floor = greenFastFloorLen(rows);
    var holesAbove = rows.some(function (r) {
      return r.levelIndex >= floor && (r.stage === "weak" || r.stage === "shaky");
    });
    var id = floor >= FLOOR_MIN && holesAbove ? "skill_gaps" : "global_baseline";
    return {
      id: id,
      label: PROFILE_LABEL[id],
      floor: floor,
      floorLabel: floor > 0 ? "L1–L" + floor : "无",
    };
  }

  function lowBandFluentTopIndex(rows) {
    var top = -1;
    for (var i = 0; i <= LOW_BAND_MAX_INDEX && i < rows.length; i += 1) {
      if (rows[i].band === "fluent") top = i;
    }
    return top;
  }

  function resolveScanTarget(rows, opts) {
    var hist = null;
    if (opts.levelChallengeBestLevel != null && Number.isFinite(Number(opts.levelChallengeBestLevel))) {
      hist = Math.floor(Number(opts.levelChallengeBestLevel));
    }
    if (opts.levelBestFromRuns != null && Number.isFinite(Number(opts.levelBestFromRuns))) {
      var fromRuns = Math.floor(Number(opts.levelBestFromRuns));
      if (hist == null || fromRuns > hist) hist = fromRuns;
    }
    var low = lowBandFluentTopIndex(rows);
    var idx;
    if (hist != null && hist >= 2 && low >= 0) idx = Math.min(hist, low);
    else if (hist != null && hist >= 2) idx = hist;
    else if (low >= 2) idx = low;
    else idx = 5;
    idx = clampLevel(idx);
    return { levelIndex: idx, levelLabel: levelLabel(idx) };
  }

  function reason(ruleId, code, evidence, note) {
    return { ruleId: ruleId, code: code, evidence: evidence || "", note: note || "" };
  }

  function trainingQueueItem(row, extra) {
    extra = extra || {};
    return {
      action: "training",
      mode: "training",
      levelIndex: row.levelIndex,
      levelLabel: row.levelLabel,
      games: extra.games != null ? extra.games : null,
      until: extra.until || "",
      title: extra.title || "训练 " + row.levelLabel,
      detail:
        (row.priorLabel || "") +
        " · " +
        row.stageLabel +
        " 准" +
        row.pPct +
        (row.tooSlow ? " 过慢" : "") +
        " n=" +
        row.n,
    };
  }

  function pickPrimaryRow(rows, schoolHoles, aheadMastered, aheadThin, schoolMastered) {
    var primaryRow = null;
    var pickNote = "";
    var alternatives = [];
    if (schoolHoles.length) {
      primaryRow = pickWorstHole(schoolHoles);
      pickNote = "in_school_hole";
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
    } else if (aheadMastered.length) {
      primaryRow = aheadMastered[0];
      for (var am = 1; am < aheadMastered.length; am += 1) {
        if (aheadMastered[am].levelIndex < primaryRow.levelIndex) primaryRow = aheadMastered[am];
      }
      pickNote = "ahead_mastered";
    } else if (schoolMastered.length) {
      var slow = schoolMastered.slice().sort(function (a, b) {
        var ta = a.timePct == null ? -1 : a.timePct;
        var tb = b.timePct == null ? -1 : b.timePct;
        return tb - ta;
      });
      primaryRow = slow[0];
      pickNote = "school_slowest";
    } else if (aheadThin.length) {
      primaryRow = aheadThin[0];
      for (var at = 1; at < aheadThin.length; at += 1) {
        if (aheadThin[at].levelIndex < primaryRow.levelIndex) primaryRow = aheadThin[at];
      }
      pickNote = "ahead_thin_only";
    } else {
      var openable = rows.filter(function (r) {
        return (r.prior === "current" || r.prior === "unknown") && r.stage === "no_data";
      });
      if (openable.length) {
        primaryRow = openable[0];
        pickNote = "open_current";
      }
    }
    return { primaryRow: primaryRow, pickNote: pickNote, alternatives: alternatives };
  }

  function buildQueue(profile, primaryRow, schoolHoles, scan, hasClearedLevel) {
    var queue = [];
    if (!primaryRow) return queue;
    if (profile.id === "skill_gaps") {
      var holes = sortHolesWorstFirst(schoolHoles);
      if (!holes.length) holes = [primaryRow];
      holes.slice(0, 4).forEach(function (r, i) {
        queue.push(
          trainingQueueItem(r, {
            until: "刷到非黄非橙",
            title: i === 0 ? "先练 " + r.levelLabel + "，直到转绿" : "再练 " + r.levelLabel + "，直到转绿",
          })
        );
      });
      if (!hasClearedLevel) {
        queue.push({
          action: "level",
          mode: "level",
          levelIndex: null,
          levelLabel: "闯关",
          games: null,
          until: "弱项轮过一轮后再摸底（底板型，不频繁）",
          title: "稍后闯关摸底",
          detail: "已通关者不插；未通关则本轮弱项过完再闯，不插在每段训练后",
        });
      }
      return queue;
    }
    queue.push(
      trainingQueueItem(primaryRow, {
        games: TRAIN_GAMES_BEFORE_SCAN,
        until: "先打 " + TRAIN_GAMES_BEFORE_SCAN + " 局",
        title: "训练 " + primaryRow.levelLabel + " × " + TRAIN_GAMES_BEFORE_SCAN + " 局",
      })
    );
    queue.push({
      action: "level",
      mode: "level",
      levelIndex: scan.levelIndex,
      levelLabel: "闯关→" + scan.levelLabel,
      games: null,
      until: "从 L1 开，须到达 " + scan.levelLabel + "；更早出局不算完成，下一次仍闯关",
      title: "闯关扫描，合格线 " + scan.levelLabel,
      detail: "平台型：短板几局后必须用闯关从第一级过一遍，避免手误早停冒充练完",
    });
    return queue;
  }

  function computePracticeAdvice(opts) {
    opts = opts || {};
    var grade = opts.grade;
    var cells = opts.cells;
    var systemPick = opts.systemPick || null;
    var hasClearedLevel = opts.hasClearedLevel === true;
    var rows = buildRows(grade, cells);
    var profile = classifyProfile(rows);
    var scan = resolveScanTarget(rows, opts);
    var reasons = [];
    var unresolved = [
      "Q1 超前「会了」暂定 n≥" + AHEAD_MASTERED_N,
      "Q2 已学/同步黄橙暂定永远压过超前",
      "Q3 绿快底板暂定连续 " + FLOOR_MIN + " 档且 timePct<" + FAST_TIME_PCT,
      "Q4 平台型暂定训练 " + TRAIN_GAMES_BEFORE_SCAN + " 局后闯关",
      "Q5 闯关合格线暂定 min(历史闯关最高, 热图 L1–L9 流畅顶)",
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

    var picked = pickPrimaryRow(rows, schoolHoles, aheadMastered, aheadThin, schoolMastered);
    var primaryRow = picked.primaryRow;
    var pickNote = picked.pickNote;
    var alternatives = picked.alternatives;

    reasons.push(
      reason(
        "R-profile",
        profile.id,
        profile.label + "；绿快底板 " + profile.floorLabel + "（" + profile.floor + " 档）",
        "Q3 暂定"
      )
    );

    if (primaryRow && pickNote === "in_school_hole") {
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
    }

    aheadThin.forEach(function (r) {
      alternatives.push({
        action: "training",
        levelIndex: r.levelIndex,
        levelLabel: r.levelLabel,
        title: "可以练但不是主线 " + r.levelLabel,
        detail: r.priorLabel + " · " + r.stageLabel + " n=" + r.n,
      });
    });

    aheadNoData.forEach(function (r) {
      reasons.push(
        reason("R-ahead-nodata", "ahead_no_data_block", r.levelLabel + " 超前且无数据，先别开", "不拿开局去试超纲")
      );
    });

    var queue = buildQueue(profile, primaryRow, schoolHoles, scan, hasClearedLevel);
    if (profile.id === "global_baseline") {
      reasons.push(
        reason(
          "R-queue-scan",
          "global_baseline_scan",
          "训练 " + TRAIN_GAMES_BEFORE_SCAN + " 局后闯关，合格线 " + scan.levelLabel,
          "Q4/Q5 暂定；未达线则队列停在闯关"
        )
      );
    } else {
      reasons.push(
        reason(
          "R-queue-drill",
          "skill_gaps_drill",
          hasClearedLevel ? "按弱项排队刷绿，已通关故日常不插闯关" : "按弱项排队刷绿，闯关不插在每段训练后",
          ""
        )
      );
    }

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

    var firstTrain = null;
    for (var qi = 0; qi < queue.length; qi += 1) {
      if (queue[qi].action === "training") {
        firstTrain = queue[qi];
        break;
      }
    }
    var compareLevel = firstTrain ? firstTrain.levelIndex : primaryRow ? primaryRow.levelIndex : null;
    var diverges = compareLevel != null && sysLevel != null ? compareLevel !== sysLevel : false;

    var title = "";
    var parentCopy = "";
    var detail = "";
    if (!primaryRow) {
      title = "暂无主建议";
      parentCopy = "热图或年级信号不足，无法按当前规则给出队列。";
      detail = parentCopy;
    } else {
      title = profile.id === "skill_gaps" ? "弱项队列 · 先练 " + primaryRow.levelLabel : "平台队列 · 先练 " + primaryRow.levelLabel;
      parentCopy = profile.label + "。";
      queue.forEach(function (step, i) {
        parentCopy +=
          (i + 1) +
          ". " +
          (step.title || step.levelLabel) +
          (step.until ? "（" + step.until + "）" : "") +
          (i < queue.length - 1 ? " → " : "");
      });
      if (dontCopy) parentCopy += " 不要开 " + dontCopy + "。";
      detail = primaryRow.levelLabel + " " + primaryRow.priorLabel + "/" + primaryRow.stageLabel;
    }

    return {
      ruleVersion: RULE_VERSION,
      grade: grade,
      profile: profile,
      scanTarget: scan,
      queue: queue,
      primary: primaryRow
        ? {
            action: firstTrain ? firstTrain.action : "training",
            mode: firstTrain ? firstTrain.mode : "training",
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
        Q3_floorMin: FLOOR_MIN,
        Q3_fastTimePct: FAST_TIME_PCT,
        Q4_trainGamesBeforeScan: TRAIN_GAMES_BEFORE_SCAN,
      },
      unresolved: unresolved,
    };
  }

  var api = {
    RULE_VERSION: RULE_VERSION,
    AHEAD_MASTERED_N: AHEAD_MASTERED_N,
    FLOOR_MIN: FLOOR_MIN,
    FAST_TIME_PCT: FAST_TIME_PCT,
    TRAIN_GAMES_BEFORE_SCAN: TRAIN_GAMES_BEFORE_SCAN,
    curriculumPrior: curriculumPrior,
    classifyStage: classifyStage,
    classifyProfile: classifyProfile,
    heatBand: heatBand,
    computePracticeAdvice: computePracticeAdvice,
    PRIOR_LABEL: PRIOR_LABEL,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JmlPracticeAdvice = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
