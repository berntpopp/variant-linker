// src/cache/CacheManager.js
'use strict';

/**
 * @fileoverview Unified cache manager that coordinates between memory (LRU) and persistent caches.
 * Implements a two-tier caching strategy: L1 (memory) and L2 (persistent).
 * @module cache/CacheManager
 */

const { LRUCache } = require('lru-cache');
const PersistentCache = require('./PersistentCache');
const debug = require('debug')('variant-linker:cache-manager');

/**
 * Unified cache manager with memory (L1) and persistent (L2) tiers.
 */
class CacheManager {
  /**
   * Create a new CacheManager instance.
   * @param {Object} config - Cache configuration
   * @param {Object} [config.memory] - Memory cache configuration
   * @param {number} [config.memory.maxSize=100] - Max entries in memory cache
   * @param {number} [config.memory.ttl=300000] - Memory cache TTL in ms
   * @param {Object} [config.persistent] - Persistent cache configuration
   * @param {boolean} [config.persistent.enabled=false] - Enable persistent cache
   * @param {string} [config.persistent.location] - Cache directory path
   * @param {number} [config.persistent.ttl=86400000] - Persistent cache TTL in ms
   * @param {string} [config.persistent.maxSize="100MB"] - Max persistent cache size
   */
  constructor(config = {}) {
    this.config = config;

    // Initialize memory cache (L1)
    const memoryConfig = config.memory || {};
    this.memoryCache = new LRUCache({
      max: memoryConfig.maxSize || 100,
      ttl: memoryConfig.ttl || 300000, // 5 minutes
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });

    // Initialize persistent cache (L2) if enabled
    this.persistentCache = null;
    if (config.persistent?.enabled) {
      try {
        this.persistentCache = new PersistentCache({
          location: config.persistent.location,
          ttl: config.persistent.ttl || 86400000, // 24 hours
          maxSize: config.persistent.maxSize || '100MB',
        });
        debug('Persistent cache enabled');
      } catch (error) {
        debug(`Failed to initialize persistent cache: ${error.message}`);
        console.warn(`Persistent cache disabled due to initialization error: ${error.message}`);
      }
    }

    debug(
      `Cache manager initialized. Memory: ${memoryConfig.maxSize || 100} entries, Persistent: ${config.persistent?.enabled ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Store data in both cache tiers.
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} [ttl] - Time-to-live in milliseconds (uses tier-specific defaults if not provided)
   * @returns {Promise<void>} Promise that resolves when data is stored
   */
  async set(key, data, ttl) {
    debug(`Setting cache for key: ${key}`);

    // Set in memory cache (L1)
    const memoryTTL = ttl || this.memoryCache.ttl;
    this.memoryCache.set(key, data, { ttl: memoryTTL });

    // Set in persistent cache (L2) if enabled
    if (this.persistentCache) {
      const persistentTTL = ttl || this.config.persistent.ttl || 86400000;
      try {
        await this.persistentCache.set(key, data, persistentTTL);
      } catch (error) {
        debug(`Failed to set persistent cache for key ${key}: ${error.message}`);
        // Don't throw - persistent cache failures shouldn't break the application
      }
    }
  }

  /**
   * Retrieve data from cache tiers (L1 first, then L2).
   * @param {string} key - Cache key
   * @returns {Promise<*>} Cached data or null if not found
   */
  async get(key) {
    // Check L1 (memory) first
    const memoryData = this.memoryCache.get(key);
    if (memoryData !== undefined) {
      debug(`Cache hit (L1/memory) for key: ${key}`);
      return memoryData;
    }

    debug(`Cache miss (L1/memory) for key: ${key}`);

    // Check L2 (persistent) if enabled
    if (this.persistentCache) {
      try {
        const persistentData = await this.persistentCache.get(key);
        if (persistentData !== null) {
          debug(`Cache hit (L2/persistent) for key: ${key}`);

          // Promote to L1 cache
          this.memoryCache.set(key, persistentData);
          debug(`Promoted key ${key} from L2 to L1 cache`);

          return persistentData;
        }
      } catch (error) {
        debug(`Failed to get from persistent cache for key ${key}: ${error.message}`);
      }
    }

    debug(`Cache miss (all tiers) for key: ${key}`);
    return null;
  }

  /**
   * Check if a key exists in any cache tier.
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists in any tier
   */
  async has(key) {
    // Check L1 first
    if (this.memoryCache.has(key)) {
      return true;
    }

    // Check L2 if enabled
    if (this.persistentCache) {
      try {
        return await this.persistentCache.has(key);
      } catch (error) {
        debug(`Failed to check persistent cache for key ${key}: ${error.message}`);
      }
    }

    return false;
  }

  /**
   * Remove a key from all cache tiers.
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key was removed from any tier
   */
  async delete(key) {
    debug(`Deleting cache entry for key: ${key}`);

    let deleted = false;

    // Delete from L1
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
      deleted = true;
    }

    // Delete from L2 if enabled
    if (this.persistentCache) {
      try {
        const persistentDeleted = await this.persistentCache.delete(key);
        deleted = deleted || persistentDeleted;
      } catch (error) {
        debug(`Failed to delete from persistent cache for key ${key}: ${error.message}`);
      }
    }

    return deleted;
  }

  /**
   * Clear all cache tiers.
   * @returns {Promise<void>} Promise that resolves when all caches are cleared
   */
  async clear() {
    debug('Clearing all cache tiers');

    // Clear L1
    this.memoryCache.clear();

    // Clear L2 if enabled
    if (this.persistentCache) {
      try {
        await this.persistentCache.clear();
      } catch (error) {
        debug(`Failed to clear persistent cache: ${error.message}`);
      }
    }
  }

  /**
   * Get comprehensive cache statistics.
   * @returns {Promise<Object>} Cache statistics for all tiers
   */
  async getStats() {
    const stats = {
      memory: {
        size: this.memoryCache.size,
        maxSize: this.memoryCache.max,
        calculatedSize: this.memoryCache.calculatedSize || 0,
        ttl: this.memoryCache.ttl,
        itemCount: this.memoryCache.size,
      },
      persistent: {
        enabled: !!this.persistentCache,
      },
    };

    if (this.persistentCache) {
      try {
        stats.persistent = {
          ...stats.persistent,
          ...(await this.persistentCache.getStats()),
        };
      } catch (error) {
        debug(`Failed to get persistent cache stats: ${error.message}`);
        stats.persistent.error = error.message;
      }
    }

    return stats;
  }

  /**
   * Get the current configuration.
   * @returns {Object} Current cache configuration
   */
  getConfig() {
    return {
      ...this.config,
      memory: {
        maxSize: this.memoryCache.max,
        ttl: this.memoryCache.ttl,
      },
    };
  }
}

module.exports = CacheManager;
