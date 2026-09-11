// test/vcfFormatter.test.js
'use strict';

/**
 * @fileoverview Unit tests for the vcfFormatter module.
 */

const { expect } = require('chai');
const { formatAnnotationsToVcf } = require('../src/vcfFormatter');
// Assuming dataExtractor provides the definition, or mock it here
// const { defaultColumnConfig } = require('../src/dataExtractor'); // If needed

describe('vcfFormatter', () => {
  describe('formatAnnotationsToVcf', () => {
    // Define a consistent mock CSQ format for testing
    // In a real scenario, derive this accurately from defaultColumnConfig or pass dynamically
    const mockVlCsqFormatFields = [
      'Allele',
      'Consequence',
      'IMPACT',
      'SYMBOL',
      'Gene',
      'Feature_type',
      'Feature',
      'BIOTYPE',
      'HGVSc',
      'HGVSp',
      // Simplified for brevity in tests, add more fields as needed for comprehensive CSQ testing
    ];

    // Test utility functions
    /**
     * Extracts the INFO field (8th column) from a VCF data line.
     * @param {string} vcfLine - A single VCF data line (tab-separated).
     * @returns {string|null} The INFO field content or null if format is wrong.
     */
    function extractInfoField(vcfLine) {
      if (!vcfLine || vcfLine.startsWith('#')) return null;
      const fields = vcfLine.split('\t');
      return fields.length > 7 ? fields[7] : null;
    }

    /**
     * Finds the first line matching a pattern (simple substring check).
     * @param {string} output - The complete VCF output string.
     * @param {string} pattern - The substring pattern to search for.
     * @returns {string|undefined} The matching line or undefined.
     */
    function findHeaderLine(output, pattern) {
      const lines = output.split('\n');
      return lines.find((line) => line.includes(pattern));
    }

    /**
     * Counts lines matching a pattern (simple substring check).
     * @param {string} output - The complete VCF output string.
     * @param {string} pattern - The substring pattern to search for.
     * @returns {number} The count of matching lines.
     */
    function countHeaderLines(output, pattern) {
      const lines = output.split('\n');
      return lines.filter((line) => line.includes(pattern)).length;
    }

    /**
     * Extracts data lines (non-header) from VCF output.
     * @param {string} output - The complete VCF output string.
     * @returns {Array<string>} Array of data lines.
     */
    function getDataLines(output) {
      return output.split('\n').filter((line) => !line.startsWith('#') && line.trim() !== '');
    }

    describe('Header Handling Tests', () => {
      it('should add fileformat header if missing from original lines', () => {
        const mockHeaderLines = [
          '##reference=GRCh38',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];
        const output = formatAnnotationsToVcf(
          [],
          undefined,
          mockHeaderLines,
          mockVlCsqFormatFields
        );
        const lines = output.split('\n');
        expect(lines[0]).to.equal('##fileformat=VCFv4.2');
        // Ensure original lines are still present after the added fileformat
        expect(lines[1]).to.equal('##reference=GRCh38');
      });

      it('should not duplicate VL_CSQ header definition if already present', () => {
        const mockHeaderLines = [
          '##fileformat=VCFv4.2',
          '##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Existing Description">', // Already exists
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];
        const output = formatAnnotationsToVcf(
          [
            {
              vcfString: '1-100-A-T',
              /* other fields */
              allele_string: 'A/T',
              most_severe_consequence: 'missense',
              transcript_consequences: [{}],
            },
          ],
          undefined,
          mockHeaderLines,
          mockVlCsqFormatFields
        );
        expect(countHeaderLines(output, 'ID=VL_CSQ')).to.equal(1);
        expect(output).to.include('Existing Description'); // Original description preserved
      });

      it('should add #CHROM line if missing from original headers', () => {
        const mockHeaderLines = ['##fileformat=VCFv4.2', '##contig=<ID=1>']; // #CHROM missing
        const output = formatAnnotationsToVcf(
          [],
          undefined,
          mockHeaderLines,
          mockVlCsqFormatFields
        );
        expect(findHeaderLine(output, '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO')).to.exist;
        expect(output.endsWith('\n')).to.be.true; // Should still end with newline even if no data lines
      });
    });

    describe('Empty Annotation Data Tests', () => {
      it('should output only prepared headers if annotation data is empty with headers provided', () => {
        const mockHeaderLines = [
          '##fileformat=VCFv4.2',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];
        const output = formatAnnotationsToVcf(
          [],
          undefined,
          mockHeaderLines,
          mockVlCsqFormatFields
        );
        const lines = output.trim().split('\n'); // Use trim to ignore final newline for counting

        expect(lines[0]).to.equal('##fileformat=VCFv4.2');
        // VL_CSQ should have been added during header prep
        expect(findHeaderLine(output, 'ID=VL_CSQ')).to.exist;
        expect(lines[lines.length - 1]).to.equal('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO');
        expect(getDataLines(output)).to.be.empty;
        expect(output.endsWith('\n')).to.be.true;
      });

      it('should output only default headers if annotation data is empty and no headers provided', () => {
        const output = formatAnnotationsToVcf([], undefined, undefined, mockVlCsqFormatFields);
        const lines = output.trim().split('\n');

        expect(lines[0]).to.equal('##fileformat=VCFv4.2');
        expect(findHeaderLine(output, 'ID=VL_CSQ')).to.exist;
        expect(lines[lines.length - 1]).to.equal('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO');
        expect(getDataLines(output)).to.be.empty;
        expect(output.endsWith('\n')).to.be.true;
      });

      it('should handle null annotation data gracefully', () => {
        const output = formatAnnotationsToVcf(null, undefined, undefined, mockVlCsqFormatFields);
        expect(output).to.be.a('string');
        expect(getDataLines(output)).to.be.empty;
        // Should contain the default header
        expect(output).to.include('##fileformat=VCFv4.2');
        expect(output.endsWith('\n')).to.be.true;
      });
    });

    describe('Multi-Allelic Site Handling Tests', () => {
      it('should combine multiple ALT alleles at the same position (non-VCF input)', () => {
        const mockAnnotationData = [
          {
            vcfString: '1-100-A-T', // Same POS/REF
            allele_string: 'A/T',
            most_severe_consequence: 'missense_variant',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
          {
            vcfString: '1-100-A-G', // Same POS/REF
            allele_string: 'A/G',
            most_severe_consequence: 'synonymous_variant',
            transcript_consequences: [{ impact: 'LOW', gene_symbol: 'GENE1' }],
          },
        ];
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          undefined,
          undefined,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);

        expect(dataLines).to.have.lengthOf(1); // Should be grouped into one line
        const fields = dataLines[0].split('\t');
        expect(fields[0]).to.equal('1');
        expect(fields[1]).to.equal('100');
        expect(fields[3]).to.equal('A');
        expect(fields[4]).to.equal('T,G'); // ALTs combined
        const info = fields[7];
        expect(info).to.include('VL_CSQ=');
        const csqValues = info.split('VL_CSQ=')[1].split(',');
        expect(csqValues).to.have.lengthOf(2); // One CSQ value per ALT
        // Check alleles in CSQ match order in ALT field
        expect(csqValues[0].startsWith(encodeURIComponent('T') + '|')).to.be.true;
        expect(csqValues[1].startsWith(encodeURIComponent('G') + '|')).to.be.true;
      });

      it('should preserve separate same-site records (VCF input)', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
          {
            originalInput: '1:100:A:G',
            vcfString: '1-100-A-G',
            allele_string: 'A/G',
            most_severe_consequence: 'synonymous',
            transcript_consequences: [{ impact: 'LOW', gene_symbol: 'GENE1' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: 'pos1',
                REF: 'A',
                ALT: ['T'],
                QUAL: 50,
                FILTER: ['PASS'],
                INFO: { DP: 30 },
              },
              alt: 'T',
            },
          ],
          [
            '1:100:A:G',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: 'pos1',
                REF: 'A',
                ALT: ['G'],
                QUAL: 60,
                FILTER: ['PASS'],
                INFO: { DP: 35 },
              },
              alt: 'G',
            },
          ], // Note: ID might be same if from same original multi-allelic line
        ]);
        const mockVcfHeaderLines = [
          '##fileformat=VCFv4.2',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          mockVcfHeaderLines,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);

        expect(dataLines).to.have.lengthOf(2);
        const first = dataLines[0].split('\t');
        const second = dataLines[1].split('\t');
        expect(first.slice(0, 7)).to.deep.equal(['1', '100', 'pos1', 'A', 'T', '50', 'PASS']);
        expect(second.slice(0, 7)).to.deep.equal(['1', '100', 'pos1', 'A', 'G', '60', 'PASS']);
        expect(first[7]).to.include('DP=30;VL_CSQ=T|');
        expect(second[7]).to.include('DP=35;VL_CSQ=G|');
      });
    });

    describe('INFO Field Handling Tests', () => {
      it('should correctly merge original INFO fields with new VL_CSQ tag', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: 50,
                FILTER: ['PASS'],
                INFO: { DP: 50, AF: 0.1, MQ: 60 },
              },
              alt: 'T',
            },
          ],
        ]);
        const mockVcfHeaderLines = [
          '##fileformat=VCFv4.2',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          mockVcfHeaderLines,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);

        expect(dataLines).to.have.lengthOf(1);
        const info = extractInfoField(dataLines[0]);
        expect(info).to.be.a('string');
        // Check order and presence
        expect(info).to.match(/^DP=50;AF=0.1;MQ=60;VL_CSQ=/);
        expect(info).to.include('VL_CSQ=T|missense'); // Check start of CSQ
      });

      it('should not duplicate existing VL_CSQ in original INFO field', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: 50,
                FILTER: ['PASS'],
                INFO: { DP: 50, VL_CSQ: 'OldValue', AF: 0.1 },
              },
              alt: 'T',
            },
          ], // Original has VL_CSQ
        ]);
        const mockVcfHeaderLines = [
          '##fileformat=VCFv4.2',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          mockVcfHeaderLines,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);

        expect(dataLines).to.have.lengthOf(1);
        const info = extractInfoField(dataLines[0]);
        expect(info).to.be.a('string');
        const infoFields = info.split(';');
        const vlCsqFields = infoFields.filter((f) => f.startsWith('VL_CSQ='));

        expect(vlCsqFields).to.have.lengthOf(1); // Only one VL_CSQ tag
        expect(vlCsqFields[0]).not.to.equal('VL_CSQ=OldValue'); // Ensure it's the new value
        expect(vlCsqFields[0]).to.include('missense'); // Check content of the new value
        expect(info).to.include('DP=50'); // Other original fields preserved
        expect(info).to.include('AF=0.1');
      });
    });

    describe('QUAL and FILTER Handling Tests', () => {
      it('should use original QUAL and FILTER values when available', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: 77,
                FILTER: ['LowQual'],
                INFO: {},
              },
              alt: 'T',
            },
          ],
        ]);
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          undefined,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[5]).to.equal('77'); // QUAL
        expect(fields[6]).to.equal('LowQual'); // FILTER
      });

      it('should use default QUAL(.) and FILTER(PASS) when not available in original record', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: undefined,
                FILTER: undefined,
                INFO: {},
              },
              alt: 'T',
            },
          ], // QUAL/FILTER undefined
        ]);
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          undefined,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[5]).to.equal('.'); // QUAL default
        expect(fields[6]).to.equal('PASS'); // FILTER default
      });

      it('should handle empty or PASS filter array correctly', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE' }],
          },
          {
            originalInput: '1:200:C:G',
            vcfString: '1-200-C-G',
            allele_string: 'C/G',
            most_severe_consequence: 'upstream',
            transcript_consequences: [{ impact: 'MODIFIER' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: 90,
                FILTER: [],
                INFO: {},
              },
              alt: 'T',
            },
          ], // Empty FILTER array
          [
            '1:200:C:G',
            {
              originalRecord: {
                CHROM: '1',
                POS: 200,
                ID: '.',
                REF: 'C',
                ALT: ['G'],
                QUAL: 90,
                FILTER: ['PASS'],
                INFO: {},
              },
              alt: 'G',
            },
          ], // FILTER is ['PASS']
        ]);
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          undefined,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(2);
        const fields1 = dataLines[0].split('\t');
        const fields2 = dataLines[1].split('\t');
        // VCF spec: If filter array is empty or just contains PASS,
        //  the output field should be 'PASS' or '.' depending on convention. '.'
        // is often used for empty/unfiltered. Let's test for PASS as implemented.
        expect(fields1[6]).to.equal('PASS'); // Empty array should result in PASS
        expect(fields2[6]).to.equal('PASS'); // ['PASS'] should result in PASS
      });

      it('should handle multiple FILTER values correctly, joining with semicolon', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            allele_string: 'A/T',
            most_severe_consequence: 'missense',
            transcript_consequences: [{ impact: 'MODERATE' }],
          },
        ];
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: '.',
                REF: 'A',
                ALT: ['T'],
                QUAL: 100,
                FILTER: ['SiteConflict', 'LowQual'],
                INFO: {},
              },
              alt: 'T',
            },
          ], // Multiple filters
        ]);
        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          undefined,
          mockVlCsqFormatFields
        );
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[6]).to.equal('SiteConflict;LowQual'); // Joined with semicolon
      });
    });
  });
});
