'use strict';

const { expect } = require('chai');
const { filterAndFormatResults } = require('../src/variantLinkerProcessor');

describe('VCF output formatting', () => {
  // Simulated VCF data for testing
  const vcfTestData = {
    meta: { stepsPerformed: [] },
    annotationData: [
      {
        input: '1:12345:A:G',
        id: '1-12345-A-G',
        seq_region_name: '1',
        start: 12345,
        end: 12345,
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
            consequence_terms: ['missense_variant'],
            biotype: 'protein_coding',
            hgvsc: 'ENST00000456:c.123A>G',
            hgvsp: 'ENSP00000456:p.Thr41Ala',
            protein_start: 41,
            protein_end: 41,
            amino_acids: 'T/A',
            codons: 'aCt/aGt',
            sift_prediction: 'tolerated',
            polyphen_prediction: 'benign',
          },
        ],
      },
      {
        input: '2:23456:T:C',
        id: '2-23456-T-C',
        seq_region_name: '2',
        start: 23456,
        end: 23456,
        strand: 1,
        allele_string: 'T/C',
        most_severe_consequence: 'synonymous_variant',
        transcript_consequences: [
          {
            impact: 'LOW',
            gene_symbol: 'GENE2',
            gene_id: 'ENSG00000789',
            feature_type: 'Transcript',
            transcript_id: 'ENST00000789',
            consequence_terms: ['synonymous_variant'],
            biotype: 'protein_coding',
            hgvsc: 'ENST00000789:c.456T>C',
            hgvsp: 'ENSP00000789:p.Leu152=',
            protein_start: 152,
            protein_end: 152,
            amino_acids: 'L',
            codons: 'ctT/ctC',
            sift_prediction: '',
            polyphen_prediction: '',
          },
        ],
      },
    ],
  };

  // Create a Map for vcfRecordMap
  const vcfRecordMap = new Map([
    [
      '1:12345:A:G',
      {
        chrom: '1',
        pos: 12345,
        ref: 'A',
        alt: 'G',
        originalRecord: {
          CHROM: '1',
          POS: 12345,
          ID: null,
          REF: 'A',
          ALT: ['G'],
          QUAL: null,
          FILTER: ['PASS'],
          INFO: { DP: 50, AF: 0.5 },
        },
      },
    ],
    [
      '2:23456:T:C',
      {
        chrom: '2',
        pos: 23456,
        ref: 'T',
        alt: 'C',
        originalRecord: {
          CHROM: '2',
          POS: 23456,
          ID: null,
          REF: 'T',
          ALT: ['C'],
          QUAL: null,
          FILTER: ['PASS'],
          INFO: { DP: 30, AF: 0.3 },
        },
      },
    ],
  ]);

  // Mock VCF header lines
  const vcfHeaderLines = [
    '##fileformat=VCFv4.2',
    '##reference=GRCh38',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
    '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE1',
  ];

  // Set the VCF-specific properties on our test data
  before(() => {
    vcfTestData.vcfRecordMap = vcfRecordMap;
    vcfTestData.vcfHeaderLines = vcfHeaderLines;
  });

  it('should format results as VCF correctly', () => {
    const formattedResults = filterAndFormatResults(vcfTestData, null, 'VCF');
    expect(formattedResults).to.be.a('string');

    // Check basic VCF structure
    const lines = formattedResults.split('\n');
    expect(lines.length).to.be.greaterThan(7); // Header (6 lines) + at least 2 data lines

    // Header should contain original header lines plus VL_CSQ definition
    expect(lines[0]).to.equal('##fileformat=VCFv4.2');
    expect(lines).to.include.members([lines[0]]); // First line should be fileformat
    expect(lines.some((line) => line.includes('##INFO=<ID=VL_CSQ'))).to.be.true; // Should have VL_CSQ definition

    // Data lines should contain the variants' information
    const dataLines = lines.filter((line) => !line.startsWith('#') && line.length > 0);
    expect(dataLines.length).to.equal(2); // Should have 2 data lines

    // Check that VL_CSQ annotation was added to INFO field
    expect(dataLines[0]).to.include('VL_CSQ=');
    expect(dataLines[1]).to.include('VL_CSQ=');

    // Verify meta step performed was added
    expect(vcfTestData.meta.stepsPerformed).to.include.members([
      'Formatted output as VCF with annotations added as VL_CSQ INFO field',
    ]);
  });

  it('should handle missing fileformat header gracefully', () => {
    // Make a copy of the test data with modified header
    const modifiedHeaderLines = vcfHeaderLines.filter((line) => !line.startsWith('##fileformat='));

    const modifiedVcfTestData = {
      ...vcfTestData,
      vcfHeaderLines: modifiedHeaderLines,
    };

    const formattedResults = filterAndFormatResults(modifiedVcfTestData, null, 'VCF');
    const lines = formattedResults.split('\n');

    // Should have added the fileformat line
    expect(lines[0]).to.equal('##fileformat=VCFv4.2');
  });

  // Note: Detailed VL_CSQ format testing has been moved to test/vcfFormatter.test.js
});
