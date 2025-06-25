// test/cnv-integration.test.js
/**
 * Integration tests for CNV (Copy Number Variant) annotation functionality.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { getDefaultColumnConfig } = require('../src/dataExtractor');

describe('CNV Integration Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe('CNV Format Detection', () => {
    const { detectInputFormat } = require('../src/variantLinkerCore');

    it('should detect deletion format correctly', () => {
      expect(detectInputFormat('7:117559600-117559609:DEL')).to.equal('CNV');
      expect(detectInputFormat('chr7:117559600-117559609:DEL')).to.equal('CNV');
      expect(detectInputFormat('X:1000000-2000000:DEL')).to.equal('CNV');
    });

    it('should detect duplication format correctly', () => {
      expect(detectInputFormat('1:1000-5000:DUP')).to.equal('CNV');
      expect(detectInputFormat('chr1:1000-5000:DUP')).to.equal('CNV');
    });

    it('should detect generic CNV format correctly', () => {
      expect(detectInputFormat('22:10000-20000:CNV')).to.equal('CNV');
      expect(detectInputFormat('chr22:10000-20000:CNV')).to.equal('CNV');
    });

    it('should be case insensitive', () => {
      expect(detectInputFormat('7:117559600-117559609:del')).to.equal('CNV');
      expect(detectInputFormat('1:1000-5000:dup')).to.equal('CNV');
      expect(detectInputFormat('22:10000-20000:cnv')).to.equal('CNV');
    });

    it('should not detect invalid CNV formats', () => {
      expect(detectInputFormat('7:117559600-117559609:INVALID')).to.equal('HGVS');
      expect(detectInputFormat('7-117559600-117559609-DEL')).to.equal('HGVS');
      expect(detectInputFormat('rs6025')).to.equal('HGVS');
      expect(detectInputFormat('1-12345-A-G')).to.equal('VCF');
    });
  });

  describe('CNV Single Variant Annotation', () => {
    it('should annotate a deletion correctly', async () => {
      // Mock VEP response for a deletion
      const mockVepResponse = [
        {
          seq_region_name: '7',
          start: 117559600,
          end: 117559609,
          allele_string: 'deletion',
          most_severe_consequence: 'feature_truncation',
          transcript_consequences: [
            {
              gene_symbol: 'CFTR',
              gene_id: 'ENSG00000001626',
              transcript_id: 'ENST00000003084',
              consequence_terms: ['feature_truncation'],
              impact: 'HIGH',
              bp_overlap: 9,
              percentage_overlap: 100,
            },
          ],
          phenotypes: [{ phenotype: 'Cystic fibrosis', source: 'OMIM' }],
          dosage_sensitivity: {
            gene_name: 'CFTR',
            phaplo: 3,
            ptriplo: 0,
          },
        },
      ];

      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region')
        .query(true)
        .reply(200, mockVepResponse);

      const result = await analyzeVariant({
        variant: '7:117559600-117559609:DEL',
        output: 'JSON',
        vepOptions: { Phenotypes: '1', numbers: '1' },
        recoderOptions: {},
        cache: false,
      });

      expect(result).to.have.property('annotationData');
      expect(result.annotationData).to.be.an('array');
      expect(result.annotationData).to.have.length(1);

      const annotation = result.annotationData[0];
      expect(annotation.originalInput).to.equal('7:117559600-117559609:DEL');
      expect(annotation.inputFormat).to.equal('CNV');
      expect(annotation.input).to.equal('7 117559600 117559609 deletion 1');
      expect(annotation.most_severe_consequence).to.equal('feature_truncation');
      expect(annotation.transcript_consequences[0].gene_symbol).to.equal('CFTR');
      expect(annotation.transcript_consequences[0].bp_overlap).to.equal(9);
    });

    it('should annotate a duplication correctly', async () => {
      // Mock VEP response for a duplication
      const mockVepResponse = [
        {
          seq_region_name: '1',
          start: 1000,
          end: 5000,
          allele_string: 'duplication',
          most_severe_consequence: 'feature_elongation',
          transcript_consequences: [
            {
              gene_symbol: 'TEST_GENE',
              gene_id: 'ENSG00000123456',
              transcript_id: 'ENST00000123456',
              consequence_terms: ['feature_elongation'],
              impact: 'MODERATE',
              bp_overlap: 4000,
              percentage_overlap: 80,
            },
          ],
        },
      ];

      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region')
        .query(true)
        .reply(200, mockVepResponse);

      const result = await analyzeVariant({
        variant: '1:1000-5000:DUP',
        output: 'JSON',
        vepOptions: { numbers: '1' },
        recoderOptions: {},
        cache: false,
      });

      expect(result).to.have.property('annotationData');
      expect(result.annotationData).to.be.an('array');
      expect(result.annotationData).to.have.length(1);

      const annotation = result.annotationData[0];
      expect(annotation.originalInput).to.equal('1:1000-5000:DUP');
      expect(annotation.inputFormat).to.equal('CNV');
      expect(annotation.input).to.equal('1 1000 5000 duplication 1');
      expect(annotation.most_severe_consequence).to.equal('feature_elongation');
      expect(annotation.transcript_consequences[0].bp_overlap).to.equal(4000);
    });
  });

  describe('CNV Batch Processing', () => {
    it('should process mixed batch with SNV and CNV', async () => {
      // Mock variant recoder for SNV
      const mockRecoderResponse = [
        {
          rs6025: {
            vcf_string: ['5-169557518-G-A'],
          },
        },
      ];

      // Mock VEP response for both variants
      const mockVepResponse = [
        // Response for SNV (5-169557518-G-A formatted as VEP)
        {
          seq_region_name: '5',
          start: 169557518,
          end: 169557518,
          allele_string: 'G/A',
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            {
              gene_symbol: 'F5',
              transcript_id: 'ENST00000360644',
              consequence_terms: ['missense_variant'],
              impact: 'MODERATE',
            },
          ],
        },
        // Response for CNV
        {
          seq_region_name: '1',
          start: 1000,
          end: 5000,
          allele_string: 'deletion',
          most_severe_consequence: 'feature_truncation',
          transcript_consequences: [
            {
              gene_symbol: 'TEST_GENE',
              transcript_id: 'ENST00000123456',
              consequence_terms: ['feature_truncation'],
              impact: 'HIGH',
              bp_overlap: 4000,
            },
          ],
        },
      ];

      nock('https://rest.ensembl.org')
        .post('/variant_recoder/homo_sapiens')
        .query(true)
        .reply(200, mockRecoderResponse);

      // Mock VEP call for recoded SNV variants (contains VCF format)
      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region', (body) => {
          return body.variants && body.variants[0].includes('169557518'); // SNV coordinate
        })
        .query(true)
        .reply(200, [mockVepResponse[0]]); // Return SNV response for recoded variants

      // Mock VEP call for CNV variants (contains regions format)
      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region', (body) => {
          return body.variants && body.variants[0].includes('1000 5000'); // CNV coordinates
        })
        .query(true)
        .reply(200, [mockVepResponse[1]]); // Return CNV response for CNV variants

      const result = await analyzeVariant({
        variants: ['rs6025', '1:1000-5000:DEL'],
        output: 'JSON',
        vepOptions: { numbers: '1' },
        recoderOptions: { vcf_string: '1' },
        cache: false,
      });

      expect(result).to.have.property('annotationData');
      expect(result.annotationData).to.be.an('array');
      expect(result.annotationData).to.have.length(2);

      // Find SNV and CNV results
      const snvResult = result.annotationData.find((r) => r.originalInput === 'rs6025');
      const cnvResult = result.annotationData.find((r) => r.originalInput === '1:1000-5000:DEL');

      expect(snvResult).to.exist;
      expect(cnvResult).to.exist;

      expect(snvResult.inputFormat).to.equal('HGVS');
      expect(cnvResult.inputFormat).to.equal('CNV');
      expect(cnvResult.input).to.equal('1 1000 5000 deletion 1');
      expect(cnvResult.transcript_consequences[0].bp_overlap).to.equal(4000);
    });
  });

  describe('CNV CSV/TSV Output', () => {
    it('should format CNV data correctly in CSV output', async () => {
      // Mock VEP response
      const mockVepResponse = [
        {
          seq_region_name: '7',
          start: 117559600,
          end: 117559609,
          allele_string: 'deletion',
          most_severe_consequence: 'feature_truncation',
          transcript_consequences: [
            {
              gene_symbol: 'CFTR',
              gene_id: 'ENSG00000001626',
              transcript_id: 'ENST00000003084',
              consequence_terms: ['feature_truncation'],
              impact: 'HIGH',
              bp_overlap: 9,
              percentage_overlap: 100,
              hgvsc: '', // Empty for CNV
              hgvsp: '', // Empty for CNV
            },
          ],
          phenotypes: [{ phenotype: 'Cystic fibrosis' }],
          dosage_sensitivity: {
            gene_name: 'CFTR',
            phaplo: 3,
            ptriplo: 0,
          },
        },
      ];

      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region')
        .query(true)
        .reply(200, mockVepResponse);

      const result = await analyzeVariant({
        variant: '7:117559600-117559609:DEL',
        output: 'CSV',
        vepOptions: { Phenotypes: '1', numbers: '1' },
        recoderOptions: {},
        cache: false,
      });

      expect(result).to.be.a('string');
      expect(result).to.include('OriginalInput');
      expect(result).to.include('7:117559600-117559609:DEL');
      expect(result).to.include('CFTR');
      expect(result).to.include('feature_truncation');
      expect(result).to.include('BP_Overlap');
      expect(result).to.include('Percentage_Overlap');
      expect(result).to.include('Phenotypes');
      expect(result).to.include('DosageSensitivity');

      // Should handle empty HGVS fields gracefully
      const lines = result.split('\n');
      const dataLine = lines.find((line) => line.includes('7:117559600-117559609:DEL'));
      expect(dataLine).to.exist;

      // Check that CNV-specific fields are populated
      expect(result).to.include('9'); // bp_overlap
      expect(result).to.include('100'); // percentage_overlap
      expect(result).to.include('Cystic fibrosis'); // phenotype
    });
  });

  describe('CNV Column Configuration', () => {
    it('should include CNV-specific columns when includeCnv option is true', () => {
      const columnConfig = getDefaultColumnConfig({ includeCnv: true });

      const columnHeaders = columnConfig.map((col) => col.header);
      expect(columnHeaders).to.include('BP_Overlap');
      expect(columnHeaders).to.include('Percentage_Overlap');
      expect(columnHeaders).to.include('Phenotypes');
      expect(columnHeaders).to.include('DosageSensitivity');

      // Check column configurations
      const bpOverlapCol = columnConfig.find((col) => col.header === 'BP_Overlap');
      expect(bpOverlapCol.path).to.equal('bp_overlap');
      expect(bpOverlapCol.isConsequenceLevel).to.be.true;

      const phenotypesCol = columnConfig.find((col) => col.header === 'Phenotypes');
      expect(phenotypesCol.path).to.equal('phenotypes');
      expect(phenotypesCol.isConsequenceLevel).to.be.false;
      expect(phenotypesCol.formatter).to.be.a('function');
    });

    it('should not include CNV-specific columns by default', () => {
      const columnConfig = getDefaultColumnConfig();

      const columnHeaders = columnConfig.map((col) => col.header);
      expect(columnHeaders).to.not.include('BP_Overlap');
      expect(columnHeaders).to.not.include('Percentage_Overlap');
      expect(columnHeaders).to.not.include('Phenotypes');
      expect(columnHeaders).to.not.include('DosageSensitivity');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid CNV format gracefully', async () => {
      try {
        await analyzeVariant({
          variant: '7:117559600-117559609:UNKNOWN',
          output: 'JSON',
          vepOptions: {},
          recoderOptions: {},
          cache: false,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        // This should be detected as HGVS format due to unknown type, and fail with recoder error
        expect(error.message).to.include('Request failed with status code 400');
      }
    });

    it('should handle unsupported CNV type gracefully', async () => {
      // This should still work but use the default 'CNV' type
      const mockVepResponse = [
        {
          seq_region_name: '7',
          start: 117559600,
          end: 117559609,
          allele_string: 'CNV',
          most_severe_consequence: 'regulatory_region_variant',
          transcript_consequences: [],
        },
      ];

      nock('https://rest.ensembl.org')
        .post('/vep/homo_sapiens/region')
        .query(true)
        .reply(200, mockVepResponse);

      const result = await analyzeVariant({
        variant: '7:117559600-117559609:CUSTOM',
        output: 'JSON',
        vepOptions: {},
        recoderOptions: {},
        cache: false,
      });

      expect(result).to.have.property('annotationData');
      expect(result.annotationData).to.be.an('array');
      expect(result.annotationData[0].input).to.equal('7 117559600 117559609 CNV 1');
    });
  });
});
