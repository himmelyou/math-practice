/**
 * 极简 Markdown → 安全 HTML（游戏说明等后台可编辑正文）
 * 支持：#/##/###、段落、无序/有序列表、表格、**粗体**、---、行内换行前空两空格
 */
(function (global) {
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineFormat(text) {
    var s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitTableRow(line) {
    var t = String(line || "").trim();
    if (t.charAt(0) === "|") t = t.slice(1);
    if (t.charAt(t.length - 1) === "|") t = t.slice(0, -1);
    return t.split("|").map(function (c) {
      return c.trim();
    });
  }

  function renderTable(rows) {
    if (!rows.length) return "";
    var head = rows[0];
    var body = rows.slice(1);
    var html = '<table class="jml-md-table"><thead><tr>';
    head.forEach(function (c) {
      html += "<th>" + inlineFormat(c) + "</th>";
    });
    html += "</tr></thead><tbody>";
    body.forEach(function (r) {
      html += "<tr>";
      r.forEach(function (c) {
        html += "<td>" + inlineFormat(c) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function renderMarkdown(src) {
    var text = String(src == null ? "" : src).replace(/\r\n/g, "\n");
    var lines = text.split("\n");
    var out = [];
    var i = 0;

    function flushParagraph(buf) {
      if (!buf.length) return;
      var joined = buf.join("\n").replace(/  \n/g, "<br>\n");
      out.push("<p>" + inlineFormat(joined).replace(/\n/g, " ") + "</p>");
      buf.length = 0;
    }

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
        out.push("<hr>");
        i += 1;
        continue;
      }

      var hm = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (hm) {
        var level = hm[1].length;
        out.push("<h" + level + ">" + inlineFormat(hm[2]) + "</h" + level + ">");
        i += 1;
        continue;
      }

      if (trimmed.indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var tableRows = [splitTableRow(trimmed)];
        i += 2;
        while (i < lines.length && lines[i].trim().indexOf("|") !== -1) {
          tableRows.push(splitTableRow(lines[i]));
          i += 1;
        }
        out.push(renderTable(tableRows));
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        out.push("<ul>");
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          out.push("<li>" + inlineFormat(lines[i].trim().replace(/^[-*]\s+/, "")) + "</li>");
          i += 1;
        }
        out.push("</ul>");
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        out.push("<ol>");
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          out.push("<li>" + inlineFormat(lines[i].trim().replace(/^\d+\.\s+/, "")) + "</li>");
          i += 1;
        }
        out.push("</ol>");
        continue;
      }

      var para = [];
      while (i < lines.length) {
        var t2 = lines[i].trim();
        if (!t2) break;
        if (/^---+$/.test(t2) || /^\*\*\*+$/.test(t2)) break;
        if (/^#{1,3}\s+/.test(t2)) break;
        if (/^[-*]\s+/.test(t2) || /^\d+\.\s+/.test(t2)) break;
        if (t2.indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
        para.push(lines[i]);
        i += 1;
      }
      flushParagraph(para);
    }

    return out.join("\n");
  }

  global.JmlSimpleMd = {
    escapeHtml: escapeHtml,
    render: renderMarkdown,
  };
})(typeof window !== "undefined" ? window : globalThis);
