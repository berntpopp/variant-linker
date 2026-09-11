'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const apiConfig = require('../config/apiConfig.json');

describe('Persistent cache configured timing', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-cache-config-'));
  });
  afterEach(() => {
    sinon.restore();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function cacheClass() {
    return proxyquire('../src/cache/PersistentCache', {
      '../../config/apiConfig.json': {
        ...apiConfig,
        cache: {
          ...apiConfig.cache,
          persistent: {
            ...apiConfig.cache.persistent,
            lockTimeoutMs: 25,
            lockPollMs: 7,
            cleanupIntervalMs: 50,
          },
        },
      },
    });
  }

  it('honors configured lock polling and the exact finite acquisition budget', async () => {
    const PersistentCache = cacheClass();
    const cache = new PersistentCache({ location: directory });
    const clock = sinon.useFakeTimers();
    const mkdir = sinon
      .stub(fs.promises, 'mkdir')
      .rejects(Object.assign(new Error('busy'), { code: 'EEXIST' }));
    let rejected = false;
    const result = assert
      .rejects(
        cache._exclusive(async () => {}),
        /busy/
      )
      .then(() => {
        rejected = true;
      });
    await clock.tickAsync(24);
    assert.equal(rejected, false);
    assert.equal(mkdir.callCount, 4);
    await clock.tickAsync(1);
    await result;
    assert.equal(mkdir.callCount, 5);
    assert.equal(clock.countTimers(), 0);
  });

  it('schedules cleanup with its configured interval and permits instance overrides', async () => {
    const PersistentCache = cacheClass();
    const cache = new PersistentCache({ location: directory, lockPollMs: 3 });
    const clock = sinon.useFakeTimers({ now: 1000, toFake: ['Date'] });
    await cache.set('first', 'value');
    assert.equal(cache.state.nextCleanup, 1050);
    assert.equal(cache.lockPollMs, 3);
    clock.tick(49);
    await cache.set('second', 'value');
    assert.equal(cache.state.nextCleanup, 1050);
    clock.tick(1);
    await cache.set('third', 'value');
    assert.equal(cache.state.nextCleanup, 1100);
  });

  it('rejects invalid timing values before using the filesystem', () => {
    const PersistentCache = cacheClass();
    for (const [key, value] of [
      ['lockTimeoutMs', 0],
      ['lockPollMs', NaN],
      ['cleanupIntervalMs', Infinity],
    ]) {
      assert.throws(
        () => new PersistentCache({ location: directory, [key]: value }),
        new RegExp(key)
      );
    }
  });
});
