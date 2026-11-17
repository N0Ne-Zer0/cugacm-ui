/* 题目页增强（在线 IDE 部分）：
 * 1) 题面样例不再渲染「填充到自测」按钮；
 * 2) 「自测」面板标题栏右侧补上「样例 1 / 样例 2」按钮，点一下把题面样例填进自测输入框；
 * 3) 自测与评测记录互斥，点了其中一个会收起另一个，避免两块面板上下堆叠；
 * 4) 自测面板固定提示：远程题只有部分支持本地自测，且自测不比对答案。
 * 只依赖 DOM，不碰 React 组件源码。
 */
(function () {
  'use strict';

  if (!document.querySelector('.problem-content')) return;

  var ZH = (function () {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.indexOf('zh') === 0) return true;
    if (lang) return false;
    var nav = document.querySelector('.nav__list');
    return !!nav && /题库|比赛|登录/.test(nav.textContent || '');
  })();

  function t(zh, en) {
    return ZH ? zh : en;
  }

  var NOTE = t(
    '远程测评题只有部分题目支持本地自测，且自测不比对答案，AC 不代表正确。',
    'Only some remote-judge problems support local pretest, and pretest does not compare answers — AC does not mean correct.'
  );

  /* ---------- 1. 去掉题面里的「填充到自测」 ---------- */
  function dropFillButtons() {
    var nodes = document.querySelectorAll('.problem-content .scratchpad-fill-button');
    for (var i = nodes.length - 1; i >= 0; i -= 1) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  /* ---------- 2. 读取题面样例 ---------- */
  function readSamples() {
    var pres = document.querySelectorAll('.problem-content pre');
    var outputs = {};
    var inputs = [];
    var i;
    for (i = 0; i < pres.length; i += 1) {
      var code = pres[i].querySelector('code');
      var cls = (pres[i].className || '') + ' ' + (code ? code.className : '');
      var mo = /language-output(\d*)/.exec(cls);
      if (mo) outputs[mo[1]] = (pres[i].textContent || '').trim();
    }
    for (i = 0; i < pres.length; i += 1) {
      var code2 = pres[i].querySelector('code');
      var cls2 = (pres[i].className || '') + ' ' + (code2 ? code2.className : '');
      var mi = /language-input(\d*)/.exec(cls2);
      if (mi) {
        inputs.push({
          key: mi[1] || String(inputs.length + 1),
          text: (pres[i].textContent || '').trim(),
          output: outputs[mi[1] || ''] || '',
        });
      }
    }
    inputs.sort(function (a, b) {
      return (parseInt(a.key, 10) || 0) - (parseInt(b.key, 10) || 0);
    });
    return inputs;
  }

  /* ---------- 3. 写入自测输入框 ---------- */
  function inputEl() {
    return document.querySelector('#scratchpad textarea.scratchpad__data-input');
  }

  function setValue(el, value) {
    var desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillSample(sample, retry) {
    var el = inputEl();
    if (!el) {
      var toggle = document.querySelector('.scratchpad__toolbar__button[data-global-hotkey="alt+p"]');
      if (toggle && !toggle.classList.contains('activated') && (retry || 0) < 3) {
        toggle.click();
        setTimeout(function () { fillSample(sample, (retry || 0) + 1); }, 350);
      }
      return;
    }
    setValue(el, sample.text);
    el.focus();
    var pane = el.closest('.split-view-view');
    if (pane && pane.scrollIntoView) pane.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 4. 「自测」面板标题栏：固定提示 + 样例按钮 ---------- */
  function selfTitle() {
    var el = inputEl();
    if (!el) return null;
    var panel = el.closest('.splitpane-fill');
    return panel ? panel.querySelector('.scratchpad__panel-title') : null;
  }

  function ensureSampleBar() {
    var title = selfTitle();
    if (!title) return;
    if (title.querySelector('.cug-sample-bar')) return;

    var bar = document.createElement('div');
    bar.className = 'cug-sample-bar';

    var samples = readSamples();
    if (samples.length) {
      var label = document.createElement('span');
      label.className = 'cug-sample-bar__label';
      label.textContent = t('填入样例', 'Fill sample');
      bar.appendChild(label);

      samples.forEach(function (sample) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cug-sample-bar__btn';
        btn.textContent = t('样例 ', 'Sample ') + sample.key;
        if (sample.output) btn.title = t('样例输入对应的期望输出：\n', 'Expected output for this sample:\n') + sample.output;
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          fillSample(sample, 0);
        });
        bar.appendChild(btn);
      });
    }

    title.appendChild(bar);
  }

  /* ---------- 5. 工具栏固定提示（任何语言都看得到） ---------- */
  function ensureToolbarHint() {
    var tb = document.querySelector('.scratchpad__toolbar');
    if (!tb || tb.querySelector('.cug-ide-hint')) return;
    var el = document.createElement('span');
    el.className = 'cug-ide-hint';
    el.textContent = NOTE;
    el.title = NOTE;
    tb.appendChild(el);
  }

  /* ---------- 6. 自测 / 评测记录 互斥 ---------- */
  var PAIRS = [['alt+p', 'alt+r'], ['alt+r', 'alt+p']];
  function bindToggles() {
    PAIRS.forEach(function (pair) {
      var btn = document.querySelector('.scratchpad__toolbar__button[data-global-hotkey="' + pair[0] + '"]');
      if (!btn || btn.dataset.cugExclusive === '1') return;
      btn.dataset.cugExclusive = '1';
      btn.addEventListener('click', function () {
        if (btn.classList.contains('activated')) return;
        var other = document.querySelector('.scratchpad__toolbar__button[data-global-hotkey="' + pair[1] + '"]');
        if (other && other.classList.contains('activated')) other.click();
      }, true);
    });
  }

  /* ---------- 7. 提交流程会自动打开评测记录：这里保证不同时展开 ---------- */
  function enforceExclusive() {
    var p = document.querySelector('.scratchpad__toolbar__button[data-global-hotkey="alt+p"]');
    var r = document.querySelector('.scratchpad__toolbar__button[data-global-hotkey="alt+r"]');
    if (!p || !r) return;
    if (p.classList.contains('activated') && r.classList.contains('activated')) {
      // 递交/自测后 Hydro 会自动展开评测记录，此时收起重叠的自测面板
      p.click();
    }
  }

  /* ---------- 调度 ---------- */
  var scheduled = false;
  function enhance() {
    try {
      dropFillButtons();
      ensureSampleBar();
      ensureToolbarHint();
      bindToggles();
      enforceExclusive();
    } catch (e) {
      if (window.console) console.warn('[cug-scratchpad]', e);
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      enhance();
    };
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  schedule();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
