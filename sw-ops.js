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

/* Web Push arrives with no payload — customer message text is deliberately not
   sent through Apple's and Google's push services. If a console window happens
   to be open it is already showing the message live, so stay quiet there. */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = clients.some(c => c.visibilityState === 'visible' && c.url.includes('ops-new.html'));
    if (visible) return;

    await self.registration.showNotification('New support message', {
      body: 'A user has sent a message. Tap to open the console.',
      icon: '/assets/admin-icon-192.png',
      badge: '/assets/admin-icon-192.png',
      vibrate: [120, 60, 120],
      tag: 'sv-chat-push',
      renotify: true,
      data: { url: '/ops-new.html' },
    });
  })());
});

/* Tapping a chat notification should jump straight to the console, reusing an
   already-open window instead of piling up new ones. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/ops-new.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('ops-new.html') && 'focus' in c) {
          if ('navigate' in c) c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
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
