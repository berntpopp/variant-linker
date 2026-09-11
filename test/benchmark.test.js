'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('Benchmark measurement boundaries', () => {
  let directory;
  let scenario;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-benchmark-'));
    const inputFile = path.join(directory, 'variants.txt');
    fs.writeFileSync(inputFile, 'rs123\nrs456\n');
    scenario = {
      name: 'Offline measurement',
      inputFile,
      variantType: 'rsid',
      assembly: 'hg38',
      expectedVariantCount: 2,
    };
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function transport(stdout) {
    const times = [1000, 1010, 2000, 2200];
    const calls = [];
    return {
      calls,
      now: () => times.shift(),
      spawnSync: (binary, args, options) => {
        calls.push({ binary, args, options });
        return { status: 0, stdout: calls.length === 1 ? '3.12.2' : stdout, stderr: '' };
      },
    };
  }

  it('measures process wall time without a fixed sleep or forced child diagnostics', async () => {
    const { runBenchmarkScenario } = require('../scripts/benchmark/runner.cjs');
    const mock = transport(JSON.stringify({ annotationData: [{}, {}] }));
    const result = await runBenchmarkScenario(scenario, {}, mock);
    assert.equal(result.startupTime, 0.01);
    assert.equal(result.executionTime, 0.2);
    assert.equal(result.variantsPerSecond, 10);
    assert.equal(result.avgTimePerVariant, 0.1);
    assert.equal(result.retryCount, null);
    assert.equal(mock.calls[1].options.env.DEBUG, undefined);
    assert.ok(mock.calls[1].args.includes('--output'));
    assert.equal(result.measurement.inputSha256.length, 64);
    assert.match(result.measurement.scope, /startup/);
  });

  it('rejects invalid CLI JSON instead of substituting the expected variant count', async () => {
    const { runBenchmarkScenario } = require('../scripts/benchmark/runner.cjs');
    const result = await runBenchmarkScenario(scenario, {}, transport('not JSON'));
    assert.equal(result.status, 'error');
    assert.match(result.error, /JSON/);
    assert.equal(result.variantsProcessed, undefined);
  });

  it('runs repeatable offline CLI scenarios and emits machine-readable metrics', function () {
    this.timeout(35000);
    const child = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/benchmark.js'),
        '--input',
        scenario.inputFile,
        '--repeat',
        '2',
        '--format',
        'json',
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.equal(child.status, 0, child.stderr);
    const [result] = JSON.parse(child.stdout);
    assert.equal(result.status, 'success');
    assert.equal(result.measurement.fixtures, true);
    assert.equal(result.averages.runsCompleted, 2);
    assert.equal(result.averages.variantsProcessed, 2);
    assert.ok(result.runs.every((run) => run.variantsProcessed === 2));
    assert.ok(
      result.runs.every((run) => run.measurement.inputSha256 === result.measurement.inputSha256)
    );
    assert.ok(result.runs.every((run) => run.profile.requestCount === 2));
    assert.ok(result.runs.every((run) => run.profile.maxInFlight === 1));
    assert.equal(result.runs[0].annotationSha256, result.runs[1].annotationSha256);
    assert.doesNotMatch(child.stdout, /variant-linker:/);
  });

  it('isolates Variant Recoder timing without making VEP requests', function () {
    this.timeout(35000);
    const child = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/benchmark.js'),
        '--input',
        scenario.inputFile,
        '--stage',
        'recoder',
        '--format',
        'json',
      ],
      { encoding: 'utf8', timeout: 30000 }
    );
    assert.equal(child.status, 0, child.stderr);
    const [result] = JSON.parse(child.stdout);
    assert.equal(result.variantsProcessed, 2);
    assert.equal(result.measurement.stage, 'recoder');
    assert.equal(result.profile.requestCount, 1);
    assert.equal(result.profile.requests[0].endpoint, '/variant_recoder/homo_sapiens');
  });
});
