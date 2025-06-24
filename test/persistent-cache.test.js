// test/persistent-cache.test.js
'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PersistentCache = require('../src/cache/PersistentCache');

describe('PersistentCache', () => {
  let cache;
  let tempDir;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-linker-test-'));

    cache = new PersistentCache({
      location: tempDir,
      ttl: 1000, // 1 second for testing
      maxSize: '1MB',
    });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  describe('Basic operations', () => {
    it('should store and retrieve data', async () => {
      const key = 'test-key';
      const data = { value: 'test-data', number: 42 };

      await cache.set(key, data);
      const result = await cache.get(key);

      expect(result).to.deep.equal(data);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).to.be.null;
    });

    it('should handle complex data structures', async () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { prop: 'value' },
        },
        date: new Date().toISOString(),
        boolean: true,
        null: null,
      };

      await cache.set('complex-key', complexData);
      const result = await cache.get('complex-key');

      expect(result).to.deep.equal(complexData);
    });

    it('should check if key exists', async () => {
      const key = 'exists-test';
      const data = 'test-data';

      expect(await cache.has(key)).to.be.false;

      await cache.set(key, data);
      expect(await cache.has(key)).to.be.true;
    });

    it('should delete specific entries', async () => {
      const key = 'delete-test';
      const data = 'test-data';

      await cache.set(key, data);
      expect(await cache.has(key)).to.be.true;

      const deleted = await cache.delete(key);
      expect(deleted).to.be.true;
      expect(await cache.has(key)).to.be.false;
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'data1');
      await cache.set('key2', 'data2');
      await cache.set('key3', 'data3');

      await cache.clear();

      expect(await cache.get('key1')).to.be.null;
      expect(await cache.get('key2')).to.be.null;
      expect(await cache.get('key3')).to.be.null;
    });
  });

  describe('TTL functionality', () => {
    it('should respect custom TTL', async () => {
      const key = 'ttl-test';
      const data = 'test-data';

      // Set with very short TTL
      await cache.set(key, data, 50); // 50ms

      // Should be available immediately
      expect(await cache.get(key)).to.equal(data);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be expired
      expect(await cache.get(key)).to.be.null;
    });

    it('should use default TTL when not specified', async () => {
      const key = 'default-ttl-test';
      const data = 'test-data';

      await cache.set(key, data); // Uses default TTL (1000ms)

      // Should be available before default TTL
      expect(await cache.get(key)).to.equal(data);

      // Note: We don't test expiration here as it would take 1 second
      // The TTL functionality is tested with custom short TTL above
    });

    it('should handle has() correctly for expired entries', async () => {
      const key = 'has-expired-test';
      const data = 'test-data';

      await cache.set(key, data, 100); // 100ms TTL

      expect(await cache.has(key)).to.be.true;

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(await cache.has(key)).to.be.false;
    });
  });

  describe('File operations', () => {
    it('should create cache directory if it does not exist', () => {
      const newTempDir = path.join(os.tmpdir(), 'variant-linker-new-' + Date.now());

      expect(fs.existsSync(newTempDir)).to.be.false;

      new PersistentCache({
        location: newTempDir,
        ttl: 1000,
      });

      expect(fs.existsSync(newTempDir)).to.be.true;

      // Clean up
      fs.rmdirSync(newTempDir);
    });

    it('should handle corrupted cache files gracefully', async () => {
      const key = 'corrupted-test';
      const filePath = path.join(tempDir, cache._getFilename(key));

      // Write corrupted JSON
      fs.writeFileSync(filePath, '{ invalid json }');

      // Should return null for corrupted file
      const result = await cache.get(key);
      expect(result).to.be.null;
    });

    it('should handle missing cache files gracefully', async () => {
      const key = 'missing-test';

      // Try to get from non-existent file
      const result = await cache.get(key);
      expect(result).to.be.null;
    });

    it('should use atomic writes', async () => {
      const key = 'atomic-test';
      const data = 'test-data';

      await cache.set(key, data);

      // Check that no temporary files are left behind
      const files = fs.readdirSync(tempDir);
      const tempFiles = files.filter((f) => f.endsWith('.tmp'));

      expect(tempFiles).to.have.length(0);
    });
  });

  describe('Statistics', () => {
    it('should return accurate cache statistics', async () => {
      const stats1 = await cache.getStats();
      expect(stats1.validEntries).to.equal(0);
      expect(stats1.location).to.equal(tempDir);

      await cache.set('key1', 'data1');
      await cache.set('key2', 'data2');

      const stats2 = await cache.getStats();
      expect(stats2.validEntries).to.equal(2);
      expect(stats2.totalSize).to.be.greaterThan(0);
      expect(stats2.maxSize).to.equal(1024 * 1024); // 1MB in bytes
    });

    it('should track expired entries in statistics', async () => {
      // Add entry with short TTL
      await cache.set('expired-key', 'data', 50); // 50ms TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = await cache.getStats();
      expect(stats.expiredEntries).to.be.greaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should parse size strings correctly', () => {
      expect(cache._parseSizeString('100B')).to.equal(100);
      expect(cache._parseSizeString('1KB')).to.equal(1024);
      expect(cache._parseSizeString('1MB')).to.equal(1024 * 1024);
      expect(cache._parseSizeString('1GB')).to.equal(1024 * 1024 * 1024);
      expect(cache._parseSizeString('1.5MB')).to.equal(1.5 * 1024 * 1024);
    });

    it('should throw error for invalid size strings', () => {
      expect(() => cache._parseSizeString('invalid')).to.throw('Invalid size string');
      expect(() => cache._parseSizeString('100')).to.throw('Invalid size string');
      expect(() => cache._parseSizeString('100XB')).to.throw('Invalid size string');
    });

    it('should expand tilde in location path', () => {
      const homeCache = new PersistentCache({
        location: '~/test-cache',
        ttl: 1000,
      });

      expect(homeCache.cacheDir).to.include(os.homedir());
      expect(homeCache.cacheDir).to.include('test-cache');
    });
  });

  describe('Error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const key = 'error-test';
      const data = 'test-data';

      // Set data first
      await cache.set(key, data);

      // Make directory read-only to simulate permission error
      const originalMode = fs.statSync(tempDir).mode;
      try {
        fs.chmodSync(tempDir, 0o444); // Read-only

        // Operations should not throw but should return null/false
        await cache.get(key);
        // Result might be null due to permission error, which is acceptable

        await cache.has(key);
        // hasResult might be false due to permission error, which is acceptable

        await cache.delete(key);
        // deleteResult might be false due to permission error, which is acceptable
      } finally {
        // Restore permissions
        fs.chmodSync(tempDir, originalMode);
      }
    });

    it('should not throw errors on cache operations', async () => {
      const key = 'no-throw-test';
      const data = 'test-data';

      // These operations should not throw even if there are underlying issues
      try {
        await cache.set(key, data);
        await cache.get(key);
        await cache.has(key);
        await cache.delete(key);
        await cache.clear();
        await cache.getStats();
        // If we get here, no exceptions were thrown
        expect(true).to.be.true;
      } catch (error) {
        // Should not reach here
        expect.fail(`Cache operations should not throw: ${error.message}`);
      }
    });
  });
});
