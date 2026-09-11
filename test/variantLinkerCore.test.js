// test/variantLinkerCore.test.js
// Comprehensive tests for the variant-linker core functionality

const { expect } = require('./helpers');
const assert = require('node:assert/strict');
const { useFixtureApi } = require('./support/fixture-api.cjs');
const {
  analyzeVariant,
  detectInputFormat,
  hasTranscriptVersion,
  stripTranscriptVersion,
} = require('../src/variantLinkerCore');

describe('variantLinkerCore.js', () => {
  useFixtureApi();

  // Input format contract
  describe('detectInputFormat()', () => {
    it('should correctly identify VCF format', () => {
      expect(detectInputFormat('1-65568-A-C')).to.equal('VCF');
      expect(detectInputFormat('X-12345-G-T')).to.equal('VCF');
    });

    it('should correctly identify HGVS format', () => {
      expect(detectInputFormat('ENST00000366667:c.803C>T')).to.equal('HGVS');
      expect(detectInputFormat('rs123')).to.equal('HGVS');
    });

    it('should correctly identify CNV format', () => {
      expect(detectInputFormat('7:117559600-117559609:DEL')).to.equal('CNV');
      expect(detectInputFormat('chr7:117559600-117559609:DEL')).to.equal('CNV');
      expect(detectInputFormat('1:1000-5000:DUP')).to.equal('CNV');
      expect(detectInputFormat('chr1:1000-5000:DUP')).to.equal('CNV');
      expect(detectInputFormat('22:10000-20000:CNV')).to.equal('CNV');
      expect(detectInputFormat('X:1000000-2000000:DEL')).to.equal('CNV');
    });

    it('should handle CNV format case insensitivity', () => {
      expect(detectInputFormat('7:117559600-117559609:del')).to.equal('CNV');
      expect(detectInputFormat('1:1000-5000:dup')).to.equal('CNV');
      expect(detectInputFormat('22:10000-20000:cnv')).to.equal('CNV');
    });

    it('should not identify invalid CNV formats as CNV', () => {
      expect(detectInputFormat('7:117559600-117559609:INVALID')).to.equal('HGVS');
      expect(detectInputFormat('7-117559600-117559609-DEL')).to.equal('HGVS');
      expect(detectInputFormat('7:start-end:DEL')).to.equal('HGVS');
    });

    it('should throw error on empty input', () => {
      expect(() => detectInputFormat()).to.throw('No variant provided');
      expect(() => detectInputFormat('')).to.throw('No variant provided');
    });
  });

  // Tests for transcript version utility functions
  describe('hasTranscriptVersion()', () => {
    it('should detect transcript versions in HGVS notation', () => {
      expect(hasTranscriptVersion('NM_001009944.3:c.540dup')).to.be.true;
      expect(hasTranscriptVersion('NM_000088.3:c.589G>T')).to.be.true;
      expect(hasTranscriptVersion('NR_123456.1:n.100A>G')).to.be.true;
      expect(hasTranscriptVersion('XM_047434208.1:c.540dup')).to.be.true;
      expect(hasTranscriptVersion('ENST00000366667.9:c.803C>T')).to.be.false; // ENST doesn't match NM/NR pattern
    });

    it('should return false for variants without transcript versions', () => {
      expect(hasTranscriptVersion('NM_001009944:c.540dup')).to.be.false;
      expect(hasTranscriptVersion('ENST00000366667:c.803C>T')).to.be.false;
      expect(hasTranscriptVersion('rs6025')).to.be.false;
      expect(hasTranscriptVersion('1-65568-A-C')).to.be.false;
      expect(hasTranscriptVersion('7:117559600-117559609:DEL')).to.be.false;
    });

    it('should handle edge cases', () => {
      expect(hasTranscriptVersion('')).to.be.false;
      expect(hasTranscriptVersion('NM_123456.c.100A>G')).to.be.false; // Missing colon
      expect(hasTranscriptVersion('NM_123456.1')).to.be.false; // Missing colon and variant
      expect(hasTranscriptVersion('NM_.1:c.100A>G')).to.be.false; // Invalid format
    });
  });

  describe('stripTranscriptVersion()', () => {
    it('should remove transcript versions from HGVS notation', () => {
      expect(stripTranscriptVersion('NM_001009944.3:c.540dup')).to.equal('NM_001009944:c.540dup');
      expect(stripTranscriptVersion('NM_000088.3:c.589G>T')).to.equal('NM_000088:c.589G>T');
      expect(stripTranscriptVersion('NR_123456.1:n.100A>G')).to.equal('NR_123456:n.100A>G');
      expect(stripTranscriptVersion('XM_047434208.1:c.540dup')).to.equal('XM_047434208:c.540dup');
    });

    it('should handle multi-digit versions', () => {
      expect(stripTranscriptVersion('NM_001009944.10:c.540dup')).to.equal('NM_001009944:c.540dup');
      expect(stripTranscriptVersion('NM_000088.123:c.589G>T')).to.equal('NM_000088:c.589G>T');
    });

    it('should not modify variants without transcript versions', () => {
      expect(stripTranscriptVersion('NM_001009944:c.540dup')).to.equal('NM_001009944:c.540dup');
      expect(stripTranscriptVersion('ENST00000366667:c.803C>T')).to.equal(
        'ENST00000366667:c.803C>T'
      );
      expect(stripTranscriptVersion('rs6025')).to.equal('rs6025');
    });

    it('should handle edge cases', () => {
      expect(stripTranscriptVersion('')).to.equal('');
      expect(stripTranscriptVersion('NM_123456.1')).to.equal('NM_123456.1'); // No colon, no change
    });
  });

  describe('Actual pipeline with offline HTTP transport', () => {
    it('processes a single VCF variant with exact identity and annotations', async () => {
      const result = await analyzeVariant({ variant: '1-65568-A-C', output: 'JSON', cache: false });
      expect(result.annotationData).to.have.lengthOf(1);
      expect(result.annotationData[0]).to.include({ start: 65568, originalInput: '1-65568-A-C' });
      expect(result.annotationData[0].transcript_consequences).to.have.lengthOf(2);
      expect(result.annotationData[0].transcript_consequences[0].gene_symbol).to.equal('OR4F5');
    });

    it('processes each mixed batch variant and reports its count', async () => {
      const variants = ['1-65568-A-C', 'rs6025'];
      const result = await analyzeVariant({ variants, output: 'JSON', cache: false });
      expect(result.meta).to.include({ batchProcessing: true, batchSize: 2 });
      expect(result.annotationData).to.have.lengthOf(2);
      expect(result.annotationData.map((v) => v.originalInput)).to.have.members(variants);
      expect(result.annotationData.map((v) => v.start)).to.have.members([65568, 169549811]);
    });

    it('joins HGVS recoder and VEP responses to the original input', async () => {
      const variant = 'ENST00000302118:c.137G>A';
      const result = await analyzeVariant({ variant, output: 'JSON', cache: false });
      expect(result.annotationData).to.have.lengthOf(1);
      expect(result.annotationData[0]).to.include({
        originalInput: variant,
        inputFormat: 'HGVS',
        variantKey: '1-55039974-G-A',
      });
    });

    for (const params of [{ variants: [] }, {}]) {
      it('rejects an empty request before transport', async () => {
        await assert.rejects(analyzeVariant({ ...params, output: 'JSON' }), /No variants provided/);
      });
    }

    for (const output of ['JSON', 'CSV', 'TSV']) {
      it('serializes supported ' + output + ' output', async () => {
        const result = await analyzeVariant({ variant: '1-65568-A-C', output, cache: false });
        if (output === 'JSON') expect(result.annotationData).to.have.lengthOf(1);
        else {
          expect(result).to.be.a('string');
          expect(result).to.include('OriginalInput').and.include('OR4F5');
        }
      });
    }
  });
});
