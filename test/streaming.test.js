'use strict';

const assert = require('node:assert/strict');
const { runCli } = require('./support/cli.cjs');

describe('Offline CLI streaming', function () {
  this.timeout(15000);

  for (const [format, delimiter] of [
    ['TSV', '\t'],
    ['CSV', ','],
  ]) {
    it(`processes ${format} input with comments and retains both variants`, async () => {
      const result = await runCli(
        ['--output', format],
        '1-65568-A-C\n# ignored comment\n\n1-65569-A-G\n'
      );
      assert.equal(result.code, 0, result.stderr);
      const [header, ...rows] = result.stdout
        .replace(/\r?\n$/, '')
        .split('\n')
        .map((line) => line.split(delimiter));
      assert.ok(header.includes('OriginalInput'));
      assert.ok(header.includes('GeneSymbol'));
      const original = header.indexOf('OriginalInput');
      assert.deepEqual(
        [...new Set(rows.map((row) => row[original]))],
        ['1-65568-A-C', '1-65569-A-G']
      );
      assert.ok(rows.every((row) => row.length === header.length));
      assert.match(result.stdout, /OR4F5/);
    });
  }

  it('emits one header across multiple one-variant chunks', async () => {
    const result = await runCli(
      ['--output', 'TSV', '--chunk-size', '1'],
      '1-65568-A-C\n1-65569-A-G\n'
    );
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.filter((line) => line.startsWith('OriginalInput\t')).length, 1);
    assert.equal(lines.length, 5);
  });

  it('keeps diagnostic output separate from tabular stdout', async () => {
    const result = await runCli(['--output', 'TSV', '--debug'], '1-65568-A-C\n');
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.startsWith('OriginalInput\t'));
    assert.ok(result.stderr.length > 0);
    assert.doesNotMatch(result.stdout, /variant-linker:|Sending API/);
  });

  it('accepts explicit VEP options in a child process', async () => {
    const result = await runCli(
      ['--output', 'CSV', '--vep_params', 'CADD=1,hgvs=1'],
      '1-65568-A-C\n'
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /1-65568-A-C/);
    assert.match(result.stdout, /missense_variant/);
  });
});
