'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sinon = require('sinon');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PersistentCache = require('../src/cache/PersistentCache');

describe('Persistent cache statistics snapshots', function () {
  this.timeout(10000);
  let directory;
  let cache;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-cache-stats-'));
    cache = new PersistentCache({ location: directory });
    await cache.set('first', 'data');
  });
  afterEach(async () => {
    sinon.restore();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('does not invalidate another process when only reading statistics', async () => {
    const generation = path.join(cache.cacheDir, '.generation');
    const before = await fs.readFile(generation, 'utf8');
    const worker = `const Cache=require(process.argv[1]);const cache=new Cache({location:process.argv[2]});
      (async()=>{await cache.getStats();await cache.getStats();console.log(JSON.stringify(await cache.getStats()));})()
      .catch(error=>{console.error(error);process.exitCode=1});`;
    const { stdout } = await promisify(execFile)(process.execPath, [
      '-e',
      worker,
      require.resolve('../src/cache/PersistentCache'),
      directory,
    ]);
    const observed = JSON.parse(stdout);
    assert.equal(observed.totalFiles, 1);
    assert.equal(observed.maintenanceScans, 1);
    assert.equal(
      await fs.readFile(generation, 'utf8'),
      before,
      'Statistics changed the mutation generation'
    );
  });

  it('preserves the last complete index when a changed generation cannot be scanned', async () => {
    const before = await cache.getStats();
    await fs.writeFile(path.join(cache.cacheDir, '.generation'), 'external-change');
    sinon
      .stub(fs, 'readdir')
      .rejects(Object.assign(new Error('directory unavailable'), { code: 'EACCES' }));
    const after = await cache.getStats();
    assert.equal(after.totalFiles, before.totalFiles);
    assert.equal(after.totalSize, before.totalSize);
    assert.match(after.error, /directory unavailable/);
  });

  it('reports an active mutation without waiting for or changing its lock', async () => {
    const before = await cache.getStats();
    const lock = path.join(cache.cacheDir, '.lock');
    await fs.mkdir(lock);
    let timer;
    const stats = await Promise.race([
      cache.getStats(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ error: 'timed out' }), 1000);
      }),
    ]);
    clearTimeout(timer);
    assert.notEqual(stats.error, 'timed out');
    assert.match(stats.error, /mutation in progress/);
    assert.equal(stats.totalFiles, before.totalFiles);
    assert.ok((await fs.stat(lock)).isDirectory());
  });

  it('contains a read permission error and recovers the existing snapshot afterward', async () => {
    const lstat = sinon.stub(fs, 'lstat');
    lstat.callThrough();
    lstat
      .withArgs(path.join(cache.cacheDir, '.lock'))
      .rejects(Object.assign(new Error('EACCES: lock metadata unavailable'), { code: 'EACCES' }));
    const stats = await cache.getStats();
    assert.match(stats.error, /EACCES/);
    assert.equal(stats.validEntries, 1);
    lstat.restore();
    const recovered = await cache.getStats();
    assert.equal(recovered.error, undefined);
    assert.equal(recovered.maintenanceErrors, 1);
  });

  it('rejects a scan crossing a mutation and publishes only the next stable snapshot', async () => {
    const generation = path.join(cache.cacheDir, '.generation');
    const entry = JSON.parse(await fs.readFile(cache._getFilePath('first'), 'utf8'));
    entry.key = 'second';
    await fs.writeFile(cache._getFilePath('second'), JSON.stringify(entry));
    await fs.writeFile(generation, 'external-before-scan');
    const readdir = fs.readdir.bind(fs);
    const stub = sinon.stub(fs, 'readdir').callsFake(async (...args) => {
      const files = await readdir(...args);
      await fs.writeFile(generation, 'external-after-scan');
      return files;
    });
    const failed = await cache.getStats();
    assert.match(failed.error, /changed during statistics refresh/);
    assert.equal(failed.totalFiles, 1);
    stub.restore();
    const refreshed = await cache.getStats();
    assert.equal(refreshed.error, undefined);
    assert.equal(refreshed.totalFiles, 2);
  });
});
