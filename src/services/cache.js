const redis = require('redis');

/**
 * Cache Service with Redis Support and In-Memory Fallback
 * PRODUCTION: Uses Redis for distributed caching (survives restarts)
 * DEVELOPMENT: Falls back to in-memory cache if Redis unavailable
 * 
 * SECURITY: Prevents data loss on restarts (main issue from code review)
 */
class CacheService {
  constructor() {
    this.redisClient = null;
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();
    this.isRedisAvailable = false;
    this.memoryCacheCleanupInterval = null;
  }

  /**
   * Initialize the cache service
   * Attempts to connect to Redis, falls back to memory cache
   */
  async connect() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({ url: process.env.REDIS_URL });
        
        this.redisClient.on('error', (err) => {
          console.warn('⚠️ Redis connection error, falling back to memory cache:', err.message);
          this.isRedisAvailable = false;
        });

        this.redisClient.on('connect', () => {
          console.log('✅ Cache service: Connected to Redis');
          this.isRedisAvailable = true;
        });

        this.redisClient.on('reconnecting', () => {
          console.log('🔄 Cache service: Attempting to reconnect to Redis...');
        });

        await this.redisClient.connect();
        this.isRedisAvailable = true;
      } catch (err) {
        console.warn('⚠️ Redis initialization failed, using in-memory cache:', err.message);
        this.isRedisAvailable = false;
      }
    } else {
      console.warn('⚠️ REDIS_URL not set, using in-memory cache (data will be lost on restart)');
      console.warn('   Set REDIS_URL in .env to enable persistent caching');
    }

    // Always start memory cache cleanup for fallback/hybrid mode
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
        console.log(`Memory cache cleanup: Removed ${cleaned} expired entries (${this.memoryCache.size} remaining)`);
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} - Cached value or null
   */
  async get(key) {
    try {
      // Try Redis first if available
      if (this.isRedisAvailable && this.redisClient) {
        const value = await this.redisClient.get(key);
        if (value) {
          return JSON.parse(value);
        }
      }
    } catch (err) {
      console.warn(`Redis get error for key ${key}:`, err.message);
      this.isRedisAvailable = false;
    }

    // Fallback to memory cache
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
    try {
      // Always set in Redis if available
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      }
    } catch (err) {
      console.warn(`Redis set error for key ${key}:`, err.message);
      this.isRedisAvailable = false;
    }

    // Always also set in memory cache as fallback
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + (ttl * 1000));
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async del(key) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.del(key);
      }
    } catch (err) {
      console.warn(`Redis del error for key ${key}:`, err.message);
      this.isRedisAvailable = false;
    }

    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  /**
   * Invalidate keys matching a pattern
   * @param {string} pattern - Wildcard pattern (e.g., 'user:*', 'session:*')
   * @returns {Promise<void>}
   */
  async invalidatePattern(pattern) {
    let redisDeleted = 0;
    let memoryDeleted = 0;

    try {
      // Pattern invalidation in Redis
      if (this.isRedisAvailable && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          redisDeleted = await this.redisClient.del(keys);
        }
      }
    } catch (err) {
      console.warn(`Redis pattern delete error:`, err.message);
      this.isRedisAvailable = false;
    }

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

    if (redisDeleted > 0 || memoryDeleted > 0) {
      console.log(`Cache invalidation: ${redisDeleted} Redis keys + ${memoryDeleted} memory keys removed for pattern ${pattern}`);
    }
  }

  /**
   * Clear all cache (use with caution)
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.flushDb();
        console.log('Redis cache cleared');
      }
    } catch (err) {
      console.warn('Redis clear error:', err.message);
    }

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
      redisConnected: this.isRedisAvailable,
      redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured'
    };
  }

  /**
   * Stop the cache service
   */
  stop() {
    if (this.memoryCacheCleanupInterval) {
      clearInterval(this.memoryCacheCleanupInterval);
    }
    if (this.redisClient) {
      this.redisClient.quit().catch(err => {
        console.warn('Error closing Redis connection:', err.message);
      });
    }
  }
}

module.exports = new CacheService();
