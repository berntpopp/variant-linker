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

    // --- Test Scenarios ---

    describe('Basic Non-VCF Input Tests', () => {
      it('should generate valid VCF output with default headers for non-VCF input', () => {
        const mockAnnotationData = [
          {
            // Input source doesn't matter here as we rely on vcfString
            vcfString: '1-100-A-T', // Essential for non-VCF input
            seq_region_name: '1',
            start: 100,
            end: 100,
            allele_string: 'A/T', // Used by formatVcfCsqString for Allele field
            most_severe_consequence: 'missense_variant', // Used by formatVcfCsqString
            transcript_consequences: [
              {
                consequence_terms: ['missense_variant'],
                impact: 'MODERATE',
                gene_symbol: 'GENE1',
                gene_id: 'ENSG001',
                feature_type: 'Transcript',
                transcript_id: 'ENST001', // Used for Feature
                biotype: 'protein_coding',
                hgvsc: 'ENST001:c.1A>T',
                hgvsp: 'ENSP001:p.Met1?',
                // Mock other fields needed by mockVlCsqFormatFields...
              },
            ],
          },
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          undefined, // No vcfRecordMap
          undefined, // No originalHeaderLines
          mockVlCsqFormatFields
        );

        expect(output).to.be.a('string').and.not.to.be.empty;
        const lines = output.split('\n');

        // Check headers
        expect(lines[0]).to.equal('##fileformat=VCFv4.2');
        expect(findHeaderLine(output, 'ID=VL_CSQ')).to.exist;
        expect(findHeaderLine(output, `Format: ${mockVlCsqFormatFields.join('|')}`)).to.exist;
        expect(findHeaderLine(output, '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO')).to.exist;

        // Check data line
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[0]).to.equal('1'); // CHROM
        expect(fields[1]).to.equal('100'); // POS
        expect(fields[2]).to.equal('.'); // ID (default for non-VCF input)
        expect(fields[3]).to.equal('A'); // REF
        expect(fields[4]).to.equal('T'); // ALT
        expect(fields[5]).to.equal('.'); // QUAL (default)
        expect(fields[6]).to.equal('PASS'); // FILTER (default)

        // Check INFO field (presence and basic structure)
        const info = fields[7];
        expect(info).to.match(/^VL_CSQ=/); // Should start with VL_CSQ
        // Verify the allele in CSQ matches the ALT allele
        expect(info).to.include(encodeURIComponent('T') + '|'); // Allele=T

        expect(output.endsWith('\n')).to.be.true;
        // Ensure only one trailing newline
        expect(output.endsWith('\n\n')).to.be.false;
      });

      it('should skip annotations without valid vcfString for non-VCF input', () => {
        const mockAnnotationData = [
          {
            input: 'valid',
            vcfString: '1-100-A-T', // Valid
            /* other required fields */
            most_severe_consequence: 'missense_variant',
            allele_string: 'A/T',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
          {
            input: 'no_vcf_string',
            // vcfString missing
            most_severe_consequence: 'stop_gained',
            allele_string: 'C/A',
            transcript_consequences: [{ impact: 'HIGH', gene_symbol: 'GENE2' }],
          },
          {
            input: 'malformed_vcf_string',
            vcfString: '2-200-C', // Malformed
            most_severe_consequence: 'intron_variant',
            allele_string: 'C/G',
            transcript_consequences: [{ impact: 'MODIFIER', gene_symbol: 'GENE3' }],
          },
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          undefined,
          undefined,
          mockVlCsqFormatFields
        );

        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1); // Only the first annotation should produce a line
        expect(dataLines[0]).to.match(/^1\t100\t.\tA\tT\t/); // Check it's the correct one
      });
    });

    describe('VL_CSQ Tag Handling Tests', () => {
      it('should omit VL_CSQ tag when no consequences', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            seq_region_name: '1',
            start: 100,
            end: 100,
            allele_string: 'A/T',
            // No transcript_consequences or most_severe_consequence
          },
        ];

        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                ID: null,
                REF: 'A',
                ALT: ['T'],
                QUAL: null,
                FILTER: ['PASS'],
                INFO: { DP: 30 },
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
        const info = extractInfoField(dataLines[0]);
        expect(info).to.equal('DP=30'); // Only original INFO, no VL_CSQ
      });

      it('should return "." for INFO when no fields present', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            seq_region_name: '1',
            start: 100,
            end: 100,
            allele_string: 'A/T',
            // No consequences or original INFO
          },
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          undefined,
          undefined,
          mockVlCsqFormatFields
        );

        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const info = extractInfoField(dataLines[0]);
        expect(info).to.equal('.'); // No INFO fields = '.'
      });

      it('should merge multiple CSQ strings with commas', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            seq_region_name: '1',
            start: 100,
            end: 100,
            allele_string: 'A/T',
            most_severe_consequence: 'missense_variant',
            transcript_consequences: [
              {
                impact: 'MODERATE',
                gene_symbol: 'GENE1',
                gene_id: 'ENSG001',
                feature_type: 'Transcript',
                transcript_id: 'ENST001',
                consequence_terms: ['missense_variant'],
                biotype: 'protein_coding',
                hgvsc: 'c.123A>T',
                hgvsp: 'p.Met1?',
              },
              {
                impact: 'LOW',
                gene_symbol: 'GENE1',
                gene_id: 'ENSG001',
                feature_type: 'Transcript',
                transcript_id: 'ENST002',
                consequence_terms: ['synonymous_variant'],
                biotype: 'protein_coding',
                hgvsc: 'c.456A>T',
                hgvsp: 'p.Leu2=',
              },
            ],
          },
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          undefined,
          undefined,
          mockVlCsqFormatFields
        );

        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const info = extractInfoField(dataLines[0]);
        const csqSection = info.split(';').find((s) => s.startsWith('VL_CSQ='));
        expect(csqSection).to.exist;
        const csqValues = csqSection.split('=')[1].split(',');
        expect(csqValues).to.have.lengthOf(2); // Should have two CSQ entries
        expect(csqValues[0]).to.include('missense_variant');
        expect(csqValues[1]).to.include('synonymous_variant');
      });

      it('should preserve order: original INFO, VL_CSQ, VL_DED_INH, VL_COMPHET', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T',
            vcfString: '1-100-A-T',
            seq_region_name: '1',
            start: 100,
            allele_string: 'A/T',
            most_severe_consequence: 'missense_variant',
            transcript_consequences: [
              {
                impact: 'MODERATE',
                gene_symbol: 'GENE1',
                consequence_terms: ['missense_variant'],
                biotype: 'protein_coding',
              },
            ],
            deducedInheritancePattern: {
              prioritizedPattern: 'AR',
              compHetDetails: {
                isCandidate: true,
                partnerVariantKeys: ['2:200:G:A'],
                geneSymbol: 'GENE1',
              },
            },
          },
        ];

        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T',
            {
              originalRecord: {
                CHROM: '1',
                POS: 100,
                REF: 'A',
                ALT: ['T'],
                INFO: { DP: 30, AF: 0.5, VL_CSQ: 'OLD_CSQ' },
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
        const info = extractInfoField(dataLines[0]);
        const parts = info.split(';');

        // Check order of parts
        expect(parts[0]).to.equal('DP=30');
        expect(parts[1]).to.equal('AF=0.5');
        expect(parts[2]).to.include('VL_CSQ=');
        expect(parts[3]).to.equal('VL_DED_INH=AR');
        expect(parts[4]).to.include('VL_COMPHET=');

        // Verify old VL_CSQ was excluded
        expect(info).to.not.include('OLD_CSQ');
      });
    });

    describe('Basic VCF Input Tests', () => {
      it('should preserve original VCF header and record info, merging VL_CSQ', () => {
        const mockAnnotationData = [
          {
            originalInput: '1:100:A:T', // Links to vcfRecordMap key
            vcfString: '1-100-A-T', // May also be present
            seq_region_name: '1',
            start: 100,
            allele_string: 'A/T',
            most_severe_consequence: 'missense_variant',
            transcript_consequences: [{ impact: 'MODERATE', gene_symbol: 'GENE1' }],
          },
        ];
        const mockOriginalInfo = { DP: 30, AF: 0.25 }; // INFO as object
        const mockVcfRecordMap = new Map([
          [
            '1:100:A:T', // Key matching annotation's originalInput
            {
              originalRecord: {
                CHROM: '1',
                POS: 100, // Use number for POS
                ID: 'rs123',
                REF: 'A',
                ALT: ['T'], // ALT is usually an array in parsed VCF
                QUAL: 50, // Use number for QUAL
                FILTER: ['LowQual'],
                INFO: mockOriginalInfo, // Pass the object
              },
              alt: 'T', // Specific ALT for this map entry
            },
          ],
        ]);
        const mockVcfHeaderLines = [
          '##fileformat=VCFv4.2',
          '##contig=<ID=1>',
          '##FILTER=<ID=LowQual,Description="Low quality">',
          '##INFO=<ID=DP,Number=1,Type=Integer,Description="Depth">',
          '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Freq">',
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        ];

        const output = formatAnnotationsToVcf(
          mockAnnotationData,
          mockVcfRecordMap,
          mockVcfHeaderLines,
          mockVlCsqFormatFields
        );

        // Check headers
        mockVcfHeaderLines.forEach((line) => expect(output).to.include(line));
        expect(findHeaderLine(output, 'ID=VL_CSQ')).to.exist; // Check VL_CSQ header added

        // Check data line
        const dataLines = getDataLines(output);
        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[0]).to.equal('1'); // CHROM from original
        expect(fields[1]).to.equal('100'); // POS from original
        expect(fields[2]).to.equal('rs123'); // ID from original
        expect(fields[3]).to.equal('A'); // REF from original
        expect(fields[4]).to.equal('T'); // ALT from original
        expect(fields[5]).to.equal('50'); // QUAL from original
        expect(fields[6]).to.equal('LowQual'); // FILTER from original

        // Check INFO merging
        const info = fields[7];
        expect(info).to.include('DP=30'); // Original INFO preserved
        expect(info).to.include('AF=0.25'); // Original INFO preserved
        expect(info).to.include(';VL_CSQ='); // New CSQ added correctly
        expect(info).to.match(/^DP=30;AF=0.25;VL_CSQ=/); // Check order (original first)
      });
    });

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

      it('should combine multiple ALT alleles at the same position (VCF input)', () => {
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

        expect(dataLines).to.have.lengthOf(1);
        const fields = dataLines[0].split('\t');
        expect(fields[0]).to.equal('1');
        expect(fields[1]).to.equal('100');
        expect(fields[2]).to.equal('pos1'); // ID from first record encountered
        expect(fields[3]).to.equal('A');
        expect(fields[4]).to.equal('T,G'); // ALTs combined
        // QUAL/FILTER taken from the first ALT encountered ('T' in this map iteration order)
        expect(fields[5]).to.equal('50');
        expect(fields[6]).to.equal('PASS');
        // INFO merged from first ALT encountered, plus combined CSQ
        const info = fields[7];
        expect(info).to.include('DP=30'); // Original INFO from first ALT
        expect(info).to.include(';VL_CSQ=');
        const csqValues = info.split('VL_CSQ=')[1].split(',');
        expect(csqValues).to.have.lengthOf(2);
        expect(csqValues[0].startsWith(encodeURIComponent('T') + '|')).to.be.true;
        expect(csqValues[1].startsWith(encodeURIComponent('G') + '|')).to.be.true;
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
