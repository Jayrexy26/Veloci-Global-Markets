/* Veloci Global Markets — country access blocking (Vercel Edge Middleware).
 *
 * Runs at the edge before anything is served. Vercel tags every request with the
 * visitor's country in `x-vercel-ip-country`; if that country is on the blocked
 * list in Supabase `system_settings`, we serve blocked-new.html with HTTP 451
 * instead of the requested page.
 *
 * Design rules:
 *   - FAIL OPEN. Any error (Supabase down, missing header, bad data) lets the
 *     request through. A backend outage must never take the whole site offline.
 *   - Admin surfaces (ops-*, admin-*) are never blocked, so you keep access
 *     from anywhere — including from a country you just blocked.
 *   - Settings are cached in edge memory for 60s, so this costs one Supabase
 *     round-trip per minute per edge region, not one per request.
 */

const SUPABASE_URL  = 'https://xdcscknfomlzwysczegc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY3Nja25mb21send5c2N6ZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTYzMDMsImV4cCI6MjA4MzI5MjMwM30.E6o2wFFMOpK1DghLUqnxG6Ig09djy4bmDQexprhAiB4';

const SETTINGS_KEYS = 'geo_blocking_enabled,blocked_countries,geo_bypass_hash,block_page_style,blocked_ips';
const CACHE_TTL_MS  = 60_000;
const BLOCKED_PAGE  = '/blocked-new.html';
const BYPASS_COOKIE = 'vgm_geo_bypass';
const COUNTRY_COOKIE = 'vgm_geo_cc';

/* Skip static assets outright — they never need a geo decision, and matching
   them would multiply middleware invocations for no benefit. HTML pages and
   extensionless paths still match. */
export const config = {
  matcher: [
    '/((?!_vercel|assets/|api/|.*\\.(?:css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|json|webmanifest|txt|xml)$).*)',
  ],
};

/* ── Settings cache (module scope survives between invocations in a warm isolate) ── */
let _cache   = null;   // { at, enabled, blocked:Set, bypassKey }
let _inflight = null;  // dedupes concurrent refreshes

async function fetchSettings() {
  const url = `${SUPABASE_URL}/rest/v1/system_settings?select=key,value&key=in.(${SETTINGS_KEYS})`;
  /* A cold edge isolate has no cached settings, so a slow first call here means
     falling open and letting a blocked visitor through. Give the cold path a
     realistic budget and one retry; a warm isolate still serves from cache and
     never waits on this at all. */
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        signal: AbortSignal.timeout(attempt === 0 ? 4000 : 2500),
      });
      if (!res.ok) throw new Error(`supabase ${res.status}`);
      return await parseSettings(res);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function parseSettings(res) {
  const map = {};
  for (const row of await res.json()) map[row.key] = row.value;

  return {
    at:        Date.now(),
    enabled:   map.geo_blocking_enabled === 'true',
    blocked:   new Set(
      String(map.blocked_countries || '')
        .split(',')
        .map(c => c.trim().toUpperCase())
        .filter(c => c.length === 2)
    ),
    /* Only the SHA-256 hash of the bypass key is stored, because system_settings
       is readable with the public anon key. Comparing hashes means a leaked
       setting can't be replayed as a working bypass. */
    bypassHash: String(map.geo_bypass_hash || '').trim().toLowerCase(),
    /* 'branded' = the region-restricted notice page.
       'error'   = empty 503 so the browser renders its own native error page. */
    style: map.block_page_style === 'error' ? 'error' : 'branded',
    ips: new Set(
      String(map.blocked_ips || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    ),
  };
}

/* Vercel puts the real client first in x-forwarded-for; anything after it is
   proxy chain and must not be trusted. */
function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || request.headers.get('x-real-ip') || '';
}

/* Fire-and-forget decision log. Never awaited, so it cannot slow a page down,
   and any failure is swallowed — diagnostics must not affect serving. */
function logDecision(country, decision, path) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/geo_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        country: country || null,
        decision,
        path: String(path || '').slice(0, 200),
      }),
    }).catch(() => {});
  } catch (_) {}
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSettings() {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache;
  if (_inflight) return _inflight;

  _inflight = fetchSettings()
    .then(cfg => { _cache = cfg; return cfg; })
    .catch(() => _cache)          // fall back to stale cache, or null -> allow
    .finally(() => { _inflight = null; });

  return _inflight;
}

