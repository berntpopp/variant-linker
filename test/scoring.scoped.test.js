// test/scoring.test.js
// Comprehensive tests for the scoring module

const { expect } = require('./helpers');
const scoring = require('../src/scoring');

describe('scoring scoped variables', () => {
  describe('Scoped Variable Extraction and Scoring', () => {
    // Mock VEP annotation with transcript consequences having different picks and values
    const mockVepAnnotationWithPicks = {
      input: '1 65568 . A C . . .',
      id: 'variant1_1_65568_A_C',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          transcript_id: 'T1',
          cadd_phred: 10,
          polyphen_score: 0.2,
          impact: 'LOW',
          gene_symbol: 'GENE1',
        }, // Non-picked
        {
          transcript_id: 'T2',
          pick: 1,
          cadd_phred: 25,
          polyphen_score: 0.9,
          impact: 'MODERATE',
          gene_symbol: 'GENE2',
        }, // The "picked" transcript
        {
          transcript_id: 'T3',
          cadd_phred: 5,
          polyphen_score: 0.5,
          impact: 'HIGH',
          gene_symbol: 'GENE3',
        }, // Non-picked
      ],
      colocated_variants: [
        {
          id: 'rs12345',
          frequencies: {
            gnomade: 0.001,
            gnomadg: 0.002,
          },
        },
      ],
    };

    describe('_findPrioritizedTranscript()', () => {
      it('should find transcript with pick=1', () => {
        const result = scoring._findPrioritizedTranscript(mockVepAnnotationWithPicks);
        expect(result).to.not.be.null;
        expect(result.transcript_id).to.equal('T2');
        expect(result.pick).to.equal(1);
      });

      it('should find transcript with mane=1 when no pick=1', () => {
        const annotation = {
          transcript_consequences: [
            { transcript_id: 'T1', cadd_phred: 10 },
            { transcript_id: 'T2', mane: 1, cadd_phred: 25 },
            { transcript_id: 'T3', cadd_phred: 5 },
          ],
        };
        const result = scoring._findPrioritizedTranscript(annotation);
        expect(result).to.not.be.null;
        expect(result.transcript_id).to.equal('T2');
        expect(result.mane).to.equal(1);
      });

      it('should find transcript with canonical=1 when no pick or mane', () => {
        const annotation = {
          transcript_consequences: [
            { transcript_id: 'T1', cadd_phred: 10 },
            { transcript_id: 'T2', canonical: 1, cadd_phred: 25 },
            { transcript_id: 'T3', cadd_phred: 5 },
          ],
        };
        const result = scoring._findPrioritizedTranscript(annotation);
        expect(result).to.not.be.null;
        expect(result.transcript_id).to.equal('T2');
        expect(result.canonical).to.equal(1);
      });

      it('should return first transcript as fallback', () => {
        const annotation = {
          transcript_consequences: [
            { transcript_id: 'T1', cadd_phred: 10 },
            { transcript_id: 'T2', cadd_phred: 25 },
            { transcript_id: 'T3', cadd_phred: 5 },
          ],
        };
        const result = scoring._findPrioritizedTranscript(annotation);
        expect(result).to.not.be.null;
        expect(result.transcript_id).to.equal('T1');
      });

      it('should return null for empty transcript consequences', () => {
        const annotation = { transcript_consequences: [] };
        const result = scoring._findPrioritizedTranscript(annotation);
        expect(result).to.be.null;
      });
    });

    describe('Annotation-level scoring with prioritized transcript', () => {
      it("should calculate annotation-level scores using the prioritized transcript's data", () => {
        const scopedScoringConfig = {
          variables: {
            aggregates: {
              'colocated_variants.0.frequencies.gnomade': 'gnomade_variant|default:0',
            },
            transcriptFields: {
              cadd_phred: 'cadd_phred_variant|default:0',
              impact: 'impact_variant',
            },
          },
          formulas: {
            annotationLevel: [{ variant_score: 'cadd_phred_variant + 10' }],
            transcriptLevel: [],
          },
        };

        const result = scoring.applyScoring([mockVepAnnotationWithPicks], scopedScoringConfig);

        // Should use CADD from picked transcript (T2: 25) not max CADD (25)
        // Expected: 25 + 10 = 35
        expect(result[0]).to.have.property('variant_score', 35);
      });

      it('should use globally aggregated variables for variant-level fields', () => {
        const scopedScoringConfig = {
          variables: {
            aggregates: {
              'colocated_variants.0.frequencies.gnomade': 'gnomade_variant|default:0',
            },
            transcriptFields: {
              cadd_phred: 'cadd_phred_variant|default:0',
            },
          },
          formulas: {
            annotationLevel: [{ variant_score: 'gnomade_variant * 1000 + cadd_phred_variant' }],
            transcriptLevel: [],
          },
        };

        const result = scoring.applyScoring([mockVepAnnotationWithPicks], scopedScoringConfig);

        // Should use gnomAD from variant (0.001) and CADD from picked transcript (25)
        // Expected: 0.001 * 1000 + 25 = 1 + 25 = 26
        expect(result[0]).to.have.property('variant_score', 26);
      });
    });

    describe('Transcript-level scoring with individual transcript data', () => {
      it('should calculate transcript-level scores using individual transcript data', () => {
        const scopedScoringConfig = {
          variables: {
            aggregates: {
              'colocated_variants.0.frequencies.gnomade': 'gnomade_variant|default:0',
            },
            transcriptFields: {
              polyphen_score: 'polyphen_score_variant|default:0',
            },
          },
          formulas: {
            annotationLevel: [],
            transcriptLevel: [{ transcript_score: 'polyphen_score_variant * 10' }],
          },
        };

        const result = scoring.applyScoring([mockVepAnnotationWithPicks], scopedScoringConfig);

        // Each transcript should use its own polyphen_score
        expect(result[0].transcript_consequences[0]).to.have.property('transcript_score', 2); // 0.2 * 10
        expect(result[0].transcript_consequences[1]).to.have.property('transcript_score', 9); // 0.9 * 10
        expect(result[0].transcript_consequences[2]).to.have.property('transcript_score', 5); // 0.5 * 10
      });

      it('should combine aggregated and transcript-specific variables in transcript scoring', () => {
        const scopedScoringConfig = {
          variables: {
            aggregates: {
              'colocated_variants.0.frequencies.gnomade': 'gnomade_variant|default:0',
            },
            transcriptFields: {
              cadd_phred: 'cadd_phred_variant|default:0',
            },
          },
          formulas: {
            annotationLevel: [],
            transcriptLevel: [{ transcript_score: 'gnomade_variant * 1000 + cadd_phred_variant' }],
          },
        };

        const result = scoring.applyScoring([mockVepAnnotationWithPicks], scopedScoringConfig);

        // Each transcript should use the same gnomAD (0.001) but its own CADD
        expect(result[0].transcript_consequences[0]).to.have.property('transcript_score', 11); // 0.001 * 1000 + 10
        expect(result[0].transcript_consequences[1]).to.have.property('transcript_score', 26); // 0.001 * 1000 + 25
        expect(result[0].transcript_consequences[2]).to.have.property('transcript_score', 6); // 0.001 * 1000 + 5
      });
    });

    describe('Legacy configuration support', () => {
      it('should still work with legacy variable configuration format', () => {
        const legacyScoringConfig = {
          variables: {
            'transcript_consequences.*.cadd_phred': 'max:cadd_phred_variant|default:25',
            'colocated_variants.0.frequencies.gnomade': 'gnomade_variant|default:0',
          },
          formulas: {
            annotationLevel: [
              { variant_score: 'cadd_phred_variant * 0.1 + gnomade_variant * 100' },
            ],
            transcriptLevel: [],
          },
        };

        const result = scoring.applyScoring([mockVepAnnotationWithPicks], legacyScoringConfig);

        // Legacy should still use max aggregation: max CADD (25) * 0.1 + gnomAD (0.001) * 100
        // Expected: 25 * 0.1 + 0.001 * 100 = 2.5 + 0.1 = 2.6
        expect(result[0]).to.have.property('variant_score');
        expect(result[0].variant_score).to.be.closeTo(2.6, 0.1);
      });
    });

    describe('Aggregator with single scalar value bug fix', () => {
      it('should wrap single scalar value in array for aggregators instead of using default', () => {
        // Test case for the bug fix where a single scalar value (not an array)
        // would incorrectly fall back to the default value when using an aggregator
        const mockAnnotationWithSingleValue = {
          input: '1 100000 . G A . . .',
          id: 'variant_single_value',
          most_severe_consequence: 'missense_variant',
          colocated_variants: [
            {
              id: 'rs99999',
              frequencies: {
                gnomade: 0.001, // Single scalar value, not an array
              },
            },
          ],
          transcript_consequences: [
            {
              transcript_id: 'ENST00000001',
              gene_symbol: 'GENE1',
              cadd_phred: 30, // Single scalar value
            },
          ],
        };

        // Configuration using aggregators with single values
        const scoringConfig = {
          variables: {
            // Legacy format with max aggregator
            'colocated_variants.*.frequencies.gnomade': 'max:gnomade_max|default:0.5',
            // Object format with min aggregator
            'transcript_consequences.*.cadd_phred': {
              target: 'cadd_min',
              aggregator: 'min',
              defaultValue: 100,
            },
          },
          formulas: {
            annotationLevel: [
              {
                single_value_score: 'gnomade_max * 1000 + cadd_min',
              },
            ],
            transcriptLevel: [],
          },
        };

        const result = scoring.applyScoring([mockAnnotationWithSingleValue], scoringConfig);

        // The bug fix should ensure that:
        // 1. gnomade_max uses the actual value 0.001, not the default 0.5
        // 2. cadd_min uses the actual value 30, not the default 100
        // Expected: 0.001 * 1000 + 30 = 1 + 30 = 31
        expect(result[0]).to.have.property('single_value_score');
        expect(result[0].single_value_score).to.equal(31);
      });

      it('should handle different aggregators with single values correctly', () => {
        const testCases = [
          { aggregator: 'max', expected: 42 },
          { aggregator: 'min', expected: 42 },
          { aggregator: 'avg', expected: 42 },
          { aggregator: 'average', expected: 42 },
        ];

        testCases.forEach(({ aggregator, expected }) => {
          const mockAnnotation = {
            values: {
              score: 42, // Single value to test various aggregators
            },
          };

          const scoringConfig = {
            variables: {
              'values.score': {
                target: `score_${aggregator}`,
                aggregator: aggregator,
                defaultValue: 999,
              },
            },
            formulas: {
              annotationLevel: [{ [`test_${aggregator}`]: `score_${aggregator}` }],
              transcriptLevel: [],
            },
          };

          const result = scoring.applyScoring([mockAnnotation], scoringConfig);
          expect(result[0]).to.have.property(
            `test_${aggregator}`,
            expected,
            `${aggregator} aggregator should use actual value, not default`
          );
        });

        // Test unique aggregator separately (returns array)
        const mockAnnotationUnique = {
          values: {
            frequency: 0.123,
          },
        };

        const uniqueConfig = {
          variables: {
            'values.frequency': {
              target: 'freq_unique',
              aggregator: 'unique',
              defaultValue: [0],
            },
          },
          formulas: {
            annotationLevel: [
              { test_unique: 'freq_unique[0]' }, // Access first element of unique array
            ],
            transcriptLevel: [],
          },
        };

        const uniqueResult = scoring.applyScoring([mockAnnotationUnique], uniqueConfig);
        expect(uniqueResult[0]).to.have.property('test_unique', 0.123);
      });

      it('should correctly calculate nephro_variant_score for variant 20-23637934-T-G', () => {
        // This is a specific test for the bug report:
        // Variant 20-23637934-T-G should have NVS of 0.000 (not 0.75)
        // because it has a high gnomade frequency of 0.2267
        const mockVariant20Underscore23637934 = {
          input: '20 23637934 . T G . . .',
          id: '.',
          most_severe_consequence: 'splice_acceptor_variant',
          colocated_variants: [
            {
              id: 'rs73318135',
              frequencies: {
                G: {
                  gnomade: 0.2267,
                  gnomadg: 0.2044,
                },
              },
            },
          ],
          transcript_consequences: [
            {
              transcript_id: 'ENST00000376925',
              gene_symbol: 'CST3',
              hgnc_id: 'HGNC:2475',
              consequence_terms: ['5_prime_UTR_variant'],
              impact: 'MODIFIER',
              cadd_phred: 2.032,
              mane_select: 'NM_000099.4',
            },
            {
              transcript_id: 'ENST00000398409',
              gene_symbol: 'CST3',
              hgnc_id: 'HGNC:2475',
              consequence_terms: ['splice_acceptor_variant'],
              impact: 'HIGH',
              cadd_phred: 2.032,
            },
          ],
        };

        const nephroScoringConfig = {
          variables: {
            'transcript_consequences.*.consequence_terms':
              'unique:consequence_terms_variant|default:0',
            'transcript_consequences.*.cadd_phred': 'max:cadd_phred_variant|default:7.226',
            'transcript_consequences.*.impact': 'unique:impact_variant|default:LOW',
            'transcript_consequences.*.hgnc_id': 'unique:hgnc_id',
            'transcript_consequences.*.gene_symbol': 'unique:gene_symbol',
            'colocated_variants.*.frequencies.*.gnomade': 'max:gnomade_variant|default:1.626e-05',
            'colocated_variants.*.frequencies.*.gnomadg': 'max:gnomadg_variant|default:5.256e-05',
          },
          formulas: {
            annotationLevel: [
              {
                nephro_variant_score:
                  '1 / (1 + Math.exp(-((-36.30796) + ((gnomade_variant - 0.00658) / 0.05959) * (-309.33539) + ((gnomadg_variant - 0.02425) / 0.11003) * (-2.54581) + ((consequence_terms_variant.map(val => val === "missense_variant" ? 1 : 0).includes(1) ? 1 : 0) - 0.24333) / 0.42909 * (-1.14313) + ((consequence_terms_variant.map(val => val === "synonymous_variant" ? 1 : 0).includes(1) ? 1 : 0) - 0.22931) / 0.42039 * (-0.96418) + ((consequence_terms_variant.map(val => val === "stop_gained" ? 1 : 0).includes(1) ? 1 : 0) - 0.06932) / 0.25400 * (-0.40553) + ((consequence_terms_variant.map(val => val === "frameshift_variant" ? 1 : 0).includes(1) ? 1 : 0) - 0.13615) / 0.34295 * (0.90216) + ((cadd_phred_variant - 12.47608) / 11.78359) * 2.68520 + ((Math.max(...impact_variant.map(val => ({ "HIGH": 4, "MODERATE": 3, "LOW": 2, "MODIFIER": 1 }[val] || 0))) - 2.49999) / 1.11804) * 3.14822)))',
              },
              {
                gene_symbol: 'gene_symbol',
              },
              {
                hgnc_id: 'hgnc_id',
              },
            ],
            transcriptLevel: [],
          },
        };

        const result = scoring.applyScoring([mockVariant20Underscore23637934], nephroScoringConfig);

        // The key assertion: NVS should be close to 0.000, not 0.75
        // With the bug fix, it uses the actual gnomade value (0.2267) instead of the default (1.626e-05)
        expect(result[0]).to.have.property('nephro_variant_score');
        expect(result[0].nephro_variant_score).to.be.closeTo(0.0, 0.001);

        // Additional assertions to verify other fields
        expect(result[0]).to.have.property('gene_symbol');
        expect(result[0].gene_symbol).to.deep.equal(['CST3']);
        expect(result[0]).to.have.property('hgnc_id');
        expect(result[0].hgnc_id).to.deep.equal(['HGNC:2475']);
      });
    });
  });
});
