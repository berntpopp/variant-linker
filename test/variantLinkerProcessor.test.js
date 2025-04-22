/**
 * Unit tests for the variantLinkerProcessor module
 */

'use strict';

const { expect } = require('chai');
const { filterAndFormatResults } = require('../src/variantLinkerProcessor');

describe('variantLinkerProcessor', () => {
  // Sample variant annotation data for testing
  const testResults = {
    meta: {
      stepsPerformed: [],
      variant: 'rs123',
    },
    annotationData: [
      {
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
      },
      {
        input: 'rs456',
        id: 'rs456',
        seq_region_name: 'chr2',
        start: 2000,
        end: 2001,
        strand: 1,
        allele_string: 'C/T',
        most_severe_consequence: 'intergenic_variant',
      },
    ],
  };

  describe('filterAndFormatResults', () => {
    it('should format results as JSON correctly', () => {
      const formattedResults = filterAndFormatResults(testResults, null, 'JSON');
      expect(formattedResults).to.be.a('string');

      // Parse back to object to validate contents
      const parsed = JSON.parse(formattedResults);
      expect(parsed).to.have.property('meta');
      expect(parsed).to.have.property('annotationData');
      expect(parsed.annotationData).to.be.an('array').with.lengthOf(2);
    });

    it('should format results as CSV correctly', () => {
      const formattedResults = filterAndFormatResults(testResults, null, 'CSV');
      expect(formattedResults).to.be.a('string');

      // Basic CSV structure validation
      const lines = formattedResults.split('\n');
      expect(lines.length).to.be.greaterThan(1); // At least header + 1 data row

      // First line should be headers
      const headers = lines[0].split(',');
      expect(headers).to.include.members(['OriginalInput', 'GeneSymbol', 'Impact', 'TranscriptID']);

      // Check data row count: 2 consequence rows for variant 1 + 1 row for variant 2
      expect(lines.length).to.equal(4);

      // Verify CSV line count reflects the flattening strategy
      expect(testResults.meta.stepsPerformed).to.include.members([
        'Formatted output as CSV using flatten-by-consequence strategy with 3 rows',
      ]);
    });

    it('should format results as TSV correctly', () => {
      const formattedResults = filterAndFormatResults(testResults, null, 'TSV');
      expect(formattedResults).to.be.a('string');

      // Basic TSV structure validation
      const lines = formattedResults.split('\n');
      expect(lines.length).to.be.greaterThan(1);

      // First line should be headers
      const headers = lines[0].split('\t');
      expect(headers).to.include.members(['OriginalInput', 'GeneSymbol', 'Impact', 'TranscriptID']);

      // Check that TSV has tabs as delimiters
      expect(lines[0]).to.include('\t');
      expect(lines[0]).to.not.include(',');

      // Check that we get the expected number of rows
      expect(lines.length).to.equal(4);

      // Check that TSV line count reflects flattening
      expect(testResults.meta.stepsPerformed).to.include.members([
        'Formatted output as TSV using flatten-by-consequence strategy with 3 rows',
      ]);
    });

    it('should handle variants with no transcript_consequences', () => {
      const resultsWithNoConsequences = {
        meta: { stepsPerformed: [] },
        annotationData: [
          {
            input: 'rs456',
            id: 'rs456',
            seq_region_name: 'chr2',
            most_severe_consequence: 'intergenic_variant',
            // No transcript_consequences array
          },
        ],
      };

      const formattedResults = filterAndFormatResults(resultsWithNoConsequences, null, 'CSV');
      const lines = formattedResults.split('\n');

      // Should have header + 1 data row
      expect(lines.length).to.equal(2);

      // Should still include default values for consequence-level fields
      const headers = lines[0].split(',');
      const dataFields = lines[1].split(',');
      const geneSymbolIndex = headers.findIndex((h) => h === 'GeneSymbol');

      expect(geneSymbolIndex).to.be.greaterThan(-1);
      expect(dataFields[geneSymbolIndex]).to.equal('');
    });

    it('should throw error for unsupported format', () => {
      expect(() => filterAndFormatResults(testResults, null, 'UNKNOWN')).to.throw(
        /Unsupported format/
      );
    });

    // Test filtering functionality combined with CSV/TSV output
    it('should apply filters before formatting as CSV', () => {
      const filterCriteria = {
        'transcript_consequences.*.impact': { eq: 'MODERATE' },
      };

      const formattedResults = filterAndFormatResults(testResults, filterCriteria, 'CSV');
      const lines = formattedResults.split('\n');

      // Only rows with MODERATE impact should remain
      const headers = lines[0].split(',');
      const impactIndex = headers.findIndex((h) => h === 'Impact');

      // Since filtering is applied to the consequences, we should still have 1+ data rows
      expect(lines.length).to.be.greaterThanOrEqual(2); // At least header + 1 data row
      expect(impactIndex).to.be.greaterThan(-1);

      // If we have data rows, check that they have the MODERATE impact
      if (lines.length > 1) {
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() !== '') {
            const fields = lines[i].split(',');
            if (fields.length > impactIndex && fields[impactIndex].trim() !== '') {
              expect(fields[impactIndex]).to.equal('MODERATE');
            }
          }
        }
      }
    });
  });

  describe('CSV and TSV output advanced tests', () => {
    it('should handle empty annotation data', () => {
      const emptyResults = {
        meta: { stepsPerformed: [] },
        annotationData: [],
      };

      const csvResult = filterAndFormatResults(emptyResults, null, 'CSV');

      // Should include headers but no data rows
      const csvLines = csvResult.split('\n');
      expect(csvLines.length).to.equal(1); // Just header row
      expect(csvLines[0]).to.include('OriginalInput');

      // Check steps performed message
      expect(emptyResults.meta.stepsPerformed).to.include.members([
        'Formatted output as CSV using flatten-by-consequence strategy with 0 rows',
      ]);
    });

    it('should handle annotations with very large transcript_consequences arrays', () => {
      // Create a variant with 50 transcript consequences
      const manyConsequencesVariant = {
        input: 'test_large',
        id: 'test_large',
        seq_region_name: 'chr1',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: Array(50)
          .fill(0)
          .map((_, i) => ({
            impact: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MODERATE' : 'LOW',
            gene_symbol: `GENE${i}`,
            transcript_id: `ENST${i}`,
            consequence_terms: ['missense_variant'],
          })),
      };

      const largeResults = {
        meta: { stepsPerformed: [] },
        annotationData: [manyConsequencesVariant],
      };

      const csvResult = filterAndFormatResults(largeResults, null, 'CSV');
      const csvLines = csvResult.split('\n');

      // Should have 51 lines: 1 header + 50 transcript consequences
      expect(csvLines.length).to.equal(51);

      // Check steps performed message
      expect(largeResults.meta.stepsPerformed).to.include.members([
        'Formatted output as CSV using flatten-by-consequence strategy with 50 rows',
      ]);
    });

    it('should properly escape special characters in CSV output', () => {
      const specialCharsVariant = {
        input: 'special,chars',
        id: 'special,chars',
        seq_region_name: 'chr1',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            impact: 'HIGH',
            gene_symbol: 'GENE_WITH,COMMA',
            transcript_id: 'TRANSCRIPT_WITH"QUOTES"',
            consequence_terms: ['term1', 'term2'],
          },
        ],
      };

      const specialResults = {
        meta: { stepsPerformed: [] },
        annotationData: [specialCharsVariant],
      };

      const csvResult = filterAndFormatResults(specialResults, null, 'CSV');
      const csvLines = csvResult.split('\n');

      // Check that commas and quotes are properly escaped in CSV
      const dataLine = csvLines[1]; // Second line (first data row)
      expect(dataLine).to.include('"special,chars"'); // Input field with comma should be quoted
      expect(dataLine).to.include('"GENE_WITH,COMMA"'); // Gene symbol with comma should be quoted
      expect(dataLine).to.include('"TRANSCRIPT_WITH""QUOTES"""'); // Transcript with quotes should have doubled quotes

      // Check that TSV doesn't escape the same way
      const tsvResult = filterAndFormatResults(specialResults, null, 'TSV');
      const tsvLines = tsvResult.split('\n');
      const tsvDataLine = tsvLines[1];

      // In TSV, tabs separate fields so commas don't need escaping
      expect(tsvDataLine).to.include('special,chars');
      expect(tsvDataLine).to.include('GENE_WITH,COMMA');
      expect(tsvDataLine).to.include('TRANSCRIPT_WITH"QUOTES"');
    });

    it('should apply complex filters before formatting as CSV', () => {
      // Sample data with multiple variants and consequences
      const mixedVariants = {
        meta: { stepsPerformed: [] },
        annotationData: [
          {
            input: 'var1',
            id: 'var1',
            seq_region_name: 'chr1',
            transcript_consequences: [
              { impact: 'HIGH', gene_symbol: 'GENE1' },
              { impact: 'MODERATE', gene_symbol: 'GENE2' },
              { impact: 'LOW', gene_symbol: 'GENE3' },
            ],
          },
          {
            input: 'var2',
            id: 'var2',
            seq_region_name: 'chr2',
            transcript_consequences: [
              { impact: 'HIGH', gene_symbol: 'GENE4' },
              { impact: 'LOW', gene_symbol: 'GENE5' },
            ],
          },
        ],
      };

      // Complex filter: HIGH impact AND gene symbols containing '1' or '4'
      const complexFilter = {
        'transcript_consequences.*.impact': { eq: 'HIGH' },
        'transcript_consequences.*.gene_symbol': { in: ['GENE1', 'GENE4'] },
      };

      const csvResult = filterAndFormatResults(mixedVariants, complexFilter, 'CSV');
      const csvLines = csvResult.split('\n');

      // Should only include consequences matching the filter criteria
      // Header + 2 filtered data rows with HIGH impact
      expect(csvLines.length).to.equal(3);

      // Check each data row contains expected gene symbols and impacts
      const headers = csvLines[0].split(',');
      const geneIndex = headers.findIndex((h) => h === 'GeneSymbol');
      const impactIndex = headers.findIndex((h) => h === 'Impact');

      // Check all data rows have HIGH impact and one of the expected genes
      for (let i = 1; i < csvLines.length; i++) {
        const dataFields = csvLines[i].split(',');
        if (dataFields.length > geneIndex && dataFields.length > impactIndex) {
          // Only check if the row has enough fields (not empty)
          if (dataFields[impactIndex]) {
            expect(dataFields[impactIndex]).to.equal('HIGH');
          }
          if (dataFields[geneIndex]) {
            expect(['GENE1', 'GENE4']).to.include(dataFields[geneIndex]);
          }
        }
      }
    });
  });
});
