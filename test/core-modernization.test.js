'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');
const { filterAndFormatResults } = require('../src/variantLinkerProcessor');
const scoring = require('../src/scoring');

describe('Pipeline data contracts', () => {
  const annotation = (input) => ({
    input,
    seq_region_name: '1',
    start: Number(input.split(' ')[1]),
    end: Number(input.split(' ')[1]),
    allele_string: 'A/C',
    most_severe_consequence: 'missense_variant',
    transcript_consequences: [{ transcript_id: 'T', consequence_terms: ['missense_variant'] }],
  });

  it('matches reordered VEP responses to their echoed variant inputs', async () => {
    const { analyzeVariant } = proxyquire('../src/variantLinkerCore', {
      './vepRegionsAnnotation': async (inputs) => inputs.map(annotation).reverse(),
    });
    const result = await analyzeVariant({ variants: ['1-100-A-C', '1-200-A-C'] });
    for (const item of result.annotationData) {
      expect(item.variantKey).to.equal(`1-${item.start}-A-C`);
    }
  });

  it('validates both single and batch schema output against the actual metadata contract', async () => {
    const { analyzeVariant } = proxyquire('../src/variantLinkerCore', {
      './vepRegionsAnnotation': async (inputs) => inputs.map(annotation),
    });
    for (const variants of [['1-100-A-C'], ['1-100-A-C', '1-200-A-C']]) {
      const result = await analyzeVariant({ variants, output: 'SCHEMA' });
      expect(result.annotationData).to.have.length(variants.length);
    }
  });

  it('keeps picked transcripts selected when applying another filter without mutating inputs', () => {
    const input = {
      annotationData: [
        {
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            { transcript_id: 'picked', pick: 1 },
            { transcript_id: 'other' },
          ],
        },
      ],
      meta: { stepsPerformed: [] },
    };
    const output = JSON.parse(
      filterAndFormatResults(
        input,
        { most_severe_consequence: { eq: 'missense_variant' } },
        'JSON',
        { pickOutput: true }
      )
    );
    expect(
      output.annotationData[0].transcript_consequences.map((item) => item.transcript_id)
    ).to.deep.equal(['picked']);
    expect(input.annotationData[0].transcript_consequences).to.have.length(2);
    expect(input.meta.stepsPerformed).to.deep.equal([]);
  });

  it('scores transcript-free variants with configured defaults', () => {
    const result = scoring.applyScoring([{ most_severe_consequence: 'intergenic_variant' }], {
      variables: { transcriptFields: { cadd_phred: { target: 'cadd', default: 0 } } },
      formulas: { annotationLevel: [{ score: 'cadd+1' }], transcriptLevel: [] },
    });
    expect(result[0].score).to.equal(1);
  });

  it('keeps unique aggregate defaults as arrays for the bundled intergenic model', () => {
    const config = scoring.readScoringConfigFromFiles(
      require('path').resolve(__dirname, '../scoring/nephro_variant_score')
    );
    const result = scoring.applyScoring(
      [{ most_severe_consequence: 'intergenic_variant' }],
      config
    );
    expect(result[0].nephro_variant_score).to.be.a('number').and.satisfy(Number.isFinite);
  });

  it('prioritizes real MANE Select metadata ahead of canonical transcripts', () => {
    expect(
      scoring._findPrioritizedTranscript({
        transcript_consequences: [
          { transcript_id: 'canonical', canonical: 1 },
          { transcript_id: 'mane', mane_select: 'NM_001.2' },
        ],
      }).transcript_id
    ).to.equal('mane');
  });
});
