const CACHE = 'veloci-v3';

const PRECACHE = [
  '/',
  '/login-new.html',
  '/dashboard-new.html',
  '/spot-new.html',
  '/markets-new.html',
  '/wallet-new.html',
  '/history-new.html',
  '/notifications-new.html',
  '/settings-new.html',
  '/session-new.html',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/vgm-logo.png',
  '/manifest.json',
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
    url.hostname.includes('ip-api.com') ||
    url.hostname.includes('ipinfo.io') ||
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
