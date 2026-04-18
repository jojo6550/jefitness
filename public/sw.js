// ===============================
//JEFitness Service Worker (v91)
// ===============================

// Cache bypass flag (toggled via postMessage)
let bypassCacheEnabled = false;

// Cache versioning
const CACHE_VERSION = '3ad2e18';
const STATIC_CACHE = `jefitness-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `jefitness-dynamic-v${CACHE_VERSION}`;

// Detect development
const IS_DEVELOPMENT = location.hostname === 'localhost' ||
                       location.hostname === '127.0.0.1';

// Files to cache immediately
const STATIC_ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/styles/styles.css',
  '/favicons/android-chrome-192x192.png', '/favicons/android-chrome-512x512.png',
  '/favicons/apple-touch-icon.png', '/favicons/favicon-16x16.png',
  '/favicons/favicon-32x32.png', '/favicons/favicon.ico', '/favicons/site.webmanifest',
  '/js/api.config.js', '/js/app.js', '/js/auth.js',
  '/js/cookie-consent.js',
  '/js/toast.js', '/js/validators.js',
  '/pages/login.html', '/pages/signup.html',
  '/pages/trainer-dashboard.html',
  '/pages/dashboard.html',
  '/pages/profile.html'
];

// ===============================
// Install
// ===============================
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ===============================
// Activate
// ===============================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!key.includes(CACHE_VERSION)) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ===============================
// Fetch - smart caching
// ===============================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip APIs and external requests
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Hard reload (Ctrl+Shift+R / Shift+F5) or bypass mode: fetch fresh, update cache
  if (request.cache === 'reload' || request.cache === 'no-store' || bypassCacheEnabled) {
    event.respondWith(
      fetch(request).then(networkResponse => {
        if (!bypassCacheEnabled && request.method === 'GET' && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(c => c.put(request.url, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Dev mode: always fetch fresh
  if (IS_DEVELOPMENT) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
        .catch(() => new Response('Offline - page not cached', { 
          status: 503, 
          statusText: 'Service Unavailable' 
        }))
    );
    return;
  }

  // HTML & JS - network first
  if (request.destination === 'document' || request.destination === 'script') {
    event.respondWith(
      fetch(request).then(networkResponse => {
        if (request.method === 'GET' && networkResponse.status === 200) {
          // Clone once for cache
          const cacheResponse = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request.url, cacheResponse));
        }
        // Validate and return original response
        if (!networkResponse || networkResponse.type !== 'basic' || networkResponse.status === 0) {
          throw new Error('Invalid network response');
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // CSS, images, fonts - cache first with update
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(networkResponse => {
        if (request.method === 'GET' && networkResponse.status === 200) {
          // Clone once for cache
          const cacheResponse = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request.url, cacheResponse));
        }
        return networkResponse;
      }).catch(() => cached); // fallback to cache if network fails
    })
  );
});

// ===============================
// Force refresh
// ===============================
self.addEventListener('message', event => {
  if (event.data?.type === 'FORCE_REFRESH') {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
    self.skipWaiting();
    console.log('[SW] Force refresh: caches cleared');
  }
  if (event.data?.type === 'BYPASS_CACHE') {
    bypassCacheEnabled = true;
    console.log('[SW] Cache bypass enabled — all requests go to network');
  }
  if (event.data?.type === 'ENABLE_CACHE') {
    bypassCacheEnabled = false;
    console.log('[SW] Cache bypass disabled — normal caching resumed');
  }
});

// ===============================
// Background sync
// ===============================
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('[SW] Performing background sync...');
  // Add offline sync logic here
}

// ===============================
// Push notifications
// ===============================
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/favicons/android-chrome-192x192.png',
    badge: '/favicons/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: { dateOfArrival: Date.now(), primaryKey: 1 },
    actions: [
      { action: 'explore', title: 'View Details', icon: '/favicons/favicon-16x16.png' },
      { action: 'close', title: 'Close', icon: '/favicons/favicon-16x16.png' }
    ]
  };
  event.waitUntil(self.registration.showNotification('JEFitness Mobile', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'explore') {
    event.waitUntil(clients.openWindow('/'));
  }
});
