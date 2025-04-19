/**
 * Integration tests for Variant Linker format conversion capabilities
 * Tests different combinations of input and output formats
 */

'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { analyzeVariant } = require('../src/variantLinkerCore');

// Test suite for format conversion functionality
describe('Format Conversion Integration Tests', function () {
  // Set timeout for all tests in this suite via beforeEach hook
  beforeEach(function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(30000);
  });

  // Helper function to write output to temp file and read it back
  function writeAndReadOutput(output, format) {
    const tempFile = path.join(__dirname, `test_output.${format.toLowerCase()}`);
    fs.writeFileSync(tempFile, output);
    const content = fs.readFileSync(tempFile, 'utf8');
    // Clean up
    fs.unlinkSync(tempFile);
    return content;
  }

  // Single variant (VCF format string) to JSON output
  it('should convert single variant in VCF format to JSON output', async () => {
    // Use a single variant in VCF format (chromosome-position-ref-alt)
    const variant = '1-12345-A-G';

    // Set up parameters - note we use 'variant' not 'vcf'
    const params = {
      variant,
      output: 'JSON',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a JSON object
    expect(result).to.be.an('object');

    // Check JSON structure
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData');
    expect(result.annotationData).to.be.an('array');

    // Verify that the JSON contains the expected number of variants
    expect(result.annotationData.length).to.be.at.least(1);

    // Verify some of the annotation properties for each variant
    result.annotationData.forEach((variant) => {
      expect(variant).to.have.property('input');
      expect(variant).to.have.property('seq_region_name');
      expect(variant).to.have.property('start');
      expect(variant).to.have.property('end');
      expect(variant).to.have.property('allele_string');

      // Check for VEP annotations
      if (variant.transcript_consequences) {
        expect(variant.transcript_consequences).to.be.an('array');
        if (variant.transcript_consequences.length > 0) {
          expect(variant.transcript_consequences[0]).to.have.property('impact');
          expect(variant.transcript_consequences[0]).to.have.property('consequence_terms');
        }
      }
    });
  });

  // Single variant to CSV output
  it('should convert single variant to CSV output', async () => {
    // Use a single variant in VCF format (chromosome-position-ref-alt)
    const variant = '1-12345-A-G';

    // Set up parameters
    const params = {
      variant,
      output: 'CSV',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a string
    expect(result).to.be.a('string');

    // Write and read from file
    const content = writeAndReadOutput(result, 'CSV');

    // Verify CSV structure
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    expect(lines.length).to.be.greaterThan(1); // At least header + 1 data row

    // Check header row
    const headers = lines[0].split(',');
    expect(headers).to.include.members([
      'OriginalInput',
      'VEPInput',
      'Location',
      'Allele',
      'GeneSymbol',
      'Impact',
      'TranscriptID',
      'ConsequenceTerms',
    ]);

    // Just verify data row exists with the right number of fields
    const data = lines[1].split(',');
    expect(data.length).to.equal(headers.length);
  });

  // Single variant to TSV output
  it('should convert single variant to TSV output', async () => {
    // Use a single variant in VCF format
    const variant = '1-12345-A-G';

    // Set up parameters
    const params = {
      variant,
      output: 'TSV',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a string
    expect(result).to.be.a('string');

    // Write and read from file
    const content = writeAndReadOutput(result, 'TSV');

    // Verify TSV structure
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    expect(lines.length).to.be.greaterThan(1); // At least header + 1 data row

    // Check header row
    const headers = lines[0].split('\t');
    expect(headers).to.include.members([
      'OriginalInput',
      'VEPInput',
      'Location',
      'Allele',
      'GeneSymbol',
      'Impact',
      'TranscriptID',
      'ConsequenceTerms',
    ]);

    // Just verify data row exists with the right number of fields
    const data = lines[1].split('\t');
    expect(data.length).to.equal(headers.length);

    // Verify delimiter
    expect(lines[0]).to.include('\t');
    expect(lines[0]).to.not.include(',');
  });

  // Process multiple variants (batch mode)
  it('should process multiple variants in batch mode', async () => {
    // Use array of variants
    const variants = ['rs6025', '1-12345-A-G'];

    // Set up parameters
    const params = {
      variants,
      output: 'JSON',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a JSON object
    expect(result).to.be.an('object');

    // Check JSON structure
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData');
    expect(result.annotationData).to.be.an('array');

    // Verify that the JSON contains at least one variant
    expect(result.annotationData.length).to.be.at.least(1);

    // Verify some of the annotation properties for each variant
    result.annotationData.forEach((variant) => {
      expect(variant).to.have.property('input');
      expect(variant).to.have.property('seq_region_name');
      expect(variant).to.have.property('start');
      expect(variant).to.have.property('end');
      expect(variant).to.have.property('allele_string');

      // Check for VEP annotations
      if (variant.transcript_consequences) {
        expect(variant.transcript_consequences).to.be.an('array');
        if (variant.transcript_consequences.length > 0) {
          expect(variant.transcript_consequences[0]).to.have.property('impact');
          expect(variant.transcript_consequences[0]).to.have.property('consequence_terms');
        }
      }
    });
  });

  // rsID variant to JSON output
  it('should process an rsID variant to JSON output', async () => {
    // Set up parameters with a well-known variant ID
    const params = {
      variant: 'rs28897696', // A common variant with consistent annotation
      output: 'JSON',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a JSON object
    expect(result).to.be.an('object');

    // Check JSON structure
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData');
    expect(result.annotationData).to.be.an('array');

    // Verify the variant has been processed
    expect(result.annotationData.length).to.be.greaterThan(0);

    // Check the original input contains the rsID
    const variant = result.annotationData[0];
    expect(variant).to.have.property('originalInput');
    expect(variant.originalInput).to.include('rs28897696');
  });

  // Test batch processing with manually specified variants instead of VCF file
  it('should process a batch of variants in VCF format', async () => {
    // Specify variants in VCF format directly
    const variantData = ['1-12345-A-G', '2-23456-T-C'];

    // Process the variants
    const params = {
      variants: variantData,
      output: 'JSON',
      vepOptions: { CADD: '1', hgvs: '1', merged: '1', mane: '1' },
      cache: true,
    };

    // Get results
    const result = await analyzeVariant(params);

    // Output should be a JSON object
    expect(result).to.be.an('object');

    // Check JSON structure
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData');
    expect(result.annotationData).to.be.an('array');

    // Verify that the JSON contains at least one variant
    expect(result.annotationData.length).to.be.at.least(1);

    // Verify some of the annotation properties for each variant
    result.annotationData.forEach((variant) => {
      expect(variant).to.have.property('input');
      expect(variant).to.have.property('seq_region_name');
      expect(variant).to.have.property('start');
      expect(variant).to.have.property('end');
      expect(variant).to.have.property('allele_string');

      // Check for VEP annotations
      if (variant.transcript_consequences) {
        expect(variant.transcript_consequences).to.be.an('array');
        if (variant.transcript_consequences.length > 0) {
          expect(variant.transcript_consequences[0]).to.have.property('impact');
          expect(variant.transcript_consequences[0]).to.have.property('consequence_terms');
        }
      }
    });
  });
});
