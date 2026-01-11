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
    async updateStylesheets() {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && !href.includes('cdn.') && !href.includes('fonts.googleapis') && !href.includes('cdnjs')) {
          link.setAttribute('href', await this.addVersionParam(href));
        }
      }
    },

    /**
     * Update all script sources with version parameter
     */
    async updateScripts() {
      const scripts = document.querySelectorAll('script[src]');
      for (const script of scripts) {
        const src = script.getAttribute('src');
        if (src && !src.includes('cdn.') && !src.includes('fonts.') && !src.includes('cache-version')) {
          script.setAttribute('src', await this.addVersionParam(src));
        }
      }
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
   * Get version string for asset
   * @param {string} assetPath - Path to the asset
   * @returns {Promise<string>} Version hash
   */
  async getVersion(assetPath) {
    // Check if server provides a version meta tag
    const versionMeta = document.querySelector('meta[name="app-version"]');
    if (versionMeta) {
      return versionMeta.getAttribute('content');
    }

    // Try to get version from cache or fetch from server
    if (!this.versionsCache) {
      try {
        this.versionsCache = await window.API.cache.getVersions();
      } catch (err) {
        console.warn('Failed to fetch cache versions, using timestamp fallback:', err);
        // Fallback: Use current minute as version (changes every minute)
        return Math.floor(Date.now() / 60000).toString(36);
      }
    }

    return this.versionsCache[assetPath] || Math.floor(Date.now() / 60000).toString(36);
  },

    /**
     * Watch for dynamically added assets and version them
     */
    setupMutationObserver() {
      const observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              // Version new stylesheets
              if (node.tagName === 'LINK' && node.getAttribute('rel') === 'stylesheet') {
                const href = node.getAttribute('href');
                if (href && !href.includes('cdn.')) {
                  node.setAttribute('href', await this.addVersionParam(href));
                }
              }

              // Version new scripts
              if (node.tagName === 'SCRIPT' && node.getAttribute('src')) {
                const src = node.getAttribute('src');
                if (src && !src.includes('cdn.')) {
                  node.setAttribute('src', await this.addVersionParam(src));
                }
              }
            }
          }
        }
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