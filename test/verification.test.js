'use strict';
const assert = require('node:assert/strict');
const { verify } = require('../scripts/verify.cjs');

describe('Local verification orchestration', () => {
  it('runs independent static gates concurrently and checks the package only after its build', async () => {
    const running = new Set();
    let staticConcurrency = 0;
    const completed = [];
    await verify(async (args) => {
      const key = args.join(' ');
      running.add(key);
      if (['lint', 'format:check', 'typecheck', 'check:loc'].includes(args[1])) {
        staticConcurrency = Math.max(staticConcurrency, running.size);
      }
      if (args[1] === 'test:package') assert.ok(completed.includes('run build'));
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      completed.push(key);
      running.delete(key);
    });
    assert.equal(staticConcurrency, 4);
    for (const check of [
      'run test:coverage',
      'run docs:build',
      'run test:package',
      'audit --audit-level=moderate',
      '--prefix docs audit --audit-level=moderate',
    ]) {
      assert.ok(completed.includes(check), check);
    }
  });

  it('reports failed static checks and does not start expensive downstream gates', async () => {
    const calls = [];
    await assert.rejects(
      verify(async (args) => {
        calls.push(args.join(' '));
        if (args[1] === 'typecheck') throw new Error('types failed');
      }),
      /types failed/
    );
    assert.equal(calls.length, 4);
  });
});
