'use strict';
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { writeOutput } = require('../src/cli/write');
const { parseSampleMap } = require('../src/cli/file');
const { validateParams, parseOptionalParameters, readConfigFile } = require('../src/cli/helpers');

describe('CLI validation and output backpressure', () => {
  it('waits for a slow output consumer to acknowledge bytes', async () => {
    let acknowledge;
    let resolved = false;
    const destination = new Writable({
      write(chunk, encoding, callback) {
        acknowledge = callback;
      },
    });
    const pending = writeOutput('row\n', destination).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.equal(resolved, false);
    acknowledge();
    await pending;
    assert.equal(resolved, true);
    destination.end();
  });

  it('rejects a broken pipe without an unhandled stream error', async () => {
    const destination = new Writable({
      write(chunk, encoding, callback) {
        callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
      },
    });
    await assert.rejects(writeOutput('row', destination), { code: 'EPIPE' });
  });

  for (const [name, override, message] of [
    ['multiple inputs', { variants: '1-200-A-C' }, /Only one variant source/],
    ['invalid output', { output: 'INVALID' }, /Invalid output format/],
    ['missing output', { output: '' }, /Missing required parameter/],
    ['invalid debug', { debug: 4 }, /Debug level/],
    ['fractional chunk', { chunkSize: 1.5 }, /positive integer/],
    ['proxy auth without host', { proxyAuth: 'name:password' }, /requires --proxy/],
    ['stdin save', { isStreaming: true, save: 'file' }, /cannot be used with stdin/],
    ['liftover HGVS', { variant: 'rs123', assembly: 'hg19tohg38' }, /coordinate-based/],
  ]) {
    it('rejects ' + name, () => {
      assert.throws(
        () => validateParams({ variant: '1-100-A-C', output: 'JSON', ...override }),
        message
      );
    });
  }
  it('accepts coordinate liftover and ordinary input modes', () => {
    for (const input of [
      { variant: '1-100-A-C' },
      { variants: '1-100-A-C,1-200-A-C' },
      { variantsFile: 'variants.txt' },
      { vcfInput: 'input.vcf' },
    ]) {
      assert.doesNotThrow(() =>
        validateParams({ ...input, assembly: 'hg19tohg38', output: 'JSON' })
      );
    }
    assert.throws(() => validateParams({ output: 'JSON' }), /At least one variant source/);
  });
  it('validates distinct trio identities and preserves equals signs in API options', () => {
    assert.deepEqual(parseSampleMap(' child, mother, father '), {
      index: 'child',
      mother: 'mother',
      father: 'father',
    });
    assert.equal(parseSampleMap(), null);
    for (const value of ['child,mother', 'child,,father', 'child,child,father']) {
      assert.throws(() => parseSampleMap(value), /three distinct IDs/);
    }
    assert.deepEqual(parseOptionalParameters('flag, expression=a=b,empty=', { existing: '1' }), {
      existing: '1',
      flag: '1',
      expression: 'a=b',
      empty: '',
    });
    assert.deepEqual(readConfigFile(), {});
  });
});
