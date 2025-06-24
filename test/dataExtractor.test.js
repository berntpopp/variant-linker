/**
 * Unit tests for the dataExtractor module
 */

'use strict';

const { expect } = require('chai');
const {
  extractField,
  flattenAnnotationData,
  formatToTabular,
  formatVcfCsqString,
} = require('../src/dataExtractor');

describe('dataExtractor', () => {
  describe('extractField', () => {
    it('should extract a simple field from an object', () => {
      const obj = { name: 'test', value: 42 };
      const config = { path: 'name', defaultValue: '' };
      expect(extractField(obj, config)).to.equal('test');
    });

    it('should extract a nested field using dot notation', () => {
      const obj = { person: { name: 'test', age: 30 } };
      const config = { path: 'person.name', defaultValue: '' };
      expect(extractField(obj, config)).to.equal('test');
    });

    it('should return default value when field is not found', () => {
      const obj = { name: 'test' };
      const config = { path: 'age', defaultValue: 'unknown' };
      expect(extractField(obj, config)).to.equal('unknown');
    });

    it('should apply formatter function when provided', () => {
      const obj = { name: 'test' };
      const config = {
        path: 'name',
        defaultValue: '',
        formatter: (value) => value.toUpperCase(),
      };
      expect(extractField(obj, config)).to.equal('TEST');
    });

    it('should handle wildcard paths in arrays', () => {
      const obj = {
        items: [
          { id: 1, name: 'item1' },
          { id: 2, name: 'item2' },
        ],
      };
      const config = { path: 'items.*.name', defaultValue: [] };
      expect(extractField(obj, config)).to.deep.equal(['item1', 'item2']);
    });

    it('should handle arrays with formatter', () => {
      const obj = {
        terms: ['term1', 'term2', 'term3'],
      };
      const config = {
        path: 'terms',
        defaultValue: '',
        formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
      };
      expect(extractField(obj, config)).to.equal('term1&term2&term3');
    });

    it('should handle null or undefined dataObject', () => {
      const config = { path: 'name', defaultValue: 'default' };
      expect(extractField(null, config)).to.equal('default');
      expect(extractField(undefined, config)).to.equal('default');
    });
  });

  describe('flattenAnnotationData', () => {
    // Test data for flattening
    const testAnnotation = {
      input: 'rs123',
      id: 'rs123',
      seq_region_name: 'chr1',
      start: 1000,
      end: 1001,
      strand: 1,
      allele_string: 'A/G',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          impact: 'MODERATE',
          gene_symbol: 'GENE1',
          gene_id: 'ENSG00000123',
          feature_type: 'Transcript',
          transcript_id: 'ENST00000456',
          consequence_terms: ['missense_variant', 'splice_region_variant'],
          hgvsc: 'ENST00000456:c.123A>G',
          hgvsp: 'ENSP00000456:p.Thr41Ala',
        },
        {
          impact: 'LOW',
          gene_symbol: 'GENE1',
          gene_id: 'ENSG00000123',
          feature_type: 'Transcript',
          transcript_id: 'ENST00000789',
          consequence_terms: ['downstream_gene_variant'],
          hgvsc: '',
          hgvsp: '',
        },
      ],
    };

    // Simplified column config for testing
    const testColumnConfig = [
      { header: 'Input', path: 'input', isConsequenceLevel: false, defaultValue: '' },
      { header: 'GeneSymbol', path: 'gene_symbol', isConsequenceLevel: true, defaultValue: '' },
      { header: 'Impact', path: 'impact', isConsequenceLevel: true, defaultValue: '' },
      {
        header: 'ConsequenceTerms',
        path: 'consequence_terms',
        isConsequenceLevel: true,
        defaultValue: '',
        formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
      },
    ];

    it('should flatten annotation data with multiple consequences', () => {
      const result = flattenAnnotationData([testAnnotation], testColumnConfig);
      expect(result).to.be.an('array').with.lengthOf(2);
      expect(result[0].Input).to.equal('rs123');
      expect(result[0].GeneSymbol).to.equal('GENE1');
      expect(result[0].Impact).to.equal('MODERATE');
      expect(result[0].ConsequenceTerms).to.equal('missense_variant&splice_region_variant');
      expect(result[1].Input).to.equal('rs123');
      expect(result[1].GeneSymbol).to.equal('GENE1');
      expect(result[1].Impact).to.equal('LOW');
      expect(result[1].ConsequenceTerms).to.equal('downstream_gene_variant');
    });

    it('should handle annotation without transcript consequences', () => {
      const annotationWithoutConsequences = {
        input: 'rs456',
        id: 'rs456',
        seq_region_name: 'chr2',
        start: 2000,
        end: 2001,
        strand: 1,
        allele_string: 'C/T',
        most_severe_consequence: 'intergenic_variant',
      };

      const result = flattenAnnotationData([annotationWithoutConsequences], testColumnConfig);
      expect(result).to.be.an('array').with.lengthOf(1);
      expect(result[0].Input).to.equal('rs456');
      expect(result[0].GeneSymbol).to.equal('');
      expect(result[0].Impact).to.equal('');
      expect(result[0].ConsequenceTerms).to.equal('');
    });

    it('should handle empty annotation data array', () => {
      const result = flattenAnnotationData([], testColumnConfig);
      expect(result).to.be.an('array').with.lengthOf(0);
    });

    it('should handle non-array annotation data', () => {
      const result = flattenAnnotationData('not an array', testColumnConfig);
      expect(result).to.be.an('array').with.lengthOf(0);
    });

    it('should use default column config if none provided', () => {
      const result = flattenAnnotationData([testAnnotation]);
      expect(result).to.be.an('array').with.lengthOf(2);
      // Check for default column headers
      expect(result[0]).to.have.property('OriginalInput');
      expect(result[0]).to.have.property('VEPInput');
      expect(result[0]).to.have.property('Impact');
      expect(result[0]).to.have.property('GeneSymbol');
    });
  });

  describe('formatToTabular', () => {
    const testRows = [
      { Col1: 'value1', Col2: 'value2', Col3: 'value3' },
      { Col1: 'value4', Col2: 'value5', Col3: 'value6' },
    ];

    const testConfig = [{ header: 'Col1' }, { header: 'Col2' }, { header: 'Col3' }];

    it('should format rows as CSV with headers', () => {
      const result = formatToTabular(testRows, testConfig, ',', true);
      const lines = result.split('\n');
      expect(lines).to.have.lengthOf(3); // Header + 2 data rows
      expect(lines[0]).to.equal('Col1,Col2,Col3');
      expect(lines[1]).to.equal('value1,value2,value3');
      expect(lines[2]).to.equal('value4,value5,value6');
    });

    it('should format rows as TSV with headers', () => {
      const result = formatToTabular(testRows, testConfig, '\t', true);
      const lines = result.split('\n');
      expect(lines).to.have.lengthOf(3);
      expect(lines[0]).to.equal('Col1\tCol2\tCol3');
      expect(lines[1]).to.equal('value1\tvalue2\tvalue3');
      expect(lines[2]).to.equal('value4\tvalue5\tvalue6');
    });

    it('should format rows without headers if specified', () => {
      const result = formatToTabular(testRows, testConfig, ',', false);
      const lines = result.split('\n');
      expect(lines).to.have.lengthOf(2); // No header, only data rows
      expect(lines[0]).to.equal('value1,value2,value3');
      expect(lines[1]).to.equal('value4,value5,value6');
    });

    it('should handle empty rows array', () => {
      const result = formatToTabular([], testConfig, ',', true);
      expect(result).to.equal('Col1,Col2,Col3'); // Headers only
    });

    it('should handle null values', () => {
      const rowsWithNull = [{ Col1: 'value1', Col2: null, Col3: 'value3' }];
      const result = formatToTabular(rowsWithNull, testConfig, ',', true);
      const lines = result.split('\n');
      expect(lines[1]).to.equal('value1,,value3');
    });

    it('should properly escape CSV fields with commas and quotes', () => {
      const rowsWithSpecialChars = [
        { Col1: 'value,with,commas', Col2: 'value with "quotes"', Col3: 'normal' },
      ];
      const result = formatToTabular(rowsWithSpecialChars, testConfig, ',', true);
      const lines = result.split('\n');
      expect(lines[1]).to.equal('"value,with,commas","value with ""quotes""",normal');
    });

    it('should not escape TSV fields with commas', () => {
      const rowsWithSpecialChars = [
        { Col1: 'value,with,commas', Col2: 'value with "quotes"', Col3: 'normal' },
      ];
      const result = formatToTabular(rowsWithSpecialChars, testConfig, '\t', true);
      const lines = result.split('\n');
      expect(lines[1]).to.equal('value,with,commas\tvalue with "quotes"\tnormal');
    });
  });

  describe('formatVcfCsqString - Most Severe Consequence', () => {
    // Mock annotation where most severe consequence is NOT in the first transcript
    const mockAnnotationForCsqTest = {
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          // First consequence - less severe
          impact: 'MODIFIER',
          gene_symbol: 'WRONG_GENE',
          gene_id: 'ENSG00000001',
          feature_type: 'Transcript',
          transcript_id: 'ENST00000001',
          biotype: 'protein_coding',
          consequence_terms: ['intron_variant'],
          hgvsc: 'ENST00000001:c.100+5G>A',
          hgvsp: '',
          protein_start: null,
          protein_end: null,
          amino_acids: '',
          codons: '',
          sift_prediction: '',
          polyphen_prediction: '',
        },
        {
          // Second consequence - most severe
          impact: 'MODERATE',
          gene_symbol: 'CORRECT_GENE',
          gene_id: 'ENSG00000002',
          feature_type: 'Transcript',
          transcript_id: 'ENST00000002',
          biotype: 'protein_coding',
          consequence_terms: ['missense_variant'],
          hgvsc: 'ENST00000002:c.200A>G',
          hgvsp: 'ENSP00000002:p.Thr67Ala',
          protein_start: 67,
          protein_end: 67,
          amino_acids: 'T/A',
          codons: 'aCc/gCc',
          sift_prediction: 'deleterious',
          polyphen_prediction: 'probably_damaging',
        },
        {
          // Third consequence - also less severe
          impact: 'LOW',
          gene_symbol: 'ANOTHER_GENE',
          gene_id: 'ENSG00000003',
          feature_type: 'Transcript',
          transcript_id: 'ENST00000003',
          biotype: 'protein_coding',
          consequence_terms: ['synonymous_variant'],
          hgvsc: 'ENST00000003:c.300C>T',
          hgvsp: 'ENSP00000003:p.Arg100=',
          protein_start: 100,
          protein_end: 100,
          amino_acids: '',
          codons: 'cgC/cgT',
          sift_prediction: '',
          polyphen_prediction: '',
        },
      ],
    };

    const csqFormatFields = [
      'IMPACT',
      'SYMBOL',
      'Gene',
      'Feature_type',
      'Feature',
      'BIOTYPE',
      'HGVSc',
      'HGVSp',
      'Protein_position',
      'Amino_acids',
      'Codons',
      'SIFT',
      'PolyPhen',
    ];

    it('should extract CSQ fields from the most severe consequence', () => {
      const result = formatVcfCsqString(mockAnnotationForCsqTest, csqFormatFields, 'G');

      // Split by comma to get individual consequence strings
      const csqStrings = result.split(',');
      expect(csqStrings).to.have.lengthOf(3); // Should have 3 consequences

      // Parse the first consequence string (should be from first transcript)
      const firstCsqFields = csqStrings[0].split('|').map(decodeURIComponent);
      expect(firstCsqFields[0]).to.equal('MODIFIER'); // IMPACT from first transcript
      expect(firstCsqFields[1]).to.equal('WRONG_GENE'); // SYMBOL from first transcript

      // Parse the second consequence string (should be from most severe transcript)
      const secondCsqFields = csqStrings[1].split('|').map(decodeURIComponent);
      expect(secondCsqFields[0]).to.equal('MODERATE'); // IMPACT from most severe
      expect(secondCsqFields[1]).to.equal('CORRECT_GENE'); // SYMBOL from most severe
      expect(secondCsqFields[2]).to.equal('ENSG00000002'); // Gene from most severe
      expect(secondCsqFields[3]).to.equal('Transcript'); // Feature_type from most severe
      expect(secondCsqFields[4]).to.equal('ENST00000002'); // Feature from most severe
      expect(secondCsqFields[5]).to.equal('protein_coding'); // BIOTYPE from most severe
      expect(secondCsqFields[6]).to.equal('ENST00000002:c.200A>G'); // HGVSc from most severe
      expect(secondCsqFields[7]).to.equal('ENSP00000002:p.Thr67Ala'); // HGVSp from most severe
      expect(secondCsqFields[8]).to.equal('67-67'); // Protein_position from most severe
      expect(secondCsqFields[9]).to.equal('T/A'); // Amino_acids from most severe
      expect(secondCsqFields[10]).to.equal('aCc/gCc'); // Codons from most severe
      expect(secondCsqFields[11]).to.equal('deleterious'); // SIFT from most severe
      expect(secondCsqFields[12]).to.equal('probably_damaging'); // PolyPhen from most severe
    });

    it('should fall back to first available data if most severe consequence not found', () => {
      const mockWithUnknownSevere = {
        ...mockAnnotationForCsqTest,
        most_severe_consequence: 'unknown_consequence', // Not in any consequence_terms
      };

      const result = formatVcfCsqString(mockWithUnknownSevere, ['IMPACT', 'SYMBOL'], 'G');
      const csqStrings = result.split(',');

      // Parse the first consequence string
      const firstCsqFields = csqStrings[0].split('|').map(decodeURIComponent);
      expect(firstCsqFields[0]).to.equal('MODIFIER'); // Falls back to first transcript's impact
      expect(firstCsqFields[1]).to.equal('WRONG_GENE'); // Falls back to first transcript with gene_symbol

      // Parse the second consequence string
      const secondCsqFields = csqStrings[1].split('|').map(decodeURIComponent);
      expect(secondCsqFields[0]).to.equal('MODERATE'); // Second transcript's impact
      expect(secondCsqFields[1]).to.equal('CORRECT_GENE'); // Second transcript's gene_symbol
    });

    it('should handle missing fields in most severe consequence', () => {
      const mockWithMissingFields = {
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            impact: 'MODIFIER',
            gene_symbol: 'FALLBACK_GENE',
            consequence_terms: ['intron_variant'],
            sift_prediction: 'tolerated',
          },
          {
            impact: 'MODERATE',
            gene_symbol: '', // Missing in most severe
            consequence_terms: ['missense_variant'],
            sift_prediction: '', // Missing in most severe
          },
        ],
      };

      const result = formatVcfCsqString(mockWithMissingFields, ['IMPACT', 'SYMBOL', 'SIFT'], 'G');
      const csqStrings = result.split(',');

      // Parse the first consequence string
      const firstCsqFields = csqStrings[0].split('|').map(decodeURIComponent);
      expect(firstCsqFields[0]).to.equal('MODIFIER'); // First transcript's impact
      expect(firstCsqFields[1]).to.equal('FALLBACK_GENE'); // First transcript's gene_symbol
      expect(firstCsqFields[2]).to.equal('tolerated'); // First transcript's SIFT

      // Parse the second consequence string (most severe consequence)
      const secondCsqFields = csqStrings[1].split('|').map(decodeURIComponent);
      expect(secondCsqFields[0]).to.equal('MODERATE'); // Most severe's impact (available)
      expect(secondCsqFields[1]).to.equal('FALLBACK_GENE'); // Should fallback to first available gene_symbol across all transcripts
      expect(secondCsqFields[2]).to.equal('tolerated'); // Should fallback to first available SIFT across all transcripts
    });

    it('should handle annotation without transcript consequences', () => {
      const mockWithoutConsequences = {
        most_severe_consequence: 'intergenic_variant',
      };

      const result = formatVcfCsqString(mockWithoutConsequences, csqFormatFields, 'G');
      expect(result).to.equal(''); // Should return empty string
    });

    it('should handle empty csqFormatFields array', () => {
      const result = formatVcfCsqString(mockAnnotationForCsqTest, [], 'G');
      expect(result).to.equal(''); // Should return empty string
    });

    it('should handle null annotation', () => {
      const result = formatVcfCsqString(null, csqFormatFields, 'G');
      expect(result).to.equal(''); // Should return empty string
    });

    it('should properly handle Protein_position with special logic', () => {
      const mockForProteinPos = {
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            consequence_terms: ['intron_variant'],
            protein_start: 100,
            protein_end: 100,
          },
          {
            consequence_terms: ['missense_variant'],
            protein_start: 67,
            protein_end: 67,
          },
        ],
      };

      const result = formatVcfCsqString(mockForProteinPos, ['Protein_position'], 'G');
      const csqStrings = result.split(',');

      // First consequence
      const firstCsqFields = csqStrings[0].split('|').map(decodeURIComponent);
      expect(firstCsqFields[0]).to.equal('100-100');

      // Second consequence (most severe)
      const secondCsqFields = csqStrings[1].split('|').map(decodeURIComponent);
      expect(secondCsqFields[0]).to.equal('67-67');
    });
  });
});
