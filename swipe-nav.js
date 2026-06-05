/* Swipe-from-left-edge to open sidebar, swipe-left to close — PWA / mobile only */
(function () {
  var EDGE_ZONE   = 28;   // px from left edge that starts an open-swipe
  var SWIPE_OPEN  = 55;   // px of travel to snap sidebar open
  var SWIPE_CLOSE = 55;   // px of travel to snap sidebar closed

  var sx = null, sy = null, tracking = false, doingH = false;
  var sbEl, ovEl;

  function isMob() { return document.documentElement.classList.contains('mob'); }
  function isOpen() { return sbEl && sbEl.classList.contains('mob-open'); }

  document.addEventListener('touchstart', function (e) {
    if (!isMob()) return;
    sbEl = document.getElementById('sidebar');
    ovEl = document.getElementById('sb-overlay');
    if (!sbEl) return;
    var t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    // Track if starting from left edge (to open) or sidebar is already open (to close)
    tracking = (sx <= EDGE_ZONE && !isOpen()) || isOpen();
    doingH   = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tracking || sx === null) return;
    var t  = e.touches[0];
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;

    // Wait until movement is large enough to classify direction
    if (!doingH) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; } // vertical scroll — abort
      doingH = true;
    }

    e.preventDefault(); // prevent page scroll during horizontal swipe

    var sbW   = sbEl.offsetWidth;
    var open  = isOpen();
    var tx    = open ? Math.max(-sbW, dx) : Math.min(0, -sbW + dx);
    var alpha = open
      ? Math.max(0, 0.6 + dx / sbW * 0.6)
      : Math.min(0.6, dx  / sbW * 0.6);

    sbEl.style.transition = 'none';
    sbEl.style.transform  = 'translateX(' + tx + 'px)';

    if (ovEl) {
      ovEl.style.transition    = 'none';
      ovEl.style.opacity       = alpha;
      ovEl.style.pointerEvents = alpha > 0.05 ? 'auto' : 'none';
      if (!open && alpha > 0) ovEl.classList.add('open');
    }
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    if (!tracking || sx === null) return;
    var dx   = e.changedTouches[0].clientX - sx;
    var open = isOpen();

    // Restore CSS transitions
    sbEl.style.transition = '';
    sbEl.style.transform  = '';
    if (ovEl) {
      ovEl.style.transition    = '';
      ovEl.style.opacity       = '';
      ovEl.style.pointerEvents = '';
    }

    if (!open && dx >= SWIPE_OPEN) {
      sbEl.classList.add('mob-open');
      if (ovEl) ovEl.classList.add('open');
    } else if (open && dx <= -SWIPE_CLOSE) {
      sbEl.classList.remove('mob-open');
      if (ovEl) ovEl.classList.remove('open');
    } else if (!open) {
      // Didn't travel far enough — snap back closed
      if (ovEl) ovEl.classList.remove('open');
    }

    tracking = false;
    doingH   = false;
    sx = sy  = null;
  }, { passive: true });
})();
