const CACHE_NAME = 'fitlife-pro-v1';
const STATIC_CACHE = 'fitlife-pro-static-v1';
const DYNAMIC_CACHE = 'fitlife-pro-dynamic-v1';

// Files to cache immediately
const STATIC_ASSETS = [
  '/public/',
  '/public/index.html',
  '/public/styles/styles.css',
  '/public/js/app.js',
  '/public/js/navbar-loader.js',
  '/public/js/auth.js',
  '/public/js/dashboard.js',
  '/public/js/profile.js',
  '/public/js/bmi.js',
  '/public/js/timer.js',
  '/public/js/sleep-tracker.js',
  '/public/js/nutrition-logger.js',
  '/public/js/view-statistics.js',
  '/public/js/schedule.js',
  '/public/js/appointments.js',
  '/public/js/reports.js',
  '/public/js/admin-dashboard.js',
  '/public/js/admin-logs.js',
  '/public/js/role-guard.js',
  '/public/js/logout.js',
  '/public/pages/dashboard.html',
  '/public/pages/profile.html',
  '/public/pages/login.html',
  '/public/pages/signup.html',
  '/public/pages/sleep-tracker.html',
  '/public/pages/timer.html',
  '/public/pages/schedule.html',
  '/public/pages/view-statistics.html',
  '/public/pages/workout-programs.html',
  '/public/pages/nutrition-logger.html',
  '/public/pages/services.html',
  '/public/pages/meet-your-trainer.html',
  '/public/pages/admin-dashboard.html',
  '/public/pages/partials/navbar.html',
  '/public/manifest.json',
  '/public/favicons/android-chrome-192x192.png',
  '/public/favicons/android-chrome-512x512.png',
  '/public/favicons/favicon-32x32.png',
  '/public/favicons/favicon-16x16.png',
  '/public/favicons/favicon.ico',
  '/public/images/hero.jpg',
  '/public/images/logo.jpg'
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
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
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
          return caches.match('/public/pages/offline.html') || caches.match('/public/index.html');
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
    icon: '/public/favicons/android-chrome-192x192.png',
    badge: '/public/favicons/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/public/favicons/favicon-16x16.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/public/favicons/favicon-16x16.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('FitLife Pro', options)
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
