const CACHE = 'veloci-ops-v1';

const PRECACHE = [
  '/ops-login-new.html',
  '/ops-new.html',
  '/assets/admin-icon-192.png',
  '/assets/admin-icon-512.png',
  '/assets/vgm-logo.png',
  '/manifest-ops.json',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('resend.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    e.request.method !== 'GET'
  ) return;

  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
          return res;
        });
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
