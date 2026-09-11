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
    this.maintenanceErrors = 0;
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
    /** @type {import('fs/promises').FileHandle | undefined} */
    let handle;
    try {
      const flags =
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
      handle = await fs.promises.open(filePath, flags);
      const info = await handle.stat({ bigint: true });
      if (!info.isFile()) return null;
      // Windows lacks O_NOFOLLOW: reject symlinks and verify the pathname still names
      // the opened descriptor. Subsequent reads use only that descriptor, never the path.
      const pathname = await fs.promises.lstat(filePath, { bigint: true });
      // Windows lstat reports device zero even when descriptor stat reports the volume ID.
      if (
        pathname.isSymbolicLink() ||
        !pathname.isFile() ||
        (pathname.dev !== 0n && info.dev !== pathname.dev) ||
        info.ino !== pathname.ino ||
        (!fs.constants.O_NOFOLLOW && info.ino === 0n)
      )
        return null;
      const entry = JSON.parse(await handle.readFile('utf8'));
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
    } finally {
      await handle?.close().catch(() => {});
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
        const generation = await this._readGeneration();
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

  /** Collect a complete candidate before changing shared index state. */
  async _collectIndex() {
    this.state.scans++;
    /** @type {Map<string, IndexEntry>} */
    const index = new Map();
    let totalBytes = 0;
    for (const name of await fs.promises.readdir(this.cacheDir)) {
      if (!OWNED.test(name)) continue;
      const filePath = path.join(this.cacheDir, name);
      const entry = await this._readCacheFile(filePath);
      if (!entry) continue;
      const info = await fs.promises.stat(filePath);
      index.set(name, {
        bytes: info.size,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
      });
      totalBytes += info.size;
    }
    // Rebuild creation order once when another process changed the directory.
    return {
      index: new Map([...index].sort((a, b) => a[1].createdAt - b[1].createdAt)),
      totalBytes,
    };
  }

  async _scan() {
    const snapshot = await this._collectIndex();
    this.state.index = snapshot.index;
    this.state.totalBytes = snapshot.totalBytes;
  }

  async _readGeneration() {
    try {
      return await fs.promises.readFile(path.join(this.cacheDir, '.generation'), 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return '';
      throw error;
    }
  }

  async _assertNoMutation() {
    try {
      await fs.promises.lstat(path.join(this.cacheDir, '.lock'));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
      throw error;
    }
    throw new Error('Cache mutation in progress; statistics snapshot was not refreshed');
  }

  /** Read-only refresh: never create a lock or publish a mutation generation.
   * Bracket the scan with lock checks followed by generation reads. A writer
   * overlapping the scan either retains its lock or changes that generation.
   */
  _refreshStatistics() {
    const run = this.state.queue.then(async () => {
      await this._assertNoMutation();
      const generation = await this._readGeneration();
      if (generation && generation === this.state.generation) return;
      const snapshot = await this._collectIndex();
      await this._assertNoMutation();
      if (generation !== (await this._readGeneration()))
        throw new Error('Cache changed during statistics refresh; retaining the last snapshot');
      this.state.index = snapshot.index;
      this.state.totalBytes = snapshot.totalBytes;
      this.state.generation = generation;
    });
    this.state.queue = run.catch(() => {});
    return run;
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
  /** Keep optional cache maintenance failures observable without failing annotation work.
   * @param {string} operation @param {unknown} error @returns {string}
   */
  _recordMaintenanceError(operation, error) {
    this.maintenanceErrors++;
    const message = error instanceof Error ? error.message : String(error);
    debug('Persistent cache %s failed: %s', operation, message);
    return message;
  }
  /** @param {string} key @returns {Promise<boolean>} False when absent or deletion fails. */
  async delete(key) {
    if (this.disabled) return false;
    return this._exclusive(async () => {
      if (!(await this._readCacheFile(this._getFilePath(key)))) return false;
      await this._removeOwned(this._getFilename(key));
      return true;
    }).catch((error) => {
      this._recordMaintenanceError('delete', error);
      return false;
    });
  }
  /** Best-effort clear; failures are counted in maintenanceErrors. */
  async clear() {
    if (this.disabled) return;
    await this._exclusive(async () => {
      for (const name of [...this.state.index.keys()]) await this._removeOwned(name);
    }).catch((error) => {
      this._recordMaintenanceError('clear', error);
    });
  }
  async _cleanupExpired() {
    if (this.disabled) return;
    await this._exclusive(async () => {
      for (const [name, entry] of this.state.index) {
        if (entry.expiresAt <= Date.now()) await this._removeOwned(name);
      }
    }).catch((error) => {
      this._recordMaintenanceError('expiry cleanup', error);
    });
  }
  /** Return the last indexed snapshot with an explicit error if refresh fails. */
  async getStats() {
    /** @type {string | undefined} */
    let refreshError;
    if (!this.disabled) {
      await this._refreshStatistics().catch((error) => {
        refreshError = this._recordMaintenanceError('statistics refresh', error);
      });
    }
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
      maintenanceErrors: this.maintenanceErrors,
      rejectedEntries: this.rejectedEntries,
      maintenanceScans: this.state.scans,
      ...(refreshError ? { error: refreshError } : {}),
    };
  }
}
module.exports = PersistentCache;
