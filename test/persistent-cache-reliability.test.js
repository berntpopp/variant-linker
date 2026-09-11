'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const PersistentCache = require('../src/cache/PersistentCache');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

describe('Persistent cache disk contracts', function () {
  this.timeout(30000);
  let directory;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-cache-'));
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves unrelated and malformed JSON through cleanup and clear', async () => {
    const cache = new PersistentCache({ location: directory });
    await fs.writeFile(path.join(directory, 'project.json'), '{broken');
    await fs.writeFile(path.join(cache.cacheDir, 'unrelated.json'), '{}');
    await cache.set('owned', { value: 1 });
    await cache._cleanupExpired();
    await cache.clear();
    assert.equal(await fs.readFile(path.join(directory, 'project.json'), 'utf8'), '{broken');
    assert.equal(await fs.readFile(path.join(cache.cacheDir, 'unrelated.json'), 'utf8'), '{}');
  });

  it('enforces the actual 1KB byte budget and rejects oversized entries', async () => {
    const cache = new PersistentCache({ location: directory, maxSize: '1KB' });
    for (let i = 0; i < 8; i++) await cache.set(`key-${i}`, 'x'.repeat(200));
    const files = await fs.readdir(cache.cacheDir);
    const sizes = await Promise.all(
      files.map(async (name) => (await fs.stat(path.join(cache.cacheDir, name))).size)
    );
    assert(sizes.reduce((sum, size) => sum + size, 0) <= 1024);
    await cache.set('oversized', 'y'.repeat(2048));
    assert.equal(await cache.get('oversized'), null);
    assert.equal(await cache.get('key-7'), 'x'.repeat(200));
  });

  it('expires data and promotes no stale entries', async () => {
    const cache = new PersistentCache({ location: directory });
    await cache.set('expired', 'data', -1);
    assert.equal(await cache.get('expired'), null);
    assert.equal(await cache.has('expired'), false);
  });

  it('publishes complete entries from concurrent cache instances without shared temps', async () => {
    const first = new PersistentCache({ location: directory });
    const second = new PersistentCache({ location: directory });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? first : second).set('shared', { i, data: 'x'.repeat(100) })
      )
    );
    const result = await new PersistentCache({ location: directory }).get('shared');
    assert.equal(typeof result.i, 'number');
    assert.equal(result.data, 'x'.repeat(100));
    assert(!(await fs.readdir(first.cacheDir)).some((name) => name.endsWith('.tmp')));
    assert.equal((await first.getStats()).writeErrors, 0);
  });

  it('amortizes maintenance instead of scanning once per write', async () => {
    const cache = new PersistentCache({ location: directory });
    for (let i = 0; i < 30; i++) await cache.set(`key-${i}`, i);
    const stats = await cache.getStats();
    assert(stats.maintenanceScans <= 2, `Unexpected scans: ${stats.maintenanceScans}`);
    assert.equal(stats.validEntries, 30);
  });

  it('coordinates byte budgets and atomic publication across separate Node workers', async () => {
    const worker = `const Cache = require(process.argv[1]);
      const cache = new Cache({location:process.argv[2], maxSize:'1KB'});
      (async () => { for(let i=0;i<4;i++) await cache.set(process.argv[3]+i,{data:'x'.repeat(150)});
      if((await cache.getStats()).writeErrors) process.exitCode=1; })().catch(error=>{console.error(error);process.exitCode=1;});`;
    await Promise.all(
      ['first', 'second'].map((name) =>
        promisify(execFile)(process.execPath, [
          '-e',
          worker,
          require.resolve('../src/cache/PersistentCache'),
          directory,
          name,
        ])
      )
    );
    const cache = new PersistentCache({ location: directory, maxSize: '1KB' });
    const files = await fs.readdir(cache.cacheDir);
    const sizes = await Promise.all(
      files.map(async (name) => (await fs.stat(path.join(cache.cacheDir, name))).size)
    );
    assert(sizes.reduce((sum, size) => sum + size, 0) <= 1024);
    for (const name of files.filter((name) => name.endsWith('.json'))) {
      assert.equal(
        JSON.parse(await fs.readFile(path.join(cache.cacheDir, name), 'utf8')).data.data,
        'x'.repeat(150)
      );
    }
  });
});
