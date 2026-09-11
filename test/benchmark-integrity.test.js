'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runBenchmarkScenario } = require('../scripts/benchmark/runner.cjs');
const { renderReadme } = require('../scripts/benchmark/report.cjs');

describe('Benchmark report integrity', () => {
  let directory;
  let scenario;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-benchmark-integrity-'));
    const inputFile = path.join(directory, 'inputs.txt');
    fs.writeFileSync(inputFile, 'rs123\nrs456\n');
    scenario = { name: 'Integrity', inputFile, assembly: 'hg38', variantType: 'rsid' };
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function mockTransport(output, status = 0) {
    const calls = [];
    let time = 0;
    return {
      calls,
      now: () => ++time * 100,
      spawnSync(_binary, args, options) {
        calls.push({ args, options });
        if (args.includes('--semver')) return { status: 0, stdout: '3.12.2' };
        fs.writeFileSync(
          options.env.VL_BENCHMARK_PROFILE,
          JSON.stringify({ requestCount: 3, retryCount: 1, chunkCount: 2, transport: 'fixture' })
        );
        return { status, stdout: JSON.stringify(output), stderr: status ? 'partial failure' : '' };
      },
    };
  }

  it('uses measured attempts and preserves metrics for valid partial output with nonzero exit', async () => {
    const result = await runBenchmarkScenario(
      scenario,
      {},
      mockTransport({ annotationData: [{ input: 'ok' }, { input: 'bad', error: 'missing' }] }, 1)
    );
    assert.equal(result.status, 'partial');
    assert.equal(result.variantsProcessed, 1);
    assert.equal(result.failures, 1);
    assert.equal(result.retryCount, 1);
    assert.equal(result.chunkCount, 2);
    assert.equal(result.profile.requestCount, 3);
    assert.equal(result.annotationSha256.length, 64);
    assert(result.stdoutBytes > 0);
    assert(result.executionTime > 0);
  });

  it('counts error annotations even when optional failure metadata is absent', async () => {
    const result = await runBenchmarkScenario(
      scenario,
      {},
      mockTransport({ annotationData: [{ error: 'missing' }] })
    );
    assert.equal(result.status, 'partial');
    assert.equal(result.failures, 1);
  });

  it('preserves the actual CLI error and profile when a failed run has no JSON output', async () => {
    const transport = mockTransport({ annotationData: [] });
    const invoke = transport.spawnSync;
    transport.spawnSync = (...args) => {
      const child = invoke(...args);
      return args[1].includes('--semver')
        ? child
        : { ...child, status: 1, stdout: '', stderr: 'Request deadline exceeded' };
    };
    const result = await runBenchmarkScenario(scenario, {}, transport);
    assert.equal(result.status, 'error');
    assert.match(result.error, /Request deadline exceeded/);
    assert.equal(result.profile.requestCount, 3);
    assert(result.executionTime > 0);
  });

  it('records git identity and removes ambient endpoint and Node preload overrides', async () => {
    const names = ['NODE_OPTIONS', 'ENSEMBL_BASE_URL'];
    const previous = names.map((name) => process.env[name]);
    process.env.NODE_OPTIONS = '--require accidental-preload.cjs';
    process.env.ENSEMBL_BASE_URL = 'https://mirror.example';
    try {
      const transport = mockTransport({ annotationData: [{ input: 'ok' }] });
      const result = await runBenchmarkScenario(scenario, {}, transport);
      assert.equal(transport.calls[1].options.env.NODE_OPTIONS, undefined);
      assert.equal(transport.calls[1].options.env.ENSEMBL_BASE_URL, undefined);
      assert.match(result.measurement.git.revision, /^[0-9a-f]{40}$/);
      assert.equal(typeof result.measurement.git.dirty, 'boolean');
    } finally {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });

  it('rejects conflicting direct runner transport options before spawning', async () => {
    for (const options of [
      { live: true, replay: 'bad' },
      { record: 'bad' },
      { live: true, record: 'bad', repeat: 2 },
    ]) {
      const transport = mockTransport({ annotationData: [] });
      await assert.rejects(
        runBenchmarkScenario(scenario, options, transport),
        /replay|record|Record/i
      );
      assert.equal(transport.calls.length, 0);
    }
  });

  it('does not let a startup-only invocation overwrite a transport recording', async () => {
    const transport = mockTransport({ annotationData: [{ input: 'ok' }] });
    const record = path.join(directory, 'recording.json');
    await runBenchmarkScenario(scenario, { live: true, record }, transport);
    assert.equal(transport.calls[0].options.env.VL_BENCHMARK_RECORD, undefined);
    assert.equal(transport.calls[1].options.env.VL_BENCHMARK_RECORD, record);
  });

  it('labels recorded replay accurately in human-readable reports', () => {
    const readme = renderReadme([], { replay: 'recording.json' });
    assert.match(readme, /recorded.*replay/i);
    assert.doesNotMatch(readme, /Transport: synthetic/);
    assert.match(readme, /adapter/i);
  });

  it('refuses a direct Recoder benchmark without an explicit transport mode', function () {
    this.timeout(10000);
    const env = { ...process.env };
    for (const name of [
      'VL_BENCHMARK_LIVE',
      'VL_TEST_FIXTURES',
      'VL_BENCHMARK_REPLAY',
      'VL_BENCHMARK_RECORD',
    ])
      delete env[name];
    const child = spawnSync(
      process.execPath,
      [
        '--require',
        path.resolve('test/support/offline-guard.cjs'),
        path.resolve('scripts/benchmark/recoder.cjs'),
        '--variants-file',
        scenario.inputFile,
      ],
      { env, encoding: 'utf8', timeout: 8000 }
    );
    assert.equal(child.status, 1);
    assert.match(child.stderr, /explicit.*transport|benchmark\.js/i);
  });
});
