'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sinon = require('sinon');
const axios = require('axios');
const { fetchApi, parseProxyConfig } = require('../src/apiHelper');
const cache = require('../src/cache');
const PersistentCache = require('../src/cache/PersistentCache');
const vep = require('../src/vepRegionsAnnotation');
const recoder = require('../src/variantRecoderPost');

describe('API reliability contracts', () => {
  afterEach(async () => {
    sinon.restore();
    cache.getCacheManager().persistentCache = null;
    await cache.clearCacheAsync();
  });

  it('keeps all 201 corresponding VEP inputs across cached POST chunks', async () => {
    const inputs = Array.from({ length: 201 }, (_, i) => `1 ${100 + i} . A C . . .`);
    const transport = sinon.stub(axios, 'post').callsFake(async (_url, body) => ({
      status: 200,
      data: body.variants.map((input) => ({ input })),
    }));
    const result = await vep(inputs, {}, true);
    assert.deepEqual(
      result.map((item) => item.input),
      inputs
    );
    assert.equal(transport.callCount, 2);
  });

  it('normalizes object ordering without confusing methods, bodies or assembly', async () => {
    const get = sinon.stub(axios, 'get').resolves({ data: 'GET' });
    const post = sinon.stub(axios, 'post').callsFake(async (_url, body) => ({ data: body.value }));
    assert.equal(await fetchApi('/identity', { b: 2, a: 1 }, true), 'GET');
    assert.equal(await fetchApi('/identity', { a: 1, b: 2 }, true), 'GET');
    assert.equal(get.callCount, 1);
    assert.equal(await fetchApi('/identity', {}, true, 'POST', { value: 'one' }), 'one');
    assert.equal(await fetchApi('/identity', {}, true, 'POST', { value: 'two' }), 'two');
    await fetchApi('/identity', {}, true, 'POST', { value: 'two' }, null, { assembly: 'hg19' });
    assert.equal(post.callCount, 3);
    assert.match(post.lastCall.args[0], /grch37/);
  });

  it('does not mutate caller query options and sets bounded transport controls', async () => {
    const transport = sinon.stub(axios, 'get').resolves({ data: [] });
    const options = Object.freeze({ 'content-type': 'application/json', a: 1 });
    const controller = new AbortController();
    await fetchApi('/context', options, false, 'GET', null, null, {
      baseUrl: 'https://example.test',
      timeoutMs: 125,
      signal: controller.signal,
    });
    const [url, config] = transport.firstCall.args;
    assert.equal(url, 'https://example.test/context?a=1');
    assert.equal(config.timeout, 125);
    assert(config.signal instanceof AbortSignal);
    assert(config.maxContentLength > 0);
  });

  it('rejects already cancelled requests before transport and never retries cancellation', async () => {
    const transport = sinon.stub(axios, 'get').resolves({ data: [] });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      fetchApi('/cancel', {}, false, 'GET', null, null, {
        signal: controller.signal,
      }),
      /abort|cancel/i
    );
    assert.equal(transport.callCount, 0);
  });

  it('aborts stalled transport within the overall deadline', async () => {
    sinon.stub(axios, 'get').callsFake(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal.reason));
        })
    );
    await assert.rejects(
      fetchApi('/stall', {}, false, 'GET', null, null, {
        timeoutMs: 25,
        deadlineMs: 50,
      }),
      /deadline|timeout/i
    );
  });

  it('reads persistent entries after L1 eviction', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-api-'));
    try {
      const manager = cache.getCacheManager();
      manager.persistentCache = new PersistentCache({ location: directory });
      const transport = sinon.stub(axios, 'get').resolves({ data: { disk: true } });
      await fetchApi('/disk', {}, true);
      manager.memoryCache.clear();
      assert.deepEqual(await fetchApi('/disk', {}, true), { disk: true });
      assert.equal(transport.callCount, 1);
    } finally {
      cache.getCacheManager().persistentCache = null;
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps recoder chunk diagnostics off stdout', async () => {
    sinon
      .stub(axios, 'post')
      .callsFake(async (_url, body) => ({ data: body.ids.map((input) => ({ input })) }));
    const output = sinon.spy(console, 'log');
    const inputs = Array.from({ length: 201 }, (_, i) => `rs${i}`);
    assert.deepEqual(
      (await recoder(inputs)).map((entry) => entry.input),
      inputs
    );
    assert.equal(output.callCount, 0);
  });

  it('never repeats proxy credentials in invalid URL errors', () => {
    assert.throws(
      () => parseProxyConfig('http://user:secret@bad host'),
      (error) => {
        assert(!error.message.includes('secret'));
        return true;
      }
    );
  });

  it('caps Retry-After and retries transient statuses with the original body', async () => {
    const transport = sinon.stub(axios, 'post');
    transport.onFirstCall().rejects(
      Object.assign(new Error('busy'), {
        response: { status: 429, headers: { 'retry-after': '999999' } },
      })
    );
    transport.onSecondCall().resolves({ data: { ok: true } });
    assert.deepEqual(
      await fetchApi('/retry', {}, false, 'POST', { id: 1 }, null, {
        maxRetryDelayMs: 5,
        deadlineMs: 500,
      }),
      { ok: true }
    );
    assert.equal(transport.callCount, 2);
    assert.deepEqual(transport.secondCall.args[1], { id: 1 });
  });

  it('cancels during retry backoff without making a second request', async () => {
    const transport = sinon
      .stub(axios, 'get')
      .rejects(Object.assign(new Error('busy'), { response: { status: 503 } }));
    const controller = new AbortController();
    const pending = fetchApi('/retry-cancel', {}, false, 'GET', null, null, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, /abort/i);
    assert.equal(transport.callCount, 1);
  });

  it('does not retry unknown transport errors or exhausted attempts', async () => {
    const transport = sinon
      .stub(axios, 'get')
      .rejects(Object.assign(new Error('invalid'), { code: 'ERR_BAD_OPTION' }));
    await assert.rejects(fetchApi('/invalid'), /invalid/);
    assert.equal(transport.callCount, 1);
    transport.resetHistory();
    transport.rejects(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
    await assert.rejects(
      fetchApi('/reset', {}, false, 'GET', null, null, { maxRetries: 1, maxRetryDelayMs: 1 }),
      /reset/
    );
    assert.equal(transport.callCount, 2);
  });

  it('rejects invalid finite-budget options before transport', async () => {
    const transport = sinon.stub(axios, 'get');
    for (const options of [{ timeoutMs: 0 }, { deadlineMs: Infinity }, { maxRetries: -1 }]) {
      await assert.rejects(fetchApi('/invalid', {}, false, 'GET', null, null, options), /must be/);
    }
    await assert.rejects(fetchApi('/invalid', {}, false, 'DELETE'), /Unsupported HTTP/);
    assert.equal(transport.callCount, 0);
  });

  it('validates wrapper JSON boundaries', async () => {
    const post = sinon.stub(axios, 'post').resolves({ data: { wrong: true } });
    await assert.rejects(vep(['1 100 . A C . . .']), /array/);
    post.resolves({ data: [null] });
    await assert.rejects(recoder(['rs1']), /objects/);
    sinon.stub(axios, 'get').resolves({ data: [null] });
    await assert.rejects(require('../src/variantRecoder')('rs1'), /objects/);
    await assert.rejects(require('../src/vepHgvsAnnotation')('NC_1:g.100A>C', ''), /objects/);
  });

  it('passes isolated contexts through single-variant wrappers', async () => {
    const transport = sinon.stub(axios, 'get').resolves({ data: [{ input: 'test' }] });
    await require('../src/variantRecoder')('rs1', {}, false, null, { assembly: 'GRCh37' });
    await require('../src/vepHgvsAnnotation')('NC_1:g.100A>C', '', {}, false, {
      assembly: 'GRCh38',
    });
    assert.match(transport.firstCall.args[0], /grch37/);
    assert.match(transport.secondCall.args[0], /^https:\/\/rest.ensembl.org/);
  });
});
