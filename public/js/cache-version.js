/**
 * Cache Version Management
 * Handles cache invalidation and versioning
 */

const CACHE_VERSION_KEY = 'jefitness_cache_version';
const CACHE_VERSIONS_KEY = 'jefitness_cache_versions';

/**
 * Get current cache version
 */
function getCacheVersion() {
    return localStorage.getItem(CACHE_VERSION_KEY) || '1.0.0';
}

/**
 * Set cache version
 */
function setCacheVersion(version) {
    localStorage.setItem(CACHE_VERSION_KEY, version);
    logger.info('Cache version updated', { version });
}

/**
 * Get cached versions from server
 */
async function fetchCacheVersions() {
    try {
        const response = await fetch('/api/cache-versions');
        if (response.ok) {
            const versions = await response.json();
            localStorage.setItem(CACHE_VERSIONS_KEY, JSON.stringify(versions));
            return versions;
        }
        throw new Error('Failed to fetch cache versions');
    } catch (err) {
        logger.warn('Failed to fetch cache versions, using timestamp fallback', { error: err?.message });
        // Fallback: Use current minute as version (changes every minute)
        const fallbackVersion = Date.now().toString(36);
        return { version: fallbackVersion, timestamp: Date.now() };
    }
}

/**
 * Check if cache needs invalidation
 */
async function checkCacheInvalidation() {
    try {
        const versions = await fetchCacheVersions();
        const currentVersion = getCacheVersion();

        if (versions.version !== currentVersion) {
            // Cache is stale, clear it
            await clearAllCaches();
            setCacheVersion(versions.version);
            logger.info('Cache invalidated', { oldVersion: currentVersion, newVersion: versions.version });
            return true;
        }
        return false;
    } catch (err) {
        logger.error('Cache invalidation check failed', { error: err?.message });
        return false;
    }
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
    // Clear service worker cache
    if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    }

    // Clear localStorage (except auth tokens)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !key.startsWith('jefitness_') && key !== CACHE_VERSION_KEY && key !== CACHE_VERSIONS_KEY) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    logger.info('All caches cleared');
}

/**
 * Register service worker update handler
 */
function registerServiceWorkerUpdates() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'CACHE_UPDATED') {
                logger.info('Service worker cache updated', { version: event.data.version });
            }
        });
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    checkCacheInvalidation();
    registerServiceWorkerUpdates();
});

// Export globally
window.getCacheVersion = getCacheVersion;
window.setCacheVersion = setCacheVersion;
window.clearAllCaches = clearAllCaches;
window.checkCacheInvalidation = checkCacheInvalidation;