/* ── Path exemptions ── */
function isExempt(pathname) {
  const p = pathname.toLowerCase();
  return (
    p === BLOCKED_PAGE ||
    p.startsWith('/ops') ||        // ops-new.html, ops-login-new.html, ops-supabase.js
    p.startsWith('/admin') ||      // admin console + admin-login
    p.startsWith('/api/') ||
    p.startsWith('/assets/') ||
    p.startsWith('/.well-known/')
  );
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/* Shared by the country block and the IP block so both look identical to the
   visitor — nothing should reveal which rule caught them. */
async function blockResponse(cfg, url, country) {
  if (cfg.style === 'error') {
    return new Response(null, {
      status: 503,
      headers: { 'cache-control': 'no-store, no-cache, must-revalidate' },
    });
  }

  const pageRes = await fetch(new URL(BLOCKED_PAGE, url.origin).toString(), {
    headers: { 'x-vgm-internal': '1' },
  });
  const html = pageRes.ok
    ? await pageRes.text()
    : '<!doctype html><meta charset="utf-8"><title>Unavailable</title>' +
      '<body style="background:#0a0b0f;color:#eaecef;font-family:sans-serif;text-align:center;padding:80px 20px">' +
      '<h1>Service unavailable in your region</h1></body>';

  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
  };
  if (country) {
    headers['x-vgm-geo-block'] = country;
    headers['set-cookie'] = `${COUNTRY_COOKIE}=${country}; Path=/; Max-Age=600; SameSite=Lax`;
  }
  return new Response(html, { status: 451, headers });
}

export default async function middleware(request) {
  try {
    const url = new URL(request.url);

    if (isExempt(url.pathname)) return;

    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();

    /* Diagnostic: what country does the edge think this visitor is in, and would
       they be blocked? Deliberately does not expose the full blocked list. */
    if (url.pathname === '/__geo') {
      const c = await getSettings();
      const h = n => {
        const v = request.headers.get(n);
        /* Vercel percent-encodes city names with non-ASCII characters */
        try { return v ? decodeURIComponent(v) : null; } catch (_) { return v || null; }
      };
      return Response.json({
        country:  country || null,
        city:     h('x-vercel-ip-city'),
        region:   h('x-vercel-ip-country-region'),
        timezone: h('x-vercel-ip-timezone'),
        ip:       clientIp(request) || null,
        enabled:  !!c?.enabled,
        blocked:  !!(c?.enabled && country && c.blocked.has(country)),
        style:    c?.style || 'branded',
      }, { headers: { 'cache-control': 'no-store' } });
    }

    /* IP blocking runs before the country check and regardless of whether geo
       blocking is switched on — it is a direct ban on one visitor. */
    const ip = clientIp(request);
    const cfgEarly = await getSettings();
    if (cfgEarly && ip && cfgEarly.ips.has(ip)) {
      logDecision(country || null, 'blocked_ip', url.pathname);
      return blockResponse(cfgEarly, url, country);
    }

    if (!country) {
      logDecision(null, 'allowed_no_country', url.pathname);
      return;                                   // unknown origin -> allow
    }

    const cfg = cfgEarly;
    if (!cfg) {
      /* settings unreachable: we fail open, and this is the one path that can
         let a blocked visitor through, so it is recorded explicitly */
      logDecision(country, 'allowed_no_config', url.pathname);
      return;
    }
    if (!cfg.enabled || cfg.blocked.size === 0) return;
    /* deliberately not logged: this is ordinary traffic, and a row per page view
       from every allowed visitor would swamp the table */
    if (!cfg.blocked.has(country)) return;

    /* Escape hatch: ?geo_key=<secret> stores a bypass cookie so you can reach
       the site from a blocked country (VPN testing, travel). */
    if (cfg.bypassHash) {
      const qsKey = url.searchParams.get('geo_key');
      if (qsKey && (await sha256Hex(qsKey)) === cfg.bypassHash) {
        url.searchParams.delete('geo_key');
        const out = new Response(null, {
          status: 302,
          headers: { location: url.toString() },
        });
        out.headers.append(
          'set-cookie',
          `${BYPASS_COOKIE}=${encodeURIComponent(qsKey)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`
        );
        return out;
      }
      const cookieKey = readCookie(request, BYPASS_COOKIE);
      if (cookieKey && (await sha256Hex(cookieKey)) === cfg.bypassHash) {
        logDecision(country, 'allowed_bypass', url.pathname);
        return;
      }
    }

    /* Blocked, "error" style: an empty body under an error status makes every
       browser fall back to its own native error page ("This page isn't
       working" in Chrome). Nothing here identifies it as a geo block — no
       marker header, no cookie — so it is indistinguishable from an outage.
       503 rather than 404 so search engines treat it as temporary and don't
       drop the pages of crawlers that happen to sit in a blocked country. */
    logDecision(country, 'blocked', url.pathname);
    return blockResponse(cfg, url, country);
  } catch (_) {
    return;   // fail open
  }
}
