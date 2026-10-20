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
   * 月报画布：固定栅格 + y 只增；先算高度再绘制。
   * 字号按朋友圈阅读设计：720 宽图在手机上约缩到一半，
   * 画布字号 ≈ 屏幕目标字号 × 1.85（正文目标约 15–17px → 画布 28–32）。
   */
  var RPT = {
    W: 720,
    PAD: 36,
    GAP: 20,
    HEADER: 148,
    SECTION_GAP: 22,
    TITLE_H: 42,
    LINE_H: 40,
    STAT_H: 56,
    LEGEND_H: 32,
    PIE: 188,
    FOOTER: 44,
    SHORT_LEN: 14,
    COLORS: ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#64748b"],
    FONT: {
      brand: 34,
      nick: 28,
      title: 36,
      titleEn: 22,
      section: 32,
      subhead: 26,
      body: 28,
      label: 24,
      stat: 44,
      caption: 22,
      footer: 20,
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

  function useTwoCol(items) {
    if (!items || items.length < 2) return false;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i] || "").length > RPT.SHORT_LEN) return false;
    }
    return true;
  }

  function rowsForList(n, twoCol) {
    if (n <= 0) return 1;
    return twoCol ? Math.ceil(n / 2) : n;
  }

  function publicDownloadSlug(data) {
    var nick = String((data && data.nickname) || "").trim();
    return nick ? safeUserSlug(nick) : "report";
  }

  function planReportHeight(data) {
    var habit = data.habit || {};
    var mix = Array.isArray(habit.mix) ? habit.mix : [];
    var leftH = (RPT.STAT_H + 10) * 2;
    if (mix.length) leftH += 28 + mix.length * RPT.LEGEND_H;
    else leftH += RPT.STAT_H;
    var rightH = RPT.PIE + 36;
    var aBody = Math.max(leftH, rightH);
    var changes = (data.milestones && data.milestones.changesZh) || [];
    var chN = changes.length || 1;
    var chRows = rowsForList(chN, useTwoCol(changes));
    var top = (data.progress && data.progress.top) || [];
    var topLabels = top.map(function (r) {
      return r && r.zh ? r.zh : "";
    });
    var topN = top.length || 1;
    var topRows = rowsForList(topN, useTwoCol(topLabels));
    var h =
      RPT.HEADER +
      RPT.SECTION_GAP +
      RPT.TITLE_H +
      aBody +
      RPT.SECTION_GAP +
      RPT.TITLE_H +
      RPT.LINE_H +
      chRows * RPT.LINE_H +
      10 +
      RPT.LINE_H +
      topRows * RPT.LINE_H +
      RPT.FOOTER +
      RPT.PAD;
    return Math.max(720, Math.min(1400, Math.ceil(h)));
  }

  function drawDivider(ctx, y) {
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
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
    ctx.fillText(zh, RPT.PAD, y + 28);
    return y + RPT.TITLE_H;
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
      var slice = ((Math.max(0, Number(m.pct) || 0) / total) * Math.PI * 2);
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
    ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  /** 短列表：两列；否则单列。返回新的 y（内容底边） */
  function drawBulletGrid(ctx, y, items, emptyText) {
    var list = items && items.length ? items : [emptyText || "—"];
    var two = items && items.length ? useTwoCol(list) : false;
    var innerW = RPT.W - RPT.PAD * 2;
    var colW = two ? (innerW - RPT.GAP) / 2 : innerW;
    var i = 0;
    while (i < list.length) {
      var cols = two ? 2 : 1;
      for (var c = 0; c < cols && i < list.length; c += 1, i += 1) {
        var x = RPT.PAD + c * (colW + RPT.GAP);
        ctx.fillStyle = "#1e293b";
        ctx.font = font("", RPT.FONT.body);
        ctx.textBaseline = "alphabetic";
        ctx.fillText(ellipsize(ctx, "· " + list[i], colW), x, y + 28);
      }
      y += RPT.LINE_H;
    }
    return y;
  }

  /**
   * @param {object} data 服务端 buildForUser 返回的 payload
   */
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

    // 背景
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#f0f6ff");
    grad.addColorStop(0.4, "#ffffff");
    grad.addColorStop(1, "#f8fafc");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, 16, 16, W - 32, H - 32, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(37,99,235,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // —— 页眉：左品牌/标题，右昵称 ——
    var F = RPT.FONT;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#1a3f8f";
    ctx.font = font("bold", F.brand);
    ctx.fillText("Jarvis Math Lab", RPT.PAD, 58);
    if (nickname) {
      ctx.fillStyle = "#334155";
      ctx.font = font("bold", F.nick);
      var nickDraw = ellipsize(ctx, nickname, 220);
      ctx.fillText(nickDraw, W - RPT.PAD - ctx.measureText(nickDraw).width, 58);
    }
    ctx.fillStyle = "#0f172a";
    ctx.font = font("bold", F.title);
    ctx.fillText(data.titleZh || monthLabelZh(monthKey) + "学习月报", RPT.PAD, 104);
    ctx.fillStyle = "#94a3b8";
    ctx.font = font("", F.titleEn);
    ctx.fillText(data.titleEn || monthLabelEn(monthKey), RPT.PAD, 134);

    var y = RPT.HEADER;
    y = drawDivider(ctx, y);

    // —— A：左竖排数据 + 右饼图 ——
    y = drawSectionTitle(ctx, y, "A. 本月练了多少");
    var aTop = y;
    var habit = data.habit || {};
    var activeDays = habit.activeDays != null ? habit.activeDays : 0;
    var runCount = habit.runs != null ? habit.runs : 0;
    var mix = Array.isArray(habit.mix) ? habit.mix : [];
    var leftW = Math.floor((W - RPT.PAD * 2 - RPT.GAP) * 0.48);
    var rightX = RPT.PAD + leftW + RPT.GAP;
    var rightW = W - RPT.PAD - rightX;

    var ly = aTop;
    function drawStat(label, value) {
      ctx.fillStyle = "#64748b";
      ctx.font = font("", F.label);
      ctx.fillText(label, RPT.PAD, ly + 20);
      ctx.fillStyle = "#0f172a";
      ctx.font = font("bold", F.stat);
      ctx.fillText(String(value), RPT.PAD, ly + 52);
      ly += RPT.STAT_H + 10;
    }
    drawStat("练习天数", activeDays);
    drawStat("练习局数", runCount);

    if (mix.length) {
      ctx.fillStyle = "#64748b";
      ctx.font = font("", F.label);
      ctx.fillText("类别占比", RPT.PAD, ly + 18);
      ly += 28;
      mix.forEach(function (m, i) {
        var sw = 14;
        ctx.fillStyle = RPT.COLORS[i % RPT.COLORS.length];
        roundRect(ctx, RPT.PAD, ly + 4, sw, sw, 3);
        ctx.fill();
        ctx.fillStyle = "#1e293b";
        ctx.font = font("", F.body);
        var label = (m.zh || "") + " " + (m.pct != null ? m.pct : 0) + "%";
        ctx.fillText(ellipsize(ctx, label, leftW - 24), RPT.PAD + sw + 8, ly + 18);
        ly += RPT.LEGEND_H;
      });
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = font("", F.body);
      ctx.fillText("本月暂无练习记录", RPT.PAD, ly + 22);
      ly += RPT.STAT_H;
    }

    var pieR = RPT.PIE / 2;
    var pieCx = rightX + rightW / 2;
    var pieCy = aTop + pieR + 6;
    drawPie(ctx, pieCx, pieCy, pieR, mix);
    ctx.fillStyle = "#94a3b8";
    ctx.font = font("", F.caption);
    var pieCap = "练习构成";
    ctx.fillText(pieCap, pieCx - ctx.measureText(pieCap).width / 2, pieCy + pieR + 26);

    var aBottom = Math.max(ly, pieCy + pieR + 36);
    y = aBottom;
    y = drawDivider(ctx, y);

    // —— B：进度变化（短则两列）+ 热图 ——
    y = drawSectionTitle(ctx, y, "B. 本月进步了什么");
    ctx.fillStyle = "#475569";
    ctx.font = font("bold", F.subhead);
    ctx.fillText("进度变化", RPT.PAD, y + 24);
    y += RPT.LINE_H;
    var changesZh = (data.milestones && data.milestones.changesZh) || [];
    y = drawBulletGrid(ctx, y, changesZh, "本月暂无进度变化");

    y += 10;
    var improvedCells =
      data.progress && data.progress.improvedCells != null ? data.progress.improvedCells : 0;
    ctx.fillStyle = "#475569";
    ctx.font = font("bold", F.subhead);
    ctx.fillText("热图进步 · " + improvedCells + " 格", RPT.PAD, y + 24);
    y += RPT.LINE_H;
    var top = (data.progress && Array.isArray(data.progress.top) && data.progress.top) || [];
    var topLines = top.map(function (r) {
      var tag = r.kind === "acc" ? "准度" : "速度";
      return tag + " · " + (r.zh || "");
    });
    y = drawBulletGrid(ctx, y, topLines, "暂无明显进步格");

    y += 12;
    ctx.fillStyle = "#94a3b8";
    ctx.font = font("", F.footer);
    ctx.fillText("Jarvis Math Lab · " + monthLabelZh(monthKey), RPT.PAD, y + 18);
    if (data.inProgress || data.adminOnlyPreview) {
      var note = "管理端预览 · 学员不可见";
      ctx.fillStyle = "#b45309";
      ctx.fillText(note, W - RPT.PAD - ctx.measureText(note).width, y + 18);
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
      titleZh: monthLabelZh(monthKey) + "学习月报",
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
