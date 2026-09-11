'use strict';

const assert = require('node:assert/strict');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { useFixtureApi } = require('./support/fixture-api.cjs');

describe('Offline input/output format conversion', () => {
  useFixtureApi();

  it('returns explicit coordinates and transcript fields for VCF input', async () => {
    const result = await analyzeVariant({ variant: '1-12345-A-G', output: 'JSON', cache: false });
    assert.equal(result.annotationData.length, 1);
    const annotation = result.annotationData[0];
    assert.equal(annotation.originalInput, '1-12345-A-G');
    assert.equal(annotation.seq_region_name, '1');
    assert.equal(annotation.start, 12345);
    assert.equal(annotation.end, 12345);
    assert.equal(annotation.allele_string, 'A/G');
    assert.deepEqual(
      annotation.transcript_consequences.map((t) => t.impact),
      ['MODERATE', 'LOW']
    );
  });

  it('returns a recoded rsID while retaining its input identity', async () => {
    const result = await analyzeVariant({ variant: 'rs28897696', output: 'JSON', cache: false });
    assert.equal(result.annotationData.length, 1);
    assert.equal(result.annotationData[0].originalInput, 'rs28897696');
    assert.equal(result.annotationData[0].variantKey, '13-32340301-G-A');
  });

  for (const variants of [
    ['rs6025', '1-12345-A-G'],
    ['1-12345-A-G', '2-23456-T-C'],
  ]) {
    it(`accounts for all variants in ${variants.join(', ')}`, async () => {
      const result = await analyzeVariant({ variants, output: 'JSON', cache: false });
      assert.equal(result.annotationData.length, 2);
      assert.deepEqual(
        result.annotationData.map((v) => v.originalInput).sort(),
        [...variants].sort()
      );
      for (const annotation of result.annotationData) {
        assert.ok(Number.isSafeInteger(annotation.start));
        assert.ok(Number.isSafeInteger(annotation.end));
        assert.equal(annotation.transcript_consequences.length, 2);
      }
    });
  }
});
