(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  var deferredPrompt = null;
  var isAdmin = document.querySelector('link[rel="manifest"]')?.href?.includes('manifest-ops');

  function createBanner() {
    if (document.getElementById('pwa-banner')) return;
    var icon = isAdmin ? '/assets/admin-icon-192.png' : '/assets/icon-192.png';
    var appName = isAdmin ? 'Veloci OPS' : 'Veloci';
    var accent = isAdmin ? '#1e3a8a' : '#f05a1a';
    var banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
      'background:#111827;border-top:1px solid rgba(255,255,255,0.1);' +
      'padding:12px 16px;align-items:center;gap:12px;box-shadow:0 -4px 20px rgba(0,0,0,0.4);';
    banner.innerHTML =
      '<img src="' + icon + '" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;color:#f1f1f1;font-size:14px;font-family:sans-serif;">' + appName + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;font-family:sans-serif;">Add to home screen for the best experience</div>' +
      '</div>' +
      '<button id="pwa-install-btn" style="background:' + accent + ';color:#fff;border:none;border-radius:8px;' +
        'padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:sans-serif;">Install</button>' +
      '<button id="pwa-dismiss-btn" style="background:none;border:none;color:#6b7280;font-size:22px;' +
        'cursor:pointer;padding:2px 6px;line-height:1;font-family:sans-serif;">×</button>';
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        banner.style.display = 'none';
      });
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
      banner.style.display = 'none';
      try { sessionStorage.setItem('pwa-dismissed', '1'); } catch (e) {}
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    try { if (sessionStorage.getItem('pwa-dismissed')) return; } catch (e) {}
    createBanner();
    document.getElementById('pwa-banner').style.display = 'flex';
  });

  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('pwa-banner');
    if (b) b.style.display = 'none';
    deferredPrompt = null;
  });
})();
