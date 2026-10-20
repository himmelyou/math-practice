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

  function drawSectionTitleCompact(ctx, y, zh, en) {
    ctx.fillStyle = "#0f3d7a";
    ctx.font = "bold 18px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(zh, 40, y);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Segoe UI', sans-serif";
    var zhW = ctx.measureText(zh).width;
    ctx.fillText(en, 40 + zhW + 10, y);
    return y + 28;
  }

  function drawLine(ctx, y, W) {
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo((W || 720) - 40, y);
    ctx.stroke();
    return y + 14;
  }

  function ellipsize(ctx, text, maxW) {
    var s = String(text || "");
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) {
      s = s.slice(0, -1);
    }
    return s + "…";
  }

  /** 短文案两列；任一项过长则整段单列 */
  function shouldTwoCol(items, maxLen) {
    if (!items || items.length < 2) return false;
    var lim = maxLen != null ? maxLen : 18;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i] || "").length > lim) return false;
    }
    return true;
  }

  function estimateHeight(data) {
    var mixN = (data.habit && data.habit.mix && data.habit.mix.length) || 0;
    var chN = (data.milestones && data.milestones.changesZh && data.milestones.changesZh.length) || 0;
    if (chN === 0) chN = 1;
    var topN = (data.progress && data.progress.top && data.progress.top.length) || 0;
    if (topN === 0) topN = 1;
    var mixRows = Math.ceil(mixN / 2) || 0;
    var chRows = shouldTwoCol(data.milestones && data.milestones.changesZh, 20)
      ? Math.ceil(chN / 2)
      : chN;
    var topRows = shouldTwoCol(
      (data.progress && data.progress.top ? data.progress.top : []).map(function (r) {
        return r.zh;
      }),
      16
    )
      ? Math.ceil(topN / 2)
      : topN;
    var h = 150 + 50 + mixRows * 40 + 40 + chRows * 26 + 36 + topRows * 28 + 56;
    return Math.max(640, Math.min(1280, h));
  }

  function publicDownloadSlug(data) {
    var nick = String((data && data.nickname) || "").trim();
    if (nick) return safeUserSlug(nick);
    return "report";
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

    roundRect(ctx, 20, 20, W - 40, H - 40, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(37,99,235,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 左上品牌+标题；右上仅昵称（无昵称不显示，绝不回退用户名）
    ctx.fillStyle = "#1a3f8f";
    ctx.font = "bold 22px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("Jarvis Math Lab", 40, 58);
    if (nickname) {
      ctx.fillStyle = "#334155";
      ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      var nickDraw = ellipsize(ctx, nickname, 220);
      var nickW = ctx.measureText(nickDraw).width;
      ctx.fillText(nickDraw, W - 40 - nickW, 58);
    }
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(data.titleZh || monthLabelZh(monthKey) + "学习月报", 40, 90);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.fillText(data.titleEn || monthLabelEn(monthKey), 40, 112);

    var y = 128;
    y = drawLine(ctx, y, W);

    y = drawSectionTitleCompact(ctx, y, "A. 本月练了多少", "Practice volume");
    var habit = data.habit || {};
    var activeDays = habit.activeDays != null ? habit.activeDays : 0;
    var runCount = habit.runs != null ? habit.runs : 0;
    var volZh = "有练 " + activeDays + " 天 · 共 " + runCount + " 局";
    ctx.fillStyle = "#0f172a";
    ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(volZh, 40, y);
    var volW = ctx.measureText(volZh).width;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.fillText(activeDays + " days · " + runCount + " runs", 40 + volW + 12, y);
    y += 26;

    var mix = Array.isArray(habit.mix) ? habit.mix : [];
    var colGap = 16;
    var colW = (W - 80 - colGap) / 2;
    if (mix.length) {
      var mi = 0;
      while (mi < mix.length) {
        for (var c = 0; c < 2 && mi < mix.length; c += 1, mi += 1) {
          var row = mix[mi];
          var x0 = 40 + c * (colW + colGap);
          ctx.fillStyle = "#1e293b";
          ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.fillText(ellipsize(ctx, row.zh, colW - 44), x0, y);
          ctx.fillStyle = "#1a3f8f";
          ctx.font = "bold 13px 'Segoe UI', sans-serif";
          var pct = (row.pct != null ? row.pct : 0) + "%";
          ctx.fillText(pct, x0 + colW - ctx.measureText(pct).width, y);
          var barY = y + 6;
          ctx.fillStyle = "#e2e8f0";
          roundRect(ctx, x0, barY, colW, 5, 3);
          ctx.fill();
          ctx.fillStyle = "#3b82f6";
          roundRect(ctx, x0, barY, Math.max(3, (colW * (row.pct || 0)) / 100), 5, 3);
          ctx.fill();
        }
        y += 34;
      }
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("本月暂无练习记录", 40, y);
      y += 22;
    }

    y = drawLine(ctx, y + 4, W);
    y = drawSectionTitleCompact(ctx, y, "B. 本月进步了什么", "Progress");

    ctx.fillStyle = "#334155";
    ctx.font = "bold 13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("进度变化", 40, y);
    y += 22;
    var changesZh = (data.milestones && data.milestones.changesZh) || [];
    if (!changesZh.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("本月暂无进度变化", 40, y);
      y += 22;
    } else if (shouldTwoCol(changesZh, 20)) {
      var ci = 0;
      while (ci < changesZh.length) {
        for (var cc = 0; cc < 2 && ci < changesZh.length; cc += 1, ci += 1) {
          var cx = 40 + cc * (colW + colGap);
          ctx.fillStyle = "#1e293b";
          ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.fillText(ellipsize(ctx, "· " + changesZh[ci], colW), cx, y);
        }
        y += 22;
      }
    } else {
      changesZh.forEach(function (zh) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(ellipsize(ctx, "· " + zh, W - 80), 40, y);
        y += 22;
      });
    }

    var improvedCells =
      data.progress && data.progress.improvedCells != null ? data.progress.improvedCells : 0;
    y += 4;
    ctx.fillStyle = "#334155";
    ctx.font = "bold 13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("热图进步 · " + improvedCells + " 格", 40, y);
    y += 22;

    var top = (data.progress && Array.isArray(data.progress.top) && data.progress.top) || [];
    var topZh = top.map(function (r) {
      return r.zh || "";
    });
    if (!top.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("暂无明显进步格", 40, y);
      y += 22;
    } else if (shouldTwoCol(topZh, 16)) {
      var ti = 0;
      while (ti < top.length) {
        for (var tc = 0; tc < 2 && ti < top.length; tc += 1, ti += 1) {
          var tx = 40 + tc * (colW + colGap);
          var trow = top[ti];
          var tag = trow.kind === "acc" ? "准" : "速";
          ctx.fillStyle = trow.kind === "acc" ? "#166534" : "#1d4ed8";
          ctx.font = "bold 11px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.fillText(tag, tx, y);
          ctx.fillStyle = "#1e293b";
          ctx.font = "12px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.fillText(ellipsize(ctx, trow.zh, colW - 22), tx + 18, y);
        }
        y += 24;
      }
    } else {
      top.forEach(function (trow, idx) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "13px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(ellipsize(ctx, idx + 1 + ". " + trow.zh, W - 80), 40, y);
        y += 22;
      });
    }

    y = Math.max(y + 12, H - 48);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("Jarvis Math Lab · " + monthLabelZh(monthKey), 40, y);
    if (data.inProgress || data.adminOnlyPreview) {
      ctx.fillStyle = "#b45309";
      ctx.fillText("管理端预览 · 学员不可见", W - 40 - ctx.measureText("管理端预览 · 学员不可见").width, y);
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
