// test/cache.test.js
'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');

describe('cache.js', () => {
  let cache;
  let mockConfig;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      cache: {
        memory: {
          maxSize: 3, // Small size for testing eviction
          ttl: 1000, // 1 second TTL for testing
        },
        persistent: {
          enabled: false, // Disable persistent cache for main tests
        },
      },
    };

    // Use proxyquire to inject mock config
    cache = proxyquire('../src/cache', {
      '../config/apiConfig.json': mockConfig,
    });

    // Clear cache before each test
    cache.clearCache();
  });

  describe('Basic cache operations', () => {
    it('should store and retrieve data', () => {
      const key = 'test-key';
      const data = { value: 'test-data' };

      cache.setCache(key, data);
      const result = cache.getCache(key);

      expect(result).to.deep.equal(data);
    });

    it('should return null for non-existent key', () => {
      const result = cache.getCache('non-existent-key');
      expect(result).to.be.null;
    });

    it('should clear all cache entries', () => {
      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');

      cache.clearCache();

      expect(cache.getCache('key1')).to.be.null;
      expect(cache.getCache('key2')).to.be.null;
    });

    it('should check if key exists in cache', () => {
      const key = 'test-key';
      const data = { value: 'test-data' };

      expect(cache.hasCache(key)).to.be.false;

      cache.setCache(key, data);
      expect(cache.hasCache(key)).to.be.true;
    });
  });

  describe('TTL (Time-To-Live) functionality', () => {
    it('should respect TTL configuration', () => {
      const key = 'test-key';
      const data = { value: 'test-data' };

      // Test setting with custom TTL
      cache.setCache(key, data, 1000);
      expect(cache.getCache(key)).to.deep.equal(data);

      // Test that hasCache reflects the entry exists
      expect(cache.hasCache(key)).to.be.true;
    });

    it('should use default TTL when not specified', () => {
      const key = 'test-key';
      const data = { value: 'test-data' };

      cache.setCache(key, data); // Uses default TTL

      // Should be available immediately
      expect(cache.getCache(key)).to.deep.equal(data);
      expect(cache.hasCache(key)).to.be.true;
    });

    it('should handle TTL configuration from config file', () => {
      // Test that cache respects TTL settings from configuration
      const stats = cache.getCacheStats();
      expect(stats.ttl).to.equal(1000); // From mock config
    });
  });

  describe('LRU (Least Recently Used) functionality', () => {
    it('should evict least recently used item when max size exceeded', () => {
      // Fill cache to max size (3)
      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');
      cache.setCache('key3', 'data3');

      // All should be present
      expect(cache.getCache('key1')).to.equal('data1');
      expect(cache.getCache('key2')).to.equal('data2');
      expect(cache.getCache('key3')).to.equal('data3');

      // Add one more item, should evict least recently used (key1)
      cache.setCache('key4', 'data4');

      // key1 should be evicted, others should remain
      expect(cache.getCache('key1')).to.be.null;
      expect(cache.getCache('key2')).to.equal('data2');
      expect(cache.getCache('key3')).to.equal('data3');
      expect(cache.getCache('key4')).to.equal('data4');
    });

    it('should update LRU order on access', () => {
      // Fill cache to max size
      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');
      cache.setCache('key3', 'data3');

      // Access key1 to make it most recently used
      cache.getCache('key1');

      // Add new item, should evict key2 (now least recently used)
      cache.setCache('key4', 'data4');

      // key2 should be evicted, key1 should remain due to recent access
      expect(cache.getCache('key1')).to.equal('data1');
      expect(cache.getCache('key2')).to.be.null;
      expect(cache.getCache('key3')).to.equal('data3');
      expect(cache.getCache('key4')).to.equal('data4');
    });

    it('should handle updating existing keys without affecting size limit', () => {
      // Fill cache to max size
      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');
      cache.setCache('key3', 'data3');

      // Update existing key
      cache.setCache('key2', 'updated-data2');

      // All original keys should still be present
      expect(cache.getCache('key1')).to.equal('data1');
      expect(cache.getCache('key2')).to.equal('updated-data2');
      expect(cache.getCache('key3')).to.equal('data3');

      // Cache should still be at max size
      const stats = cache.getCacheStats();
      expect(stats.size).to.equal(3);
    });
  });

  describe('Cache statistics', () => {
    it('should return accurate cache statistics', () => {
      const stats1 = cache.getCacheStats();
      expect(stats1.size).to.equal(0);
      expect(stats1.maxSize).to.equal(3);

      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');

      const stats2 = cache.getCacheStats();
      expect(stats2.size).to.equal(2);
      expect(stats2.maxSize).to.equal(3);
      expect(stats2.itemCount).to.equal(2);
      expect(stats2.ttl).to.equal(1000); // From mock config
    });
  });

  describe('Edge cases', () => {
    it('should handle null and undefined values', () => {
      cache.setCache('null-key', null);
      cache.setCache('undefined-key', undefined);

      expect(cache.getCache('null-key')).to.be.null;
      expect(cache.getCache('undefined-key')).to.be.null; // LRU cache treats undefined as missing
    });

    it('should handle complex objects', () => {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          string: 'test',
          boolean: true,
        },
        functions: () => 'test',
        date: new Date(),
      };

      cache.setCache('complex-key', complexObject);
      const result = cache.getCache('complex-key');

      expect(result).to.deep.equal(complexObject);
    });

    it('should handle very large keys', () => {
      const largeKey = 'x'.repeat(1000);
      const data = 'test-data';

      cache.setCache(largeKey, data);
      expect(cache.getCache(largeKey)).to.equal(data);
    });
  });

  describe('Error handling', () => {
    it('should handle missing configuration gracefully', () => {
      // Test with empty config
      const cacheWithEmptyConfig = proxyquire('../src/cache', {
        '../config/apiConfig.json': {},
      });

      // Should use defaults
      const stats = cacheWithEmptyConfig.getCacheStats();
      expect(stats.maxSize).to.equal(100); // Default max size
      expect(stats.ttl).to.equal(300000); // Default TTL
    });
  });

  describe('Async API functions', () => {
    it('should provide async cache operations', async () => {
      const key = 'async-test';
      const data = { value: 'async-data' };

      // Test async get/set
      cache.setCache(key, data);
      const result = await cache.getCacheAsync(key);
      expect(result).to.deep.equal(data);

      // Test async has
      const hasResult = await cache.hasCacheAsync(key);
      expect(hasResult).to.be.true;

      // Test async clear
      await cache.clearCacheAsync();
      const afterClear = await cache.getCacheAsync(key);
      expect(afterClear).to.be.null;
    });

    it('should provide comprehensive cache statistics', async () => {
      cache.setCache('key1', 'data1');
      cache.setCache('key2', 'data2');

      const stats = await cache.getComprehensiveCacheStats();

      expect(stats).to.have.property('memory');
      expect(stats).to.have.property('persistent');

      expect(stats.memory.size).to.equal(2);
      expect(stats.persistent.enabled).to.be.false;
    });

    it('should provide access to cache manager', () => {
      const manager = cache.getCacheManager();
      expect(manager).to.have.property('memoryCache');
      expect(manager).to.have.property('persistentCache');
    });
  });
});
