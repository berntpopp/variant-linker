'use strict';

const assert = require('node:assert/strict');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { useFixtureApi } = require('./support/fixture-api.cjs');

describe('Deterministic recoder-to-tabular integration', () => {
  useFixtureApi();

  for (const [variant, expectedCoordinate] of [
    ['rs6025', '1:169549811-169549811'],
    ['ENST00000302118:c.137G>A', '1:55039974-55039974'],
    ['9-130716739-G-GT', '9:130716739-130716739'],
  ]) {
    for (const [output, delimiter] of [
      ['CSV', ','],
      ['TSV', '\t'],
    ]) {
      it(`retains identity and consequences for ${variant} as ${output}`, async () => {
        const result = await analyzeVariant({ variant, output, cache: false });
        const [header, ...rows] = result.split('\n').map((line) => line.split(delimiter));
        assert.equal(rows.length, 2);
        assert.ok(rows.every((row) => row.length === header.length));
        const field = (row, name) => row[header.indexOf(name)];
        assert.ok(rows.every((row) => field(row, 'OriginalInput') === variant));
        assert.ok(rows.every((row) => field(row, 'Location') === expectedCoordinate + '(1)'));
        assert.deepEqual(
          rows.map((row) => field(row, 'Impact')),
          ['MODERATE', 'LOW']
        );
        assert.deepEqual(
          rows.map((row) => field(row, 'ConsequenceTerms')),
          ['missense_variant', 'synonymous_variant']
        );
      });
    }
  }

  it('accounts for each input in mixed batch output without fuzzy row tolerances', async () => {
    const variants = ['rs6025', '1-12345-A-G'];
    const result = await analyzeVariant({ variants, output: 'TSV', cache: false });
    const [header, ...rows] = result.split('\n').map((line) => line.split('\t'));
    assert.equal(rows.length, 4);
    const original = header.indexOf('OriginalInput');
    for (const variant of variants) {
      assert.equal(rows.filter((row) => row[original] === variant).length, 2);
    }
  });
});
