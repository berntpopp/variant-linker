'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sinon = require('sinon');
const debug = require('debug');
const cache = require('../src/cache');
const CacheManager = require('../src/cache/CacheManager');

describe('Cache expiry and diagnostics', () => {
  afterEach(() => {
    sinon.restore();
    debug.disable();
  });
  it('does not print variant-bearing cache identities under ordinary debugging', async () => {
    const output = sinon.stub(debug, 'log');
    debug.enable('variant-linker:cache');
    const secret = 'sensitive-variant-1-100-A-C';
    await cache.setCache(secret, {});
    cache.getCache(secret);
    cache.getCache(`${secret}-miss`);
    assert(!output.getCalls().some((call) => call.args.join(' ').includes(secret)));
  });

  it('does not extend persistent TTL when promoting a disk entry to memory', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-expiry-'));
    try {
      const manager = new CacheManager({
        memory: { ttl: 5000 },
        persistent: { enabled: true, location: directory, ttl: 1000 },
      });
      await manager.set('ttl', 'value');
      manager.memoryCache.clear();
      assert.equal(await manager.get('ttl'), 'value');
      await new Promise((resolve) => {
        setTimeout(resolve, 1050);
      });
      assert.equal(await manager.get('ttl'), null);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
