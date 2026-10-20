/**
 * 月度报告假数据画布（双语占位）。浏览器端生成 PNG dataURL / Blob。
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

  /** 列表展示用（可含中文） */
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

  /** 浏览器下载用英文安全名 */
  function downloadFileName(username, monthKey) {
    return safeUserSlug(username) + "_" + String(monthKey || "report") + ".png";
  }

  /** @deprecated 等同 displayTitle */
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

  /** 惯用：Blob + object URL 触发下载 */
  function triggerPngDownload(source, fileName) {
    var name = String(fileName || "monthly-report.png").replace(/[\\/:*?"<>|]+/g, "_");
    if (!/\.png$/i.test(name)) name += ".png";
    var blob = null;
    if (source && typeof source === "object" && typeof source.size === "number") {
      blob = source;
    } else if (typeof source === "string" && source.indexOf("base64,") >= 0) {
      blob = dataUrlToBlob(source);
    } else if (typeof source === "string" && source.length) {
      blob = dataUrlToBlob("data:image/png;base64," + source);
    }
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

  /** 杜撰内容：正式版替换为真实汇总 */
  function buildFakePayload(username, monthKey) {
    return {
      username: String(username || ""),
      monthKey: monthKey,
      titleZh: monthLabelZh(monthKey) + "学习月报",
      titleEn: "Monthly Learning Report · " + monthLabelEn(monthKey),
      habit: {
        activeDays: 14,
        runs: 37,
        tasksDone: 8,
        mix: [
          { zh: "四则运算", en: "Arithmetic", pct: 42 },
          { zh: "平方数", en: "Perfect squares", pct: 18 },
          { zh: "整除", en: "Divisibility", pct: 15 },
          { zh: "因数倍数", en: "Factors & multiples", pct: 12 },
          { zh: "小数运算", en: "Decimals", pct: 8 },
          { zh: "其他", en: "Other", pct: 5 },
        ],
      },
      milestones: {
        unlocksZh: ["训练解锁至 L9", "平方数解锁至 L3", "小数解锁至 D4"],
        unlocksEn: ["Training unlocked to L9", "Squares unlocked to L3", "Decimals unlocked to D4"],
        badgesZh: ["连续练习 7 天", "任务达人铜牌"],
        badgesEn: ["7-day practice streak", "Task Master (Bronze)"],
      },
      progress: {
        improvedCells: 6,
        top: [
          {
            kind: "acc",
            zh: "四则 L6：准确率跨过 95%",
            en: "Arithmetic L6: accuracy crossed 95%",
          },
          {
            kind: "acc",
            zh: "整除 Z2：准确率跨过 95%",
            en: "Divisibility Z2: accuracy crossed 95%",
          },
          {
            kind: "speed",
            zh: "平方 L2：准度保持 ≥95%，速度提升最多",
            en: "Squares L2: stayed ≥95% accuracy, biggest speed gain",
          },
        ],
      },
      noteZh: "（示意数据 · 正式版将按真实练习生成）",
      noteEn: "(Sample data · production will use real practice stats)",
    };
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

  /**
   * @returns {Promise<{ dataUrl: string, blob: Blob, fileName: string, width: number, height: number }>}
   */
  function renderFakeReportPng(username, monthKey) {
    var data = buildFakePayload(username, monthKey);
    var W = 720;
    var H = 1180;
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
    ctx.fillText(data.titleZh, 48, 118);
    ctx.fillStyle = "#64748b";
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText(data.titleEn, 48, 142);
    ctx.fillText("学员 / Student：" + data.username, 48, 168);

    var y = 196;
    y = drawLine(ctx, y);

    y = drawSectionTitle(ctx, y, "A. 本月练了多少", "A. Practice volume");
    ctx.fillStyle = "#0f172a";
    ctx.font = "17px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(
      "有练 " + data.habit.activeDays + " 天 · 共 " + data.habit.runs + " 局 · 完成任务 " + data.habit.tasksDone + " 个",
      48,
      y
    );
    y += 24;
    ctx.fillStyle = "#64748b";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.fillText(
      data.habit.activeDays + " active days · " + data.habit.runs + " runs · " + data.habit.tasksDone + " tasks done",
      48,
      y
    );
    y += 32;
    ctx.fillStyle = "#334155";
    ctx.font = "bold 15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("能力类别占比 / Mix by skill", 48, y);
    y += 22;
    data.habit.mix.forEach(function (row) {
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
      roundRect(ctx, barX, barY, Math.max(4, (barW * row.pct) / 100), 8, 4);
      ctx.fill();
      y += 36;
    });

    y += 8;
    y = drawLine(ctx, y);
    y = drawSectionTitle(ctx, y, "B. 本月进步了什么", "B. Progress highlights");

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("新解锁 / New unlocks", 48, y);
    y += 24;
    data.milestones.unlocksZh.forEach(function (zh, i) {
      ctx.fillStyle = "#1e293b";
      ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("· " + zh, 56, y);
      y += 18;
      ctx.fillStyle = "#64748b";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText("  " + data.milestones.unlocksEn[i], 56, y);
      y += 22;
    });

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("新徽章 / New badges", 48, y);
    y += 24;
    data.milestones.badgesZh.forEach(function (zh, i) {
      ctx.fillStyle = "#1e293b";
      ctx.font = "15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText("· " + zh, 56, y);
      y += 18;
      ctx.fillStyle = "#64748b";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText("  " + data.milestones.badgesEn[i], 56, y);
      y += 22;
    });

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(
      "热图单元进步 / Heatmap cells improved：共 " + data.progress.improvedCells + " 格",
      48,
      y
    );
    y += 20;
    ctx.fillStyle = "#64748b";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.fillText(data.progress.improvedCells + " cells improved vs previous month-end", 48, y);
    y += 28;
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 15px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText("进步最大的三项 / Top 3 improvements", 48, y);
    y += 26;
    data.progress.top.forEach(function (row, idx) {
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

    y = Math.max(y + 10, H - 90);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(data.noteZh, 48, y);
    ctx.fillText(data.noteEn, 48, y + 18);

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
    buildFakePayload: buildFakePayload,
    renderFakeReportPng: renderFakeReportPng,
    dataUrlToBase64: dataUrlToBase64,
    dataUrlToBlob: dataUrlToBlob,
    triggerPngDownload: triggerPngDownload,
  };
})(typeof window !== "undefined" ? window : globalThis);
