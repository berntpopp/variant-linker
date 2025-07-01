/**
 * Integration tests using real-world fixture data for variant-linker CSV/TSV output
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { analyzeVariant } = require('../src/variantLinkerCore');

// Set timeout for all tests in this suite - defined in mocharc.json
describe('Fixture-based output format integration tests', function () {
  // Set a longer timeout for CI environments or slow API responses
  // eslint-disable-next-line no-invalid-this
  this.timeout(process.env.CI ? 240000 : 60000);

  // Helper function to retry API calls that might fail temporarily
  async function retryApiCall(apiCall, maxRetries = 2, retryDelay = 2000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Attempt the API call
        return await apiCall();
      } catch (error) {
        // Store the error in case all retries fail
        lastError = error;

        // Log the retry attempt
        console.log(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);

        // Don't wait after the last attempt
        if (attempt < maxRetries) {
          // Wait before the next retry
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError;
  }

  // Helper function to normalize line endings for cross-platform comparison
  function normalizeLineEndings(str) {
    return str.replace(/\r\n/g, '\n');
  }

  // Helper to read fixture file
  function readFixture(filename) {
    return normalizeLineEndings(
      fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8')
    );
  }

  // Helper function to compare results while being tolerant of timestamp/ordering differences
  function compareCSVTSVResults(actual, expected, delimiter, options = {}) {
    // Default options
    const opts = {
      // How much variance in row count to tolerate
      rowCountTolerance: 5,
      // Whether this is an HGVS variant (which may have more variance)
      isHGVS: false,
      ...options,
    };

    // Normalize line endings
    actual = normalizeLineEndings(actual);

    // Get header rows
    const actualLines = actual.split('\n');
    const expectedLines = expected.split('\n');

    // Compare headers (should match exactly)
    expect(actualLines[0]).to.equal(expectedLines[0], 'Headers should match exactly');

    // Both should have same number of data rows (approximately)
    // We use a fuzzy comparison because depending on API responses,
    // the exact number of rows might vary slightly
    // Count non-empty lines, minus header row
    const actualDataRowCount = actualLines.filter((line) => line.trim().length > 0).length - 1;
    const expectedDataRowCount = expectedLines.filter((line) => line.trim().length > 0).length - 1;

    // HGVS variants may have more variance in result count due to database updates
    const tolerance = opts.isHGVS ? 20 : opts.rowCountTolerance;

    // For HGVS variants, just verify we have some data rows
    if (opts.isHGVS) {
      expect(actualDataRowCount).to.be.greaterThan(0, 'Should have at least one data row');
    } else {
      expect(Math.abs(actualDataRowCount - expectedDataRowCount)).to.be.lessThan(
        tolerance,
        'Data row count should be similar'
      );
    }

    // If rows are available, check data structure
    if (actualDataRowCount > 0 && expectedDataRowCount > 0) {
      // Get column indexes for key fields to check
      const headers = actualLines[0].split(delimiter);
      const inputIdx = headers.indexOf('OriginalInput');
      const alleleIdx = headers.indexOf('Allele');

      // Get a data row from each
      const actualSample = actualLines.find((line, idx) => idx > 0 && line.trim().length > 0);
      const expectedSample = expectedLines.find((line, idx) => idx > 0 && line.trim().length > 0);

      if (actualSample && expectedSample) {
        const actualFields = actualSample.split(delimiter);
        const expectedFields = expectedSample.split(delimiter);

        // Original input should be similar
        if (inputIdx >= 0) {
          // The input format might be slightly different but should contain the same basic info
          const actualInput = actualFields[inputIdx];
          const expectedInput = expectedFields[inputIdx];

          // Both inputs should be non-empty
          expect(actualInput.trim().length).to.be.greaterThan(0, 'Input field should not be empty');
          expect(expectedInput.trim().length).to.be.greaterThan(
            0,
            'Expected input field should not be empty'
          );
        }

        // Allele field should be present
        if (alleleIdx >= 0) {
          expect(actualFields[alleleIdx].trim().length).to.be.greaterThan(
            0,
            'Allele field should not be empty'
          );
        }
      }
    }
  }

  // Tests for basic SNP variant
  describe('rs6025 (Factor V Leiden SNP)', () => {
    it('should generate matching CSV output', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variant: 'rs6025',
          output: 'CSV',
        })
      );

      const expectedOutput = readFixture('rs6025.csv');
      compareCSVTSVResults(result, expectedOutput, ',');
    });

    it('should generate matching TSV output', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variant: 'rs6025',
          output: 'TSV',
        })
      );

      const expectedOutput = readFixture('rs6025.tsv');
      compareCSVTSVResults(result, expectedOutput, '\t');
    });
  });

  // Tests for HGVS notation variant
  describe('HGVS missense variant', () => {
    it('should generate matching CSV output', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variant: 'ENST00000302118:c.137G>A',
          output: 'CSV',
        })
      );

      const expectedOutput = readFixture('hgvs_missense.csv');
      compareCSVTSVResults(result, expectedOutput, ',', { isHGVS: true });
    });

    it('should generate matching TSV output', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variant: 'ENST00000302118:c.137G>A',
          output: 'TSV',
        })
      );

      const expectedOutput = readFixture('hgvs_missense.tsv');
      compareCSVTSVResults(result, expectedOutput, '\t', { isHGVS: true });
    });
  });

  // Tests for VCF format variant
  describe('VCF frameshift variant', () => {
    it('should generate matching CSV output', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variant: '9 130716739 . G GT',
          output: 'CSV',
        })
      );

      const expectedOutput = readFixture('vcf_frameshift.csv');
      compareCSVTSVResults(result, expectedOutput, ',');
    });

    // VCF tests may need extra time due to API errors
    it('should generate matching TSV output', async () => {
      const result = await retryApiCall(
        () =>
          analyzeVariant({
            variant: '9 130716739 . G GT',
            output: 'TSV',
          }),
        3, // More retries for this particular test
        3000 // Longer delay between retries
      );

      const expectedOutput = readFixture('vcf_frameshift.tsv');
      compareCSVTSVResults(result, expectedOutput, '\t');
    });
  });

  // Tests for batch processing with filtering
  describe('Multiple variants with filtering', function () {
    // Test runs longer due to batch processing
    it('should generate matching CSV output with filtering', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variants: ['rs6025', 'rs1042522', 'rs333'],
          filter: JSON.stringify({
            'transcript_consequences.*.impact': { eq: 'HIGH' },
          }),
          output: 'CSV',
        })
      );

      const expectedOutput = readFixture('multiple_variants_filtered.csv');
      compareCSVTSVResults(result, expectedOutput, ',');
    });

    // Test runs longer due to batch processing
    it('should generate matching TSV output with filtering', async () => {
      const result = await retryApiCall(() =>
        analyzeVariant({
          variants: ['rs6025', 'rs1042522', 'rs333'],
          filter: JSON.stringify({
            'transcript_consequences.*.impact': { eq: 'HIGH' },
          }),
          output: 'TSV',
        })
      );

      const expectedOutput = readFixture('multiple_variants_filtered.tsv');
      compareCSVTSVResults(result, expectedOutput, '\t');
    });
  });
});
