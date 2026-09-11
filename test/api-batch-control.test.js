'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const { orderedChunks } = require('../src/api/orderedChunks');
const { createOriginScheduler } = require('../src/api/originScheduler');
const { delay } = require('../src/api/requestContext');
const proxyquire = require('proxyquire').noCallThru();
const axios = require('axios').default;

describe('Bounded ordered POST workers', () => {
  afterEach(() => sinon.restore());
  it('keeps 1000 inputs in five <=200 batches and restores order after out-of-order completion', async () => {
    const clock = sinon.useFakeTimers();
    const inputs = Array.from({ length: 1000 }, (_, index) => index);
    let active = 0;
    let peak = 0;
    const sizes = [];
    const completed = [];
    const result = orderedChunks(
      inputs,
      async (chunk, index, signal) => {
        sizes.push(chunk.length);
        peak = Math.max(peak, ++active);
        await delay(index === 0 ? 50 : 10, signal);
        active--;
        completed.push(index);
        return chunk;
      },
      { concurrency: 2 }
    );
    await clock.runAllAsync();
    assert.deepEqual(await result, inputs);
    assert.deepEqual(sizes, [200, 200, 200, 200, 200]);
    assert.equal(peak, 2);
    assert.equal(completed[0], 1);
  });

  it('defaults to serial execution and preserves duplicates', async () => {
    const starts = [];
    assert.deepEqual(
      await orderedChunks(
        ['a', 'a', 'b'],
        async (chunk, index) => {
          starts.push(index);
          return chunk;
        },
        { chunkSize: 1 }
      ),
      ['a', 'a', 'b']
    );
    assert.deepEqual(starts, [0, 1, 2]);
  });

  it('aborts sibling requests and stops new chunks on the first failure', async () => {
    const clock = sinon.useFakeTimers();
    const starts = [];
    let siblingSignal;
    const failure = new Error('bad response');
    const result = orderedChunks(
      [1, 2, 3, 4],
      async (_chunk, index, signal) => {
        starts.push(index);
        if (index === 0) {
          await delay(10, signal);
          throw failure;
        }
        siblingSignal = signal;
        await delay(500, signal);
        return [];
      },
      { chunkSize: 1, concurrency: 2 }
    );
    const rejected = assert.rejects(result, (error) => error === failure);
    await clock.tickAsync(10);
    await rejected;
    assert.deepEqual(starts, [0, 1]);
    assert(siblingSignal.aborted);
    assert.equal(clock.countTimers(), 0);
  });

  it('propagates caller cancellation before scheduling and during active requests', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    let calls = 0;
    await assert.rejects(
      orderedChunks(
        [1],
        async () => {
          calls++;
          return [];
        },
        { signal: controller.signal }
      ),
      /cancelled/
    );
    assert.equal(calls, 0);
    const active = new AbortController();
    const result = orderedChunks([1, 2, 3], async () => new Promise(() => {}), {
      chunkSize: 1,
      concurrency: 2,
      signal: active.signal,
    });
    const rejected = assert.rejects(result, /stop/);
    active.abort(new Error('stop'));
    await rejected;
  });

  it('rejects unsafe sizes and concurrency before any requests', async () => {
    for (const options of [
      { chunkSize: 201 },
      { chunkSize: 0 },
      { concurrency: 3 },
      { concurrency: 1.5 },
    ]) {
      await assert.rejects(
        orderedChunks([1], async () => [], options),
        /chunkSize|concurrency/
      );
    }
    assert.deepEqual(await orderedChunks([], async () => []), []);
  });
});

