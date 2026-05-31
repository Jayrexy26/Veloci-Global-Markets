/* Veloci Global Markets — maintenance + ban guard. Include after supabase.js on all protected pages. */
(async () => {
  try {
    const db = window.SV_DB;
    if (!db) return;

    const CACHE_KEY = 'sv_maint';
    const cached = sessionStorage.getItem(CACHE_KEY);

    if (cached) {
      const { v, t } = JSON.parse(cached);
      if (Date.now() - t < 60000) {
        if (v === 'true') { window.location.href = 'maintenance.html'; return; }
        /* Cache hit, not in maintenance — still check ban */
        const { data: { session } } = await db.auth.getSession();
        if (session) {
          const { data: prof } = await db.from('profiles').select('status').eq('id', session.user.id).single();
          if (prof?.status === 'banned') {
            await db.auth.signOut();
            sessionStorage.clear();
            window.location.href = 'login.html?banned=1';
          }
        }
        return;
      }
    }

    /* Cache miss — fetch maintenance status and session in parallel */
    const [{ data: maintData }, { data: { session } }] = await Promise.all([
      db.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle(),
      db.auth.getSession(),
    ]);

    const isOn = maintData?.value === 'true';
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: String(isOn), t: Date.now() }));
    if (isOn) { window.location.href = 'maintenance.html'; return; }

    if (session) {
      const { data: prof } = await db.from('profiles').select('status').eq('id', session.user.id).single();
      if (prof?.status === 'banned') {
        await db.auth.signOut();
        sessionStorage.clear();
        window.location.href = 'login.html?banned=1';
      }
    }
  } catch(e) {}
})();
