/**
 * In-Memory Caching Service
 * Handles session and data caching using in-memory storage
 */
class CacheService {
  constructor() {
    this.memoryCache = new Map(); // In-memory cache
    this.memoryCacheTTL = new Map(); // TTL tracking for memory cache
    this.getTime = () => Date.now(); // Time function, can be mocked for testing
  }

  /**
   * Initialize the cache service
   */
  async connect() {
    console.log('Cache service initialized with in-memory storage');
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
        console.log(`Memory cache cleanup: Removed ${cleaned} expired entries`);
      }
    }, 60000); // Clean up every minute
  }

  async get(key) {
    // Check if entry has expired
    const expiry = this.memoryCacheTTL.get(key);
    const now = this.getTime();
    if (expiry && now > expiry) {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }
    return this.memoryCache.get(key) || null;
  }

  async set(key, value, ttl = 3600) {
    // Store in memory cache with TTL
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, this.getTime() + (ttl * 1000));
  }

  async del(key) {
    // Remove from memory cache
    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  async invalidatePattern(pattern) {
    // Pattern matching - simple wildcard matching
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
    });

    if (keysToDelete.length > 0) {
      console.log(`Cache: Invalidated ${keysToDelete.length} keys matching pattern ${pattern}`);
    }
  }
}

const cacheService = new CacheService();
module.exports = cacheService;