describe('Shared per-origin request quota and cooldown', () => {
  afterEach(() => sinon.restore());
  const url = 'https://rest.ensembl.org/vep/human/region';
  const signal = () => new AbortController().signal;

  it('paces VEP and Recoder together while keeping different origins independent', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    const started = [];
    await scheduler.acquire(url, signal(), 10000);
    const same = scheduler
      .acquire('https://rest.ensembl.org/variant_recoder/human', signal(), 10000)
      .then(() => started.push(Date.now()));
    await scheduler.acquire('https://grch37.rest.ensembl.org/vep/human/region', signal(), 10000);
    await clock.tickAsync(99);
    assert.deepEqual(started, []);
    await clock.tickAsync(1);
    await same;
    assert.deepEqual(started, [100]);
  });

  it('extends already queued waits for full Retry-After and never shortens cooldown', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    await scheduler.acquire(url, signal(), 60000);
    let sent = false;
    const queued = scheduler.acquire(url, signal(), 60000).then(() => {
      sent = true;
    });
    scheduler.observe(url, { 'retry-after': '40.5' });
    scheduler.observe(url, { 'retry-after': '1' });
    await clock.tickAsync(40499);
    assert.equal(sent, false);
    await clock.tickAsync(1);
    await queued;
    assert.equal(sent, true);
  });

  it('reserves the remaining quota and waits until its reset before a further request', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    scheduler.observe(url, { 'x-ratelimit-remaining': '1', 'x-ratelimit-reset': '2' });
    await scheduler.acquire(url, signal(), 10000);
    let sent = false;
    const queued = scheduler.acquire(url, signal(), 10000).then(() => {
      sent = true;
    });
    await clock.tickAsync(1999);
    assert.equal(sent, false);
    await clock.tickAsync(1);
    await queued;
    assert.equal(sent, true);
  });

  it('adopts a stricter server rate and ignores malformed headers', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    scheduler.observe(url, {
      'x-ratelimit-limit': '2',
      'x-ratelimit-period': '1',
      'retry-after': 'invalid',
      'x-ratelimit-remaining': 'invalid',
    });
    await scheduler.acquire(url, signal(), 10000);
    let sent = false;
    const queued = scheduler.acquire(url, signal(), 10000).then(() => {
      sent = true;
    });
    await clock.tickAsync(499);
    assert.equal(sent, false);
    await clock.tickAsync(1);
    await queued;
  });

  it('rejects waits outside the deadline and allows cancellation without consuming a slot', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    scheduler.observe(url, { 'retry-after': '40' });
    await assert.rejects(scheduler.acquire(url, signal(), 10000), /deadline/);
    const controller = new AbortController();
    const result = scheduler.acquire(url, controller.signal, 60000);
    const rejected = assert.rejects(result, /stop/);
    controller.abort(new Error('stop'));
    await rejected;
    assert.equal(clock.countTimers(), 0);
  });

  it('tightens an already reserved next-start time when the server reports a lower rate', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    await scheduler.acquire(url, signal(), 10000);
    scheduler.observe(url, { 'x-ratelimit-limit': '2', 'x-ratelimit-period': '1' });
    let sent = false;
    const queued = scheduler.acquire(url, signal(), 10000).then(() => {
      sent = true;
    });
    await clock.tickAsync(499);
    assert.equal(sent, false);
    await clock.tickAsync(1);
    await queued;
  });

  it('recovers its configured rate floor when the server advertises a higher allowance', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    scheduler.observe(url, { 'x-ratelimit-limit': '1', 'x-ratelimit-period': '1' });
    await scheduler.acquire(url, signal(), 10000);
    scheduler.observe(url, { 'x-ratelimit-limit': '55000', 'x-ratelimit-period': '3600' });
    let sent = false;
    const queued = scheduler.acquire(url, signal(), 10000).then(() => {
      sent = true;
    });
    await clock.tickAsync(100);
    assert.equal(sent, true);
    await queued;
  });

  it('does not interpret malformed scientific Retry-After as a mandatory cooldown', async () => {
    const scheduler = createOriginScheduler();
    scheduler.observe(url, { 'retry-after': '4e1' });
    await scheduler.acquire(url, signal(), Date.now() + 1000);
  });
});

describe('Opt-in POST worker integration', () => {
  afterEach(() => sinon.restore());
  it('rejects path control characters in the Recoder species before transport', async () => {
    const fetchApi = sinon.stub().resolves([]);
    const recoder = proxyquire('../src/variantRecoderPost', { './apiHelper': { fetchApi } });
    for (const species of ['../info/ping', 'human?other=1', 'human#fragment', '..']) {
      await assert.rejects(recoder(['rs123'], { species }), /species/i);
    }
    assert.equal(fetchApi.callCount, 0);
  });
  for (const [name, key] of [
    ['vepRegionsAnnotation', 'variants'],
    ['variantRecoderPost', 'ids'],
  ]) {
    it(`${name} executes two bounded batches concurrently and preserves output order`, async () => {
      const clock = sinon.useFakeTimers();
      let active = 0;
      let peak = 0;
      const starts = [];
      const wrapper = proxyquire(`../src/${name}`, {
        './apiHelper': {
          fetchApi: async (_path, _query, _cache, _method, body, _proxy, context) => {
            peak = Math.max(peak, ++active);
            starts.push(body[key].length);
            await delay(
              body[key][0] === '0' ? 50 : 10,
              context.signal || new AbortController().signal
            );
            active--;
            return body[key].map((input) => ({ input }));
          },
        },
      });
      const inputs = Array.from({ length: 1000 }, (_, index) => String(index));
      const result = wrapper(inputs, {}, false, null, { postConcurrency: 2 });
      await clock.runAllAsync();
      assert.deepEqual(
        (await result).map((entry) => entry.input),
        inputs
      );
      assert.deepEqual(starts, [200, 200, 200, 200, 200]);
      assert.equal(peak, 2);
    });
  }

  it('shares activated origin pacing with later default-context requests', async () => {
    const clock = sinon.useFakeTimers();
    const scheduler = createOriginScheduler();
    const { fetchApi } = proxyquire('../src/apiHelper', {
      './api/originScheduler': { createOriginScheduler: () => scheduler },
    });
    const starts = [];
    sinon.stub(axios, 'get').callsFake(async () => {
      starts.push(Date.now());
      return { data: [], headers: {} };
    });
    await fetchApi('/one', {}, false, 'GET', null, null, { postConcurrency: 2 });
    const second = fetchApi('/two');
    await clock.tickAsync(99);
    assert.deepEqual(starts, [0]);
    await clock.tickAsync(1);
    await second;
    assert.deepEqual(starts, [0, 100]);
  });
});
