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

const SETTINGS_KEYS = 'geo_blocking_enabled,blocked_countries,geo_bypass_hash';
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
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    signal: AbortSignal.timeout(2000),   // never hang a page load on Supabase
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);

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
  };
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

export default async function middleware(request) {
  try {
    const url = new URL(request.url);

    if (isExempt(url.pathname)) return;

    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    if (!country) return;                       // unknown origin -> allow

    const cfg = await getSettings();
    if (!cfg || !cfg.enabled || cfg.blocked.size === 0) return;
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
      if (cookieKey && (await sha256Hex(cookieKey)) === cfg.bypassHash) return;
    }

    /* Blocked. Serve the notice page body under a 451, keeping the URL intact. */
    const pageRes = await fetch(new URL(BLOCKED_PAGE, url.origin).toString(), {
      headers: { 'x-vgm-internal': '1' },
    });
    const html = pageRes.ok
      ? await pageRes.text()
      : '<!doctype html><meta charset="utf-8"><title>Unavailable</title>' +
        '<body style="background:#0a0b0f;color:#eaecef;font-family:sans-serif;text-align:center;padding:80px 20px">' +
        '<h1>Service unavailable in your region</h1></body>';

    return new Response(html, {
      status: 451,                              // Unavailable For Legal Reasons
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-vgm-geo-block': country,
        'set-cookie': `${COUNTRY_COOKIE}=${country}; Path=/; Max-Age=600; SameSite=Lax`,
      },
    });
  } catch (_) {
    return;   // fail open
  }
}
