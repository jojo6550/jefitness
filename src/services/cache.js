/**
 * Redis Caching Service
 * Handles session and data caching
 */
const redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.memoryCache = new Map(); // Fallback in-memory cache
    this.memoryCacheTTL = new Map(); // TTL tracking for memory cache
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.client.on('error', (err) => console.error('Redis Client Error', err));
      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis, falling back to in-memory cache:', error.message);
      this.client = null;
      this.isConnected = false;

      // Start cleanup interval for memory cache
      this.startMemoryCacheCleanup();
    }
  }

  /**
   * Start periodic cleanup of expired memory cache entries
   */
  startMemoryCacheCleanup() {
    setInterval(() => {
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
    if (this.isConnected && this.client) {
      try {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Redis cache get error:', error);
        return null;
      }
    } else {
      // Use memory cache fallback
      const expiry = this.memoryCacheTTL.get(key);
      if (expiry && Date.now() > expiry) {
        this.memoryCache.delete(key);
        this.memoryCacheTTL.delete(key);
        return null;
      }
      return this.memoryCache.get(key) || null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (this.isConnected && this.client) {
      try {
        await this.client.setEx(key, ttl, JSON.stringify(value));
      } catch (error) {
        console.error('Redis cache set error:', error);
      }
    } else {
      // Use memory cache fallback
      this.memoryCache.set(key, value);
      this.memoryCacheTTL.set(key, Date.now() + (ttl * 1000));
    }
  }

  async del(key) {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (error) {
        console.error('Redis cache delete error:', error);
      }
    } else {
      // Use memory cache fallback
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
    }
  }

  async invalidatePattern(pattern) {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      } catch (error) {
        console.error('Redis cache invalidate pattern error:', error);
      }
    } else {
      // Use memory cache fallback - simple pattern matching
      const regex = new RegExp(pattern.replace('*', '.*'));
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
        console.log(`Memory cache: Invalidated ${keysToDelete.length} keys matching pattern ${pattern}`);
      }
    }
  }
}

const cacheService = new CacheService();
module.exports = cacheService;
