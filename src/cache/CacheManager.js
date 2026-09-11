'use strict';
const { LRUCache } = require('lru-cache');
const PersistentCache = require('./PersistentCache');
const debug = require('debug')('variant-linker:cache-manager');
/** @typedef {{memory?: {maxSize?: number, ttl?: number}, persistent?: import('./PersistentCache').PersistentConfig}} CacheConfig */
/** Two-tier cache with fixed expirations; reads never extend source TTL. */
class CacheManager {
  /** @param {CacheConfig} [config] */
  constructor(config = {}) {
    this.config = config;
    /** @type {LRUCache<string, {}>} */
    this.memoryCache = new LRUCache({
      max: config.memory?.maxSize || 100,
      ttl: config.memory?.ttl ?? 300000,
      allowStale: false,
      updateAgeOnGet: false,
    });
    /** @type {PersistentCache | null} */
    this.persistentCache = null;
    if (config.persistent?.enabled) {
      try {
        const persistent = new PersistentCache(config.persistent);
        if (!persistent.disabled) this.persistentCache = persistent;
      } catch (error) {
        debug(
          'Persistent cache disabled: %s',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }
  /** @param {string} key @param {unknown} data @param {number} [ttl] */
  async set(key, data, ttl) {
    if (data === null || data === undefined) return;
    if (ttl !== undefined && ttl <= 0) {
      await this.delete(key);
      return;
    }
    this.memoryCache.set(key, data, { ttl: ttl ?? this.memoryCache.ttl });
    if (this.persistentCache)
      await this.persistentCache.set(key, data, ttl ?? this.config.persistent?.ttl ?? 86400000);
  }
  /** @param {string} key @returns {Promise<unknown>} */
  async get(key) {
    const memory = this.memoryCache.get(key);
    if (memory !== undefined) return memory;
    if (!this.persistentCache) return null;
    const entry = await this.persistentCache.getEntry(key);
    if (!entry || entry.data === null || entry.data === undefined) return null;
    const ttl = Math.min(this.memoryCache.ttl || Infinity, entry.expiresAt - Date.now());
    if (ttl <= 0) return null;
    this.memoryCache.set(key, entry.data, { ttl });
    return entry.data;
  }
  /** @param {string} key */
  async has(key) {
    return (
      this.memoryCache.has(key) || (this.persistentCache ? this.persistentCache.has(key) : false)
    );
  }
  /** @param {string} key */
  async delete(key) {
    const memoryDeleted = this.memoryCache.delete(key);
    const diskDeleted = this.persistentCache ? await this.persistentCache.delete(key) : false;
    return memoryDeleted || diskDeleted;
  }
  async clear() {
    this.memoryCache.clear();
    if (this.persistentCache) await this.persistentCache.clear();
  }
  async getStats() {
    return {
      memory: {
        size: this.memoryCache.size,
        maxSize: this.memoryCache.max,
        calculatedSize: this.memoryCache.calculatedSize || 0,
        ttl: this.memoryCache.ttl,
        itemCount: this.memoryCache.size,
      },
      persistent: {
        enabled: !!this.persistentCache,
        ...(this.persistentCache ? await this.persistentCache.getStats() : {}),
      },
    };
  }
  getConfig() {
    return { ...this.config, memory: { maxSize: this.memoryCache.max, ttl: this.memoryCache.ttl } };
  }
}
module.exports = CacheManager;
