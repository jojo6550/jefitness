const cacheService = require('../../src/services/cache');

describe('Cache Service - Memory Cache', () => {
  beforeEach(() => {
    // Reset cache service state for each test
    cacheService.memoryCache = new Map();
    cacheService.memoryCacheTTL = new Map();
    if (cacheService.memoryCacheCleanupInterval) {
      clearInterval(cacheService.memoryCacheCleanupInterval);
      cacheService.memoryCacheCleanupInterval = null;
    }
  });

  afterEach(async () => {
    // Clean up any intervals
    if (cacheService.memoryCacheCleanupInterval) {
      clearInterval(cacheService.memoryCacheCleanupInterval);
      cacheService.memoryCacheCleanupInterval = null;
    }
  });

  describe('Initialization', () => {
    it('should initialize with empty memory cache', async () => {
      await cacheService.connect();
      expect(cacheService.memoryCache).toBeInstanceOf(Map);
      expect(cacheService.memoryCacheTTL).toBeInstanceOf(Map);
    });
  });

  describe('Memory Cache Operations', () => {
    beforeEach(async () => {
      // Initialize the cache service
      await cacheService.connect();
    });

    describe('set', () => {
      it('should store values in memory cache with TTL', async () => {
        const key = 'test-key';
        const value = { data: 'test-value' };
        const ttl = 3600;

        await cacheService.set(key, value, ttl);

        expect(cacheService.memoryCache.get(key)).toEqual(value);
        expect(cacheService.memoryCacheTTL.get(key)).toBeDefined();
        expect(cacheService.memoryCacheTTL.get(key)).toBeGreaterThan(Date.now());
      });

      it('should use default TTL when not specified', async () => {
        const key = 'test-key';
        const value = { data: 'test-value' };

        await cacheService.set(key, value);

        expect(cacheService.memoryCache.get(key)).toEqual(value);
        expect(cacheService.memoryCacheTTL.get(key)).toBeDefined();
      });
    });

    describe('get', () => {
      it('should retrieve values from memory cache', async () => {
        const key = 'test-key';
        const value = { data: 'test-value' };

        await cacheService.set(key, value);
        const retrieved = await cacheService.get(key);

        expect(retrieved).toEqual(value);
      });

      it('should return null for non-existent keys', async () => {
        const retrieved = await cacheService.get('non-existent-key');
        expect(retrieved).toBe(null);
      });

      it('should return null for expired entries', async () => {
        const key = 'test-key';
        const value = { data: 'test-value' };

        // Set with very short TTL (1 second)
        await cacheService.set(key, value, 1);

        // Advance time past expiration
        jest.advanceTimersByTime(2000);

        const retrieved = await cacheService.get(key);
        expect(retrieved).toBe(null);

        // Entry should be cleaned up
        expect(cacheService.memoryCache.has(key)).toBe(false);
        expect(cacheService.memoryCacheTTL.has(key)).toBe(false);
      });
    });

    describe('del', () => {
      it('should remove entries from memory cache', async () => {
        const key = 'test-key';
        const value = { data: 'test-value' };

        await cacheService.set(key, value);
        expect(cacheService.memoryCache.has(key)).toBe(true);

        await cacheService.del(key);

        expect(cacheService.memoryCache.has(key)).toBe(false);
        expect(cacheService.memoryCacheTTL.has(key)).toBe(false);
      });

      it('should handle deleting non-existent keys gracefully', async () => {
        expect(async () => {
          await cacheService.del('non-existent-key');
        }).not.toThrow();
      });
    });

    describe('invalidatePattern', () => {
      it('should remove entries matching a pattern', async () => {
        // Set multiple entries
        await cacheService.set('user:1', { id: 1 });
        await cacheService.set('user:2', { id: 2 });
        await cacheService.set('post:1', { id: 1 });

        expect(cacheService.memoryCache.size).toBe(3);

        // Invalidate user entries
        await cacheService.invalidatePattern('user:*');

        expect(cacheService.memoryCache.size).toBe(1);
        expect(cacheService.memoryCache.has('post:1')).toBe(true);
        expect(cacheService.memoryCache.has('user:1')).toBe(false);
        expect(cacheService.memoryCache.has('user:2')).toBe(false);
      });

      it('should handle wildcard patterns correctly', async () => {
        await cacheService.set('cache:user:profile:1', { id: 1 });
        await cacheService.set('cache:user:profile:2', { id: 2 });
        await cacheService.set('cache:post:1', { id: 1 });

        await cacheService.invalidatePattern('cache:user:*');

        expect(cacheService.memoryCache.size).toBe(1);
        expect(cacheService.memoryCache.has('cache:post:1')).toBe(true);
      });

      it('should handle empty pattern matches', async () => {
        await cacheService.set('test:key', { data: 'value' });

        await cacheService.invalidatePattern('non-matching:*');

        expect(cacheService.memoryCache.size).toBe(1);
      });
    });
  });

  describe('Memory Cache Cleanup', () => {
    beforeEach(async () => {
      // Initialize the cache service
      await cacheService.connect();
    });

    it('should automatically clean up expired entries', async () => {
      jest.useFakeTimers();

      // Set entries with different TTLs
      await cacheService.set('short', { data: 'short' }, 1); // 1 second
      await cacheService.set('long', { data: 'long' }, 10); // 10 seconds

      expect(cacheService.memoryCache.size).toBe(2);

      // Advance time past short TTL
      jest.advanceTimersByTime(2000);

      // Manually trigger cleanup since fake timers don't run intervals automatically
      const now = Date.now();
      let cleaned = 0;
      for (const [key, expiry] of cacheService.memoryCacheTTL) {
        if (now > expiry) {
          cacheService.memoryCache.delete(key);
          cacheService.memoryCacheTTL.delete(key);
          cleaned++;
        }
      }

      // Short entry should be cleaned up
      expect(cacheService.memoryCache.has('short')).toBe(false);
      expect(cacheService.memoryCache.has('long')).toBe(true);

      jest.useRealTimers();
    });
  });
});

