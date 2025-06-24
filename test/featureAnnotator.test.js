// test/featureAnnotator.test.js
/**
 * Tests for the featureAnnotator module.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const {
  annotateOverlaps,
  hasUserFeatureOverlaps,
  formatUserFeatureOverlaps,
} = require('../src/featureAnnotator');

describe('featureAnnotator', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('annotateOverlaps', () => {
    it('should return unchanged data when no features provided', () => {
      const annotationData = [{ seq_region_name: '1', start: 1000, end: 1001 }];

      const result = annotateOverlaps(annotationData, null);

      expect(result).to.equal(annotationData);
    });

    it('should return unchanged data when empty features provided', () => {
      const annotationData = [{ seq_region_name: '1', start: 1000, end: 1001 }];
      const features = { featuresByChrom: {}, geneSets: new Map() };

      const result = annotateOverlaps(annotationData, features);

      expect(result).to.equal(annotationData);
      expect(result[0]).to.have.property('user_feature_overlap').that.is.an('array').with.length(0);
    });

    it('should annotate region overlaps correctly', () => {
      const mockIntervalTree = {
        search: sandbox.stub().returns([
          {
            name: 'region1',
            source: '/path/to/test.bed',
            low: 500,
            high: 1500,
            score: 100,
            strand: '+',
          },
          { name: 'region2', source: '/path/to/test.bed', low: 800, high: 1200 },
        ]),
      };

      const annotationData = [
        { seq_region_name: '1', start: 1000, end: 1001, transcript_consequences: [] },
      ];

      const features = {
        featuresByChrom: { 1: mockIntervalTree },
        geneSets: new Map(),
      };

      const result = annotateOverlaps(annotationData, features);

      expect(result[0].user_feature_overlap).to.have.length(2);
      expect(result[0].user_feature_overlap[0]).to.deep.include({
        type: 'region',
        name: 'region1',
        source: 'test.bed',
        chrom: '1',
        region_start: 500,
        region_end: 1500,
        score: 100,
        strand: '+',
      });
      expect(result[0].user_feature_overlap[1]).to.deep.include({
        type: 'region',
        name: 'region2',
        source: 'test.bed',
        chrom: '1',
        region_start: 800,
        region_end: 1200,
      });
      expect(result[0].user_feature_overlap[1]).to.not.have.property('score');
    });

    it('should annotate gene overlaps correctly', () => {
      const annotationData = [
        {
          seq_region_name: '1',
          start: 1000,
          end: 1001,
          transcript_consequences: [
            { gene_symbol: 'BRCA1', gene_id: 'ENSG00000012048' },
            { gene_symbol: 'TP53', gene_id: 'ENSG00000141510' },
            { gene_symbol: 'MYC' }, // Only symbol, no ID
          ],
        },
      ];

      const geneSets = new Map();
      geneSets.set('BRCA1', [{ source: '/path/to/genes.txt', type: 'gene_list' }]);
      geneSets.set('ENSG00000141510', [
        { source: '/path/to/genes.json', type: 'json_genes', panel: 'cancer' },
      ]);

      const features = {
        featuresByChrom: {},
        geneSets: geneSets,
      };

      const result = annotateOverlaps(annotationData, features);

      expect(result[0].user_feature_overlap).to.have.length(2);
      expect(result[0].user_feature_overlap[0]).to.deep.include({
        type: 'gene',
        identifier: 'BRCA1',
        source: 'genes.txt',
        gene_source_type: 'gene_list',
      });
      expect(result[0].user_feature_overlap[1]).to.deep.include({
        type: 'gene',
        identifier: 'ENSG00000141510',
        source: 'genes.json',
        gene_source_type: 'json_genes',
        panel: 'cancer',
      });
    });

    it('should handle both region and gene overlaps', () => {
      const mockIntervalTree = {
        search: sandbox
          .stub()
          .returns([
            { name: 'promoter_region', source: '/path/to/regions.bed', low: 900, high: 1100 },
          ]),
      };

      const annotationData = [
        {
          seq_region_name: '1',
          start: 1000,
          end: 1001,
          transcript_consequences: [{ gene_symbol: 'BRCA1' }],
        },
      ];

      const geneSets = new Map();
      geneSets.set('BRCA1', [{ source: '/path/to/cancer_genes.txt', type: 'gene_list' }]);

      const features = {
        featuresByChrom: { 1: mockIntervalTree },
        geneSets: geneSets,
      };

      const result = annotateOverlaps(annotationData, features);

      expect(result[0].user_feature_overlap).to.have.length(2);

      // Should be sorted by type (gene comes before region alphabetically)
      expect(result[0].user_feature_overlap[0].type).to.equal('gene');
      expect(result[0].user_feature_overlap[1].type).to.equal('region');
    });

    it('should handle chromosome name normalization', () => {
      const mockIntervalTree = {
        search: sandbox
          .stub()
          .returns([{ name: 'test_region', source: '/path/to/test.bed', low: 1000, high: 2000 }]),
      };

      const annotationData = [
        { seq_region_name: 'chr1', start: 1500, end: 1501, transcript_consequences: [] },
        { seq_region_name: 'chrX', start: 1500, end: 1501, transcript_consequences: [] },
      ];

      const features = {
        featuresByChrom: { 1: mockIntervalTree, X: mockIntervalTree },
        geneSets: new Map(),
      };

      const result = annotateOverlaps(annotationData, features);

      expect(mockIntervalTree.search).to.have.been.calledWith(1500, 1501);
      expect(result[0].user_feature_overlap).to.have.length(1);
      expect(result[1].user_feature_overlap).to.have.length(1);
    });

    it('should handle missing transcript_consequences gracefully', () => {
      const annotationData = [
        { seq_region_name: '1', start: 1000, end: 1001 }, // No transcript_consequences
      ];

      const geneSets = new Map();
      geneSets.set('BRCA1', [{ source: '/path/to/genes.txt', type: 'gene_list' }]);

      const features = {
        featuresByChrom: {},
        geneSets: geneSets,
      };

      const result = annotateOverlaps(annotationData, features);

      expect(result[0].user_feature_overlap).to.have.length(0);
    });

    it('should handle interval tree search errors gracefully', () => {
      const mockIntervalTree = {
        search: sandbox.stub().throws(new Error('Search failed')),
      };

      const annotationData = [
        { seq_region_name: '1', start: 1000, end: 1001, transcript_consequences: [] },
      ];

      const features = {
        featuresByChrom: { 1: mockIntervalTree },
        geneSets: new Map(),
      };

      const result = annotateOverlaps(annotationData, features);

      expect(result[0].user_feature_overlap).to.have.length(0);
    });

    it('should handle invalid annotation data', () => {
      expect(annotateOverlaps(null, {})).to.be.null;
      expect(annotateOverlaps(undefined, {})).to.be.undefined;
      expect(annotateOverlaps('not an array', {})).to.equal('not an array');
    });
  });

  describe('hasUserFeatureOverlaps', () => {
    it('should return true when annotations have overlaps', () => {
      const annotationData = [
        {
          user_feature_overlap: [{ type: 'region', name: 'test' }],
        },
      ];

      expect(hasUserFeatureOverlaps(annotationData)).to.be.true;
    });

    it('should return false when annotations have empty overlaps', () => {
      const annotationData = [{ user_feature_overlap: [] }, { user_feature_overlap: [] }];

      expect(hasUserFeatureOverlaps(annotationData)).to.be.false;
    });

    it('should return false when annotations have no overlap field', () => {
      const annotationData = [{ seq_region_name: '1' }, { seq_region_name: '2' }];

      expect(hasUserFeatureOverlaps(annotationData)).to.be.false;
    });

    it('should return false for invalid input', () => {
      expect(hasUserFeatureOverlaps(null)).to.be.false;
      expect(hasUserFeatureOverlaps(undefined)).to.be.false;
      expect(hasUserFeatureOverlaps('not an array')).to.be.false;
    });
  });

  describe('formatUserFeatureOverlaps', () => {
    it('should format region overlaps correctly', () => {
      const overlaps = [
        { type: 'region', name: 'promoter', source: 'regions.bed' },
        { type: 'region', name: 'enhancer', source: 'encode.bed' },
      ];

      const result = formatUserFeatureOverlaps(overlaps);

      expect(result).to.equal('region:promoter(regions.bed);region:enhancer(encode.bed)');
    });

    it('should format gene overlaps correctly', () => {
      const overlaps = [
        { type: 'gene', identifier: 'BRCA1', source: 'cancer_genes.txt' },
        { type: 'gene', identifier: 'TP53', source: 'tumor_suppressors.json' },
      ];

      const result = formatUserFeatureOverlaps(overlaps);

      expect(result).to.equal('gene:BRCA1(cancer_genes.txt);gene:TP53(tumor_suppressors.json)');
    });

    it('should format mixed overlaps correctly', () => {
      const overlaps = [
        { type: 'gene', identifier: 'BRCA1', source: 'genes.txt' },
        { type: 'region', name: 'promoter', source: 'regions.bed' },
      ];

      const result = formatUserFeatureOverlaps(overlaps);

      expect(result).to.equal('gene:BRCA1(genes.txt);region:promoter(regions.bed)');
    });

    it('should handle unknown types gracefully', () => {
      const overlaps = [{ type: 'unknown', name: 'test', source: 'file.txt' }];

      const result = formatUserFeatureOverlaps(overlaps);

      expect(result).to.equal('unknown:test(file.txt)');
    });

    it('should return empty string for empty or invalid input', () => {
      expect(formatUserFeatureOverlaps([])).to.equal('');
      expect(formatUserFeatureOverlaps(null)).to.equal('');
      expect(formatUserFeatureOverlaps(undefined)).to.equal('');
      expect(formatUserFeatureOverlaps('not an array')).to.equal('');
    });

    it('should handle missing fields gracefully', () => {
      const overlaps = [
        { type: 'region', source: 'file.bed' }, // Missing name
        { type: 'gene', source: 'genes.txt' }, // Missing identifier
      ];

      const result = formatUserFeatureOverlaps(overlaps);

      expect(result).to.equal('region:unknown(file.bed);gene:unknown(genes.txt)');
    });
  });
});
