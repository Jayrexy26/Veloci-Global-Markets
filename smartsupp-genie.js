/*!
 * smartsupp-genie.js
 * Chat panel is a DIV added/removed from #smartsupp-widget-container.
 * Open  → DIV appended  → genieIn
 * Close → DIV removed   → re-insert, genieOut, then truly remove
 */
(function () {
  'use strict';

  /* ── Keyframes + utility classes ── */
  var $s = document.createElement('style');
  $s.textContent =
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
  document.head.appendChild($s);

  /* ── Helpers ── */
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

  /* Chat panel: has max-height set + NOT the button wrapper (9999px radius) */
  function isChatPanel(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'DIV') return false;
    var s = el.style;
    return s.maxHeight !== '' && s.borderRadius !== '9999px';
  }

  /* ── Core observer ── */
  function setup(container) {
    var _blocking = false;

    new MutationObserver(function (muts) {
      muts.forEach(function (m) {

        /* Panel added → chat opened → genieIn */
        m.addedNodes.forEach(function (n) {
          if (_blocking || !isChatPanel(n)) return;
          genieIn(n);
        });

        /* Panel removed → chat closed → re-insert, animate out, then truly remove */
        m.removedNodes.forEach(function (n) {
          if (_blocking || !isChatPanel(n)) return;
          _blocking = true;
          container.appendChild(n);           /* put it back temporarily */
          genieOut(n, function () {
            if (n.parentNode) n.parentNode.removeChild(n);
            _blocking = false;
          });
        });

      });
    }).observe(container, { childList: true });
  }

  /* ── Wait for Smartsupp to inject its container ── */
  function init() {
    var c = document.getElementById('smartsupp-widget-container');
    if (c) { setup(c); return; }
    new MutationObserver(function (_, obs) {
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
