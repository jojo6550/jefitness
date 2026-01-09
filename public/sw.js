// Cache versioning - increment these versions to bust cache
const CACHE_VERSION = '5';
const CACHE_NAME = `jefitness-v${CACHE_VERSION}`;
const STATIC_CACHE = `jefitness-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `jefitness-dynamic-v${CACHE_VERSION}`;

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/styles.css',
  '/js/app.js',
  '/js/navbar-loader.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/profile.js',
  '/js/bmi.js',
  '/js/timer.js',
  '/js/sleep-tracker.js',
  '/js/nutrition-logger.js',
  '/js/view-statistics.js',
  '/js/schedule.js',
  '/js/appointments.js',
  '/js/reports.js',
  '/js/admin-dashboard.js',
  '/js/admin-logs.js',
  '/js/role-guard.js',
  '/js/logout.js',
  '/pages/dashboard.html',
  '/pages/profile.html',
  '/pages/login.html',
  '/pages/signup.html',
  '/pages/sleep-tracker.html',
  '/pages/timer.html',
  '/pages/schedule.html',
  '/pages/view-statistics.html',
  '/pages/workout-programs.html',
  '/pages/nutrition-logger.html',
  '/pages/services.html',
  '/pages/meet-your-trainer.html',
  '/pages/admin-dashboard.html',
  '/pages/partials/navbar.html',
  '/manifest.json',
  '/favicons/android-chrome-192x192.png',
  '/favicons/android-chrome-512x512.png',
  '/favicons/favicon-32x32.png',
  '/favicons/favicon-16x16.png',
  '/favicons/favicon.ico',
  '/images/hero.jpg',
  '/images/logo.jpg'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(error => {
        console.error('[SW] Failed to cache some assets:', error);
        // Fallback: cache assets individually
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err)))
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete caches that don't match current version
          if (!cacheName.includes(`v${CACHE_VERSION}`)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip caching for API calls and external resources
  if (url.origin !== location.origin ||
      url.pathname.startsWith('/api/') ||
      url.pathname.includes('cdn.jsdelivr.net') ||
      url.pathname.includes('fonts.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then(response => {
        // Cache successful GET requests
        if (request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Return offline fallback for HTML pages
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match('/pages/offline.html') || caches.match('/index.html');
        }
      });
    })
  );
});

// Background sync for offline actions (if implemented)
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Implement background sync logic here
  console.log('[SW] Performing background sync');
}

// Push notifications (if implemented)
self.addEventListener('push', event => {
  console.log('[SW] Push received:', event);

  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/favicons/android-chrome-192x192.png',
    badge: '/favicons/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/favicons/favicon-16x16.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/favicons/favicon-16x16.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('JEFitness Mobile', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click received:', event);

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
