#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;

if (!npmCli || !fs.existsSync(npmCli)) {
  throw new Error('Run this verifier with npm run verify.');
}

const checks = [
  ['run', 'lint'],
  ['run', 'format:check'],
  ['run', 'typecheck'],
  ['run', 'check:loc'],
  ['run', 'test:coverage'],
  ['run', 'build'],
  ['run', 'test:package'],
  ['run', 'docs:build'],
  ['audit', '--omit=dev', '--audit-level=moderate'],
];

for (const args of checks) {
  console.log(`\nVerifying: npm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
