/* Veloci Global Markets — Web Push sender for support chat.
 *
 * Called by a database trigger whenever a user posts a message. Sends a
 * payload-less Web Push to every registered ops admin; the service worker then
 * draws the notification.
 *
 * Payload-less is deliberate. Carrying data in a push requires aes128gcm
 * encryption per RFC 8291, and sending customer message text through Apple's
 * and Google's push services is worth avoiding anyway. The notification says a
 * message arrived; the console shows who and what.
 */

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_JWK') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@velociglobal.pro';
const SHARED_SECRET = Deno.env.get('PUSH_SHARED_SECRET') ?? '';
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function signingKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    JSON.parse(VAPID_PRIVATE),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/* VAPID: an ES256 JWT bound to the push service's origin. */
async function vapidHeader(endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })));
  const unsigned = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(),
    new TextEncoder().encode(unsigned),
  );
  return `vapid t=${unsigned}.${b64url(sig)}, k=${VAPID_PUBLIC}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  /* The trigger is the only caller; a shared secret keeps this endpoint from
     being used by anyone else to spam our admins' devices. */
  if (SHARED_SECRET) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${SHARED_SECRET}`) {
      return new Response('unauthorized', { status: 401 });
    }
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* payload-less push, nothing needed */ }

  const subsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!subsRes.ok) {
    return new Response(JSON.stringify({ error: `subscriptions ${subsRes.status}` }), { status: 500 });
  }
  const subs = await subsRes.json() as Array<{ id: string; endpoint: string }>;

  let sent = 0;
  const stale: string[] = [];

  await Promise.all(subs.map(async (s) => {
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidHeader(s.endpoint),
          TTL: '600',
          'Content-Length': '0',
          Urgency: 'high',
        },
      });
      if (res.status === 404 || res.status === 410) {
        stale.push(s.id);                 // device unsubscribed or reinstalled
      } else if (res.ok || res.status === 201 || res.status === 202) {
        sent++;
      }
    } catch { /* one dead endpoint must not stop the others */ }
  }));

  /* Prune endpoints the push service has retired, so the list stays clean. */
  if (stale.length) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${stale.join(',')})`,
      { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    ).catch(() => {});
  }

  return new Response(
    JSON.stringify({ sent, total: subs.length, pruned: stale.length, from: body.sender_name ?? null }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
