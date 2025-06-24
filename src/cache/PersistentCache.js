// src/cache/PersistentCache.js
'use strict';

/**
 * @fileoverview Persistent file-based cache implementation with TTL support
 * and atomic write operations for data integrity.
 * @module cache/PersistentCache
 */

// Browser environment detection and graceful fallbacks
let fs;
let path;
let crypto;
let os;
try {
  fs = require('fs');
  path = require('path');
  crypto = require('crypto');
  os = require('os');
} catch (e) {
  // Browser environment - modules will be null/undefined
}
const debug = require('debug')('variant-linker:persistent-cache');

/**
 * Persistent cache that stores data in JSON files on disk.
 * Provides TTL support and atomic write operations for data integrity.
 */
class PersistentCache {
  /**
   * Create a new PersistentCache instance.
   * @param {Object} config - Cache configuration
   * @param {string} [config.location] - Cache directory path
   * @param {number} [config.ttl] - Default TTL in milliseconds
   * @param {string} [config.maxSize] - Maximum cache size (e.g., "100MB")
   */
  constructor(config = {}) {
    // Detect browser environment and disable persistent cache
    this.isBrowser = typeof window !== 'undefined' || !fs || !path || !crypto || !os;

    if (this.isBrowser) {
      debug('Browser environment detected - persistent cache disabled');
      this.disabled = true;
      return;
    }

    this.defaultTTL = config.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    this.maxSize = this._parseSizeString(config.maxSize || '100MB');

    // Determine cache directory
    if (config.location) {
      this.cacheDir = path.resolve(config.location.replace('~', os.homedir()));
    } else {
      this.cacheDir = path.join(os.homedir(), '.cache', 'variant-linker');
    }

    // Ensure cache directory exists
    this._ensureCacheDir();

    debug(`Persistent cache initialized at: ${this.cacheDir}`);
    debug(`Max size: ${this.maxSize} bytes, Default TTL: ${this.defaultTTL}ms`);
  }

