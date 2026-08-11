/* Veloci Global Markets — Smartsupp live chat gate.
 *
 * Replaces the inline Smartsupp loader that used to sit in every page head.
 * Reads the chat rules from Supabase system_settings first and only injects
 * Smartsupp if they allow it, so a disabled widget is never downloaded at all.
 *
 * Rules (all set from ops → Settings → Live Chat):
 *   chat_enabled        'true' | 'false'      master switch
 *   chat_visibility     'all'  | 'logged_in'  who may see the widget
 *   chat_disabled_users JSON array of user ids to hide it from
 *
 * Fails open: if the settings cannot be read the chat loads, matching the
 * behaviour before this file existed — a transient error should not silently
 * remove the support channel.
 */
(function () {
  const SUPABASE_URL  = 'https://xdcscknfomlzwysczegc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY3Nja25mb21send5c2N6ZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTYzMDMsImV4cCI6MjA4MzI5MjMwM30.E6o2wFFMOpK1DghLUqnxG6Ig09djy4bmDQexprhAiB4';
  const STORAGE_KEY   = 'sb-xdcscknfomlzwysczegc-auth-token';
  const SMARTSUPP_KEY = 'bf17dc4b07110cdfdfc72a377e70c50879c14cea';
  const CACHE_KEY     = 'sv_chat_cfg';
  const CACHE_TTL     = 20000;   // 20s — a toggle in ops shows up on the next page load

  /* ── The original inline loader, unchanged apart from being callable ── */
  function loadSmartsupp() {
    if (window.smartsupp) return;
    const cfg = window._smartsupp = window._smartsupp || {};
    cfg.key   = SMARTSUPP_KEY;
    cfg.color = '#f05a1a';
    (function (d) {
      let s, c;
      const o = window.smartsupp = function () { o._.push(arguments); };
      o._ = [];
      s = d.getElementsByTagName('script')[0];
      c = d.createElement('script');
      c.type = 'text/javascript';
      c.charset = 'utf-8';
      c.async = true;
      c.defer = true;
      c.fetchPriority = 'high';
      c.src = 'https://www.smartsuppchat.com/loader.js?';
      s.parentNode.insertBefore(c, s);
    })(document);
  }

  /* ── Settings, cached per tab so this costs one request per 20s ── */
  async function getSettings() {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { v, t } = JSON.parse(cached);
        if (Date.now() - t < CACHE_TTL) return v;
      }
    } catch (_) {}

    const url = SUPABASE_URL +
      '/rest/v1/system_settings?select=key,value&key=in.(chat_enabled,chat_visibility,chat_disabled_users)';
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
    });
    if (!res.ok) throw new Error('settings ' + res.status);

    const map = {};
    (await res.json()).forEach(r => { map[r.key] = r.value; });
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: map, t: Date.now() })); } catch (_) {}
    return map;
  }

  /* ── Who is signed in ──
     Uses the Supabase client when the page loads it. The public marketing and
     markets pages do not, so there we read the session supabase-js persists in
     localStorage. Anything unreadable counts as signed out. */
  async function currentUserId() {
    if (window.SV_DB && window.SV_DB.auth && window.SV_DB.auth.getSession) {
      try {
        const { data } = await window.SV_DB.auth.getSession();
        return (data && data.session && data.session.user && data.session.user.id) || null;
      } catch (_) {}
    }
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (raw.startsWith('base64-')) raw = atob(raw.slice(7));   // newer supabase-js
      const parsed  = JSON.parse(raw);
      const session = parsed && (parsed.currentSession || parsed);
      if (!session || !session.user) return null;
      /* ignore an expired session — that user is effectively signed out */
      if (session.expires_at && session.expires_at * 1000 < Date.now()) return null;
      return session.user.id || null;
    } catch (_) {
      return null;
    }
  }

  (async function () {
    let cfg;
    try {
      cfg = await getSettings();
    } catch (_) {
      loadSmartsupp();   // fail open
      return;
    }

    try {
      /* master switch — absent setting means "on", matching previous behaviour */
      if (cfg.chat_enabled !== undefined && String(cfg.chat_enabled) !== 'true') return;

      let disabled = [];
      try {
        const parsed = JSON.parse(cfg.chat_disabled_users || '[]');
        if (Array.isArray(parsed)) disabled = parsed;
      } catch (_) {}

      const needsUser = cfg.chat_visibility === 'logged_in' || disabled.length > 0;
      if (needsUser) {
        const uid = await currentUserId();
        if (cfg.chat_visibility === 'logged_in' && !uid) return;   // signed-out visitor
        if (uid && disabled.indexOf(uid) !== -1) return;           // hidden from this user
      }

      loadSmartsupp();
    } catch (_) {
      loadSmartsupp();   // fail open
    }
  })();
})();
