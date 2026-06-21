/**
 * 管理端图片上传：居中裁剪方图 + 压缩，统一为 WebP/JPEG/PNG dataUrl
 */
(function (global) {
  var DEFAULT_SIZE = 256;
  var DEFAULT_MAX_BYTES = 80000;

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取图片"));
      };
      img.src = url;
    });
  }

  function canvasToDataUrl(canvas, mime, quality) {
    try {
      return canvas.toDataURL(mime, quality);
    } catch (e) {
      return null;
    }
  }

  function estimateBase64Bytes(dataUrl) {
    if (!dataUrl) return 0;
    var comma = dataUrl.indexOf(",");
    var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return Math.ceil(b64.length * 0.75);
  }

  function buildAttempts(file, preferWebp) {
    var fileType = String((file && file.type) || "").toLowerCase();
    var tryAlpha = fileType.indexOf("png") >= 0 || fileType.indexOf("webp") >= 0 || fileType.indexOf("gif") >= 0;
    var attempts = [];
    if (preferWebp) {
      for (var q = 0.88; q >= 0.55; q -= 0.08) {
        attempts.push({ mime: "image/webp", quality: q });
      }
    }
    if (tryAlpha) {
      attempts.push({ mime: "image/png", quality: undefined });
    }
    for (var qj = 0.88; qj >= 0.55; qj -= 0.08) {
      attempts.push({ mime: "image/jpeg", quality: qj });
    }
    return attempts;
  }

  function normalizeImageFile(file, options) {
    options = options || {};
    var size = options.size || DEFAULT_SIZE;
    var maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
    var preferWebp = options.preferWebp !== false;

    return loadImageFromFile(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("无效图片尺寸");

      var side = Math.min(w, h);
      var sx = Math.floor((w - side) / 2);
      var sy = Math.floor((h - side) / 2);
      var attempts = buildAttempts(file, preferWebp);
      var sizes = [size];
      if (size > 192) sizes.push(192);
      if (size > 128) sizes.push(128);

      var best = null;
      for (var si = 0; si < sizes.length; si++) {
        var curSize = sizes[si];
        var canvas = document.createElement("canvas");
        canvas.width = curSize;
        canvas.height = curSize;
        var ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法创建画布");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, curSize, curSize);

        for (var ai = 0; ai < attempts.length; ai++) {
          var a = attempts[ai];
          var dataUrl = canvasToDataUrl(canvas, a.mime, a.quality);
          if (!dataUrl) continue;
          var bytes = estimateBase64Bytes(dataUrl);
          if (!best || bytes < best.bytes) {
            best = { dataUrl: dataUrl, bytes: bytes, width: curSize, height: curSize };
          }
          if (bytes <= maxBytes) {
            return {
              dataUrl: dataUrl,
              bytes: bytes,
              width: curSize,
              height: curSize,
              originalWidth: w,
              originalHeight: h,
            };
          }
        }
      }

      if (!best) throw new Error("图片处理失败");
      return {
        dataUrl: best.dataUrl,
        bytes: best.bytes,
        width: best.width,
        height: best.height,
        originalWidth: w,
        originalHeight: h,
      };
    });
  }

  function formatNormalizeStatus(result) {
    if (!result) return "";
    var orig =
      result.originalWidth && result.originalHeight
        ? result.originalWidth + "×" + result.originalHeight
        : "原图";
    var kb = Math.max(1, Math.round((result.bytes || 0) / 1024));
    return "已处理为 " + result.width + "×" + result.height + "（" + orig + " → 约 " + kb + "KB）";
  }

  global.JmlAdminImageNormalize = {
    normalizeImageFile: normalizeImageFile,
    formatNormalizeStatus: formatNormalizeStatus,
  };
})(typeof window !== "undefined" ? window : global);
