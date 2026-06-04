/*!
 * smartsupp-genie.js
 * Applies genieIn / genieOut animation to the Smartsupp chat window.
 * Works by watching #smartsupp-widget-container children for display changes.
 */
(function () {
  'use strict';

  /* ── Inject keyframes + utility classes ── */
  var $style = document.createElement('style');
  $style.textContent =
    '@keyframes ssGIn{' +
      '0%{opacity:.7;clip-path:polygon(48% 100%,52% 100%,52% 100%,48% 100%,48% 100%,52% 100%);transform:scaleY(.02)}' +
      '18%{opacity:1;clip-path:polygon(0% 0%,100% 0%,74% 50%,62% 100%,38% 100%,26% 50%);transform:scaleY(.58)}' +
      '50%{clip-path:polygon(0% 0%,100% 0%,90% 50%,82% 100%,18% 100%,10% 50%);transform:scaleY(.84)}' +
      '78%{clip-path:polygon(0% 0%,100% 0%,98% 50%,94% 100%,6% 100%,2% 50%);transform:scaleY(.97)}' +
      '100%{clip-path:polygon(0% 0%,100% 0%,100% 50%,100% 100%,0% 100%,0% 50%);transform:scaleY(1);opacity:1}' +
    '}' +
    '@keyframes ssGOut{' +
      '0%{clip-path:polygon(0% 0%,100% 0%,100% 50%,100% 100%,0% 100%,0% 50%);transform:scaleY(1);opacity:1}' +
      '20%{clip-path:polygon(0% 0%,100% 0%,98% 50%,94% 100%,6% 100%,2% 50%);transform:scaleY(.97)}' +
      '50%{clip-path:polygon(0% 0%,100% 0%,90% 50%,82% 100%,18% 100%,10% 50%);transform:scaleY(.84);opacity:1}' +
      '80%{clip-path:polygon(0% 0%,100% 0%,74% 50%,62% 100%,38% 100%,26% 50%);transform:scaleY(.56);opacity:.8}' +
      '100%{clip-path:polygon(48% 100%,52% 100%,52% 100%,48% 100%,48% 100%,52% 100%);transform:scaleY(.02);opacity:0}' +
    '}' +
    '.ss-gi{animation:ssGIn .54s cubic-bezier(.34,1.1,.64,1) both!important;transform-origin:bottom right;will-change:clip-path,transform}' +
    '.ss-go{animation:ssGOut .36s cubic-bezier(.4,0,.8,1) both!important;transform-origin:bottom right;will-change:clip-path,transform}';
  document.head.appendChild($style);

  var _guard = false;

  function genieIn(el) {
    el.classList.remove('ss-go');
    void el.offsetWidth;
    el.classList.add('ss-gi');
  }

  function genieOut(el, done) {
    el.classList.remove('ss-gi');
    void el.offsetWidth;
    el.classList.add('ss-go');
    el.addEventListener('animationend', function () {
      el.classList.remove('ss-go');
      if (done) done();
    }, { once: true });
  }

  function watchChild(el) {
    new MutationObserver(function (muts) {
      if (_guard) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.attributeName !== 'style') continue;
        var nowHidden = el.style.display === 'none';
        var wasHidden = /display\s*:\s*none/.test(m.oldValue || '');
        if (nowHidden && !wasHidden) {
          /* Going hidden — play genieOut first, then truly hide */
          _guard = true;
          el.style.display = 'block';
          genieOut(el, function () {
            el.style.display = 'none';
            _guard = false;
          });
          return;
        }
        if (!nowHidden && wasHidden) {
          /* Appearing — play genieIn */
          genieIn(el);
          return;
        }
      }
    }).observe(el, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  }

  function setup(container) {
    /* Watch all current direct children */
    Array.from(container.children).forEach(watchChild);
    /* Watch for any children Smartsupp adds later */
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) watchChild(n);
        });
      });
    }).observe(container, { childList: true });
  }

  function init() {
    var c = document.getElementById('smartsupp-widget-container');
    if (c) { setup(c); return; }
    /* Wait for Smartsupp to inject its container */
    new MutationObserver(function (muts, obs) {
      var el = document.getElementById('smartsupp-widget-container');
      if (el) { obs.disconnect(); setup(el); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
