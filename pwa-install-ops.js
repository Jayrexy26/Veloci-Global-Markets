// pwa-install-ops.js — Install banner for Veloci OPS admin app
(function () {
  const INSTALLED_KEY = 'veloci_ops_pwa_installed';

  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    localStorage.getItem(INSTALLED_KEY)
  ) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const STYLE = `
    #vpwa-banner {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 99998;
      background: #080c18; color: #fff;
      padding: 14px 20px;
      display: flex; align-items: center; gap: 14px;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      animation: vpwaSlideUp 0.35s cubic-bezier(.34,1.1,.64,1) both;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    @keyframes vpwaSlideUp {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #vpwa-icon {
      width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;
      background: #1e3a8a; overflow: hidden;
    }
    #vpwa-icon img { width: 100%; height: 100%; object-fit: cover; }
    #vpwa-text { flex: 1; min-width: 0; }
    #vpwa-text strong { display: block; font-size: 14px; font-weight: 700; }
    #vpwa-text span   { display: block; font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; line-height: 1.4; }
    #vpwa-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
    #vpwa-install {
      height: 36px; padding: 0 18px;
      background: #1e3a8a; color: #fff;
      border: none; border-radius: 20px;
      font-size: 13px; font-weight: 700; cursor: pointer;
      font-family: inherit; white-space: nowrap;
    }
    #vpwa-install:hover { background: #1e40af; }
    #vpwa-dismiss {
      background: none; border: none; color: rgba(255,255,255,0.35);
      font-size: 11px; cursor: pointer; font-family: inherit;
      text-align: center; padding: 0;
    }
    #vpwa-dismiss:hover { color: rgba(255,255,255,0.7); }

    #vpwa-ios-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
      background: #080c18; color: #fff;
      border-radius: 20px 20px 0 0;
      padding: 20px 24px 32px;
      box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      animation: vpwaSlideUp 0.35s cubic-bezier(.34,1.1,.64,1) both;
    }
    #vpwa-ios-sheet h3 { font-size: 17px; font-weight: 700; margin: 0 0 6px; }
    #vpwa-ios-sheet p  { font-size: 13px; color: rgba(255,255,255,0.55); margin: 0 0 20px; }
    .vpwa-step {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 16px; font-size: 14px;
    }
    .vpwa-step-num {
      width: 28px; height: 28px; border-radius: 50%;
      background: #1e3a8a; color: #fff; font-weight: 700; font-size: 13px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .vpwa-step-icon {
      font-size: 20px; width: 28px; text-align: center; flex-shrink: 0;
    }
    #vpwa-ios-close {
      width: 100%; height: 44px; margin-top: 8px;
      background: rgba(255,255,255,0.08); color: #fff;
      border: none; border-radius: 12px; font-size: 14px;
      font-weight: 600; cursor: pointer; font-family: inherit;
    }
    #vpwa-overlay-bg {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99998;
    }
    #vpwa-handle {
      width: 36px; height: 4px; background: rgba(255,255,255,0.2);
      border-radius: 2px; margin: 0 auto 20px;
    }
  `;

  function injectStyles() {
    if (document.getElementById('vpwa-styles')) return;
    const s = document.createElement('style');
    s.id = 'vpwa-styles';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function dismiss() {
    document.getElementById('vpwa-banner')?.remove();
    document.getElementById('vpwa-overlay-bg')?.remove();
    document.getElementById('vpwa-ios-sheet')?.remove();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  let _deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;

    setTimeout(() => {
      injectStyles();
      const banner = document.createElement('div');
      banner.id = 'vpwa-banner';
      banner.innerHTML = `
        <div id="vpwa-icon"><img src="/assets/admin-icon-192.png" alt="Veloci OPS"></div>
        <div id="vpwa-text">
          <strong>Veloci OPS</strong>
          <span>Install the admin panel for quick access</span>
        </div>
        <div id="vpwa-actions">
          <button id="vpwa-install">Install</button>
          <button id="vpwa-dismiss">Maybe later</button>
        </div>`;
      document.body.appendChild(banner);

      document.getElementById('vpwa-install').addEventListener('click', async () => {
        banner.remove();
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        if (outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1');
        _deferredPrompt = null;
      });
      document.getElementById('vpwa-dismiss').addEventListener('click', dismiss);
    }, 2500);
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, '1');
    document.getElementById('vpwa-banner')?.remove();
  });

  if (isIOS && isSafari) {
    setTimeout(() => {
      injectStyles();

      const overlay = document.createElement('div');
      overlay.id = 'vpwa-overlay-bg';
      overlay.addEventListener('click', dismiss);
      document.body.appendChild(overlay);

      const sheet = document.createElement('div');
      sheet.id = 'vpwa-ios-sheet';
      sheet.innerHTML = `
        <div id="vpwa-handle"></div>
        <h3>Install Veloci OPS</h3>
        <p>Add the admin panel to your home screen for quick access.</p>
        <div class="vpwa-step">
          <div class="vpwa-step-num">1</div>
          <div>Tap the <strong>Share</strong> button at the bottom of your browser</div>
          <div class="vpwa-step-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </div>
        </div>
        <div class="vpwa-step">
          <div class="vpwa-step-num">2</div>
          <div>Scroll down and tap <strong>"Add to Home Screen"</strong></div>
          <div class="vpwa-step-icon">➕</div>
        </div>
        <div class="vpwa-step">
          <div class="vpwa-step-num">3</div>
          <div>Tap <strong>"Add"</strong> in the top-right corner</div>
          <div class="vpwa-step-icon">✅</div>
        </div>
        <button id="vpwa-ios-close">Got it</button>`;
      document.body.appendChild(sheet);

      document.getElementById('vpwa-ios-close').addEventListener('click', dismiss);
    }, 3000);
  }
})();
