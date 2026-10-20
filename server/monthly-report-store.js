/**
 * 月度报告：元数据 JSON + PNG 落盘。
 * 月份口径：Asia/Shanghai 自然月；「当前应出」= 上一完整月。
 */
const fs = require("fs");
const path = require("path");

function createMonthlyReportStore(opts) {
  const dataDir = opts.dataDir;
  const rootDir = opts.rootDir || path.join(dataDir, "monthly-reports");
  const readJson = opts.readJson;
  const writeJson = opts.writeJson;

  function ensureRoot() {
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
  }

  function encodeUsername(username) {
    return encodeURIComponent(String(username || ""));
  }

  function metaPath(username) {
    return path.join(rootDir, encodeUsername(username) + ".json");
  }

  function userImageDir(username) {
    return path.join(rootDir, encodeUsername(username));
  }

  function imagePath(username, monthKey) {
    return path.join(userImageDir(username), String(monthKey) + ".png");
  }

  function chinaDayFromTs(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(n));
    } catch (e) {
      return new Date(n).toISOString().slice(0, 10);
    }
  }

  /** @returns {string} YYYY-MM */
  function chinaMonthKeyFromTs(ts) {
    const day = chinaDayFromTs(ts != null ? ts : Date.now());
    return day ? day.slice(0, 7) : "";
  }

  /** 当前上海自然月 YYYY-MM */
  function currentMonthKey(nowTs) {
    return chinaMonthKeyFromTs(nowTs != null ? nowTs : Date.now());
  }

  /** 上一完整自然月（上海） */
  function latestClosedMonthKey(nowTs) {
    const day = chinaDayFromTs(nowTs != null ? nowTs : Date.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
    const y = Number(day.slice(0, 4));
    const m = Number(day.slice(5, 7));
    if (m <= 1) return y - 1 + "-12";
    return y + "-" + String(m - 1).padStart(2, "0");
  }

  /** 管理端可预览/生成：已结束月或当月；不可未来月 */
  function isAdminReportableMonth(monthKey, nowTs) {
    if (!isValidMonthKey(monthKey)) return false;
    const current = currentMonthKey(nowTs);
    return !!current && String(monthKey) <= current;
  }

  function isValidMonthKey(monthKey) {
    return /^\d{4}-\d{2}$/.test(String(monthKey || ""));
  }

  function monthLabelZh(monthKey) {
    if (!isValidMonthKey(monthKey)) return String(monthKey || "");
    const y = monthKey.slice(0, 4);
    const m = Number(monthKey.slice(5, 7));
    return y + "年" + m + "月";
  }

  /** 列表展示用（可含中文） */
  function displayTitle(username, monthKey) {
    return String(username || "") + "_" + monthLabelZh(monthKey) + "_月度报告.png";
  }

  /** 下载 / 对外英文安全名；磁盘仍为 userDir/YYYY-MM.png */
  function safeUserSlug(username) {
    const s = String(username || "").trim();
    const ascii = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    if (ascii) return ascii.slice(0, 64);
    let hex = "";
    try {
      hex = Buffer.from(s, "utf8").toString("hex").slice(0, 16);
    } catch (e) {
      hex = String(Date.now());
    }
    return "user_" + hex;
  }

  function downloadFileName(username, monthKey) {
    return safeUserSlug(username) + "_" + String(monthKey || "report") + ".png";
  }

  /** @deprecated 兼容旧字段名，等同 displayTitle */
  function displayFileName(username, monthKey) {
    return displayTitle(username, monthKey);
  }

  function emptyMeta(username) {
    return { username: String(username || ""), reports: {}, updatedAt: 0 };
  }

  function getMeta(username) {
    const name = String(username || "");
    if (!name) return emptyMeta("");
    try {
      if (!fs.existsSync(metaPath(name))) return emptyMeta(name);
      const data = readJson(metaPath(name), null);
      if (!data || typeof data !== "object") return emptyMeta(name);
      if (!data.reports || typeof data.reports !== "object") data.reports = {};
      data.username = name;
      return data;
    } catch (e) {
      console.warn("[monthly-report-store] read meta failed", name, e && e.message ? e.message : e);
      return emptyMeta(name);
    }
  }

  function setMeta(username, meta) {
    const name = String(username || "");
    if (!name || !meta) return;
    ensureRoot();
    writeJson(metaPath(name), {
      username: name,
      updatedAt: Date.now(),
      reports: meta.reports && typeof meta.reports === "object" ? meta.reports : {},
    });
  }

  function hasImage(username, monthKey) {
    try {
      return fs.existsSync(imagePath(username, monthKey));
    } catch (e) {
      return false;
    }
  }

  function readImageBuffer(username, monthKey) {
    const fp = imagePath(username, monthKey);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp);
  }

  function saveImage(username, monthKey, pngBuffer, optsSave) {
    optsSave = optsSave || {};
    const name = String(username || "");
    if (!name || !isValidMonthKey(monthKey) || !Buffer.isBuffer(pngBuffer) || !pngBuffer.length) {
      return { ok: false, error: "invalid_args" };
    }
    const latest = latestClosedMonthKey();
    const current = currentMonthKey();
    const force = !!optsSave.force;
    if (!isAdminReportableMonth(monthKey)) {
      return { ok: false, error: "future_month", currentMonthKey: current, latestClosedMonthKey: latest };
    }
    const meta = getMeta(name);
    const existing = meta.reports[monthKey];
    if (existing && hasImage(name, monthKey) && !force) {
      return {
        ok: true,
        existed: true,
        monthKey: monthKey,
        entry: existing,
      };
    }
    // 强制重生：上一完整月或当月（管理端实时预览）
    if (force && monthKey !== latest && monthKey !== current) {
      return {
        ok: false,
        error: "force_only_closed_or_current",
        latestClosedMonthKey: latest,
        currentMonthKey: current,
      };
    }
    ensureRoot();
    const dir = userImageDir(name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(imagePath(name, monthKey), pngBuffer);
    const entry = {
      monthKey: monthKey,
      fileName: displayTitle(name, monthKey),
      downloadFileName: downloadFileName(name, monthKey),
      generatedAt: Date.now(),
      readAt: existing && existing.readAt ? existing.readAt : null,
      fake: optsSave.fake === true,
    };
    meta.reports[monthKey] = entry;
    setMeta(name, meta);
    return { ok: true, existed: false, monthKey: monthKey, entry: entry };
  }

  function markRead(username, monthKey) {
    const name = String(username || "");
    if (!name || !isValidMonthKey(monthKey)) return { ok: false, error: "invalid_args" };
    const meta = getMeta(name);
    const entry = meta.reports[monthKey];
    if (!entry || !hasImage(name, monthKey)) {
      return { ok: false, error: "not_generated" };
    }
    if (!entry.readAt) {
      entry.readAt = Date.now();
      meta.reports[monthKey] = entry;
      setMeta(name, meta);
    }
    return { ok: true, entry: entry };
  }

  function statusFor(username, monthKey) {
    const name = String(username || "");
    const meta = getMeta(name);
    const entry = meta.reports[monthKey] || null;
    const generated = !!(entry && hasImage(name, monthKey));
    const current = currentMonthKey();
    const latest = latestClosedMonthKey();
    const inProgress = !!current && monthKey === current;
    return {
      monthKey: monthKey,
      fileName: displayTitle(name, monthKey),
      downloadFileName: downloadFileName(name, monthKey),
      generated: generated,
      read: !!(generated && entry && entry.readAt),
      readAt: generated && entry ? entry.readAt || null : null,
      generatedAt: generated && entry ? entry.generatedAt || null : null,
      canForceRegenerate: monthKey === latest || inProgress,
      inProgress: inProgress,
      adminOnly: inProgress,
      studentVisible: !inProgress && monthKey <= latest,
    };
  }

  /** 管理端列表：已存月份 + 上一完整月 + 当月（学员不可见） */
  function listForAdmin(username) {
    const name = String(username || "");
    const meta = getMeta(name);
    const latest = latestClosedMonthKey();
    const current = currentMonthKey();
    const keys = Object.keys(meta.reports || {});
    if (latest && keys.indexOf(latest) < 0) keys.push(latest);
    if (current && keys.indexOf(current) < 0) keys.push(current);
    keys.sort(function (a, b) {
      return a < b ? 1 : a > b ? -1 : 0;
    });
    return keys.filter(isValidMonthKey).map(function (k) {
      return statusFor(name, k);
    });
  }

  return {
    chinaDayFromTs,
    chinaMonthKeyFromTs,
    currentMonthKey,
    latestClosedMonthKey,
    isAdminReportableMonth,
    isValidMonthKey,
    monthLabelZh,
    displayTitle,
    displayFileName,
    downloadFileName,
    safeUserSlug,
    getMeta,
    hasImage,
    readImageBuffer,
    saveImage,
    markRead,
    statusFor,
    listForAdmin,
  };
}

module.exports = { createMonthlyReportStore };
