'use strict';

const assert = require('node:assert/strict');
const { runCli } = require('./support/cli.cjs');

describe('Streaming argument and empty-input behavior', function () {
  this.timeout(15000);

  for (const flag of ['--save', '--output-file']) {
    it(`rejects ${flag} for stdin streaming`, async () => {
      const result = await runCli(['--output', 'TSV', flag, 'output.tsv']);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /cannot be used with stdin streaming/);
      assert.equal(result.stdout, '');
    });
  }

  it('produces no NDJSON records for empty streaming input', async () => {
    const result = await runCli(['--output', 'JSON']);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });

  for (const format of ['TSV', 'CSV']) {
    it(`handles empty ${format} input with a header and successful status`, async () => {
      const result = await runCli(['--output', format], '# comment only\n\n');
      assert.equal(result.code, 0, result.stderr);
      assert.ok(result.stdout.startsWith('OriginalInput'));
      assert.equal(result.stdout.trim().split('\n').length, 1);
    });
  }
});
