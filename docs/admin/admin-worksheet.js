/**
 * 管理端：去括号习题纸生成与打印
 */
(function () {
  var QUESTIONS_PER_PAGE = 20;
  var COLS_PER_PAGE = 10;

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildQuestion(level) {
    var eng = window.JmlExpandBrackets;
    if (!eng || typeof eng.buildQuestion !== 'function') {
      throw new Error('未加载出题模块 expand-brackets-questions.js');
    }
    var q = eng.buildQuestion(level);
    return {
      prompt: q.prompt || '',
      answer: q.correctText != null ? q.correctText : '',
    };
  }

  function splitIntoColumns(questions, perCol) {
    var left = questions.slice(0, perCol);
    var right = questions.slice(perCol);
    return { left: left, right: right };
  }

  function renderColumnItems(items, startIndex, showAnswers) {
    var html = '';
    for (var i = 0; i < items.length; i += 1) {
      var q = items[i];
      var n = startIndex + i;
      html +=
        '<li class="jml-ws-item">' +
        '<span class="jml-ws-num">' +
        n +
        '.</span> ' +
        '<span class="jml-ws-prompt">' +
        escapeHtml(q.prompt) +
        '</span>';
      if (showAnswers) {
        html += '<span class="jml-ws-ans">= ' + escapeHtml(q.answer) + '</span>';
      } else {
        html += '<span class="jml-ws-workspace" aria-hidden="true"></span>';
      }
      html += '</li>';
    }
    return html;
  }

  function renderPageHtml(opts) {
    var title = opts.title;
    var name = opts.studentName;
    var questions = opts.questions;
    var showAnswers = !!opts.showAnswers;
    var split = splitIntoColumns(questions, COLS_PER_PAGE);
    var nameHtml = name
      ? escapeHtml(name)
      : '&nbsp;';

    return (
      '<section class="jml-ws-page' +
      (showAnswers ? ' jml-ws-answers' : '') +
      '">' +
      '<header class="jml-ws-head">' +
      '<h1 class="jml-ws-title">' +
      escapeHtml(title) +
      '</h1>' +
      '<p class="jml-ws-meta">' +
      '<span>姓名：<span class="jml-ws-name-line">' +
      nameHtml +
      '</span></span>' +
      '</p>' +
      '</header>' +
      '<div class="jml-ws-grid">' +
      '<ol class="jml-ws-col" start="1">' +
      renderColumnItems(split.left, 1, showAnswers) +
      '</ol>' +
      '<ol class="jml-ws-col" start="' +
      (COLS_PER_PAGE + 1) +
      '">' +
      renderColumnItems(split.right, COLS_PER_PAGE + 1, showAnswers) +
      '</ol>' +
      '</div>' +
      '</section>'
    );
  }

  function generateWorksheet() {
    var levelEl = document.getElementById('jml-ws-level');
    var pagesEl = document.getElementById('jml-ws-pages');
    var nameEl = document.getElementById('jml-ws-student-name');
    var answersEl = document.getElementById('jml-ws-include-answers');
    var preview = document.getElementById('jml-worksheet-preview');
    if (!preview) return;

    var level = levelEl ? Number(levelEl.value) : 0;
    if (!Number.isFinite(level)) level = 0;
    level = Math.min(4, Math.max(0, Math.floor(level)));

    var pages = pagesEl ? Number(pagesEl.value) : 1;
    if (!Number.isFinite(pages) || pages < 1) pages = 1;
    if (pages > 20) pages = 20;

    var studentName = nameEl ? String(nameEl.value || '').trim() : '';
    var includeAnswers = answersEl ? !!answersEl.checked : false;

    var labels = (window.JmlExpandBrackets && window.JmlExpandBrackets.LEVEL_LABELS) || [];
    var levelLabel = labels[level] || '去括号 L' + (level + 1);
    var title = '去括号练习 · ' + levelLabel;

    var html = '';
    try {
      for (var p = 0; p < pages; p += 1) {
        var batch = [];
        for (var i = 0; i < QUESTIONS_PER_PAGE; i += 1) {
          batch.push(buildQuestion(level));
        }
        html += renderPageHtml({
          title: title,
          studentName: studentName,
          questions: batch,
          showAnswers: false,
        });
        if (includeAnswers) {
          html += renderPageHtml({
            title: title,
            studentName: studentName,
            questions: batch,
            showAnswers: true,
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

  function fillLevelSelect() {
    var sel = document.getElementById('jml-ws-level');
    if (!sel) return;
    var labels = (window.JmlExpandBrackets && window.JmlExpandBrackets.LEVEL_LABELS) || [
      'L1 · 一层括号（整数）',
      'L2 · 乘除去括号',
      'L3 · 两段括号',
      'L4 · 系数×括号',
      'L5 · 综合',
    ];
    sel.innerHTML = '';
    labels.forEach(function (label, idx) {
      var opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.value = '0';
  }

  var inited = false;

  function bindEvents() {
    if (inited) return;
    inited = true;
    var genBtn = document.getElementById('jml-ws-generate');
    var printBtn = document.getElementById('jml-ws-print');
    if (genBtn) genBtn.addEventListener('click', generateWorksheet);
    if (printBtn) printBtn.addEventListener('click', printWorksheet);
  }

  window.JmlAdminWorksheet = {
    init: function () {
      fillLevelSelect();
      bindEvents();
    },
    generate: generateWorksheet,
    print: printWorksheet,
  };
})();
