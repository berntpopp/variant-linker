'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('Physical source line limit', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-linker-loc-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function check(lines, ending = '\n') {
    const file = path.join(directory, 'sample.js');
    fs.writeFileSync(file, Array(lines).fill('// line').join(ending) + ending);
    return spawnSync(process.execPath, [path.resolve('scripts/check-loc.cjs'), file], {
      encoding: 'utf8',
    });
  }

  it('accepts 649 physical lines, including a trailing newline', () => {
    const result = check(649);
    assert.equal(result.status, 0, result.stderr);
  });

  it('rejects 650 physical lines and identifies the offending file', () => {
    const result = check(650);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sample\.js: 650 lines/);
  });

  it('counts CRLF files by physical lines', () => {
    assert.equal(check(649, '\r\n').status, 0);
    assert.equal(check(650, '\r\n').status, 1);
  });
});
