// src/cache.js
'use strict';

/**
 * @fileoverview Enhanced cache module with LRU support, configurable size limits,
 * and optional persistent file-based caching. Provides backward compatibility
 * with the existing cache API while adding new capabilities.
 * @module cache
 */

const CacheManager = require('./cache/CacheManager');
const debug = require('debug')('variant-linker:cache');

// Load cache configuration
const apiConfig = require('../config/apiConfig.json');
const cacheConfig = apiConfig.cache || {};

// Initialize the unified cache manager
const cacheManager = new CacheManager(cacheConfig);

/**
 * Stores data in the cache for a given key with an optional TTL.
 * @param {string} key - The key to store the data under (typically the request URL).
 * @param {*} data - The data to cache.
 * @param {number} [ttl] - Time-to-live in milliseconds (uses default if not provided).
 */
function setCache(key, data, ttl) {
  debug(`Setting cache for key: ${key}${ttl ? `, TTL: ${ttl}ms` : ''}`);
  // Use async operation but don't wait for it to maintain backward compatibility
  cacheManager.set(key, data, ttl).catch((error) => {
    debug(`Failed to set cache for key ${key}: ${error.message}`);
  });
}

/**
 * Retrieves cached data for the given key if it has not expired.
 * @param {string} key - The cache key.
 * @returns {*} The cached data or null if not present or expired.
 */
function getCache(key) {
  // For backward compatibility, we need to return synchronously
  // We'll only check the memory cache (L1) in the sync API
  const memoryCache = cacheManager.memoryCache;
  const data = memoryCache.get(key);

  if (data !== undefined) {
    debug(`Cache hit (memory) for key: ${key}`);
    return data;
  }

  debug(`Cache miss (memory) for key: ${key}`);
  return null;
}

/**
 * Async version of getCache that checks both memory and persistent caches.
 * @param {string} key - The cache key.
 * @returns {Promise<*>} The cached data or null if not present or expired.
 */
async function getCacheAsync(key) {
  return await cacheManager.get(key);
}

/**
 * Clears the entire cache (both memory and persistent).
 */
function clearCache() {
  debug('Clearing entire cache');
  cacheManager.clear().catch((error) => {
    debug(`Failed to clear cache: ${error.message}`);
  });
}

/**
 * Async version of clearCache.
 * @returns {Promise<void>} Promise that resolves when cache is cleared
 */
async function clearCacheAsync() {
  await cacheManager.clear();
}

/**
 * Returns cache statistics for monitoring and debugging.
 * @returns {Object} Cache statistics including size, hit rate, etc.
 */
function getCacheStats() {
  // Return memory cache stats for backward compatibility
  const memoryCache = cacheManager.memoryCache;
  return {
    size: memoryCache.size,
    maxSize: memoryCache.max,
    calculatedSize: memoryCache.calculatedSize || 0,
    ttl: memoryCache.ttl,
    itemCount: memoryCache.size,
  };
}

/**
 * Returns comprehensive cache statistics for all tiers.
 * @returns {Promise<Object>} Comprehensive cache statistics
 */
async function getComprehensiveCacheStats() {
  return await cacheManager.getStats();
}

/**
 * Checks if a key exists in the memory cache (without affecting LRU order).
 * @param {string} key - The cache key to check.
 * @returns {boolean} True if the key exists in memory cache and is not expired.
 */
function hasCache(key) {
  return cacheManager.memoryCache.has(key);
}

/**
 * Async version of hasCache that checks both memory and persistent caches.
 * @param {string} key - The cache key to check.
 * @returns {Promise<boolean>} True if the key exists in any cache tier.
 */
async function hasCacheAsync(key) {
  return await cacheManager.has(key);
}

/**
 * Get the cache manager instance for advanced operations.
 * @returns {CacheManager} The cache manager instance
 */
function getCacheManager() {
  return cacheManager;
}

// Backward compatible exports
module.exports = {
  setCache,
  getCache,
  clearCache,
  getCacheStats,
  hasCache,
  // New async APIs
  getCacheAsync,
  clearCacheAsync,
  getComprehensiveCacheStats,
  hasCacheAsync,
  getCacheManager,
};
