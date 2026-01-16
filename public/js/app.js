// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// PWA Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  showInstallPromotion();
});

function showInstallPromotion() {
  // Show a button or banner to install the app
  const installButton = document.createElement('button');
  installButton.innerText = 'Install JEFitness Mobile';
  installButton.className = 'btn btn-primary position-fixed bottom-0 end-0 m-3 z-index-1050';
  installButton.style.zIndex = '1050';
  installButton.onclick = () => {
    // Hide the app provided install promotion
    installButton.remove();
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
    });
  };
  document.body.appendChild(installButton);

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (installButton.parentNode) {
      installButton.remove();
    }
  }, 10000);
}

// Handle app installed event
window.addEventListener('appinstalled', (evt) => {
  console.log('App was installed.');
});

// Mobile-specific enhancements
if ('ontouchstart' in window) {
  // Add touch-friendly interactions
  document.addEventListener('touchstart', function() {}, {passive: true});
}

// Offline detection
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
  const status = navigator.onLine ? 'online' : 'offline';
  console.log(`App is now ${status}`);

  // You can show/hide offline indicators here
  // For example, show a banner when offline
  if (!navigator.onLine) {
    showOfflineBanner();
  } else {
    hideOfflineBanner();
  }
}

function showOfflineBanner() {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'alert alert-warning position-fixed top-0 start-0 w-100 text-center';
    banner.innerHTML = '<i class="bi bi-wifi-off"></i> You are currently offline. Some features may be limited.';
    banner.style.zIndex = '1060';
    document.body.appendChild(banner);
  }
  banner.style.display = 'block';
}

function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.display = 'none';
  }
}

// Performance monitoring (optional)
if ('performance' in window && 'PerformanceObserver' in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          console.log('LCP:', entry.startTime);
        }
      }
    });
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (e) {
    console.log('Performance observer not supported');
  }
}
