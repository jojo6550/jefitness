// ===============================
// JEFitness Service Worker (v13)
// ===============================

// Cache versioning
const CACHE_VERSION = '13';
const STATIC_CACHE = `jefitness-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `jefitness-dynamic-v${CACHE_VERSION}`;

// Detect development
const IS_DEVELOPMENT = location.hostname === 'localhost' ||
                       location.hostname === '127.0.0.1' ||
                       location.hostname.includes('dev') ||
                       location.port === '5501';

// Files to cache immediately
const STATIC_ASSETS = [
  '/', '/index.html',
  '/styles/styles.css', '/manifest.json',
  '/favicons/android-chrome-192x192.png',
  '/favicons/android-chrome-512x512.png',
  '/favicons/favicon-32x32.png', '/favicons/favicon-16x16.png',
  '/favicons/favicon.ico', '/images/hero.jpg', '/images/logo.jpg',
  '/js/app.js', '/js/navbar-loader.js', '/js/auth.js',
  '/js/dashboard.js', '/js/profile.js', '/js/bmi.js',
  '/js/timer.js', '/js/sleep-tracker.js', '/js/nutrition-logger.js',
  '/js/view-statistics.js', '/js/schedule.js', '/js/appointments.js',
  '/js/reports.js', '/js/admin-dashboard.js', '/js/admin-logs.js',
  '/js/role-guard.js', '/js/logout.js',
  '/pages/dashboard.html', '/pages/profile.html', '/pages/login.html',
  '/pages/signup.html', '/pages/sleep-tracker.html', '/pages/timer.html',
  '/pages/schedule.html', '/pages/view-statistics.html', '/pages/workout-programs.html',
  '/pages/nutrition-logger.html', '/pages/services.html', '/pages/meet-your-trainer.html',
  '/pages/admin-dashboard.html', '/pages/partials/navbar.html'
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

  // Dev mode: always fetch fresh
  if (IS_DEVELOPMENT) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
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
        // Return original response directly
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
