/* Veloci Global Markets — live visitor presence.
 *
 * Heartbeats to a definer function so ops can show who is on the site right
 * now. Runs on every page, signed in or not. The table it feeds is not
 * readable by visitors — only support can see the list.
 *
 * Nothing here is worth breaking a page for: every call is wrapped, and a
 * failure just means the visitor does not appear in the list.
 */
(function () {
  const SUPABASE_URL  = 'https://xdcscknfomlzwysczegc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY3Nja25mb21send5c2N6ZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTYzMDMsImV4cCI6MjA4MzI5MjMwM30.E6o2wFFMOpK1DghLUqnxG6Ig09djy4bmDQexprhAiB4';
  const KEY_STORAGE = 'sv_visitor_key';
  const GEO_STORAGE = 'sv_visitor_geo';
  const HEARTBEAT   = 45000;

  /* ops runs on the same origin and must not appear in its own visitor list */
  const p = location.pathname.toLowerCase();
  if (p.startsWith('/ops') || p.startsWith('/admin')) return;

  let visitorKey;
  try {
    visitorKey = localStorage.getItem(KEY_STORAGE);
    if (!visitorKey) {
      visitorKey = (crypto.randomUUID && crypto.randomUUID()) ||
        ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }));
      localStorage.setItem(KEY_STORAGE, visitorKey);
    }
  } catch (_) {
    return;   // no storage, no stable identity — skip rather than spam rows
  }

  function deviceInfo() {
    const ua = navigator.userAgent || '';
    const mobile = /Mobi|Android|iPhone|iPod/i.test(ua);
    const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua));
    let os = 'Unknown';
    if (/Windows NT 11/.test(ua))          os = 'Windows 11';
    else if (/Windows NT 10/.test(ua))     os = 'Windows 10';
    else if (/Windows/.test(ua))           os = 'Windows';
    else if (/iPhone|iPad|iPod/.test(ua))  os = 'iOS';
    else if (/Android ([\d.]+)/.test(ua))  os = 'Android ' + RegExp.$1;
    else if (/Mac OS X/.test(ua))          os = 'macOS';
    else if (/Linux/.test(ua))             os = 'Linux';
    let browser = 'Unknown';
    if (/Edg\//.test(ua))               browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua))    browser = 'Opera';
    else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
    else if (/Firefox\//.test(ua))      browser = 'Firefox';
    else if (/Chrome\//.test(ua))       browser = 'Chrome';
    else if (/Safari\//.test(ua))       browser = 'Safari';
    return { device: tablet ? 'Tablet' : (mobile ? 'Mobile' : 'Desktop'), os, browser };
  }

  /* Country comes from the edge, cached per tab so it costs one request per
     session rather than one per heartbeat. */
  async function geo() {
    try {
      const cached = sessionStorage.getItem(GEO_STORAGE);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
    try {
      const r = await fetch('/__geo', { cache: 'no-store' });
      if (!r.ok) return {};
      const g = await r.json();
      try { sessionStorage.setItem(GEO_STORAGE, JSON.stringify(g)); } catch (_) {}
      return g;
    } catch (_) { return {}; }
  }

  /* The visitor's own auth token when signed in, so ops can name them.
     Falls back to the anon key for logged-out visitors. */
  function authToken() {
    try {
      let raw = localStorage.getItem('sb-xdcscknfomlzwysczegc-auth-token');
      if (!raw) return null;
      if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
      const s = JSON.parse(raw);
      const session = s && (s.currentSession || s);
      if (!session || !session.access_token) return null;
      if (session.expires_at && session.expires_at * 1000 < Date.now()) return null;
      return session.access_token;
    } catch (_) { return null; }
  }

  async function ping() {
    try {
      const g = await geo();
      const d = deviceInfo();
      const token = authToken();
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/visitor_ping`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token || SUPABASE_ANON}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_key:      visitorKey,
          p_page:     location.pathname + location.search,
          p_country:  g.country || '',
          p_city:     g.city || '',
          p_device:   d.device,
          p_os:       d.os,
          p_browser:  d.browser,
          p_referrer: document.referrer || '',
        }),
        keepalive: true,
      });
    } catch (_) {}
  }

  function leave() {
    try {
      const body = JSON.stringify({ p_key: visitorKey });
      /* sendBeacon survives the page unloading; fetch usually does not */
      if (navigator.sendBeacon) {
        const url = `${SUPABASE_URL}/rest/v1/rpc/visitor_leave?apikey=${encodeURIComponent(SUPABASE_ANON)}`;
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      }
    } catch (_) {}
  }

  ping();
  let timer = setInterval(ping, HEARTBEAT);

  /* Stop counting a backgrounded tab as an active visitor, and catch up
     immediately when they come back. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ping();
      if (!timer) timer = setInterval(ping, HEARTBEAT);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  window.addEventListener('pagehide', leave);
})();
