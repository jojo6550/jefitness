/**
 * Client-side Cache Busting Helper
 * Automatically adds version parameters to asset URLs
 * Ensures fresh assets are loaded without manual hard refresh
 */

(function() {
  'use strict';

  const CacheVersionManager = {
    /**
     * Initialize cache busting for all assets
     */
    init() {
      // Update stylesheet links
      this.updateStylesheets();
      // Update script sources (except this one)
      this.updateScripts();
      // Listen for dynamic asset loading
      this.setupMutationObserver();
    },

    /**
     * Update all stylesheet links with version parameter
     */
    updateStylesheets() {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('cdn.') && !href.includes('fonts.googleapis') && !href.includes('cdnjs')) {
          link.setAttribute('href', this.addVersionParam(href));
        }
      });
    },

    /**
     * Update all script sources with version parameter
     */
    updateScripts() {
      document.querySelectorAll('script[src]').forEach(script => {
        const src = script.getAttribute('src');
        if (src && !src.includes('cdn.') && !src.includes('fonts.') && !src.includes('cache-version')) {
          script.setAttribute('src', this.addVersionParam(src));
        }
      });
    },

    /**
     * Add version parameter to URL
     * @param {string} url - Original URL
     * @returns {string} URL with version parameter
     */
    addVersionParam(url) {
      if (!url) return url;

      // Don't version external URLs
      if (url.startsWith('http') && !window.location.origin) {
        return url;
      }

      // Generate a version hash based on current timestamp
      // This ensures fresh assets on server restart
      const version = this.getVersion();

      // Check if URL already has version param
      if (url.includes('?v=')) {
        return url.replace(/\?v=[\w]+/, `?v=${version}`);
      }

      // Add version parameter
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}v=${version}`;
    },

    /**
     * Get version string (timestamp-based for development)
     * In production, this could be replaced with build hash
     * @returns {string} Version hash
     */
    getVersion() {
      // Check if server provides a version meta tag
      const versionMeta = document.querySelector('meta[name="app-version"]');
      if (versionMeta) {
        return versionMeta.getAttribute('content');
      }

      // Fallback: Use current hour as version (changes every hour)
      // This ensures cache bust at least hourly without hard refresh
      return Math.floor(Date.now() / 3600000).toString(36);
    },

    /**
     * Watch for dynamically added assets and version them
     */
    setupMutationObserver() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              // Version new stylesheets
              if (node.tagName === 'LINK' && node.getAttribute('rel') === 'stylesheet') {
                const href = node.getAttribute('href');
                if (href && !href.includes('cdn.')) {
                  node.setAttribute('href', this.addVersionParam(href));
                }
              }

              // Version new scripts
              if (node.tagName === 'SCRIPT' && node.getAttribute('src')) {
                const src = node.getAttribute('src');
                if (src && !src.includes('cdn.')) {
                  node.setAttribute('src', this.addVersionParam(src));
                }
              }
            });
          }
        });
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      CacheVersionManager.init();
    });
  } else {
    CacheVersionManager.init();
  }

  // Export for manual use
  window.CacheVersionManager = CacheVersionManager;
})();