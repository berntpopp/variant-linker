'use strict';

const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const packageJson = require('../../package.json');
const apiConfig = require('../../config/apiConfig.json');
const benchmarkConfig = require('../../config/benchmarkConfig.json');
const { canonicalJson } = require('../../src/api/requestContext');

const cliPath = path.resolve(__dirname, '../../src/main.js');

function gitIdentity() {
  const options = { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true };
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], options);
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], options);
  return {
    revision: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
  };
}

/** Measure complete CLI invocations. The startup baseline is reported, never subtracted. */
async function runBenchmarkScenario(scenario, options = {}, transport = {}) {
  const invoke = transport.spawnSync || spawnSync;
  const now = transport.now || (() => performance.now());
  const repeat = options.repeat ?? benchmarkConfig.repeat;
  const stage = options.stage ?? benchmarkConfig.stage;
  const executable = stage === 'recoder' ? path.resolve(__dirname, 'recoder.cjs') : cliPath;
  if (!Number.isSafeInteger(repeat) || repeat < 1)
    throw new Error('repeat must be a positive integer');
  if (options.replay && (options.live || options.record))
    throw new Error('replay cannot be combined with live or record');
  if (options.record && !options.live) throw new Error('record requires explicit live opt-in');
  if (options.record && repeat !== 1)
    throw new Error('Record once, then replay repeated measurements');
  const measurement = {
    scope: `End-to-end CLI wall time including Node startup, ${stage === 'recoder' ? 'recoding' : 'annotation'}, and JSON serialization`,
    git: gitIdentity(),
    stage,
    postConcurrency: options.apiConcurrency ?? apiConfig.requests.postConcurrency,
    timeoutMs: options.apiTimeout ?? apiConfig.requests.timeoutMs,
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
    fixtures: !options.live && !options.replay,
    transport: options.live ? 'live' : options.replay ? 'replay' : 'fixture',
    replaySha256: options.replay
      ? crypto.createHash('sha256').update(fs.readFileSync(options.replay)).digest('hex')
      : null,
    cache: false,
    diagnosticsEnabled: false,
    measuredAt: new Date().toISOString(),
  };
  const childOptions = {
    env: {
      ...process.env,
    },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeout ?? benchmarkConfig.processTimeoutMs,
    maxBuffer: benchmarkConfig.maxOutputBytes,
  };
  for (const [name, value] of Object.entries({
    processTimeoutMs: childOptions.timeout,
    maxOutputBytes: childOptions.maxBuffer,
    maxOldSpaceMiB: benchmarkConfig.maxOldSpaceMiB,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`);
  }
  // An empty DEBUG value enables prefix-based loggers; remove the variable entirely.
  delete childOptions.env.DEBUG;
  for (const key of [
    'VL_TEST_FIXTURES',
    'VL_BENCHMARK_INPUT',
    'VL_BENCHMARK_LIVE',
    'VL_BENCHMARK_RECORD',
    'VL_BENCHMARK_REPLAY',
    'VL_BENCHMARK_PROFILE',
    'NODE_OPTIONS',
    'ENSEMBL_BASE_URL',
  ])
    delete childOptions.env[key];
  if (options.live) childOptions.env.VL_BENCHMARK_LIVE = '1';
  else if (!options.replay)
    Object.assign(childOptions.env, {
      VL_TEST_FIXTURES: '1',
      VL_BENCHMARK_INPUT: scenario.inputFile,
    });
  if (options.record) childOptions.env.VL_BENCHMARK_RECORD = path.resolve(options.record);
  if (options.replay) childOptions.env.VL_BENCHMARK_REPLAY = path.resolve(options.replay);
  const runtimeOptions = [`--max-old-space-size=${benchmarkConfig.maxOldSpaceMiB}`];
  if (!options.live && !options.replay)
    runtimeOptions.push(
      '--require',
      path.resolve(__dirname, '../../test/support/benchmark-preload.cjs')
    );
  if (options.record || options.replay)
    runtimeOptions.push('--require', path.resolve(__dirname, 'replay.cjs'));
  runtimeOptions.push('--require', path.resolve(__dirname, 'profile.cjs'));
  const startupOptions = { ...childOptions, env: { ...childOptions.env } };
  // Startup performs no transport; do not flush an empty recording over prior data.
  delete startupOptions.env.VL_BENCHMARK_RECORD;
  const baselineStart = now();
  const baseline = invoke(
    process.execPath,
    [...runtimeOptions, executable, '--semver'],
    startupOptions
  );
  const baselineEnd = now();
  const startupTime = baseline.status === 0 ? (baselineEnd - baselineStart) / 1000 : null;
  const command = [
    ...runtimeOptions,
    executable,
    scenario.variantType === 'vcf' ? '--vcf-input' : '--variants-file',
    scenario.inputFile,
    '--assembly',
    scenario.assembly,
    '--output',
    'JSON',
    '--api-concurrency',
    String(options.apiConcurrency ?? apiConfig.requests.postConcurrency),
    '--api-timeout',
    String(options.apiTimeout ?? apiConfig.requests.timeoutMs),
  ];
  const runs = [];
  for (let index = 0; index < repeat; index++) {
    if (options.verbose) console.error(`Benchmark ${scenario.name}: run ${index + 1}/${repeat}`);
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-benchmark-profile-'));
    const profilePath = path.join(profileDirectory, 'profile.json');
    let executionTime = null;
    let profile = null;
    let stdoutBytes = null;
    try {
      const start = now();
      const child = invoke(process.execPath, command, {
        ...childOptions,
        env: { ...childOptions.env, VL_BENCHMARK_PROFILE: profilePath },
      });
      const end = now();
      executionTime = (end - start) / 1000;
      stdoutBytes = Buffer.byteLength(child.stdout || '');
      profile = fs.existsSync(profilePath)
        ? JSON.parse(fs.readFileSync(profilePath, 'utf8'))
        : null;
      if (child.error) throw child.error;
      let output;
      try {
        output = JSON.parse(child.stdout);
      } catch (error) {
        if (child.status !== 0)
          throw new Error(`CLI exited ${child.status}: ${child.stderr || child.signal || ''}`, {
            cause: error,
          });
        throw new Error('CLI output is not valid JSON', { cause: error });
      }
      if (!Array.isArray(output.annotationData)) throw new Error('CLI JSON lacks annotationData');
      const variantsProcessed = output.annotationData.filter(
        (annotation) => !annotation.error
      ).length;
      const failures = Math.max(
        output.annotationData.length - variantsProcessed,
        output.errors?.length || 0,
        output.meta?.failedVariants || 0
      );
      runs.push({
        name: scenario.name,
        status: failures ? 'partial' : child.status !== 0 ? 'error' : 'success',
        ...(child.status !== 0
          ? { error: `CLI exited ${child.status}: ${child.stderr || child.signal || ''}` }
          : {}),
        repeatIndex: index,
        executionTime,
        startupTime,
        variantsProcessed,
        avgTimePerVariant: variantsProcessed ? executionTime / variantsProcessed : null,
        variantsPerSecond: executionTime > 0 ? variantsProcessed / executionTime : null,
        retryCount: profile?.retryCount ?? output.meta?.retryCount ?? null,
        chunkCount: profile?.chunkCount ?? output.meta?.chunkCount ?? null,
        stdoutBytes,
        failures,
        annotationSha256: crypto
          .createHash('sha256')
          .update(canonicalJson(output.annotationData))
          .digest('hex'),
        profile,
        measurement,
      });
    } catch (error) {
      runs.push({
        name: scenario.name,
        status: 'error',
        repeatIndex: index,
        error: error.message,
        executionTime,
        stdoutBytes,
        profile,
        startupTime,
        measurement,
      });
    } finally {
      fs.rmSync(profileDirectory, { recursive: true, force: true });
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
