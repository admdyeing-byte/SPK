const APP_BASE = new URL('./', self.location).pathname;
const APP_ROOT = APP_BASE.endsWith('/') ? APP_BASE : `${APP_BASE}/`;
const PRECACHE = 'spk-precache-v8';
const RUNTIME = 'spk-runtime-v8';

const PRECACHE_URLS = [
  APP_ROOT,
  `${APP_ROOT}index.html`,
  `${APP_ROOT}manifest.json`,
  `${APP_ROOT}app-logo.jpg`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            return caches.delete(cacheName);
          }
          return undefined;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/.well-known/') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.includes('__')
  ) {
    return;
  }

  if (
    url.pathname.includes('chrome-extension') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('ws') ||
    url.pathname.includes('hmr')
  ) {
    return;
  }

  const isDocumentRequest =
    event.request.mode === 'navigate' ||
    url.pathname === APP_ROOT ||
    url.pathname.endsWith('.html') ||
    url.pathname === `${APP_ROOT}manifest.json`;

  if (isDocumentRequest) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PRECACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(`${APP_ROOT}index.html`)))
    );
    return;
  }

  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(RUNTIME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
