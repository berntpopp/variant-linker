/**
 * Unit tests for the dataExtractor module
 */

'use strict';

const { expect } = require('chai');
const { extractField, flattenAnnotationData, formatToTabular } = require('../src/dataExtractor');

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
});
