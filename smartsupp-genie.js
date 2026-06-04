/*!
 * smartsupp-genie.js — diagnostic build
 * Open browser DevTools console and click the chat button.
 * Look for lines starting with [SG] to see what Smartsupp injects.
 */
(function () {
  'use strict';

  /* ── CSS ── */
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

  /* ── Helpers ── */
  function genieIn(el) {
    console.log('[SG] genieIn on', el.tagName, el.id, el.className, el.style.cssText);
    el.classList.remove('ss-go');
    void el.offsetWidth;
    el.classList.add('ss-gi');
  }
  function genieOut(el) {
    console.log('[SG] genieOut on', el.tagName, el.id, el.className, el.style.cssText);
    el.classList.remove('ss-gi');
    void el.offsetWidth;
    el.classList.add('ss-go');
    el.addEventListener('animationend', function () { el.classList.remove('ss-go'); }, { once: true });
  }

  /* ── Diagnostic: dump Smartsupp DOM once it appears ── */
  function dumpContainer(c) {
    console.log('[SG] #smartsupp-widget-container found. Direct children:', c.children.length);
    Array.from(c.querySelectorAll('*')).forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      console.log('[SG] [' + i + ']', el.tagName,
        'id=' + (el.id || '-'),
        'class=' + (el.className || '-'),
        'style="' + el.style.cssText + '"',
        'rect=' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
  }

  /* ── Main ── */
  window.smartsupp = window.smartsupp || function () {
    (window.smartsupp._ = window.smartsupp._ || []).push(arguments);
  };

  /* Watch for container injection */
  function waitForContainer(cb) {
    var c = document.getElementById('smartsupp-widget-container');
    if (c) { cb(c); return; }
    new MutationObserver(function (_, obs) {
      var el = document.getElementById('smartsupp-widget-container');
      if (el) { obs.disconnect(); cb(el); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  waitForContainer(function (container) {
    /* Dump immediately and again after 3 s (widget may still be loading) */
    dumpContainer(container);
    setTimeout(function () {
      console.log('[SG] --- 3s dump ---');
      dumpContainer(container);
    }, 3000);

    /* Watch ALL style + class changes in the whole container subtree */
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'attributes') {
          console.log('[SG] attr change on', m.target.tagName,
            'id=' + (m.target.id || '-'),
            m.attributeName + ':', m.target.getAttribute(m.attributeName),
            '(was:', m.oldValue + ')');
        }
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1) console.log('[SG] node added:', n.tagName, n.id, n.className);
          });
          m.removedNodes.forEach(function (n) {
            if (n.nodeType === 1) console.log('[SG] node removed:', n.tagName, n.id, n.className);
          });
        }
      });
    }).observe(container, {
      subtree: true, childList: true,
      attributes: true, attributeOldValue: true,
      attributeFilter: ['style', 'class', 'width', 'height']
    });
  });

  /* Also log API events */
  smartsupp('on', 'chat:open', function () {
    console.log('[SG] smartsupp event: chat:open');
    var c = document.getElementById('smartsupp-widget-container');
    if (c) dumpContainer(c);
  });
  smartsupp('on', 'chat:close', function () {
    console.log('[SG] smartsupp event: chat:close');
    var c = document.getElementById('smartsupp-widget-container');
    if (c) dumpContainer(c);
  });

})();
