(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  window.__pwaPrompt = null;
  var isAdmin = !!(document.querySelector('link[rel="manifest"]') || {}).href
    && (document.querySelector('link[rel="manifest"]').href || '').includes('manifest-ops');

  /* ── native install prompt (Android Chrome / Edge / Samsung) ── */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pwaPrompt = e;

    /* auto-banner only if not dismissed in this session */
    try { if (sessionStorage.getItem('pwa-dismissed')) return; } catch (_) {}

    showPWABanner();
  });

  window.addEventListener('appinstalled', function () {
    window.__pwaPrompt = null;
    var b = document.getElementById('pwa-banner');
    if (b) b.style.display = 'none';
  });

  /* ── global install trigger — called from any page ── */
  window.triggerPWAInstall = function () {
    if (window.__pwaPrompt) {
      window.__pwaPrompt.prompt();
      window.__pwaPrompt.userChoice.then(function () { window.__pwaPrompt = null; });
      return;
    }
    /* iOS Safari */
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) { showIOSModal(); return; }
    /* standalone already installed */
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      alert('Veloci is already installed on your device.'); return;
    }
    /* generic fallback */
    showGenericModal();
  };

  /* ── bottom banner (Android / desktop) ── */
  function showPWABanner() {
    if (document.getElementById('pwa-banner')) {
      document.getElementById('pwa-banner').style.display = 'flex';
      return;
    }
    var icon  = isAdmin ? '/assets/admin-icon-192.png' : '/assets/icon-192.png';
    var label = isAdmin ? 'Veloci OPS' : 'Veloci';
    var accent = isAdmin ? '#1e3a8a' : '#f05a1a';

    var el = document.createElement('div');
    el.id = 'pwa-banner';
    el.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:99999;display:flex;' +
      'align-items:center;gap:12px;padding:12px 16px;' +
      'background:#111827;border-top:1px solid rgba(255,255,255,.1);' +
      'box-shadow:0 -4px 20px rgba(0,0,0,.5);';
    el.innerHTML =
      '<img src="' + icon + '" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;" />' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;color:#f1f1f1;font-size:14px;font-family:sans-serif;">' + label + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;font-family:sans-serif;">Add to your home screen</div>' +
      '</div>' +
      '<button id="pwa-install-btn" style="background:' + accent + ';color:#fff;border:none;border-radius:8px;' +
        'padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:sans-serif;white-space:nowrap;">Install</button>' +
      '<button id="pwa-dismiss-btn" style="background:none;border:none;color:#6b7280;font-size:22px;' +
        'cursor:pointer;padding:2px 6px;line-height:1;font-family:sans-serif;">×</button>';
    document.body.appendChild(el);

    document.getElementById('pwa-install-btn').addEventListener('click', function () {
      window.triggerPWAInstall();
      el.style.display = 'none';
    });
    document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
      el.style.display = 'none';
      try { sessionStorage.setItem('pwa-dismissed', '1'); } catch (_) {}
    });
  }

  /* ── iOS share-sheet instructions modal ── */
  function showIOSModal() {
    showModal(
      'Add to Home Screen',
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<img src="/assets/icon-192.png" style="width:64px;height:64px;border-radius:14px;margin:0 auto 12px;" />' +
        '<div style="font-size:15px;font-weight:600;color:#f1f1f1;margin-bottom:4px;">Veloci</div>' +
      '</div>' +
      '<ol style="padding-left:20px;color:#d1d5db;font-size:14px;line-height:1.9;margin:0;">' +
        '<li>Tap the <strong style="color:#fff;">Share</strong> button ' +
          '<span style="font-size:18px;vertical-align:middle;">⬆</span> at the bottom of Safari</li>' +
        '<li>Scroll down and tap <strong style="color:#fff;">Add to Home Screen</strong></li>' +
        '<li>Tap <strong style="color:#fff;">Add</strong> in the top-right corner</li>' +
      '</ol>'
    );
  }

  /* ── generic fallback modal ── */
  function showGenericModal() {
    showModal(
      'Install Veloci',
      '<div style="color:#d1d5db;font-size:14px;line-height:1.7;">' +
        '<p style="margin-bottom:12px;">To install the app, open this site in <strong style="color:#fff;">Chrome</strong> on Android, then:</p>' +
        '<ol style="padding-left:20px;margin:0;">' +
          '<li>Tap the <strong style="color:#fff;">⋮ Menu</strong> in the top-right corner</li>' +
          '<li>Tap <strong style="color:#fff;">Add to Home screen</strong> or <strong style="color:#fff;">Install app</strong></li>' +
        '</ol>' +
      '</div>'
    );
  }

  function showModal(title, bodyHTML) {
    var existing = document.getElementById('pwa-info-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'pwa-info-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.7);' +
      'display:flex;align-items:flex-end;justify-content:center;padding:0;';
    overlay.innerHTML =
      '<div style="background:#1f2937;border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
          '<div style="font-weight:700;color:#f1f1f1;font-size:16px;font-family:sans-serif;">' + title + '</div>' +
          '<button id="pwa-modal-close" style="background:rgba(255,255,255,.1);border:none;color:#9ca3af;' +
            'border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;font-family:sans-serif;">×</button>' +
        '</div>' +
        bodyHTML +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById('pwa-modal-close').addEventListener('click', function () {
      overlay.remove();
    });
  }
})();
