'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const preload = path.resolve('test/support/offline-guard.cjs');

describe('Offline transport in spawned processes', () => {
  function run(code, fixtures = false) {
    return spawnSync(process.execPath, ['--require', preload, '-e', code], {
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, VL_TEST_FIXTURES: fixtures ? '1' : '' },
    });
  }

  it('rejects unintended external HTTP without contacting the public network', () => {
    const result = run(`require('axios').get('https://unexpected.invalid/').then(
      () => process.exitCode = 1,
      e => console.log(e.message)
    )`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Disallowed net connect/);
  });

  it('replays recoder fixtures in a child with exact input identity', () => {
    const result = run(
      `require('axios').post(
      'https://rest.ensembl.org/variant_recoder/homo_sapiens',
      {ids:['rs6025','rs123']}
    ).then(r => console.log(JSON.stringify(r.data.map(v => v.input))))`,
      true
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ['rs6025', 'rs123']);
  });

  it('refuses unknown endpoints even when fixtures are enabled', () => {
    const result = run(
      `require('axios').get('https://rest.ensembl.org/not-a-fixture').then(
      () => process.exitCode = 1,
      e => console.log(e.message)
    )`,
      true
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nock: No match|Disallowed net connect/);
  });
});
