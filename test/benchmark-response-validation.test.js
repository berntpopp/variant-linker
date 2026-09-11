'use strict';
const assert = require('node:assert/strict');

describe('Recorded benchmark response validation', () => {
  const cohort = [
    {
      chromosome: '22',
      position: 100,
      ref: 'A',
      alt: 'G',
      vcfInput: '22 100 . A G . . .',
      recoderInput: 'NC_000022.10:g.100A>G',
    },
    {
      chromosome: '22',
      position: 200,
      ref: 'T',
      alt: 'C',
      vcfInput: '22 200 . T C . . .',
      recoderInput: 'NC_000022.10:g.200T>C',
    },
  ];
  function recording(data, inputs) {
    return {
      entries: {
        fixture: { request: { body: { ids: inputs } }, responses: [{ status: 200, data }] },
      },
    };
  }

  it('reports missing cohort members without claiming incomplete responses are complete', () => {
    const { inspectRecording } = require('../scripts/benchmark/validate-responses.cjs');
    const result = inspectRecording(
      'recoder',
      recording(
        [{ G: { input: cohort[0].recoderInput, vcf_string: ['22-100-A-G'] } }],
        [cohort[0].recoderInput]
      ),
      cohort
    );
    assert.equal(result.summary.missingCohortInputs, 1);
    assert.equal(result.summary.completeCohort, false);
    assert.equal(result.summary.coordinateMatches, 1);
  });

  it('accepts the target among multiple returned alleles and flags wrong coordinates', () => {
    const { inspectRecording } = require('../scripts/benchmark/validate-responses.cjs');
    const result = inspectRecording(
      'recoder',
      recording(
        [
          { G: { input: cohort[0].recoderInput, vcf_string: ['22-100-A-G', '22-100-A-T'] } },
          { C: { input: cohort[1].recoderInput, vcf_string: ['22-201-T-C'] } },
        ],
        cohort.map((v) => v.recoderInput)
      ),
      cohort
    );
    assert.equal(result.summary.coordinateMatches, 1);
    assert.equal(result.summary.coordinateMismatches, 1);
    assert.equal(result.summary.multipleReturnedCoordinates, 1);
    assert.equal(result.summary.completeAndIdentityValid, false);
  });

  it('ignores object key order but preserves array ordering in exact comparisons', () => {
    const { canonical } = require('../scripts/benchmark/validate-responses.cjs');
    assert.equal(canonical({ b: 2, a: [1, 2] }), canonical({ a: [1, 2], b: 2 }));
    assert.notEqual(canonical({ a: [1, 2] }), canonical({ a: [2, 1] }));
  });
});
