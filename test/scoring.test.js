// test/scoring.test.js
// Comprehensive tests for the scoring module

const path = require('path');
const fs = require('fs');
const sinon = require('sinon');
const { expect, mockResponses } = require('./helpers');
const scoring = require('../src/scoring');

describe('scoring.js', () => {
  // Test data for our tests
  const mockVariableAssignmentConfig = {
    "@context": "https://schema.org/",
    "@type": "Configuration",
    "variables": {
      // String-based mapping (legacy format)
      "transcript_consequences.*.cadd_phred": "max:cadd_phred_variant|default:25",
      // Object-based mapping (new format)
      "transcript_consequences.*.impact": {
        "target": "impact_variant",
        "aggregator": "unique",
        "defaultValue": "MODIFIER"
      },
      // Conditional transformation
      "transcript_consequences.*.polyphen_score": {
        "target": "polyphen_harmful",
        "condition": "value > 0.8 ? 'probably_damaging' : (value > 0.5 ? 'possibly_damaging' : 'benign')",
        "defaultValue": "unknown"
      },
      // Simple path with no aggregation
      "most_severe_consequence": "consequence_variant",
      // Path with wildcard and dot notation
      "colocated_variants.*.frequencies.*.gnomade": "max:gnomade_variant|default:0"
    }
  };

  const mockFormulaConfig = {
    "@context": "https://schema.org/",
    "@type": "Configuration",
    "formulas": {
      "annotation_level": [
        { "variant_score": "cadd_phred_variant * 0.1 + (1 - gnomade_variant) * 50" }
      ],
      "transcript_level": [
        { "transcript_score": "polyphen_harmful === 'probably_damaging' ? 10 : (polyphen_harmful === 'possibly_damaging' ? 5 : 0)" }
      ]
    }
  };

  // Sample VEP annotation for testing
  const mockVepAnnotation = {
    "input": "1 65568 . A C . . .",
    "id": "variant1_1_65568_A_C",
    "most_severe_consequence": "missense_variant",
    "transcript_consequences": [
      {
        "transcript_id": "ENST00000001",
        "gene_id": "ENSG00000001",
        "gene_symbol": "GENE1",
        "consequence_terms": ["missense_variant"],
        "impact": "MODERATE",
        "polyphen_score": 0.95,
        "sift_score": 0.1,
        "cadd_phred": 28.5
      },
      {
        "transcript_id": "ENST00000002",
        "gene_id": "ENSG00000001",
        "gene_symbol": "GENE1",
        "consequence_terms": ["5_prime_UTR_variant"],
        "impact": "MODIFIER",
        "polyphen_score": 0.6,
        "sift_score": 0.4,
        "cadd_phred": 15.2
      }
    ],
    "colocated_variants": [
      {
        "id": "rs12345",
        "frequencies": {
          "gnomade": 0.001,
          "gnomadg": 0.002
        }
      },
      {
        "id": "rs67890",
        "frequencies": {
          "gnomade": 0.003
        }
      }
    ]
  };

  describe('parseScoringConfig()', () => {
    it('should parse variable assignment and formula configuration correctly', () => {
      const result = scoring.parseScoringConfig(mockVariableAssignmentConfig, mockFormulaConfig);
      
      // Verify structure
      expect(result).to.have.property('variables').that.is.an('object');
      expect(result).to.have.property('formulas').that.is.an('object');
      
      // Check variable assignments
      expect(result.variables['transcript_consequences.*.cadd_phred']).to.equal('max:cadd_phred_variant|default:25');
      
      // Check formulas
      expect(result.formulas).to.have.property('annotation_level').that.is.an('array');
      expect(result.formulas).to.have.property('transcript_level').that.is.an('array');
      expect(result.formulas.annotation_level[0]).to.have.property('variant_score');
      expect(result.formulas.transcript_level[0]).to.have.property('transcript_score');
    });
    
    it('should handle legacy formula configuration format', () => {
      const legacyFormulaConfig = {
        "formulas": [
          { "legacy_score": "cadd_phred_variant * 2" }
        ]
      };
      
      const result = scoring.parseScoringConfig(mockVariableAssignmentConfig, legacyFormulaConfig);
      
      expect(result.formulas.annotation_level).to.be.an('array');
      expect(result.formulas.annotation_level[0]).to.have.property('legacy_score');
      expect(result.formulas.transcript_level).to.be.an('array').that.is.empty;
    });
    
    it('should handle missing formula sections gracefully', () => {
      const emptyFormulaConfig = {
        "@context": "https://schema.org/"
      };
      
      const result = scoring.parseScoringConfig(mockVariableAssignmentConfig, emptyFormulaConfig);
      
      expect(result.formulas.annotation_level).to.be.an('array').that.is.empty;
      expect(result.formulas.transcript_level).to.be.an('array').that.is.empty;
    });
  });

  describe('readScoringConfigFromFiles()', () => {
    let fsReadFileSyncStub;
    
    beforeEach(() => {
      // Set up stubs for filesystem operations
      fsReadFileSyncStub = sinon.stub(fs, 'readFileSync');
    });
    
    afterEach(() => {
      // Restore original functions
      fsReadFileSyncStub.restore();
    });
    
    it('should read and parse scoring configuration files correctly', () => {
      // Set up mock file content
      fsReadFileSyncStub.withArgs(sinon.match(/variable_assignment_config\.json$/), 'utf-8')
        .returns(JSON.stringify(mockVariableAssignmentConfig));
      fsReadFileSyncStub.withArgs(sinon.match(/formula_config\.json$/), 'utf-8')
        .returns(JSON.stringify(mockFormulaConfig));
      
      const configPath = '/mock/scoring/profile';
      const result = scoring.readScoringConfigFromFiles(configPath);
      
      // Verify the result has the expected structure
      expect(result).to.have.property('variables').that.is.an('object');
      expect(result).to.have.property('formulas').that.is.an('object');
      expect(result.formulas).to.have.property('annotation_level').that.is.an('array');
      expect(result.formulas).to.have.property('transcript_level').that.is.an('array');
      
      // Verify that the filesystem was called with the expected paths
      expect(fsReadFileSyncStub.calledWith(`${configPath}/variable_assignment_config.json`, 'utf-8')).to.be.true;
      expect(fsReadFileSyncStub.calledWith(`${configPath}/formula_config.json`, 'utf-8')).to.be.true;
    });
    
    it('should propagate file reading errors', () => {
      // Simulate a filesystem error
      fsReadFileSyncStub.throws(new Error('File not found'));
      
      expect(() => scoring.readScoringConfigFromFiles('/nonexistent/path'))
        .to.throw('File not found');
    });
    
    it('should propagate JSON parsing errors', () => {
      // Return invalid JSON
      fsReadFileSyncStub.withArgs(sinon.match(/variable_assignment_config\.json$/), 'utf-8')
        .returns('{ invalid: json }');
      fsReadFileSyncStub.withArgs(sinon.match(/formula_config\.json$/), 'utf-8')
        .returns(JSON.stringify(mockFormulaConfig));
      
      expect(() => scoring.readScoringConfigFromFiles('/mock/path'))
        .to.throw(/JSON/);
    });
  });

  // We focus on testing public APIs rather than implementation details
  // This follows KISS principles and makes tests more resilient to refactoring

  describe('applyScoring()', () => {
    it('should apply annotation-level formulas to annotations', () => {
      const scoringConfig = {
        variables: {
          "transcript_consequences.*.cadd_phred": "max:cadd_phred_variant|default:25",
          "colocated_variants.*.frequencies.*.gnomade": "max:gnomade_variant|default:0"
        },
        formulas: {
          annotation_level: [
            { "variant_score": "cadd_phred_variant * 0.1 + (1 - gnomade_variant) * 50" }
          ],
          transcript_level: []
        }
      };
      
      const result = scoring.applyScoring([mockVepAnnotation], scoringConfig);
      
      expect(result[0]).to.have.property('variant_score');
      // 28.5 * 0.1 + (1 - 0.003) * 50 = 2.85 + 49.85 = 52.7
      // Allow for floating point precision differences
      expect(result[0].variant_score).to.be.closeTo(52.7, 0.2);
    });
    
    it('should apply transcript-level formulas to transcripts', () => {
      const scoringConfig = {
        variables: {
          "polyphen_score": {
            "target": "polyphen_harmful",
            "condition": "value > 0.8 ? 'probably_damaging' : (value > 0.5 ? 'possibly_damaging' : 'benign')",
            "defaultValue": "unknown"
          }
        },
        formulas: {
          annotation_level: [],
          transcript_level: [
            { "transcript_score": "polyphen_harmful === 'probably_damaging' ? 10 : (polyphen_harmful === 'possibly_damaging' ? 5 : 0)" }
          ]
        }
      };
      
      const result = scoring.applyScoring([mockVepAnnotation], scoringConfig);
      
      // First transcript has polyphen_score of 0.95 (probably_damaging) -> score 10
      expect(result[0].transcript_consequences[0]).to.have.property('transcript_score', 10);
      
      // Second transcript has polyphen_score of 0.6 (possibly_damaging) -> score 5
      expect(result[0].transcript_consequences[1]).to.have.property('transcript_score', 5);
    });
    
    it('should handle transcript-level formulas with extracted variables', () => {
      // Following KISS principle - create a minimal test case
      // with proper variable extraction
      
      const scoringConfig = {
        variables: {
          // Simple variable mapping directly from the object
          "frequencies.gnomade": "gnomade_value"
        },
        formulas: {
          annotation_level: [],
          transcript_level: [
            {
              "meta_score": "gnomade_value * 123400"
            }
          ]
        }
      };
      
      // Create an annotation with properly nested data structure
      const mockAnnotation = {
        transcript_consequences: [
          {
            // Variables will be extracted from this structure
            frequencies: {
              gnomade: 0.01
            }
          }
        ]
      };
      
      const result = scoring.applyScoring([mockAnnotation], scoringConfig);
      
      // Check that the transcript has a meta_score
      expect(result[0].transcript_consequences[0]).to.have.property('meta_score');
      // Value should be 1234 (0.01 * 123400)
      const score = result[0].transcript_consequences[0].meta_score;
      expect(score).to.equal(1234);
    });
    
    it('should handle annotation-level formulas with extracted variables', () => {
      // Following KISS principle - create a minimal test case
      // with proper variable extraction
      
      const scoringConfig = {
        variables: {
          // Simple variable mappings directly from the object
          "cadd_phred": "cadd_score",
          "gnomade": "frequency"
        },
        formulas: {
          annotation_level: [
            {
              "basic_score": "cadd_score * 2 - (frequency * 1000)"
            }
          ],
          transcript_level: []
        }
      };
      
      // Create a straightforward test annotation with proper structure
      const mockAnnotation = {
        // Variables will be extracted from this structure
        cadd_phred: 30,
        gnomade: 0.001
      };
      
      const result = scoring.applyScoring([mockAnnotation], scoringConfig);
      
      // Verify that the basic_score was calculated
      // Expected: 30 * 2 - (0.001 * 1000) = 60 - 1 = 59
      expect(result[0]).to.have.property('basic_score');
      const score = result[0].basic_score;
      expect(score).to.equal(59);
    });
  });
});
