'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const debug = require('debug')('variant-linker:persistent-cache');
/** @typedef {{location?: string, ttl?: number, maxSize?: string, enabled?: boolean}} PersistentConfig */
/** @typedef {{owner: string, key: string, data: unknown, expiresAt: number, createdAt: number}} Entry */
/** @typedef {{bytes: number, expiresAt: number, createdAt: number}} IndexEntry */
/** @typedef {{queue: Promise<unknown>, index: Map<string, IndexEntry>, generation: string,
 * scans: number, totalBytes: number, nextCleanup: number}} DirectoryState */
/** @type {Map<string, DirectoryState>} */
const directories = new Map();
const OWNED = /^vl-[a-f0-9]{64}\.json$/;
const OWNER = 'variant-linker-cache-v1';

/** Persistent JSON cache. Only verified owned entries are eligible for deletion. */
class PersistentCache {
  /** @param {PersistentConfig} [config] */
  constructor(config = {}) {
    this.disabled = typeof window !== 'undefined' || typeof fs.mkdirSync !== 'function';
    this.isBrowser = this.disabled;
    this.defaultTTL = config.ttl ?? 86400000;
    this.maxSize = this._parseSizeString(config.maxSize || '100MB');
    this.cacheDir = '';
    this.writeErrors = 0;
    this.rejectedEntries = 0;
    /** @type {DirectoryState} */
    this.state = {
      queue: Promise.resolve(),
      index: new Map(),
      generation: '',
      scans: 0,
      totalBytes: 0,
      nextCleanup: 0,
    };
    if (this.disabled) return;
    const location = config.location
      ? config.location.replace(/^~(?=[/\\]|$)/, os.homedir())
      : path.join(os.homedir(), '.cache', 'variant-linker');
    this.cacheDir = path.join(path.resolve(location), 'entries-v1');
    this._ensureCacheDir();
    const shared = directories.get(this.cacheDir);
    if (shared) this.state = shared;
    else directories.set(this.cacheDir, this.state);
  }

