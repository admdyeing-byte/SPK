// Service Worker for SPK (Sistem Penilaian Karyawan) PWA
// Version: 7.0 - Updated with proactive update checks and auto-refresh mechanisms

const PRECACHE = 'spk-precache-v7';
const RUNTIME = 'spk-runtime-v7';

// Core assets to precache immediately on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-logo.jpg'
];

// Install Event - Precache core assets & activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // Force immediate activation of the new SW
  );
});

// Activate Event - Clean up old cache versions and claim clients
self.addEventListener('activate', (event) => {
  const currentCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[Service Worker] Deleting obsolete cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim()) // Instantly take control of all open pages
  );
});

// Fetch Event - Smart, optimized routing strategies
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. DO NOT cache Firebase Auth, Firestore DB, or external API endpoints
  // Doing so would break authentication and real-time database updates.
  if (
    url.hostname.includes('firebase') || 
    url.hostname.includes('firestore') || 
    url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts') ||
    url.pathname.startsWith('/api/') ||
    url.href.includes('__') // Firebase auth helpers
  ) {
    return;
  }

  // 2. DO NOT cache local development socket or Vite HMR files
  if (
    url.pathname.includes('chrome-extension') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/') ||
    event.request.url.includes('ws') ||
    event.request.url.includes('hmr')
  ) {
    return;
  }

  // 3. Document Caching Strategy: Network-First (Fallback to Cache)
  // This prevents the PWA from getting stuck with an older version of the HTML.
  if (
    event.request.mode === 'navigate' || 
    url.pathname === '/' || 
    url.pathname.endsWith('.html') ||
    url.pathname === '/manifest.json'
  ) {
    let fetchPromise;
    try {
      // Use { cache: 'no-cache' } to bypass the browser's HTTP cache and force checking the server
      fetchPromise = fetch(new Request(event.request, { cache: 'no-cache' }));
    } catch (e) {
      fetchPromise = fetch(event.request);
    }

    event.respondWith(
      fetchPromise
        .then((response) => {
          // If response is valid, put a copy in the precache
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(PRECACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If offline, serve from cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // 4. Static Assets Strategy: Cache-First (Fallback to Network) with Runtime Caching
  // Best for CSS, JS, images, and fonts to ensure super-fast subsequent page load speeds.
  const isStaticAsset = 
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache, but fetch and update the cache in the background for next time (Stale-While-Revalidate pattern)
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(RUNTIME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => { /* Ignore background update network errors */ });
          
          return cachedResponse;
        }

        // Not in cache, fetch from network and add to runtime cache
        return fetch(event.request).then((response) => {
          if (response.status === 200 || response.status === 0) { // status 0 for opaque external assets like Google Fonts
            const responseClone = response.clone();
            caches.open(RUNTIME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 5. Default Strategy: Cache, falling back to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