  /**
   * Parse size string (e.g., "100MB") to bytes.
   * @param {string} sizeStr - Size string
   * @returns {number} Size in bytes
   * @private
   */
  _parseSizeString(sizeStr) {
    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB)$/i);
    if (!match) {
      throw new Error(`Invalid size string: ${sizeStr}`);
    }

    const [, size, unit] = match;
    return Math.floor(parseFloat(size) * units[unit.toUpperCase()]);
  }

  /**
   * Ensure cache directory exists.
   * @private
   */
  _ensureCacheDir() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        debug(`Created cache directory: ${this.cacheDir}`);
      }
    } catch (error) {
      debug(`Failed to create cache directory: ${error.message}`);
      throw new Error(`Cannot create cache directory: ${error.message}`);
    }
  }

  /**
   * Generate a safe filename from a cache key.
   * @param {string} key - Cache key
   * @returns {string} Safe filename
   * @private
   */
  _getFilename(key) {
    // Create a hash of the key to avoid filesystem issues
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return `${hash}.json`;
  }

  /**
   * Get full file path for a cache key.
   * @param {string} key - Cache key
   * @returns {string} Full file path
   * @private
   */
  _getFilePath(key) {
    return path.join(this.cacheDir, this._getFilename(key));
  }

  /**
   * Read and parse cache entry from file.
   * @param {string} filePath - File path
   * @returns {Object|null} Cache entry or null if not valid
   * @private
   */
  _readCacheFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const entry = JSON.parse(content);

      // Validate entry structure
      if (!entry || typeof entry.expiresAt !== 'number' || !entry.hasOwnProperty('data')) {
        debug(`Invalid cache entry structure in ${filePath}`);
        return null;
      }

      return entry;
    } catch (error) {
      debug(`Failed to read cache file ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Write cache entry to file atomically.
   * @param {string} filePath - File path
   * @param {Object} entry - Cache entry
   * @private
   */
  _writeCacheFile(filePath, entry) {
    const tempPath = `${filePath}.tmp`;

    try {
      // Write to temporary file first
      fs.writeFileSync(tempPath, JSON.stringify(entry), 'utf8');

      // Atomic move to final location
      fs.renameSync(tempPath, filePath);

      debug(`Cache entry written to ${filePath}`);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        debug(`Failed to cleanup temp file: ${cleanupError.message}`);
      }

      debug(`Failed to write cache file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store data in persistent cache.
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} [ttl] - Time-to-live in milliseconds
   * @returns {Promise<void>} Promise that resolves when data is stored
   */
  async set(key, data, ttl = this.defaultTTL) {
    const filePath = this._getFilePath(key);
    const expiresAt = Date.now() + ttl;

    const entry = {
      key,
      data,
      expiresAt,
      createdAt: Date.now(),
    };

    try {
      this._writeCacheFile(filePath, entry);
      debug(`Set cache entry for key: ${key}, expires: ${new Date(expiresAt).toISOString()}`);

      // Background cleanup of expired entries
      setImmediate(() => this._cleanupExpired());
    } catch (error) {
      debug(`Failed to set cache entry for key ${key}: ${error.message}`);
      // Don't throw - persistent cache failures shouldn't break the application
    }
  }

  /**
   * Retrieve data from persistent cache.
   * @param {string} key - Cache key
   * @returns {Promise<*>} Cached data or null if not found/expired
   */
  async get(key) {
    const filePath = this._getFilePath(key);

    try {
      if (!fs.existsSync(filePath)) {
        debug(`Cache miss: file not found for key ${key}`);
        return null;
      }

      const entry = this._readCacheFile(filePath);
      if (!entry) {
        debug(`Cache miss: invalid entry for key ${key}`);
        return null;
      }

      // Check if expired
      if (Date.now() >= entry.expiresAt) {
        debug(`Cache miss: expired entry for key ${key}`);
        // Delete expired file
        try {
          fs.unlinkSync(filePath);
        } catch (deleteError) {
          debug(`Failed to delete expired cache file: ${deleteError.message}`);
        }
        return null;
      }

      debug(`Cache hit for key: ${key}`);
      return entry.data;
    } catch (error) {
      debug(`Failed to get cache entry for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a key exists in cache and is not expired.
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists and is valid
   */
  async has(key) {
    const data = await this.get(key);
    return data !== null;
  }

  /**
   * Remove a specific cache entry.
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if entry was removed
   */
  async delete(key) {
    const filePath = this._getFilePath(key);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        debug(`Deleted cache entry for key: ${key}`);
        return true;
      }
      return false;
    } catch (error) {
      debug(`Failed to delete cache entry for key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all cache entries.
   * @returns {Promise<void>} Promise that resolves when all entries are cleared
   */
  async clear() {
    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            debug(`Failed to delete cache file ${file}: ${error.message}`);
          }
        }
      }

      debug('Cleared all cache entries');
    } catch (error) {
      debug(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Clean up expired cache entries.
   * @private
   */
  _cleanupExpired() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const entry = this._readCacheFile(filePath);

        if (!entry || now >= entry.expiresAt) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            debug(`Failed to delete expired file ${file}: ${error.message}`);
          }
        }
      }

      if (deletedCount > 0) {
        debug(`Cleaned up ${deletedCount} expired cache entries`);
      }
    } catch (error) {
      debug(`Failed to cleanup expired entries: ${error.message}`);
    }
  }

  /**
   * Get cache statistics.
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      let validEntries = 0;
      let expiredEntries = 0;
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;

        const entry = this._readCacheFile(filePath);
        if (entry) {
          if (now < entry.expiresAt) {
            validEntries++;
          } else {
            expiredEntries++;
          }
        }
      }

      return {
        location: this.cacheDir,
        totalFiles: files.filter((f) => f.endsWith('.json')).length,
        validEntries,
        expiredEntries,
        totalSize,
        maxSize: this.maxSize,
        defaultTTL: this.defaultTTL,
      };
    } catch (error) {
      debug(`Failed to get cache stats: ${error.message}`);
      return {
        location: this.cacheDir,
        totalFiles: 0,
        validEntries: 0,
        expiredEntries: 0,
        totalSize: 0,
        maxSize: this.maxSize,
        defaultTTL: this.defaultTTL,
      };
    }
  }
}

module.exports = PersistentCache;
