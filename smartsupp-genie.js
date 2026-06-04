/*!
 * smartsupp-genie.js
 * Applies genieIn / genieOut to the Smartsupp chat iframe
 * using Smartsupp's own chat:open / chat:close event API.
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

  /* ── Ensure the smartsupp queue exists so we can register events
        before the widget script has fully loaded ── */
  window.smartsupp = window.smartsupp || function () {
    (window.smartsupp._ = window.smartsupp._ || []).push(arguments);
  };

  function getWidget() {
    var c = document.getElementById('smartsupp-widget-container');
    if (!c) return null;
    /* Prefer the first iframe; fall back to first element child */
    return c.querySelector('iframe') || c.firstElementChild || null;
  }

  function genieIn(el) {
    el.classList.remove('ss-go');
    void el.offsetWidth;         /* force reflow so animation restarts */
    el.classList.add('ss-gi');
  }

  function genieOut(el) {
    el.classList.remove('ss-gi');
    void el.offsetWidth;
    el.classList.add('ss-go');
    el.addEventListener('animationend', function () {
      el.classList.remove('ss-go');
    }, { once: true });
  }

  /* ── Hook Smartsupp events ── */
  smartsupp('on', 'chat:open', function () {
    var el = getWidget();
    if (el) genieIn(el);
  });

  smartsupp('on', 'chat:close', function () {
    var el = getWidget();
    if (el) genieOut(el);
  });

})();
