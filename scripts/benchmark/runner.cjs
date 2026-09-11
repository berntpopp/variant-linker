'use strict';

const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const packageJson = require('../../package.json');

const cliPath = path.resolve(__dirname, '../../src/main.js');

/** Measure complete CLI invocations. The startup baseline is reported, never subtracted. */
async function runBenchmarkScenario(scenario, options = {}, transport = {}) {
  const invoke = transport.spawnSync || spawnSync;
  const now = transport.now || (() => performance.now());
  const repeat = options.repeat ?? 1;
  if (!Number.isSafeInteger(repeat) || repeat < 1)
    throw new Error('repeat must be a positive integer');
  const measurement = {
    scope: 'End-to-end CLI wall time including Node startup, annotation, and serialization',
    startupScope: 'Separate CLI --semver invocation; not subtracted from annotation timings',
    inputSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(scenario.inputFile))
      .digest('hex'),
    inputFile: path.resolve(scenario.inputFile),
    assembly: scenario.assembly,
    node: process.version,
    variantLinker: packageJson.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    fixtures: !options.live,
    cache: false,
    diagnosticsEnabled: false,
    measuredAt: new Date().toISOString(),
  };
  const childOptions = {
    env: {
      ...process.env,
      ...(!options.live ? { VL_TEST_FIXTURES: '1', VL_BENCHMARK_INPUT: scenario.inputFile } : {}),
    },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeout ?? 120000,
    maxBuffer: 50 * 1024 * 1024,
  };
  // An empty DEBUG value enables prefix-based loggers; remove the variable entirely.
  delete childOptions.env.DEBUG;
  const runtimeOptions = ['--max-old-space-size=4096'];
  if (!options.live)
    runtimeOptions.push(
      '--require',
      path.resolve(__dirname, '../../test/support/benchmark-preload.cjs')
    );
  const baselineStart = now();
  const baseline = invoke(process.execPath, [...runtimeOptions, cliPath, '--semver'], childOptions);
  const baselineEnd = now();
  const startupTime = baseline.status === 0 ? (baselineEnd - baselineStart) / 1000 : null;
  const command = [
    ...runtimeOptions,
    cliPath,
    scenario.variantType === 'vcf' ? '--vcf-input' : '--variants-file',
    scenario.inputFile,
    '--assembly',
    scenario.assembly,
    '--output',
    'JSON',
  ];
  const runs = [];
  for (let index = 0; index < repeat; index++) {
    if (options.verbose) console.error(`Benchmark ${scenario.name}: run ${index + 1}/${repeat}`);
    try {
      const start = now();
      const child = invoke(process.execPath, command, childOptions);
      const end = now();
      if (child.error) throw child.error;
      if (child.status !== 0)
        throw new Error(`CLI exited ${child.status}: ${child.stderr || child.signal || ''}`);
      let output;
      try {
        output = JSON.parse(child.stdout);
      } catch (error) {
        throw new Error('CLI output is not valid JSON', { cause: error });
      }
      if (!Array.isArray(output.annotationData)) throw new Error('CLI JSON lacks annotationData');
      const variantsProcessed = output.annotationData.filter(
        (annotation) => !annotation.error
      ).length;
      const failures = output.errors?.length || output.meta?.failedVariants || 0;
      const executionTime = (end - start) / 1000;
      runs.push({
        name: scenario.name,
        status: failures ? 'partial' : 'success',
        repeatIndex: index,
        executionTime,
        startupTime,
        variantsProcessed,
        avgTimePerVariant: variantsProcessed ? executionTime / variantsProcessed : null,
        variantsPerSecond: executionTime > 0 ? variantsProcessed / executionTime : null,
        // Debug text cannot establish reliable counts; do not invent zero retries or one chunk.
        retryCount: output.meta?.retryCount ?? null,
        chunkCount: output.meta?.chunkCount ?? null,
        failures,
        measurement,
      });
    } catch (error) {
      runs.push({
        name: scenario.name,
        status: 'error',
        repeatIndex: index,
        error: error.message,
        startupTime,
        measurement,
      });
    }
    if (options.log) fs.appendFileSync(options.log, JSON.stringify(runs.at(-1)) + '\n');
  }
  if (repeat === 1) return runs[0];
  const successful = runs.filter((run) => run.status === 'success');
  if (!successful.length) return { name: scenario.name, status: 'error', runs, measurement };
  const average = (key) =>
    successful.every((run) => typeof run[key] === 'number')
      ? successful.reduce((sum, run) => sum + run[key], 0) / successful.length
      : null;
  const executionTime = average('executionTime');
  return {
    name: scenario.name,
    status: successful.length === repeat ? 'success' : 'partial',
    runs,
    measurement,
    averages: {
      executionTime,
      startupTime,
      variantsProcessed: average('variantsProcessed'),
      avgTimePerVariant: average('avgTimePerVariant'),
      variantsPerSecond: average('variantsPerSecond'),
      retryCount: average('retryCount'),
      chunkCount: average('chunkCount'),
      minExecutionTime: Math.min(...successful.map((run) => run.executionTime)),
      maxExecutionTime: Math.max(...successful.map((run) => run.executionTime)),
      stdDeviation: Math.sqrt(
        successful.reduce((sum, run) => sum + (run.executionTime - executionTime) ** 2, 0) /
          successful.length
      ),
      runsCompleted: successful.length,
      totalRuns: repeat,
    },
  };
}

module.exports = { runBenchmarkScenario };
