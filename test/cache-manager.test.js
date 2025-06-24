// test/cache-manager.test.js
'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CacheManager = require('../src/cache/CacheManager');

describe('CacheManager', () => {
  let cacheManager;
  let tempDir;

  beforeEach(() => {
    // Create a temporary directory for persistent cache tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-linker-manager-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  describe('Memory-only cache', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        memory: {
          maxSize: 3,
          ttl: 1000,
        },
        persistent: {
          enabled: false,
        },
      });
    });

    it('should store and retrieve from memory cache', async () => {
      const key = 'memory-test';
      const data = { value: 'test-data' };

      await cacheManager.set(key, data);
      const result = await cacheManager.get(key);

      expect(result).to.deep.equal(data);
    });

    it('should respect LRU eviction in memory cache', async () => {
      // Fill cache to max size
      await cacheManager.set('key1', 'data1');
      await cacheManager.set('key2', 'data2');
      await cacheManager.set('key3', 'data3');

      // All should be present
      expect(await cacheManager.get('key1')).to.equal('data1');
      expect(await cacheManager.get('key2')).to.equal('data2');
      expect(await cacheManager.get('key3')).to.equal('data3');

      // Add one more, should evict least recently used (key1)
      await cacheManager.set('key4', 'data4');

      // key1 should be evicted
      expect(await cacheManager.get('key1')).to.be.null;
      expect(await cacheManager.get('key2')).to.equal('data2');
      expect(await cacheManager.get('key3')).to.equal('data3');
      expect(await cacheManager.get('key4')).to.equal('data4');
    });

    it('should handle has() correctly', async () => {
      const key = 'has-test';
      const data = 'test-data';

      expect(await cacheManager.has(key)).to.be.false;

      await cacheManager.set(key, data);
      expect(await cacheManager.has(key)).to.be.true;
    });

    it('should delete entries correctly', async () => {
      const key = 'delete-test';
      const data = 'test-data';

      await cacheManager.set(key, data);
      expect(await cacheManager.has(key)).to.be.true;

      const deleted = await cacheManager.delete(key);
      expect(deleted).to.be.true;
      expect(await cacheManager.has(key)).to.be.false;
    });

    it('should clear all entries', async () => {
      await cacheManager.set('key1', 'data1');
      await cacheManager.set('key2', 'data2');

      await cacheManager.clear();

      expect(await cacheManager.get('key1')).to.be.null;
      expect(await cacheManager.get('key2')).to.be.null;
    });
  });

  describe('Two-tier cache (memory + persistent)', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        memory: {
          maxSize: 2, // Small memory cache for testing tier behavior
          ttl: 1000,
        },
        persistent: {
          enabled: true,
          location: tempDir,
          ttl: 5000, // Longer TTL for persistent cache
        },
      });
    });

    it('should store in both tiers', async () => {
      const key = 'two-tier-test';
      const data = { value: 'test-data' };

      await cacheManager.set(key, data);

      // Should be in memory cache
      const memoryResult = cacheManager.memoryCache.get(key);
      expect(memoryResult).to.deep.equal(data);

      // Should also be in persistent cache
      const persistentResult = await cacheManager.persistentCache.get(key);
      expect(persistentResult).to.deep.equal(data);
    });

    it('should retrieve from memory first (L1)', async () => {
      const key = 'l1-test';
      const data = 'test-data';

      await cacheManager.set(key, data);

      // Get should return from memory (faster)
      const result = await cacheManager.get(key);
      expect(result).to.equal(data);
    });

    it('should fall back to persistent cache (L2)', async () => {
      const key = 'l2-test';
      const data = 'test-data';

      // Set in persistent cache directly
      await cacheManager.persistentCache.set(key, data);

      // Should retrieve from persistent and promote to memory
      const result = await cacheManager.get(key);
      expect(result).to.equal(data);

      // Should now be in memory cache too
      const memoryResult = cacheManager.memoryCache.get(key);
      expect(memoryResult).to.equal(data);
    });

    it('should promote from L2 to L1 on access', async () => {
      const key = 'promote-test';
      const data = 'test-data';

      // Set only in persistent cache
      await cacheManager.persistentCache.set(key, data);

      // Verify it's not in memory
      expect(cacheManager.memoryCache.get(key)).to.be.undefined;

      // Get from cache manager (should promote)
      const result = await cacheManager.get(key);
      expect(result).to.equal(data);

      // Should now be in memory cache
      expect(cacheManager.memoryCache.get(key)).to.equal(data);
    });

    it('should handle memory cache eviction with persistent fallback', async () => {
      // Fill memory cache (max size 2)
      await cacheManager.set('key1', 'data1');
      await cacheManager.set('key2', 'data2');

      // Add third item, should evict key1 from memory but keep in persistent
      await cacheManager.set('key3', 'data3');

      // key1 should be evicted from memory
      expect(cacheManager.memoryCache.get('key1')).to.be.undefined;

      // But should still be available from persistent cache
      const result = await cacheManager.get('key1');
      expect(result).to.equal('data1');

      // And should be promoted back to memory
      expect(cacheManager.memoryCache.get('key1')).to.equal('data1');
    });

    it('should delete from both tiers', async () => {
      const key = 'delete-both-test';
      const data = 'test-data';

      await cacheManager.set(key, data);

      // Verify in both tiers
      expect(cacheManager.memoryCache.get(key)).to.equal(data);
      expect(await cacheManager.persistentCache.get(key)).to.equal(data);

      // Delete
      const deleted = await cacheManager.delete(key);
      expect(deleted).to.be.true;

      // Should be gone from both tiers
      expect(cacheManager.memoryCache.get(key)).to.be.undefined;
      expect(await cacheManager.persistentCache.get(key)).to.be.null;
    });

    it('should clear both tiers', async () => {
      await cacheManager.set('key1', 'data1');
      await cacheManager.set('key2', 'data2');

      // Verify data exists
      expect(await cacheManager.get('key1')).to.equal('data1');
      expect(await cacheManager.get('key2')).to.equal('data2');

      await cacheManager.clear();

      // Should be cleared from both tiers
      expect(await cacheManager.get('key1')).to.be.null;
      expect(await cacheManager.get('key2')).to.be.null;
    });

    it('should handle has() across both tiers', async () => {
      const key = 'has-both-test';
      const data = 'test-data';

      expect(await cacheManager.has(key)).to.be.false;

      // Set only in persistent cache
      await cacheManager.persistentCache.set(key, data);

      // Should find it
      expect(await cacheManager.has(key)).to.be.true;
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        memory: {
          maxSize: 5,
          ttl: 1000,
        },
        persistent: {
          enabled: true,
          location: tempDir,
          ttl: 5000,
        },
      });
    });

    it('should return comprehensive statistics', async () => {
      await cacheManager.set('key1', 'data1');
      await cacheManager.set('key2', 'data2');

      const stats = await cacheManager.getStats();

      expect(stats).to.have.property('memory');
      expect(stats).to.have.property('persistent');

      expect(stats.memory.size).to.equal(2);
      expect(stats.memory.maxSize).to.equal(5);
      expect(stats.memory.itemCount).to.equal(2);

      expect(stats.persistent.enabled).to.be.true;
      expect(stats.persistent.validEntries).to.equal(2);
      expect(stats.persistent.location).to.equal(tempDir);
    });

    it('should handle statistics when persistent cache is disabled', async () => {
      const memoryOnlyManager = new CacheManager({
        memory: { maxSize: 3, ttl: 1000 },
        persistent: { enabled: false },
      });

      await memoryOnlyManager.set('key1', 'data1');

      const stats = await memoryOnlyManager.getStats();

      expect(stats.memory.size).to.equal(1);
      expect(stats.persistent.enabled).to.be.false;
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      const config = {
        memory: { maxSize: 10, ttl: 2000 },
        persistent: { enabled: true, location: tempDir, ttl: 10000 },
      };

      const manager = new CacheManager(config);
      const returnedConfig = manager.getConfig();

      expect(returnedConfig.memory.maxSize).to.equal(10);
      expect(returnedConfig.memory.ttl).to.equal(2000);
      expect(returnedConfig.persistent.enabled).to.be.true;
    });

    it('should use defaults for missing configuration', () => {
      const manager = new CacheManager({});
      const config = manager.getConfig();

      expect(config.memory.maxSize).to.equal(100); // Default
      expect(config.memory.ttl).to.equal(300000); // Default
    });
  });

  describe('Error handling', () => {
    it('should handle persistent cache initialization errors gracefully', () => {
      // Try to create cache in invalid location
      const invalidPath = '/invalid/path/that/should/not/exist';

      expect(() => {
        new CacheManager({
          memory: { maxSize: 5, ttl: 1000 },
          persistent: {
            enabled: true,
            location: invalidPath,
          },
        });
      }).to.not.throw();
    });

    it('should continue working when persistent cache operations fail', async () => {
      const manager = new CacheManager({
        memory: { maxSize: 5, ttl: 1000 },
        persistent: {
          enabled: true,
          location: tempDir,
        },
      });

      // These should not throw even if persistent operations fail
      try {
        await manager.set('key', 'data');
        await manager.get('key');
        await manager.has('key');
        await manager.delete('key');
        await manager.clear();
        await manager.getStats();
        // If we get here, no exceptions were thrown
        expect(true).to.be.true;
      } catch (error) {
        // Should not reach here
        expect.fail(`Cache operations should not throw: ${error.message}`);
      }
    });
  });
});
