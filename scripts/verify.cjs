#!/usr/bin/env node
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');

async function allChecks(checks) {
  const results = await Promise.allSettled(checks);
  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length)
    throw new Error(failures.map((error) => error.message).join('\n'), { cause: failures[0] });
}

async function runNpm(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this verifier with npm run verify.');
  const label = 'npm ' + args.join(' ');
  const start = performance.now();
  console.log('Starting: ' + label);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: root,
      stdio: 'pipe',
      env: process.env,
    });
    const output = [];
    child.stdout.on('data', (chunk) => {
      output.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      console.log('\n' + label + '\n' + Buffer.concat(output).toString());
      const duration = ((performance.now() - start) / 1000).toFixed(2);
      console.log(`${code === 0 ? 'Passed' : 'FAILED'}: ${label} (${duration}s)`);
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})`));
    });
  });
}

async function verify(run = runNpm, staticOnly = false) {
  await allChecks(
    ['lint', 'format:check', 'typecheck', 'check:loc'].map((check) => run(['run', check]))
  );
  if (staticOnly) return;
  await allChecks([
    run(['run', 'test:coverage']),
    (async () => {
      await run(['run', 'build']);
      await run(['run', 'test:package']);
    })(),
    run(['run', 'docs:build']),
    (async () => {
      await run(['audit', '--audit-level=moderate']);
      await run(['--prefix', 'docs', 'audit', '--audit-level=moderate']);
    })(),
  ]);
}

if (require.main === module) {
  const started = performance.now();
  verify(runNpm, process.argv.includes('--static'))
    .then(() => {
      console.log(`Verification passed in ${((performance.now() - started) / 1000).toFixed(2)}s.`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { verify };