  /** @param {string} sizeStr @returns {number} */
  _parseSizeString(sizeStr) {
    const match = /^(\d+(?:\.\d+)?)(B|KB|MB|GB)$/i.exec(sizeStr);
    if (!match) throw new Error(`Invalid size string: ${sizeStr}`);
    /** @type {Record<string, number>} */
    const units = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 };
    return Math.floor(Number(match[1]) * units[match[2].toUpperCase()]);
  }

  _ensureCacheDir() {
    fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
  }
  /** @param {string} key */
  _getFilename(key) {
    return `vl-${crypto.createHash('sha256').update(key).digest('hex')}.json`;
  }
  /** @param {string} key */
  _getFilePath(key) {
    return path.join(this.cacheDir, this._getFilename(key));
  }

  /** @param {string} filePath @returns {Promise<Entry | null>} */
  async _readCacheFile(filePath) {
    if (!OWNED.test(path.basename(filePath))) return null;
    try {
      const info = await fs.promises.lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink()) return null;
      const entry = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (
        entry?.owner !== OWNER ||
        typeof entry.key !== 'string' ||
        !Number.isFinite(entry.expiresAt) ||
        !Number.isFinite(entry.createdAt) ||
        !Object.hasOwn(entry, 'data') ||
        path.basename(filePath) !== this._getFilename(entry.key)
      )
        return null;
      return entry;
    } catch {
      return null;
    }
  }

  /** Exclusive lock also coordinates separate Node processes. Never steal a live lock.
   * @template T @param {() => Promise<T>} operation @returns {Promise<T>}
   */
  _exclusive(operation) {
    const run = this.state.queue.then(async () => {
      const lockPath = path.join(this.cacheDir, '.lock');
      const deadline = Date.now() + 10000;
      for (;;) {
        try {
          await fs.promises.mkdir(lockPath);
          break;
        } catch (error) {
          if (
            /** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST' ||
            Date.now() >= deadline
          )
            throw error;
          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });
        }
      }
      try {
        let generation = '';
        try {
          generation = await fs.promises.readFile(path.join(this.cacheDir, '.generation'), 'utf8');
        } catch {
          /* First write. */
        }
        if (!generation || generation !== this.state.generation) await this._scan();
        const result = await operation();
        const nextGeneration = crypto.randomUUID();
        await fs.promises.writeFile(path.join(this.cacheDir, '.generation'), nextGeneration, {
          mode: 0o600,
        });
        this.state.generation = nextGeneration;
        return result;
      } finally {
        await fs.promises.rmdir(lockPath);
      }
    });
    this.state.queue = run.catch(() => {});
    return run;
  }

  async _scan() {
    this.state.scans++;
    this.state.index.clear();
    this.state.totalBytes = 0;
    for (const name of await fs.promises.readdir(this.cacheDir)) {
      if (!OWNED.test(name)) continue;
      const filePath = path.join(this.cacheDir, name);
      const entry = await this._readCacheFile(filePath);
      if (!entry) continue;
      const info = await fs.promises.stat(filePath);
      this.state.index.set(name, {
        bytes: info.size,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
      });
      this.state.totalBytes += info.size;
    }
    // Rebuild creation order once when another process changed the directory.
    this.state.index = new Map(
      [...this.state.index].sort((a, b) => a[1].createdAt - b[1].createdAt)
    );
  }

  /** @param {string} filePath @param {Entry} entry */
  async _writeCacheFile(filePath, entry) {
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(entry), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await fs.promises.rename(temporary, filePath);
    } finally {
      await fs.promises.unlink(temporary).catch(() => {});
    }
  }

  /** @param {string} name */
  async _removeOwned(name) {
    const filePath = path.join(this.cacheDir, name);
    if (await this._readCacheFile(filePath)) await fs.promises.unlink(filePath);
    this.state.totalBytes -= this.state.index.get(name)?.bytes || 0;
    this.state.index.delete(name);
  }

  /** @param {string} key @param {unknown} data @param {number} [ttl] */
  async set(key, data, ttl = this.defaultTTL) {
    if (this.disabled) return;
    const entry = { owner: OWNER, key, data, expiresAt: Date.now() + ttl, createdAt: Date.now() };
    try {
      const bytes = Buffer.byteLength(JSON.stringify(entry));
      // Reserve the generation marker, which is also physically present on disk.
      if (bytes + 36 > this.maxSize || !Number.isFinite(ttl) || ttl <= 0 || data === undefined) {
        this.rejectedEntries++;
        return;
      }
      await this._exclusive(async () => {
        const name = this._getFilename(key);
        if (Date.now() >= this.state.nextCleanup) {
          for (const [existing, metadata] of this.state.index) {
            if (metadata.expiresAt <= Date.now()) await this._removeOwned(existing);
          }
          this.state.nextCleanup = Date.now() + 60000;
        }
        const replacedBytes = this.state.index.get(name)?.bytes || 0;
        for (const existing of this.state.index.keys()) {
          if (36 + this.state.totalBytes - replacedBytes + bytes <= this.maxSize) break;
          if (existing !== name) await this._removeOwned(existing);
        }
        await this._writeCacheFile(this._getFilePath(key), entry);
        this.state.totalBytes += bytes - replacedBytes;
        this.state.index.delete(name);
        this.state.index.set(name, {
          bytes,
          expiresAt: entry.expiresAt,
          createdAt: entry.createdAt,
        });
      });
    } catch (error) {
      this.writeErrors++;
      debug('Persistent write failed: %s', error instanceof Error ? error.message : String(error));
    }
  }

  /** @param {string} key @returns {Promise<Entry | null>} */
  async getEntry(key) {
    if (this.disabled) return null;
    const entry = await this._readCacheFile(this._getFilePath(key));
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry;
  }
  /** @param {string} key @returns {Promise<unknown>} */
  async get(key) {
    return (await this.getEntry(key))?.data ?? null;
  }
  /** @param {string} key */
  async has(key) {
    return (await this.getEntry(key)) !== null;
  }
  /** @param {string} key */
  async delete(key) {
    if (this.disabled) return false;
    return this._exclusive(async () => {
      if (!(await this._readCacheFile(this._getFilePath(key)))) return false;
      await this._removeOwned(this._getFilename(key));
      return true;
    });
  }
  async clear() {
    if (this.disabled) return;
    await this._exclusive(async () => {
      for (const name of [...this.state.index.keys()]) await this._removeOwned(name);
    });
  }
  async _cleanupExpired() {
    if (this.disabled) return;
    await this._exclusive(async () => {
      for (const [name, entry] of this.state.index) {
        if (entry.expiresAt <= Date.now()) await this._removeOwned(name);
      }
    });
  }
  async getStats() {
    if (!this.disabled) await this._exclusive(async () => {});
    let totalSize = 0,
      validEntries = 0,
      expiredEntries = 0;
    for (const entry of this.state.index.values()) {
      totalSize += entry.bytes;
      if (entry.expiresAt > Date.now()) validEntries++;
      else expiredEntries++;
    }
    return {
      location: this.cacheDir,
      totalFiles: this.state.index.size,
      validEntries,
      expiredEntries,
      totalSize,
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      writeErrors: this.writeErrors,
      rejectedEntries: this.rejectedEntries,
      maintenanceScans: this.state.scans,
    };
  }
}
module.exports = PersistentCache;
