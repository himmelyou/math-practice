/**
 * 月度报告画布渲染（浏览器）。数据由服务端 /monthly-report/.../data 提供。
 */
(function (global) {
  function monthLabelZh(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return String(monthKey || "");
    return monthKey.slice(0, 4) + "年" + Number(monthKey.slice(5, 7)) + "月";
  }

  function monthLabelEn(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return String(monthKey || "");
    var names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return names[Number(monthKey.slice(5, 7)) - 1] + " " + monthKey.slice(0, 4);
  }

  function displayTitle(username, monthKey) {
    return String(username || "") + "_" + monthLabelZh(monthKey) + "_月度报告.png";
  }

  function safeUserSlug(username) {
    var s = String(username || "").trim();
    var ascii = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    if (ascii) return ascii.slice(0, 64);
    var hex = "";
    try {
      for (var i = 0; i < s.length && hex.length < 16; i += 1) {
        hex += s.charCodeAt(i).toString(16);
      }
    } catch (e) {
      hex = String(Date.now());
    }
    return "user_" + hex.slice(0, 16);
  }

  function downloadFileName(username, monthKey) {
    return safeUserSlug(username) + "_" + String(monthKey || "report") + ".png";
  }

  function displayFileName(username, monthKey) {
    return displayTitle(username, monthKey);
  }

  function dataUrlToBlob(dataUrl) {
    var str = String(dataUrl || "");
    var m = /^data:([^;]+);base64,(.+)$/.exec(str);
    if (!m) return null;
    var bin = atob(m[2]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || "image/png" });
  }

  function resolvePngBlob(source) {
    if (source && typeof source === "object" && typeof source.size === "number") {
      return source;
    }
    if (typeof source === "string" && source.indexOf("base64,") >= 0) {
      return dataUrlToBlob(source);
    }
    if (typeof source === "string" && source.length) {
      return dataUrlToBlob("data:image/png;base64," + source);
    }
    return null;
  }

  function safeDownloadName(fileName) {
    var name = String(fileName || "monthly-report.png").replace(/[\\/:*?"<>|]+/g, "_");
    if (!/\.png$/i.test(name)) name += ".png";
    return name;
  }

  function triggerPngDownload(source, fileName) {
    var name = safeDownloadName(fileName);
    var blob = resolvePngBlob(source);
    if (!blob) return false;
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        /* ignore */
      }
    }, 2000);
    return true;
  }

  function looksMobileUa() {
    var ua = String((typeof navigator !== "undefined" && navigator.userAgent) || "");
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    // iPadOS 桌面 UA
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) {
      return true;
    }
    return false;
  }

  function canSharePngFile(file) {
    try {
      if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
      if (typeof navigator.canShare !== "function") return false;
      return !!navigator.canShare({ files: [file] });
    } catch (e) {
      return false;
    }
  }

  /**
   * 手机优先系统分享（可存相册/发微信）；电脑或不支持则下载到 Downloads。
   * @returns {Promise<{ method: 'share'|'download', ok: boolean, aborted?: boolean, fallback?: boolean }>}
   */
  function saveOrSharePng(source, fileName) {
    var name = safeDownloadName(fileName);
    var blob = resolvePngBlob(source);
    if (!blob) {
      return Promise.resolve({ method: "download", ok: false });
    }
    var file = null;
    try {
      file = new File([blob], name, { type: "image/png" });
    } catch (e) {
      file = null;
    }
    var preferShare = looksMobileUa() && file && canSharePngFile(file);
    if (preferShare) {
      return navigator
        .share({ files: [file], title: name })
        .then(function () {
          return { method: "share", ok: true };
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") {
            return { method: "share", ok: false, aborted: true };
          }
          var ok = triggerPngDownload(blob, name);
          return { method: "download", ok: !!ok, fallback: true };
        });
    }
    var ok = triggerPngDownload(blob, name);
    return Promise.resolve({
      method: "download",
      ok: !!ok,
      mobileWithoutShare: looksMobileUa(),
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * 月报画布（朋友圈向）：信息少、留白够；字号阶梯 + 行距绑定。
   * A：左仅天数/局数；右饼图 + 旁侧小字图例（不占左栏）。
   * 不展示用户名；右上仅昵称（可空）。
   */
  var RPT = {
    W: 720,
    PAD: 40,
    GAP: 24,
    HEADER: 118,
    SECTION_GAP: 30,
    TITLE_H: 36,
    TITLE_PAD_BOTTOM: 16,
    SUB_H: 30,
    LINE_H: 34,
    STAT_BLOCK: 56,
    STAT_GAP: 16,
    STAT_COL_GAP: 16,
    PIE: 164,
    LEGEND_ROW: 24,
    LEGEND_GAP: 10,
    FOOTER: 40,
    ACCENT: "#2563eb",
    COLORS: ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#94a3b8"],
    FONT: {
      brand: 26,
      nick: 22,
      title: 30,
      titleEn: 18,
      section: 26,
      subhead: 22,
      body: 22,
      bullet: 20,
      label: 17,
      stat: 26,
      legend: 17,
      footer: 16,
    },
  };

  function font(weight, sizePx) {
    return (
      (weight ? weight + " " : "") +
      sizePx +
      "px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    );
  }

  function ellipsize(ctx, text, maxW) {
    var s = String(text || "");
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }

  function rowsForList(n) {
    if (n <= 0) return 1;
    return n;
  }

  function publicDownloadSlug(data) {
    var nick = String((data && data.nickname) || "").trim();
    return nick ? safeUserSlug(nick) : "report";
  }

  function planReportHeight(data) {
    var habit = data.habit || {};
    var mix = Array.isArray(habit.mix) ? habit.mix : [];
    var leftH = RPT.STAT_BLOCK * 2 + RPT.STAT_GAP; // 2×2 两行
    var legendH = mix.length
      ? Math.max(RPT.PIE, mix.length * RPT.LEGEND_ROW)
      : RPT.PIE;
    var rightH = legendH + 8;
    var aBody = Math.max(leftH, rightH);
    var changes =
      (data.milestones && (data.milestones.breakthroughsZh || data.milestones.changesZh)) || [];
    var chRows = rowsForList(changes.length || 1);
    var top = (data.progress && data.progress.top) || [];
    var topRows = rowsForList(top.length || 1);
    var h =
      RPT.HEADER +
      RPT.SECTION_GAP +
      RPT.TITLE_H +
      RPT.TITLE_PAD_BOTTOM +
      aBody +
      RPT.SECTION_GAP +
      RPT.TITLE_H +
      RPT.TITLE_PAD_BOTTOM +
      RPT.SUB_H +
      chRows * RPT.LINE_H +
      12 +
      RPT.SUB_H +
      topRows * RPT.LINE_H +
      RPT.FOOTER +
      RPT.PAD;
    return Math.max(640, Math.min(1280, Math.ceil(h)));
  }

  function drawDivider(ctx, y) {
    ctx.strokeStyle = "rgba(148,163,184,0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RPT.PAD, y);
    ctx.lineTo(RPT.W - RPT.PAD, y);
    ctx.stroke();
    return y + RPT.SECTION_GAP;
  }

  function drawSectionTitle(ctx, y, zh) {
    ctx.fillStyle = "#0f3d7a";
    ctx.font = font("bold", RPT.FONT.section);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(zh, RPT.PAD, y + 22);
    return y + RPT.TITLE_H + RPT.TITLE_PAD_BOTTOM;
  }

  function drawPie(ctx, cx, cy, radius, mix) {
    var total = 0;
    mix.forEach(function (m) {
      total += Math.max(0, Number(m.pct) || 0);
    });
    if (!(total > 0)) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.fill();
      return;
    }
    var start = -Math.PI / 2;
    mix.forEach(function (m, i) {
      var slice = (Math.max(0, Number(m.pct) || 0) / total) * Math.PI * 2;
      if (slice <= 0) return;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = RPT.COLORS[i % RPT.COLORS.length];
      ctx.fill();
      start += slice;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  /** 饼图右侧小字图例 */
  function drawPieLegend(ctx, x, topY, maxH, mix) {
    var F = RPT.FONT;
    if (!mix.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = font("", F.legend);
      ctx.textBaseline = "alphabetic";
      ctx.fillText("暂无分类", x, topY + 16);
      return;
    }
    var blockH = mix.length * RPT.LEGEND_ROW;
    var y0 = topY + Math.max(0, (maxH - blockH) / 2);
    mix.forEach(function (m, i) {
      var rowY = y0 + i * RPT.LEGEND_ROW;
      var sw = 9;
      ctx.fillStyle = RPT.COLORS[i % RPT.COLORS.length];
      roundRect(ctx, x, rowY + 4, sw, sw, 2);
      ctx.fill();
      ctx.fillStyle = "#475569";
      ctx.font = font("", F.legend);
      ctx.textBaseline = "alphabetic";
      var text = (m.zh || "") + " " + (m.pct != null ? m.pct : 0) + "%";
      ctx.fillText(ellipsize(ctx, text, 150), x + sw + 6, rowY + 13);
    });
  }

  /** 将文案中的数据数字用强调色分段绘制 */
  function drawTextWithNumberHighlight(ctx, text, x, baselineY, maxW, baseColor, accentColor, fontSize, baseWeight) {
    var size = fontSize != null ? fontSize : RPT.FONT.body;
    var weight = baseWeight || "";
    var full = String(text || "");
    ctx.font = font(weight, size);
    ctx.textBaseline = "alphabetic";
    var clipped = ellipsize(ctx, full, maxW);
    // 只标指标：百分比/时长/第N级/共有N项；不扫标题里的裸数字（如「结果超100」「2~11」）
    var re =
      /(\d+(?:\.\d+)?%|\d+小时(?:\d+分)?(?:\d+秒)?|\d+分\d+秒|\d+分钟|\d+秒|第\d+级|共有\s*\d+)/g;
    var last = 0;
    var m;
    var cx = x;
    while ((m = re.exec(clipped)) != null) {
      var raw = m[0];
      var hiStart = m.index;
      var hiText = raw;
      // 「共有 13」只高亮数字部分
      var gongyou = /^共有\s*/.exec(raw);
      if (gongyou) {
        hiStart += gongyou[0].length;
        hiText = raw.slice(gongyou[0].length);
      } else {
        // 「第1级」只高亮中间数字
        var diJi = /^第(\d+)级$/.exec(raw);
        if (diJi) {
          hiStart += 1;
          hiText = diJi[1];
        }
      }
      var before = clipped.slice(last, hiStart);
      if (before) {
        ctx.fillStyle = baseColor;
        ctx.font = font(weight, size);
        ctx.fillText(before, cx, baselineY);
        cx += ctx.measureText(before).width;
      }
      ctx.fillStyle = accentColor;
      ctx.font = font("bold", size);
      ctx.fillText(hiText, cx, baselineY);
      cx += ctx.measureText(hiText).width;
      last = m.index + raw.length;
      var afterHi = clipped.slice(hiStart + hiText.length, last);
      if (afterHi) {
        ctx.fillStyle = baseColor;
        ctx.font = font(weight, size);
        ctx.fillText(afterHi, cx, baselineY);
        cx += ctx.measureText(afterHi).width;
      }
    }
    var rest = clipped.slice(last);
    if (rest) {
      ctx.fillStyle = baseColor;
      ctx.font = font(weight, size);
      ctx.fillText(rest, cx, baselineY);
    }
  }

  function drawBulletGrid(ctx, y, items, emptyText) {
    var list = items && items.length ? items : [emptyText || "—"];
    var colW = RPT.W - RPT.PAD * 2;
    for (var i = 0; i < list.length; i += 1) {
      drawTextWithNumberHighlight(
        ctx,
        "· " + list[i],
        RPT.PAD,
        y + 22,
        colW,
        "#1e293b",
        RPT.ACCENT,
        RPT.FONT.bullet
      );
      y += RPT.LINE_H;
    }
    return y;
  }

  function renderReportPng(data) {
    if (!data || !data.monthKey) {
      return Promise.reject(new Error("missing_report_data"));
    }
    var monthKey = data.monthKey;
    var nickname = String(data.nickname || "").trim();
    var W = RPT.W;
    var H = planReportHeight(data);
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("canvas_unsupported"));

    var F = RPT.FONT;
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#f0f6ff");
    grad.addColorStop(0.45, "#ffffff");
    grad.addColorStop(1, "#f8fafc");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, 14, 14, W - 28, H - 28, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(37,99,235,0.14)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 页眉：左昵称 · 右品牌（同字号）
    ctx.textBaseline = "alphabetic";
    ctx.font = font("bold", F.brand);
    if (nickname) {
      ctx.fillStyle = "#475569";
      var nickDraw = ellipsize(ctx, nickname, W * 0.45);
      ctx.fillText(nickDraw, RPT.PAD, 52);
    }
    ctx.fillStyle = "#1a3f8f";
    var brand = "Jarvis Math Lab";
    ctx.fillText(brand, W - RPT.PAD - ctx.measureText(brand).width, 52);
    ctx.fillStyle = "#0f172a";
    ctx.font = font("bold", F.title);
    ctx.fillText(data.titleZh || "数感练习月报（" + monthLabelZh(monthKey) + "）", RPT.PAD, 88);
    ctx.fillStyle = "#94a3b8";
    ctx.font = font("", F.titleEn);
    ctx.fillText(data.titleEn || monthLabelEn(monthKey), RPT.PAD, 112);

    var y = RPT.HEADER;
    y = drawDivider(ctx, y);

    // A：左 2×2 统计 · 右饼图+图例
    y = drawSectionTitle(ctx, y, "A. 本月练习统计");
    var aTop = y;
    var habit = data.habit || {};
    var activeDays = habit.activeDays != null ? habit.activeDays : 0;
    var runCount = habit.runs != null ? habit.runs : 0;
    var tasksDone = habit.tasksDone != null ? habit.tasksDone : 0;
    var durationLabel = habit.durationLabel || "0秒";
    var mix = Array.isArray(habit.mix) ? habit.mix : [];

    // 右区先定位，再算左栏可用宽度
    var legendW = 148;
    var pieR = RPT.PIE / 2;
    var legendX = W - RPT.PAD - legendW;
    var pieCx = legendX - RPT.LEGEND_GAP - pieR;
    var pieLift = 14; // 饼图/图例相对左栏略上移
    var pieCy = aTop + pieR - pieLift;
    var leftPanelW = Math.max(200, pieCx - pieR - RPT.GAP - RPT.PAD);
    var statColW = (leftPanelW - RPT.STAT_COL_GAP) / 2;

    function drawStatAt(col, row, label, value) {
      var x = RPT.PAD + col * (statColW + RPT.STAT_COL_GAP);
      var yy = aTop + row * (RPT.STAT_BLOCK + RPT.STAT_GAP);
      ctx.fillStyle = "#64748b";
      ctx.font = font("", F.label);
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, x, yy + 14);
      ctx.fillStyle = RPT.ACCENT;
      ctx.font = font("bold", F.stat);
      ctx.fillText(ellipsize(ctx, String(value), statColW), x, yy + 48);
    }
    // 顺序：天数、时长 / 局数、任务
    drawStatAt(0, 0, "练习天数", activeDays);
    drawStatAt(1, 0, "练习时长", durationLabel);
    drawStatAt(0, 1, "完成局数", runCount);
    drawStatAt(1, 1, "完成任务", tasksDone);
    var leftBottom = aTop + RPT.STAT_BLOCK * 2 + RPT.STAT_GAP;

    drawPie(ctx, pieCx, pieCy, pieR, mix);
    drawPieLegend(ctx, legendX, aTop - pieLift, RPT.PIE, mix);

    y = Math.max(leftBottom, aTop + RPT.PIE) + 4;
    y = drawDivider(ctx, y);

    // B
    y = drawSectionTitle(ctx, y, "B. 本月进度总结");
    ctx.fillStyle = "#64748b";
    ctx.font = font("bold", F.subhead);
    ctx.fillText("新的突破", RPT.PAD, y + 20);
    y += RPT.SUB_H;
    var breakthroughs =
      (data.milestones && (data.milestones.breakthroughsZh || data.milestones.changesZh)) || [];
    y = drawBulletGrid(ctx, y, breakthroughs, "本月暂无新的突破");

    y += 12;
    var improvedCells =
      data.progress && data.progress.improvedCells != null ? data.progress.improvedCells : 0;
    drawTextWithNumberHighlight(
      ctx,
      "热图进步（本月共有 " + improvedCells + " 项热图取得进步）",
      RPT.PAD,
      y + 20,
      W - RPT.PAD * 2,
      "#64748b",
      RPT.ACCENT,
      F.subhead,
      "bold"
    );
    y += RPT.SUB_H;
    var top = (data.progress && Array.isArray(data.progress.top) && data.progress.top) || [];
    var topLines = top.map(function (r) {
      return r.zh || "";
    });
    y = drawBulletGrid(ctx, y, topLines, "暂无明显热图进步");

    if (data.inProgress || data.adminOnlyPreview) {
      y += 14;
      var note = "管理端预览 · 学员不可见";
      ctx.fillStyle = "#b45309";
      ctx.font = font("", F.footer);
      ctx.fillText(note, W - RPT.PAD - ctx.measureText(note).width, y + 16);
    }

    var slug = publicDownloadSlug(data);
    var title = slug + "_" + monthLabelZh(monthKey) + "_月度报告.png";
    var dlName = slug + "_" + String(monthKey || "report") + ".png";
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("toBlob_failed"));
          return;
        }
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          blob: blob,
          fileName: title,
          displayTitle: title,
          downloadFileName: dlName,
          width: W,
          height: H,
        });
      }, "image/png");
    });
  }

  /** @deprecated 无数据时不可用；请用 renderReportPng(data) */
  function renderFakeReportPng(_username, monthKey) {
    return renderReportPng({
      nickname: "",
      monthKey: monthKey,
      titleZh: "数感练习月报（" + monthLabelZh(monthKey) + "）",
      titleEn: "Monthly Learning Report · " + monthLabelEn(monthKey),
      habit: { activeDays: 0, runs: 0, mix: [] },
      milestones: { changesZh: [], changesEn: [] },
      progress: { improvedCells: 0, top: [] },
    });
  }

  function dataUrlToBase64(dataUrl) {
    var i = String(dataUrl || "").indexOf("base64,");
    return i >= 0 ? dataUrl.slice(i + 7) : "";
  }

  global.JmlMonthlyReportFake = {
    monthLabelZh: monthLabelZh,
    monthLabelEn: monthLabelEn,
    displayTitle: displayTitle,
    displayFileName: displayFileName,
    downloadFileName: downloadFileName,
    safeUserSlug: safeUserSlug,
    renderReportPng: renderReportPng,
    renderFakeReportPng: renderFakeReportPng,
    dataUrlToBase64: dataUrlToBase64,
    dataUrlToBlob: dataUrlToBlob,
    triggerPngDownload: triggerPngDownload,
    saveOrSharePng: saveOrSharePng,
    looksMobileUa: looksMobileUa,
  };
})(typeof window !== "undefined" ? window : globalThis);
