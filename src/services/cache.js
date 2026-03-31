/**
 * In-Memory Cache Service
 * Simple in-memory caching without Redis dependency
 *
 * Note: Data will be lost on server restart
 * For production, consider using a distributed cache solution
 */

class CacheService {
  constructor() {
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();
    this.memoryCacheCleanupInterval = null;
  }

  /**
   * Initialize the cache service
   * Starts memory cache cleanup interval
   */
  connect() {
    console.log('✅ Cache service: Using in-memory cache');
    this.startMemoryCacheCleanup();
  }

  /**
   * Start periodic cleanup of expired memory cache entries
   */
  startMemoryCacheCleanup() {
    if (this.memoryCacheCleanupInterval) {
      clearInterval(this.memoryCacheCleanupInterval);
    }

    this.memoryCacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, expiry] of this.memoryCacheTTL) {
        if (now > expiry) {
          this.memoryCache.delete(key);
          this.memoryCacheTTL.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(
          `Memory cache cleanup: Removed ${cleaned} expired entries (${this.memoryCache.size} remaining)`
        );
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} - Cached value or null
   */
  async get(key) {
    const expiry = this.memoryCacheTTL.get(key);
    const now = Date.now();

    if (expiry && now > expiry) {
      // Entry expired, remove it
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }

    return this.memoryCache.get(key) || null;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time-to-live in seconds (default: 1 hour)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = 3600) {
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + ttl * 1000);
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async del(key) {
    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  /**
   * Invalidate keys matching a pattern
   * @param {string} pattern - Wildcard pattern (e.g., 'user:*', 'session:*')
   * @returns {Promise<void>}
   */
  async invalidatePattern(pattern) {
    let memoryDeleted = 0;

    // Pattern matching in memory cache
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete = [];

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      memoryDeleted++;
    });

    if (memoryDeleted > 0) {
      console.log(
        `Cache invalidation: ${memoryDeleted} memory keys removed for pattern ${pattern}`
      );
    }
  }

  /**
   * Clear all cache (use with caution)
   * @returns {Promise<void>}
   */
  async clear() {
    this.memoryCache.clear();
    this.memoryCacheTTL.clear();
    console.log('Memory cache cleared');
  }

  /**
   * Get cache statistics (for monitoring)
   * @returns {Object} - Cache stats
   */
  getStats() {
    return {
      memoryEntries: this.memoryCache.size,
      type: 'in-memory',
    };
  }

  /**
   * Stop the cache service
   */
  stop() {
    if (this.memoryCacheCleanupInterval) {
      clearInterval(this.memoryCacheCleanupInterval);
    }
    console.log('✅ Cache service stopped');
  }
}

module.exports = new CacheService();
