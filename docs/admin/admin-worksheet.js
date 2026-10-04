/**
 * 管理端：四则 / 拆括号 / 小数 / 整除 / 分数习题纸生成与打印
 */
(function () {
  function getPageLayout(mode) {
    if (mode === 'arithmetic' || mode === 'decimal') {
      return { questionsPerPage: 30, perCol: 15, pageClass: 'jml-ws-page--30' };
    }
    if (mode === 'divisibility') {
      return { questionsPerPage: 24, perCol: 12, pageClass: 'jml-ws-page--24' };
    }
    if (mode === 'fraction') {
      return {
        questionsPerPage: 24,
        perCol: 6,
        sectionSize: 12,
        pageClass: 'jml-ws-page--frac',
        stackedSections: true,
      };
    }
    return { questionsPerPage: 20, perCol: 10, pageClass: 'jml-ws-page--20' };
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getWorksheetMode() {
    var el = document.getElementById('jml-ws-mode');
    var mode = el ? String(el.value || 'expandBrackets') : 'expandBrackets';
    if (mode === 'arithmetic') return 'arithmetic';
    if (mode === 'decimal') return 'decimal';
    if (mode === 'divisibility') return 'divisibility';
    if (mode === 'fraction') return 'fraction';
    return 'expandBrackets';
  }

  function mapFractionQuestion(q) {
    return {
      prompt: q.prompt || '',
      promptHtml: q.promptHtml || '',
      answer: q.answer != null ? String(q.answer) : '',
      answerHtml: q.answerHtml || '',
      section: q.section || '',
      compact: false,
    };
  }

  function promptInnerHtml(q) {
    if (q.promptHtml) return q.promptHtml;
    return escapeHtml(q.prompt);
  }

  function answerInnerHtml(q) {
    if (q.answerHtml) return q.answerHtml;
    return escapeHtml(q.answer);
  }

  function mapDivisibilityQuestion(q) {
    return {
      prompt: q.text || q.prompt || '',
      answer: q.answer != null ? String(q.answer) : '',
      compact: true,
    };
  }

  function buildQuestion(mode, level) {
    if (mode === 'arithmetic') {
      var ar = window.JmlArithmetic;
      if (!ar || typeof ar.buildQuestion !== 'function') {
        throw new Error('未加载出题模块 arithmetic-questions.js');
      }
      var q = ar.buildQuestion(level);
      return {
        prompt: q.text || '',
        answer: q.answer != null ? String(q.answer) : '',
        compact: level >= 14,
      };
    }
    if (mode === 'decimal') {
      var dec = window.JmlDecimal;
      if (!dec || typeof dec.buildQuestion !== 'function') {
        throw new Error('未加载出题模块 decimal-questions.js');
      }
      var dq = dec.buildQuestion(level);
      return {
        prompt: dq.text || '',
        answer: dq.answer != null ? String(dq.answer) : '',
        compact: false,
      };
    }
    if (mode === 'divisibility') {
      var div = window.JmlDivisibility;
      if (!div || typeof div.buildQuestion !== 'function') {
        throw new Error('未加载出题模块 divisibility-questions.js');
      }
      return mapDivisibilityQuestion(div.buildQuestion(level));
    }
    if (mode === 'fraction') {
      var fr = window.JmlFraction;
      if (!fr || typeof fr.buildQuestion !== 'function') {
        throw new Error('未加载出题模块 fraction-questions.js');
      }
      return mapFractionQuestion(fr.buildQuestion(level));
    }
    var eng = window.JmlExpandBrackets;
    if (!eng || typeof eng.buildQuestion !== 'function') {
      throw new Error('未加载出题模块 expand-brackets-questions.js');
    }
    var eb = eng.buildQuestion(level);
    return {
      prompt: eb.prompt || '',
      answer: eb.correctText != null ? eb.correctText : '',
      compact: false,
    };
  }

  function buildPageBatch(mode, level, count) {
    if (mode === 'divisibility') {
      var div = window.JmlDivisibility;
      if (!div || typeof div.buildRun !== 'function') {
        throw new Error('未加载出题模块 divisibility-questions.js');
      }
      return div.buildRun(level, count).map(mapDivisibilityQuestion);
    }
    if (mode === 'fraction') {
      var fr = window.JmlFraction;
      if (!fr || typeof fr.buildRun !== 'function') {
        throw new Error('未加载出题模块 fraction-questions.js');
      }
      return fr.buildRun(level, count).map(mapFractionQuestion);
    }
    if (mode === 'arithmetic' && window.JmlArithmetic && typeof window.JmlArithmetic.resetLevelDeck === 'function') {
      window.JmlArithmetic.resetLevelDeck(level, count, {
        keepPoolOrder: level === (window.JmlArithmetic.L13_LEVEL_INDEX || 12),
      });
    }
    if (mode === 'decimal' && window.JmlDecimal && typeof window.JmlDecimal.resetLevelSegment === 'function') {
      window.JmlDecimal.resetLevelSegment(level, count);
    }
    var batch = [];
    var i;
    for (i = 0; i < count; i += 1) {
      batch.push(buildQuestion(mode, level));
    }
    return batch;
  }

  /** 纵向分栏：左列 1…perCol，右列 perCol+1… */
  function splitIntoColumns(questions, perCol) {
    return {
      left: questions.slice(0, perCol),
      right: questions.slice(perCol),
    };
  }

  function renderColumnItems(items, startIndex, showAnswers) {
    var html = '';
    for (var i = 0; i < items.length; i += 1) {
      var q = items[i];
      var n = startIndex + i;
      var promptClass = 'jml-ws-prompt' + (q.compact ? ' jml-ws-prompt-compact' : '');
      html +=
        '<li class="jml-ws-item">' +
        '<div class="jml-ws-qline">' +
        '<span class="jml-ws-num">' +
        n +
        '.</span>' +
        '<span class="' +
        promptClass +
        '">' +
        promptInnerHtml(q) +
        '</span>';
      if (showAnswers) {
        html +=
          '<span class="jml-ws-ans">' +
          (q.section === '比大小' ? ' ' : ' = ') +
          answerInnerHtml(q) +
          '</span>';
      }
      html += '</div>';
      if (!showAnswers) {
        html += '<span class="jml-ws-workspace" aria-hidden="true"></span>';
      }
      html += '</li>';
    }
    return html;
  }

  function renderTwoColGrid(questions, startIndex, perCol, showAnswers) {
    var split = splitIntoColumns(questions, perCol);
    return (
      '<div class="jml-ws-grid">' +
      '<ol class="jml-ws-col" start="' +
      startIndex +
      '">' +
      renderColumnItems(split.left, startIndex, showAnswers) +
      '</ol>' +
      '<ol class="jml-ws-col" start="' +
      (startIndex + perCol) +
      '">' +
      renderColumnItems(split.right, startIndex + perCol, showAnswers) +
      '</ol>' +
      '</div>'
    );
  }

  function renderPageHtml(opts) {
    var title = opts.title;
    var name = opts.studentName;
    var questions = opts.questions;
    var showAnswers = !!opts.showAnswers;
    var layout = opts.layout || getPageLayout('expandBrackets');
    var nameHtml = name ? escapeHtml(name) : '&nbsp;';
    var body;

    if (layout.stackedSections) {
      var sectionSize = layout.sectionSize || 12;
      var perCol = layout.perCol || 6;
      var meta = opts.sectionTitles || ['', ''];
      var top = questions.slice(0, sectionSize);
      var bot = questions.slice(sectionSize, sectionSize * 2);
      body =
        '<div class="jml-ws-sections">' +
        '<div class="jml-ws-frac-sec">' +
        '<h2 class="jml-ws-frac-sec-title">' +
        escapeHtml(meta[0] || '') +
        '</h2>' +
        renderTwoColGrid(top, 1, perCol, showAnswers) +
        '</div>' +
        '<div class="jml-ws-frac-sec">' +
        '<h2 class="jml-ws-frac-sec-title">' +
        escapeHtml(meta[1] || '') +
        '</h2>' +
        renderTwoColGrid(bot, sectionSize + 1, perCol, showAnswers) +
        '</div>' +
        '</div>';
    } else {
      var split = splitIntoColumns(questions, layout.perCol);
      body =
        '<div class="jml-ws-grid">' +
        '<ol class="jml-ws-col" start="1">' +
        renderColumnItems(split.left, 1, showAnswers) +
        '</ol>' +
        '<ol class="jml-ws-col" start="' +
        (layout.perCol + 1) +
        '">' +
        renderColumnItems(split.right, layout.perCol + 1, showAnswers) +
        '</ol>' +
        '</div>';
    }

    return (
      '<section class="jml-ws-page ' +
      layout.pageClass +
      (showAnswers ? ' jml-ws-answers' : '') +
      '">' +
      '<header class="jml-ws-head">' +
      '<h1 class="jml-ws-title">' +
      escapeHtml(title) +
      '</h1>' +
      '<p class="jml-ws-meta">姓名：<span class="jml-ws-name-line">' +
      nameHtml +
      '</span></p>' +
      '</header>' +
      body +
      '</section>'
    );
  }

  function clampLevel(mode, level) {
    if (mode === 'arithmetic') {
      var maxA = (window.JmlArithmetic && window.JmlArithmetic.LEVEL_COUNT) || 16;
      return Math.min(maxA - 1, Math.max(0, Math.floor(level)));
    }
    if (mode === 'decimal') {
      var maxD = (window.JmlDecimal && window.JmlDecimal.LEVEL_COUNT) || 5;
      return Math.min(maxD - 1, Math.max(0, Math.floor(level)));
    }
    if (mode === 'fraction') {
      var maxF = (window.JmlFraction && window.JmlFraction.LEVEL_COUNT) || 4;
      return Math.min(maxF - 1, Math.max(0, Math.floor(level)));
    }
    if (mode === 'divisibility') {
      var maxZ = (window.JmlDivisibility && window.JmlDivisibility.LEVEL_COUNT) || 5;
      return Math.min(maxZ - 1, Math.max(0, Math.floor(level)));
    }
    return Math.min(4, Math.max(0, Math.floor(level)));
  }

  function getLevelLabels(mode) {
    if (mode === 'arithmetic') {
      return (window.JmlArithmetic && window.JmlArithmetic.LEVEL_LABELS) || [];
    }
    if (mode === 'decimal') {
      return (window.JmlDecimal && window.JmlDecimal.LEVEL_LABELS) || [];
    }
    if (mode === 'fraction') {
      return (window.JmlFraction && window.JmlFraction.LEVEL_LABELS) || [];
    }
    if (mode === 'divisibility') {
      return (window.JmlDivisibility && window.JmlDivisibility.LEVEL_LABELS) || [];
    }
    return (
      (window.JmlExpandBrackets && window.JmlExpandBrackets.LEVEL_LABELS) || [
        'L1 · 一层括号（整数）',
        'L2 · 乘除去括号',
        'L3 · 分配并算积',
        'L4 · 分配并算积（进阶）',
        'L5 · 两括号相乘',
      ]
    );
  }

  function generateWorksheet() {
    var mode = getWorksheetMode();
    var layout = getPageLayout(mode);
    var levelEl = document.getElementById('jml-ws-level');
    var pagesEl = document.getElementById('jml-ws-pages');
    var nameEl = document.getElementById('jml-ws-student-name');
    var answersEl = document.getElementById('jml-ws-include-answers');
    var preview = document.getElementById('jml-worksheet-preview');
    if (!preview) return;

    var level = levelEl ? Number(levelEl.value) : 0;
    if (!Number.isFinite(level)) level = 0;
    level = clampLevel(mode, level);

    var pages = pagesEl ? Number(pagesEl.value) : 1;
    if (!Number.isFinite(pages) || pages < 1) pages = 1;
    if (pages > 20) pages = 20;

    var studentName = nameEl ? String(nameEl.value || '').trim() : '';
    var includeAnswers = answersEl ? !!answersEl.checked : false;

    var labels = getLevelLabels(mode);
    var levelLabel =
      labels[level] ||
      (mode === 'arithmetic'
        ? 'L' + (level + 1)
        : mode === 'decimal'
          ? 'D' + (level + 1)
          : mode === 'divisibility'
            ? 'Z' + (level + 1)
            : mode === 'fraction'
              ? 'F' + (level + 1)
              : '去括号 L' + (level + 1));
    var title =
      mode === 'arithmetic'
        ? '四则运算 · ' + levelLabel
        : mode === 'decimal'
          ? '小数运算 · ' + levelLabel
          : mode === 'divisibility'
            ? '整除判断 · ' + levelLabel
            : mode === 'fraction'
              ? '分数运算 · ' + levelLabel
              : '去括号练习 · ' + levelLabel;

    var fracMeta =
      mode === 'fraction' && window.JmlFraction && typeof window.JmlFraction.getLevelMeta === 'function'
        ? window.JmlFraction.getLevelMeta(level)
        : null;
    var sectionTitles = fracMeta && fracMeta.sections ? fracMeta.sections : null;

    var html = '';
    try {
      for (var p = 0; p < pages; p += 1) {
        var batch = buildPageBatch(mode, level, layout.questionsPerPage);
        html += renderPageHtml({
          title: title,
          studentName: studentName,
          questions: batch,
          showAnswers: false,
          layout: layout,
          sectionTitles: sectionTitles,
        });
        if (includeAnswers) {
          html += renderPageHtml({
            title: title,
            studentName: studentName,
            questions: batch,
            showAnswers: true,
            layout: layout,
            sectionTitles: sectionTitles,
          });
        }
      }
    } catch (e) {
      preview.innerHTML =
        '<div class="jml-worksheet-preview-empty">' +
        escapeHtml(e.message || '生成失败') +
        '</div>';
      return;
    }

    preview.innerHTML = html;
  }

  function printWorksheet() {
    var preview = document.getElementById('jml-worksheet-preview');
    if (!preview || !preview.querySelector('.jml-ws-page')) {
      alert('请先点击「生成预览」。');
      return;
    }
    document.body.classList.add('jml-worksheet-printing');
    var cleanup = function () {
      document.body.classList.remove('jml-worksheet-printing');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(function () {
      window.print();
    }, 50);
  }

  function fillLevelSelect(mode) {
    var sel = document.getElementById('jml-ws-level');
    if (!sel) return;
    var labels = getLevelLabels(mode);
    sel.innerHTML = '';
    labels.forEach(function (label, idx) {
      var opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.value = '0';
  }

  function onModeChange() {
    fillLevelSelect(getWorksheetMode());
    var preview = document.getElementById('jml-worksheet-preview');
    if (preview) {
      preview.innerHTML =
        '<div class="jml-worksheet-preview-empty">设置题型与难度后点击「生成预览」。</div>';
    }
  }

  var inited = false;

  function bindEvents() {
    if (inited) return;
    inited = true;
    var genBtn = document.getElementById('jml-ws-generate');
    var printBtn = document.getElementById('jml-ws-print');
    var modeEl = document.getElementById('jml-ws-mode');
    if (genBtn) genBtn.addEventListener('click', generateWorksheet);
    if (printBtn) printBtn.addEventListener('click', printWorksheet);
    if (modeEl) modeEl.addEventListener('change', onModeChange);
  }

  window.JmlAdminWorksheet = {
    init: function () {
      fillLevelSelect(getWorksheetMode());
      bindEvents();
    },
    generate: generateWorksheet,
    print: printWorksheet,
  };
})();
