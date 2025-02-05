// src/cache.js
'use strict';

const defaultTTL = 300000; // default Time-To-Live: 5 minutes

// Use a Map to store cache entries.
const cache = new Map();

/**
 * Stores data in the cache for a given key with an optional TTL.
 * @param {string} key - The key to store the data under (typically the request URL).
 * @param {*} data - The data to cache.
 * @param {number} [ttl=defaultTTL] - Time-to-live in milliseconds.
 */
function setCache(key, data, ttl = defaultTTL) {
  const expiresAt = Date.now() + ttl;
  cache.set(key, { data, expiresAt });
}

/**
 * Retrieves cached data for the given key if it has not expired.
 * @param {string} key - The cache key.
 * @returns {*} The cached data or null if not present or expired.
 */
function getCache(key) {
  const entry = cache.get(key);
  if (entry) {
    if (Date.now() < entry.expiresAt) {
      return entry.data;
    } else {
      cache.delete(key); // expired entry
    }
  }
  return null;
}

/**
 * Clears the entire cache.
 */
function clearCache() {
  cache.clear();
}

module.exports = { setCache, getCache, clearCache };
