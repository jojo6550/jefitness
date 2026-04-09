/**
 * User Document Cache Service
 *
 * Similar to frontend auth-cache.js: holds user documents in memory to reduce
 * database round-trips within request handlers and long-running processes.
 *
 * Two caching strategies:
 * 1. Per-request cache (req.userCache) — cleared after each request
 * 2. Process-level cache — optional TTL-based caching for worker processes/crons
 *
 * Usage in middleware/controllers:
 *   const user = await userCache.findById(userId, req);
 *   // Automatically reads from req.userCache first, falls back to DB, stores result
 */

const User = require('../models/User');

class UserCache {
  constructor() {
    // Process-level cache: { userId: { data, timestamp } }
    this.processCache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize request-local cache on req object
   * Called by middleware early in the request lifecycle
   */
  initRequestCache(req) {
    req.userCache = new Map();
    return req;
  }

  /**
   * Find user by ID with caching
   * Cache strategy:
   *   1. Check req.userCache (request-scoped, always fresh for current req)
   *   2. Check process cache (if not expired)
   *   3. Query database and cache result
   *
   * @param {string} userId - User ID to fetch
   * @param {object} req - Express request object (for request cache)
   * @param {object} options - { fields, ttl, skipCache }
   * @returns {object} User document or null
   */
  async findById(userId, req = null, options = {}) {
    if (!userId) return null;

    const cacheKey = userId.toString();
    const { fields = null, ttl = this.defaultTTL, skipCache = false } = options;

    // 1. Check request cache (highest priority)
    if (req && req.userCache && req.userCache.has(cacheKey)) {
      return req.userCache.get(cacheKey);
    }

    // 2. Check process cache (if not skipped)
    if (!skipCache && this.processCache.has(cacheKey)) {
      const cached = this.processCache.get(cacheKey);
      if (Date.now() - cached.timestamp < cached.ttl) {
        // Copy to request cache for consistency
        if (req && req.userCache) {
          req.userCache.set(cacheKey, cached.data);
        }
        return cached.data;
      } else {
        // Expired, remove from process cache
        this.processCache.delete(cacheKey);
      }
    }

    // 3. Query database
    let query = User.findById(userId);
    if (fields) {
      query = query.select(fields);
    }
    const user = await query.lean();

    if (!user) return null;

    // Cache in both places
    if (req && req.userCache) {
      req.userCache.set(cacheKey, user);
    }
    this.processCache.set(cacheKey, {
      data: user,
      timestamp: Date.now(),
      ttl,
    });

    return user;
  }

  /**
   * Batch find multiple users by ID
   * More efficient than N separate findById calls
   *
   * @param {array} userIds - Array of user IDs
   * @param {object} req - Express request object
   * @param {object} options - { fields, ttl, skipCache }
   * @returns {Map} userId -> user document
   */
  async findByIds(userIds, req = null, options = {}) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Map();
    }

    const { fields = null, ttl = this.defaultTTL, skipCache = false } = options;
    const result = new Map();
    const missingIds = [];

    // Check caches
    for (const id of userIds) {
      const cacheKey = id.toString();

      // Check request cache
      if (req && req.userCache && req.userCache.has(cacheKey)) {
        result.set(id, req.userCache.get(cacheKey));
        continue;
      }

      // Check process cache
      if (!skipCache && this.processCache.has(cacheKey)) {
        const cached = this.processCache.get(cacheKey);
        if (Date.now() - cached.timestamp < cached.ttl) {
          result.set(id, cached.data);
          if (req && req.userCache) {
            req.userCache.set(cacheKey, cached.data);
          }
          continue;
        } else {
          this.processCache.delete(cacheKey);
        }
      }

      missingIds.push(id);
    }

    // Fetch missing ones from DB
    if (missingIds.length > 0) {
      let query = User.find({ _id: { $in: missingIds } });
      if (fields) {
        query = query.select(fields);
      }
      const dbUsers = await query.lean();

      for (const user of dbUsers) {
        const cacheKey = user._id.toString();
        result.set(user._id, user);

        // Cache in both places
        if (req && req.userCache) {
          req.userCache.set(cacheKey, user);
        }
        this.processCache.set(cacheKey, {
          data: user,
          timestamp: Date.now(),
          ttl,
        });
      }
    }

    return result;
  }

  /**
   * Invalidate cache entry (e.g., after user update)
   */
  invalidate(userId) {
    const key = userId.toString();
    this.processCache.delete(key);
    // Note: can't invalidate request cache across all req objects,
    // but request cache is cleared after each request anyway
  }

  /**
   * Invalidate all cache entries
   * Useful for testing or after batch operations
   */
  clear() {
    this.processCache.clear();
  }

  /**
   * Get cache stats (for monitoring)
   */
  getStats() {
    return {
      processCacheSize: this.processCache.size,
      defaultTTL: this.defaultTTL,
    };
  }
}

module.exports = new UserCache();
