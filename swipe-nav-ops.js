/* Swipe-from-left-edge to open sidebar, swipe-left to close — admin panel mobile */
(function () {
  var EDGE_ZONE   = 28;
  var SWIPE_OPEN  = 55;
  var SWIPE_CLOSE = 55;

  var sx = null, sy = null, tracking = false, doingH = false;
  var sbEl, ovEl, ovClass;

  function isMob() { return window.innerWidth <= 768; }
  function isOpen() { return sbEl && sbEl.classList.contains('open'); }

  function getOverlay() {
    var el = document.getElementById('sideOverlay');
    if (el) { ovClass = 'show'; return el; }
    el = document.getElementById('sidebar-overlay');
    if (el) { ovClass = 'open'; return el; }
    return null;
  }

  document.addEventListener('touchstart', function (e) {
    if (!isMob()) return;
    sbEl = document.getElementById('sidebar');
    ovEl = getOverlay();
    if (!sbEl) return;
    var t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    tracking = (sx <= EDGE_ZONE && !isOpen()) || isOpen();
    doingH = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tracking || sx === null) return;
    var t  = e.touches[0];
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;

    if (!doingH) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
      doingH = true;
    }

    e.preventDefault();

    var sbW   = sbEl.offsetWidth;
    var open  = isOpen();
    var tx    = open ? Math.max(-sbW, dx) : Math.min(0, -sbW + dx);
    var alpha = open
      ? Math.max(0, 0.55 + dx / sbW * 0.55)
      : Math.min(0.55, dx / sbW * 0.55);

    sbEl.style.transition = 'none';
    sbEl.style.transform  = 'translateX(' + tx + 'px)';

    if (ovEl) {
      ovEl.style.transition    = 'none';
      ovEl.style.display       = 'block';
      ovEl.style.opacity       = alpha;
      ovEl.style.pointerEvents = alpha > 0.05 ? 'auto' : 'none';
    }
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    if (!tracking || sx === null) return;
    var dx   = e.changedTouches[0].clientX - sx;
    var open = isOpen();

    sbEl.style.transition = '';
    sbEl.style.transform  = '';

    if (ovEl) {
      ovEl.style.transition    = '';
      ovEl.style.display       = '';
      ovEl.style.opacity       = '';
      ovEl.style.pointerEvents = '';
    }

    if (!open && dx >= SWIPE_OPEN) {
      sbEl.classList.add('open');
      if (ovEl) ovEl.classList.add(ovClass);
    } else if (open && dx <= -SWIPE_CLOSE) {
      sbEl.classList.remove('open');
      if (ovEl) ovEl.classList.remove(ovClass);
    } else if (!open) {
      if (ovEl) ovEl.classList.remove(ovClass);
    }

    tracking = false;
    doingH   = false;
    sx = sy  = null;
  }, { passive: true });
})();
