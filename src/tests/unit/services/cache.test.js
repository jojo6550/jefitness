/**
 * Unit Tests for Cache Service
 * Tests in-memory caching, TTL, cache invalidation, and cleanup
 */

const CacheService = require('../../../services/cache');

describe('Cache Service', () => {
  let cacheService;

  beforeEach(() => {
    // Create new instance for each test
    cacheService = new CacheService();
  });

  afterEach(() => {
    // Clear any intervals
    if (cacheService.memoryCacheCleanupInterval) {
      clearInterval(cacheService.memoryCacheCleanupInterval);
    }
  });

  describe('get() and set()', () => {
    test('should set and retrieve cache value', async () => {
      await cacheService.set('test-key', 'test-value', 3600);

      const value = await cacheService.get('test-key');
      expect(value).toBe('test-value');
    });

    test('should store complex objects', async () => {
      const complexValue = {
        user: { id: 1, name: 'Test' },
        settings: { theme: 'dark' }
      };

      await cacheService.set('complex-key', complexValue, 3600);

      const retrieved = await cacheService.get('complex-key');
      expect(retrieved).toEqual(complexValue);
    });

    test('should store arrays', async () => {
      const arrayValue = [1, 2, 3, 'test', { nested: true }];

      await cacheService.set('array-key', arrayValue, 3600);

      const retrieved = await cacheService.get('array-key');
      expect(retrieved).toEqual(arrayValue);
    });

    test('should return null for non-existent keys', async () => {
      const value = await cacheService.get('non-existent');
      expect(value).toBeNull();
    });

    test('should overwrite existing values', async () => {
      await cacheService.set('key', 'value1', 3600);
      await cacheService.set('key', 'value2', 3600);

      const value = await cacheService.get('key');
      expect(value).toBe('value2');
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire cache after TTL', async () => {
      // Mock time
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('expiring-key', 'value', 1); // 1 second TTL

      // Value should exist immediately
      let value = await cacheService.get('expiring-key');
      expect(value).toBe('value');

      // Advance time by 2 seconds
      currentTime += 2000;

      // Value should now be expired
      value = await cacheService.get('expiring-key');
      expect(value).toBeNull();
    });

    test('should not expire before TTL', async () => {
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('key', 'value', 10); // 10 second TTL

      // Advance time by 5 seconds (still within TTL)
      currentTime += 5000;

      const value = await cacheService.get('key');
      expect(value).toBe('value');
    });

    test('should handle different TTL values', async () => {
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('short-ttl', 'value1', 1);
      await cacheService.set('long-ttl', 'value2', 100);

      // Advance time past short TTL but before long TTL
      currentTime += 2000;

      expect(await cacheService.get('short-ttl')).toBeNull();
      expect(await cacheService.get('long-ttl')).toBe('value2');
    });

    test('should use default TTL of 3600 seconds', async () => {
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('default-ttl', 'value'); // No TTL specified

      // Advance time by 1 hour (3600 seconds) - should still exist
      currentTime += 3599 * 1000;
      expect(await cacheService.get('default-ttl')).toBe('value');

      // Advance time past 1 hour - should be expired
      currentTime += 2000;
      expect(await cacheService.get('default-ttl')).toBeNull();
    });
  });

  describe('del()', () => {
    test('should delete cache entry', async () => {
      await cacheService.set('delete-key', 'value', 3600);
      expect(await cacheService.get('delete-key')).toBe('value');

      await cacheService.del('delete-key');
      expect(await cacheService.get('delete-key')).toBeNull();
    });

    test('should handle deleting non-existent keys', async () => {
      await expect(cacheService.del('non-existent')).resolves.not.toThrow();
    });

    test('should delete TTL tracking along with value', async () => {
      await cacheService.set('key', 'value', 3600);
      await cacheService.del('key');

      // Both cache and TTL should be removed
      expect(cacheService.memoryCache.has('key')).toBe(false);
      expect(cacheService.memoryCacheTTL.has('key')).toBe(false);
    });
  });

  describe('invalidatePattern()', () => {
    beforeEach(async () => {
      // Set up test data
      await cacheService.set('user:1:profile', { name: 'User 1' }, 3600);
      await cacheService.set('user:2:profile', { name: 'User 2' }, 3600);
      await cacheService.set('user:1:settings', { theme: 'dark' }, 3600);
      await cacheService.set('product:1', { name: 'Product 1' }, 3600);
      await cacheService.set('product:2', { name: 'Product 2' }, 3600);
    });

    test('should invalidate keys matching pattern', async () => {
      await cacheService.invalidatePattern('user:*');

      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('user:2:profile')).toBeNull();
      expect(await cacheService.get('user:1:settings')).toBeNull();

      // Non-matching keys should remain
      expect(await cacheService.get('product:1')).toBeDefined();
      expect(await cacheService.get('product:2')).toBeDefined();
    });

    test('should invalidate specific user cache', async () => {
      await cacheService.invalidatePattern('user:1:*');

      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('user:1:settings')).toBeNull();

      // Other users should remain
      expect(await cacheService.get('user:2:profile')).toBeDefined();
    });

    test('should handle patterns with no matches', async () => {
      await cacheService.invalidatePattern('nonexistent:*');

      // All existing keys should remain
      expect(await cacheService.get('user:1:profile')).toBeDefined();
      expect(await cacheService.get('product:1')).toBeDefined();
    });

    test('should invalidate all keys with wildcard', async () => {
      await cacheService.invalidatePattern('*');

      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('product:1')).toBeNull();
      expect(cacheService.memoryCache.size).toBe(0);
    });

    test('should handle complex patterns', async () => {
      await cacheService.set('app:cache:user:1', 'value', 3600);
      await cacheService.set('app:cache:user:2', 'value', 3600);
      await cacheService.set('app:temp:data', 'value', 3600);

      await cacheService.invalidatePattern('app:cache:*');

      expect(await cacheService.get('app:cache:user:1')).toBeNull();
      expect(await cacheService.get('app:cache:user:2')).toBeNull();
      expect(await cacheService.get('app:temp:data')).toBeDefined();
    });
  });

  describe('Automatic Cleanup', () => {
    test('should start cleanup interval on connect', async () => {
      await cacheService.connect();

      expect(cacheService.memoryCacheCleanupInterval).toBeDefined();
    });

    test('should clean up expired entries periodically', async () => {
      jest.useFakeTimers();

      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.connect();

      // Add entries with different TTLs
      await cacheService.set('short', 'value1', 1);
      await cacheService.set('long', 'value2', 100);

      // Advance time past short TTL
      currentTime += 2000;

      // Trigger cleanup (runs every 60 seconds)
      jest.advanceTimersByTime(60000);

      // Short TTL should be cleaned up
      expect(cacheService.memoryCache.has('short')).toBe(false);
      expect(cacheService.memoryCache.has('long')).toBe(true);

      jest.useRealTimers();
    });

    test('should not create duplicate cleanup intervals', async () => {
      await cacheService.connect();
      const firstInterval = cacheService.memoryCacheCleanupInterval;

      await cacheService.connect();
      const secondInterval = cacheService.memoryCacheCleanupInterval;

      // Should clear and create new interval
      expect(firstInterval).not.toBe(secondInterval);
    });
  });

  describe('Cache Hit/Miss Behavior', () => {
    test('should handle cache hit', async () => {
      await cacheService.set('hit-key', 'cached-value', 3600);

      const value = await cacheService.get('hit-key');
      expect(value).toBe('cached-value');
    });

    test('should handle cache miss', async () => {
      const value = await cacheService.get('miss-key');
      expect(value).toBeNull();
    });

    test('should handle expired entry as cache miss', async () => {
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('expired-key', 'value', 1);

      // Advance time past TTL
      currentTime += 2000;

      const value = await cacheService.get('expired-key');
      expect(value).toBeNull();
    });
  });

  describe('Memory Management', () => {
    test('should handle large number of entries', async () => {
      // Add 1000 entries
      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`key-${i}`, `value-${i}`, 3600);
      }

      expect(cacheService.memoryCache.size).toBe(1000);

      // Verify retrieval works
      expect(await cacheService.get('key-500')).toBe('value-500');
    });

    test('should free memory when entries are deleted', async () => {
      await cacheService.set('key1', 'value1', 3600);
      await cacheService.set('key2', 'value2', 3600);

      const initialSize = cacheService.memoryCache.size;

      await cacheService.del('key1');

      expect(cacheService.memoryCache.size).toBe(initialSize - 1);
    });

    test('should free memory when entries expire', async () => {
      let currentTime = Date.now();
      cacheService.getTime = () => currentTime;

      await cacheService.set('key1', 'value1', 1);
      await cacheService.set('key2', 'value2', 1);

      const initialSize = cacheService.memoryCache.size;

      // Advance time to expire entries
      currentTime += 2000;

      // Access to trigger cleanup
      await cacheService.get('key1');
      await cacheService.get('key2');

      expect(cacheService.memoryCache.size).toBeLessThan(initialSize);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null values', async () => {
      await cacheService.set('null-key', null, 3600);

      const value = await cacheService.get('null-key');
      expect(value).toBeNull();
    });

    test('should handle undefined values', async () => {
      await cacheService.set('undefined-key', undefined, 3600);

      const value = await cacheService.get('undefined-key');
      expect(value).toBe(undefined);
    });

    test('should handle empty string', async () => {
      await cacheService.set('empty-key', '', 3600);

      const value = await cacheService.get('empty-key');
      expect(value).toBe('');
    });

    test('should handle zero as value', async () => {
      await cacheService.set('zero-key', 0, 3600);

      const value = await cacheService.get('zero-key');
      expect(value).toBe(0);
    });

    test('should handle boolean values', async () => {
      await cacheService.set('true-key', true, 3600);
      await cacheService.set('false-key', false, 3600);

      expect(await cacheService.get('true-key')).toBe(true);
      expect(await cacheService.get('false-key')).toBe(false);
    });

    test('should handle negative TTL as expired', async () => {
      await cacheService.set('negative-ttl', 'value', -1);

      const value = await cacheService.get('negative-ttl');
      expect(value).toBeNull();
    });
  });
});
