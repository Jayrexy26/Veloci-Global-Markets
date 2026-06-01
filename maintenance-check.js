/* Veloci Global Markets — maintenance + ban guard. Include after supabase.js on all protected pages. */
(async () => {
  try {
    const db = window.SV_DB;
    if (!db) return;

    const CACHE_KEY = 'sv_maint';
    const CACHE_TTL = 15000; // 15s cache — real-time channel handles instant propagation

    /* ── Helper: redirect to maintenance ── */
    function goMaintenance() {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: 'true', t: Date.now() }));
      window.location.href = 'maintenance-new.html';
    }

    /* ── Check cache first ── */
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { v, t } = JSON.parse(cached);
      if (Date.now() - t < CACHE_TTL) {
        if (v === 'true') { goMaintenance(); return; }
        /* Cache says not in maintenance — still check ban, then set up live watcher */
      }
    }

    /* ── Fetch maintenance status + session in parallel ── */
    const [{ data: maintData }, { data: { session } }] = await Promise.all([
      db.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle(),
      db.auth.getSession(),
    ]);

    const isOn = maintData?.value === 'true';
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: String(isOn), t: Date.now() }));
    if (isOn) { goMaintenance(); return; }

    /* ── Ban check ── */
    if (session) {
      const { data: prof } = await db.from('profiles').select('status').eq('id', session.user.id).single();
      if (prof?.status === 'banned') {
        await db.auth.signOut();
        sessionStorage.clear();
        window.location.href = 'login-new.html?banned=1';
        return;
      }
    }

    /* ── Real-time watcher: redirect the instant maintenance turns on ── */
    db.channel('sv-maintenance-live')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'system_settings',
        filter: 'key=eq.maintenance_mode'
      }, payload => {
        if (payload.new?.value === 'true') {
          goMaintenance();
        } else {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: 'false', t: Date.now() }));
        }
      })
      .subscribe();

  } catch(e) {}
})();
