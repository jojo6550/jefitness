/**
 * Resource Loader
 * Handles loading of external resources (Bootstrap, Google Fonts, etc.)
 * with fallback mechanisms for mobile environments
 */

class ResourceLoader {
  static async loadBootstrapCSS() {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css';
      link.crossOrigin = 'anonymous';
      link.timeout = 10000;
      
      link.onerror = () => {
        console.warn('Failed to load Bootstrap CSS from CDN, using local copy');
        this.loadBootstrapCSSLocal().then(resolve).catch(reject);
      };
      
      link.onload = () => {
        console.log('Bootstrap CSS loaded from CDN');
        resolve();
      };
      
      document.head.appendChild(link);
      
      // Timeout fallback
      setTimeout(() => {
        if (!link.loaded && !link.error) {
          link.onerror?.();
        }
      }, 10000);
    });
  }

  static async loadBootstrapCSSLocal() {
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/bootstrap.min.css';
      link.onload = () => {
        console.log('Bootstrap CSS loaded from local file');
        resolve();
      };
      link.onerror = () => {
        console.error('Failed to load Bootstrap CSS from local file');
        resolve(); // Resolve anyway to continue
      };
      document.head.appendChild(link);
    });
  }

  static async loadBootstrapJS() {
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js';
      script.crossOrigin = 'anonymous';
      script.async = true;
      
      script.onload = () => {
        console.log('Bootstrap JS loaded from CDN');
        resolve();
      };
      
      script.onerror = () => {
        console.warn('Failed to load Bootstrap JS, checking local copy');
        this.loadBootstrapJSLocal().then(resolve);
      };
      
      document.body.appendChild(script);
    });
  }

  static async loadBootstrapJSLocal() {
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'js/bootstrap.bundle.min.js';
      script.async = true;
      
      script.onload = () => {
        console.log('Bootstrap JS loaded from local file');
        resolve();
      };
      
      script.onerror = () => {
        console.error('Failed to load Bootstrap JS from local file');
        resolve(); // Resolve anyway to continue
      };
      
      document.body.appendChild(script);
    });
  }

  static async loadGoogleFonts() {
    // Preconnect to Google Fonts
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect2);

    // Load Google Fonts CSS
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap';
      link.onload = () => {
        console.log('Google Fonts loaded');
        resolve();
      };
      link.onerror = () => {
        console.warn('Failed to load Google Fonts (non-critical)');
        resolve();
      };
      document.head.appendChild(link);
    });
  }

  static async loadFontAwesome() {
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      link.crossOrigin = 'anonymous';
      
      link.onload = () => {
        console.log('Font Awesome loaded');
        resolve();
      };
      
      link.onerror = () => {
        console.warn('Failed to load Font Awesome (non-critical)');
        resolve();
      };
      
      document.head.appendChild(link);
    });
  }

  static async loadCustomCSS() {
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/styles.css';
      
      link.onload = () => {
        console.log('Custom CSS loaded');
        resolve();
      };
      
      link.onerror = () => {
        console.error('Failed to load custom CSS');
        resolve();
      };
      
      document.head.appendChild(link);
    });
  }

  static async initialize() {
    try {
      console.log('Starting resource loading...');
      
      // Load resources in order of priority
      await this.loadCustomCSS();
      await this.loadGoogleFonts();
      
      // Load Bootstrap in parallel
      const [cssLoaded] = await Promise.all([
        this.loadBootstrapCSS(),
        this.loadBootstrapJS()
      ]);

      // Load optional resources
      await this.loadFontAwesome();

      // Mark as ready
      document.body.classList.add('resources-loaded');
      window.dispatchEvent(new Event('resources-loaded'));
      
      console.log('All resources loaded successfully');
      
    } catch (error) {
      console.error('Resource loading error:', error);
      // Continue anyway - some resources may have loaded
      document.body.classList.add('resources-loaded-partial');
    }
  }

  static isResourcesLoaded() {
    return document.body.classList.contains('resources-loaded') ||
           document.body.classList.contains('resources-loaded-partial');
  }

  static waitForResources() {
    return new Promise(resolve => {
      if (this.isResourcesLoaded()) {
        resolve();
      } else {
        document.addEventListener('resources-loaded', resolve, { once: true });
        // Timeout after 10 seconds
        setTimeout(resolve, 10000);
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ResourceLoader.initialize());
} else {
  ResourceLoader.initialize();
}

// Make globally available
window.ResourceLoader = ResourceLoader;