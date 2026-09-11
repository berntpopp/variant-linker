'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const apiConfig = require('../config/apiConfig.json');
const benchmarkConfig = require('../config/benchmarkConfig.json');
const path = require('node:path');

function configured(requests = {}, ensembl = {}) {
  return {
    ...apiConfig,
    requests: { ...apiConfig.requests, ...requests },
    ensembl: { ...apiConfig.ensembl, ...ensembl },
  };
}

describe('Configuration-driven transport defaults', () => {
  afterEach(() => sinon.restore());

  it('reads all transport defaults from config while allowing explicit request overrides', () => {
    const defaults = {
      timeoutMs: 125,
      deadlineMs: 250,
      maxResponseBytes: 800,
      maxRetryDelayMs: 30,
      postConcurrency: 2,
    };
    const { resolveRequestOptions } = proxyquire('../src/api/requestContext', {
      '../../config/apiConfig.json': configured(defaults),
    });
    const actual = resolveRequestOptions();
    for (const [key, value] of Object.entries(defaults)) assert.equal(actual[key], value, key);
    assert.equal(resolveRequestOptions({ timeoutMs: 99, postConcurrency: 1 }).timeoutMs, 99);
    assert.equal(resolveRequestOptions({ postConcurrency: 1 }).postConcurrency, 1);
  });

  it('rejects invalid configured transport budgets and concurrency bounds', () => {
    for (const [key, value] of [
      ['timeoutMs', 0],
      ['deadlineMs', Infinity],
      ['maxResponseBytes', -1],
      ['maxRetryDelayMs', NaN],
      ['postConcurrency', 3],
      ['maxPostConcurrency', 0],
    ]) {
      const { resolveRequestOptions } = proxyquire('../src/api/requestContext', {
        '../../config/apiConfig.json': configured({ [key]: value }),
      });
      assert.throws(() => resolveRequestOptions(), new RegExp(key));
    }
  });

  it('uses the configured provider ceiling and selected concurrency for chunking', async () => {
    const { orderedChunks } = proxyquire('../src/api/orderedChunks', {
      '../../config/apiConfig.json': configured({ postConcurrency: 2 }, { maxPostSize: 3 }),
    });
    const chunks = [];
    assert.deepEqual(
      await orderedChunks([1, 2, 3, 4, 5], async (chunk) => {
        chunks.push(chunk);
        return chunk;
      }),
      [1, 2, 3, 4, 5]
    );
    assert.deepEqual(
      chunks.map((chunk) => chunk.length),
      [3, 2]
    );
    await assert.rejects(
      orderedChunks([1], async () => [], { chunkSize: 4 }),
      /chunkSize/
    );
  });

  it('rejects invalid provider constraints instead of disabling request bounds', async () => {
    for (const maxPostSize of [0, NaN, Infinity, 1.5]) {
      const { orderedChunks } = proxyquire('../src/api/orderedChunks', {
        '../../config/apiConfig.json': configured({}, { maxPostSize }),
      });
      await assert.rejects(
        orderedChunks([1], async () => []),
        /maxPostSize/
      );
    }
  });

  it('uses configured pacing and rejects invalid pacing defaults', async () => {
    const clock = sinon.useFakeTimers();
    const { createOriginScheduler } = proxyquire('../src/api/originScheduler', {
      '../../config/apiConfig.json': configured({ minIntervalMs: 250 }),
    });
    const scheduler = createOriginScheduler();
    const signal = new AbortController().signal;
    await scheduler.acquire('https://example.test', signal, 1000);
    let sent = false;
    const queued = scheduler.acquire('https://example.test', signal, 1000).then(() => {
      sent = true;
    });
    await clock.tickAsync(249);
    assert.equal(sent, false);
    await clock.tickAsync(1);
    await queued;
    for (const minIntervalMs of [0, -1, Infinity]) {
      const invalid = proxyquire('../src/api/originScheduler', {
        '../../config/apiConfig.json': configured({ minIntervalMs }),
      });
      assert.throws(() => invalid.createOriginScheduler(), /minIntervalMs/);
    }
  });

  it('uses the same configurable Recoder benchmark defaults', () => {
    const { parseOptions } = proxyquire('../scripts/benchmark/recoder.cjs', {
      '../../config/apiConfig.json': configured({ timeoutMs: 125, postConcurrency: 2 }),
    });
    const options = parseOptions(['--semver']);
    assert.equal(options.apiTimeout, 125);
    assert.equal(options.apiConcurrency, 2);
    assert.equal(parseOptions(['--api-timeout', '99', '--api-concurrency', '1']).apiTimeout, 99);
  });

  it('uses configured benchmark repeat, subprocess budgets, memory and API defaults', async () => {
    const { runBenchmarkScenario } = proxyquire('../scripts/benchmark/runner.cjs', {
      '../../config/apiConfig.json': configured({ timeoutMs: 125, postConcurrency: 2 }),
      '../../config/benchmarkConfig.json': {
        ...benchmarkConfig,
        repeat: 2,
        processTimeoutMs: 444,
        maxOutputBytes: 888,
        maxOldSpaceMiB: 32,
      },
    });
    const calls = [];
    let time = 0;
    const result = await runBenchmarkScenario(
      {
        name: 'Configured',
        inputFile: path.resolve('examples/benchmark_data/single_variant.txt'),
        assembly: 'hg38',
        variantType: 'rsid',
      },
      {},
      {
        now: () => ++time,
        spawnSync(_binary, args, options) {
          calls.push({ args, options });
          return {
            status: 0,
            stdout: args.includes('--semver') ? '3.12.2' : '{"annotationData":[{}]}',
          };
        },
      }
    );
    assert.equal(result.runs.length, 2);
    assert.equal(result.measurement.timeoutMs, 125);
    assert.equal(result.measurement.postConcurrency, 2);
    assert.equal(calls[1].options.timeout, 444);
    assert.equal(calls[1].options.maxBuffer, 888);
    assert(calls[1].args.includes('--max-old-space-size=32'));
  });
});
