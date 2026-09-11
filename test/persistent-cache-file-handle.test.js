'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sinon = require('sinon');
const PersistentCache = require('../src/cache/PersistentCache');

describe('Persistent cache file identity', () => {
  let directory;
  let cache;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-cache-handle-'));
    cache = new PersistentCache({ location: directory });
    await cache.set('key', { value: 'original' });
  });
  afterEach(async () => {
    sinon.restore();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('never reads a replacement pathname after checking the original entry', async () => {
    const filename = cache._getFilePath('key');
    const replacement = path.join(cache.cacheDir, 'replacement.tmp');
    const entry = JSON.parse(await fs.readFile(filename, 'utf8'));
    entry.data.value = 'replacement';
    await fs.writeFile(replacement, JSON.stringify(entry));
    const lstat = fs.lstat.bind(fs);
    let replaced = false;
    sinon.stub(fs, 'lstat').callsFake(async (...args) => {
      const info = await lstat(...args);
      if (args[0] === filename && !replaced) {
        replaced = true;
        await fs.rename(replacement, filename);
      }
      return info;
    });
    const result = await cache.get('key');
    assert.equal(replaced, true);
    assert.ok(result === null || result.value === 'original', 'A replacement entry was consumed');
  });

  it('closes the opened descriptor when cached JSON is invalid', async () => {
    await fs.writeFile(cache._getFilePath('key'), '{invalid');
    const open = fs.open.bind(fs);
    const handles = [];
    sinon.stub(fs, 'open').callsFake(async (...args) => {
      const handle = await open(...args);
      handles.push(handle);
      return handle;
    });
    assert.equal(await cache.get('key'), null);
    assert.equal(handles.length, 1, 'Expected one descriptor-based read');
    assert.equal(handles[0].fd, -1, 'Invalid entries must not leak file descriptors');
  });

  it('rejects symbolic-link metadata before reading the opened descriptor', async () => {
    const open = fs.open.bind(fs);
    let opened;
    let read;
    sinon.stub(fs, 'open').callsFake(async (...args) => {
      opened = await open(...args);
      read = sinon.spy(opened, 'readFile');
      return opened;
    });
    const lstat = fs.lstat.bind(fs);
    sinon.stub(fs, 'lstat').callsFake(async (...args) => {
      const info = await lstat(...args);
      sinon.stub(info, 'isSymbolicLink').returns(true);
      return info;
    });
    assert.equal(await cache.get('key'), null);
    assert.equal(read.callCount, 0);
    assert.equal(opened.fd, -1);
  });
});
