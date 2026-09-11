'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

function runCli(args, input = '', extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--require',
        path.resolve(__dirname, 'offline-guard.cjs'),
        path.resolve(__dirname, '../../src/main.js'),
        ...args,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, VL_TEST_FIXTURES: '1', ...extraEnv },
      }
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timed out: ${stderr}`));
    }, 8000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error);
    });
    child.stdin.end(input);
  });
}

module.exports = { runCli };
