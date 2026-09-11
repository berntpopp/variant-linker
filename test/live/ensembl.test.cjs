'use strict';

const assert = require('node:assert/strict');
const { analyzeVariant } = require('../../src/variantLinkerCore');

describe('Opt-in live Ensembl smoke', () => {
  it('returns the requested variant with transcript annotations', async () => {
    const result = await analyzeVariant({
      variant: '1-169549811-C-T',
      output: 'JSON',
      cache: false,
    });
    assert.ok(Array.isArray(result.annotationData));
    assert.equal(result.annotationData[0].start, 169549811);
    assert.ok(result.annotationData[0].transcript_consequences.length > 0);
  });
});
