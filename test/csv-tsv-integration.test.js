'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { useFixtureApi } = require('./support/fixture-api.cjs');

describe('Offline CSV/TSV output and file roundtrip', () => {
  useFixtureApi();
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-tabular-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  for (const [output, delimiter] of [
    ['CSV', ','],
    ['TSV', '\t'],
  ]) {
    it(`retains identity and all consequence fields in ${output}`, async () => {
      const result = await analyzeVariant({ variant: 'rs123', output, cache: false });
      const filename = path.join(directory, `annotation.${output.toLowerCase()}`);
      fs.writeFileSync(filename, result);
      assert.equal(fs.readFileSync(filename, 'utf8'), result);
      const [header, ...rows] = result.split('\n').map((line) => line.split(delimiter));
      assert.equal(rows.length, 2);
      for (const column of [
        'OriginalInput',
        'VEPInput',
        'Location',
        'Allele',
        'GeneSymbol',
        'Impact',
        'TranscriptID',
        'ConsequenceTerms',
      ])
        assert.ok(header.includes(column));
      assert.ok(rows.every((row) => row.length === header.length));
      assert.deepEqual(
        rows.map((row) => row[header.indexOf('OriginalInput')]),
        ['rs123', 'rs123']
      );
      assert.deepEqual(
        rows.map((row) => row[header.indexOf('Impact')]),
        ['MODERATE', 'LOW']
      );
    });

    it(`retains both input identities in batch ${output}`, async () => {
      const result = await analyzeVariant({ variants: ['rs123', 'rs456'], output, cache: false });
      const [header, ...rows] = result.split('\n').map((line) => line.split(delimiter));
      assert.equal(rows.length, 4);
      const originals = rows.map((row) => row[header.indexOf('OriginalInput')]);
      assert.deepEqual(originals.sort(), ['rs123', 'rs123', 'rs456', 'rs456']);
    });

    it(`emits only the header when no ${output} rows match the filter`, async () => {
      const result = await analyzeVariant({
        variant: 'rs123',
        output,
        cache: false,
        filter: JSON.stringify({
          'transcript_consequences.*.impact': { eq: 'NON_EXISTENT_IMPACT' },
        }),
      });
      assert.equal(result.replace(/\r?\n$/, '').split('\n').length, 1);
      assert.ok(result.startsWith(`OriginalInput${delimiter}`));
    });
  }
});
