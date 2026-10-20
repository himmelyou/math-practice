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

  function drawSectionTitle(ctx, y, zh, en) {
    ctx.fillStyle = "#0f3d7a";
    ctx.font = "bold 22px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(zh, 48, y);
    ctx.fillStyle = "#64748b";
    ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(en, 48, y + 22);
    return y + 48;
  }

  function drawLine(ctx, y) {
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(672, y);
    ctx.stroke();
    return y + 20;
  }

  function estimateHeight(data) {
    var mixN = (data.habit && data.habit.mix && data.habit.mix.length) || 0;
    var chN = (data.milestones && data.milestones.changesZh && data.milestones.changesZh.length) || 0;
    if (chN === 0) chN = 1;
    var topN = (data.progress && data.progress.top && data.progress.top.length) || 0;
    if (topN === 0) topN = 1;
    var h = 220 + 120 + mixN * 36 + 80 + chN * 40 + 70 + topN * 48 + 100;
    return Math.max(900, Math.min(2200, h));
  }

  /**
   * @param {object} data 服务端 buildForUser 返回的 payload
   */
  function renderReportPng(data) {
    if (!data || !data.monthKey) {
      return Promise.reject(new Error("missing_report_data"));
    }
    var username = data.username || "";
    var monthKey = data.monthKey;
    var W = 720;
    var H = estimateHeight(data);
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("canvas_unsupported"));

    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#f0f6ff");
    grad.addColorStop(0.35, "#ffffff");
    grad.addColorStop(1, "#f8fafc");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    roundRect(ctx, 24, 24, W - 48, H - 48, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(37,99,235,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#1a3f8f";
    ctx.font = "bold 28px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("Jarvis Math Lab", 48, 78);
    ctx.fillStyle = "#334155";
    ctx.font = "bold 24px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(data.titleZh || monthLabelZh(monthKey) + "学习月报", 48, 118);
    ctx.fillStyle = "#64748b";
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText(data.titleEn || "Monthly Learning Report · " + monthLabelEn(monthKey), 48, 142);
    ctx.fillText("学员 / Student：" + username, 48, 168);

    var y = 196;
    y = drawLine(ctx, y);

    y = drawSectionTitle(ctx, y, "A. 本月练了多少", "A. Practice volume");
    var habit = data.habit || {};
    var activeDays = habit.activeDays != null ? habit.activeDays : 0;
    var runCount = habit.runs != null ? habit.runs : 0;
    ctx.fillStyle = "#0f172a";
    ctx.font = "17px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("有练 " + activeDays + " 天 · 共 " + runCount + " 局", 48, y);
    y += 24;
    ctx.fillStyle = "#64748b";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.fillText(activeDays + " active days · " + runCount + " runs", 48, y);
    y += 32;

    var mix = Array.isArray(habit.mix) ? habit.mix : [];
    if (mix.length) {
      ctx.fillStyle = "#334155";
      ctx.font = "bold 15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("能力类别占比 / Mix by skill", 48, y);
      y += 22;
      mix.forEach(function (row) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(row.zh + " / " + row.en, 56, y);
        ctx.fillStyle = "#1a3f8f";
        ctx.font = "bold 15px 'Segoe UI', sans-serif";
        ctx.fillText(row.pct + "%", 560, y);
        var barX = 56;
        var barY = y + 8;
        var barW = 520;
        ctx.fillStyle = "#e2e8f0";
        roundRect(ctx, barX, barY, barW, 8, 4);
        ctx.fill();
        ctx.fillStyle = "#3b82f6";
        roundRect(ctx, barX, barY, Math.max(4, (barW * (row.pct || 0)) / 100), 8, 4);
        ctx.fill();
        y += 36;
      });
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("本月暂无练习记录 / No practice this month", 48, y);
      y += 28;
    }

    y += 8;
    y = drawLine(ctx, y);
    y = drawSectionTitle(ctx, y, "B. 本月进步了什么", "B. Progress highlights");

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("进度变化（仅列出有变化） / Progress changes", 48, y);
    y += 24;
    var changesZh = (data.milestones && data.milestones.changesZh) || [];
    var changesEn = (data.milestones && data.milestones.changesEn) || [];
    if (!changesZh.length) {
      ctx.fillStyle = "#64748b";
      ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("· 本月暂无进度变化", 56, y);
      y += 18;
      ctx.fillText("  No progress changes this month", 56, y);
      y += 28;
    } else {
      changesZh.forEach(function (zh, i) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText("· " + zh, 56, y);
        y += 18;
        ctx.fillStyle = "#64748b";
        ctx.font = "13px 'Segoe UI', sans-serif";
        var en = changesEn[i] || "";
        if (en) {
          ctx.fillText("  " + en, 56, y);
          y += 22;
        } else {
          y += 4;
        }
      });
    }

    var improvedCells =
      data.progress && data.progress.improvedCells != null ? data.progress.improvedCells : 0;
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("热图单元进步 / Heatmap cells improved：共 " + improvedCells + " 格", 48, y);
    y += 20;
    ctx.fillStyle = "#64748b";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.fillText(improvedCells + " cells improved vs prior snapshot", 48, y);
    y += 28;

    var top = (data.progress && Array.isArray(data.progress.top) && data.progress.top) || [];
    if (top.length) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("进步最大的项目 / Top improvements", 48, y);
      y += 26;
      top.forEach(function (row, idx) {
        var tag = row.kind === "acc" ? "准度" : "速度";
        var tagEn = row.kind === "acc" ? "ACC" : "SPD";
        roundRect(ctx, 48, y - 14, 44, 20, 6);
        ctx.fillStyle = row.kind === "acc" ? "#dcfce7" : "#dbeafe";
        ctx.fill();
        ctx.fillStyle = row.kind === "acc" ? "#166534" : "#1d4ed8";
        ctx.font = "bold 11px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(tag, 56, y);
        ctx.fillStyle = "#1e293b";
        ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(idx + 1 + ". " + row.zh, 100, y);
        y += 20;
        ctx.fillStyle = "#64748b";
        ctx.font = "13px 'Segoe UI', sans-serif";
        ctx.fillText("   [" + tagEn + "] " + row.en, 100, y);
        y += 28;
      });
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("本月热图暂无明显进步格 / No notable heatmap gains", 48, y);
      y += 28;
    }

    y = Math.max(y + 16, H - 70);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("Jarvis Math Lab · " + monthLabelZh(monthKey), 48, y);

    var title = displayTitle(username, monthKey);
    var dlName = downloadFileName(username, monthKey);
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
  function renderFakeReportPng(username, monthKey) {
    return renderReportPng({
      username: username,
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
