// test/feature-annotation-integration.test.js
/**
 * Integration tests for the custom feature annotation functionality.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const proxyquire = require('proxyquire');
const { setupMock } = require('./helpers');
const apiConfig = require('../config/apiConfig.json');

describe('Feature Annotation Integration Tests', () => {
  let sandbox;
  let fsStub;
  let variantLinkerCore;
  let featureParser;
  let IntervalTreeStub;
  let intervalTreeInstance;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fsStub = {
      promises: {
        readFile: sandbox.stub(),
      },
    };

    // Mock IntervalTree
    intervalTreeInstance = {
      insert: sandbox.stub(),
      search: sandbox.stub().returns([]),
      count: 0,
    };
    IntervalTreeStub = sandbox.stub().returns(intervalTreeInstance);

    // Mock the featureParser module with fs stub and IntervalTree
    featureParser = proxyquire('../src/featureParser', {
      fs: fsStub,
      'node-interval-tree': IntervalTreeStub,
    });

    // Mock variantLinkerCore with the stubbed featureParser
    variantLinkerCore = proxyquire('../src/variantLinkerCore', {
      './featureParser': featureParser,
    });
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it('should annotate variants with BED file overlaps', async () => {
    // Mock BED file content
    const bedContent = 'chr1\t65000\t66000\ttest_region\t100\t+';
    fsStub.promises.readFile.resolves(bedContent);

    // Configure interval tree mock to return overlapping regions
    intervalTreeInstance.search.returns([
      {
        low: 65000,
        high: 66000,
        name: 'test_region',
        score: 100,
        strand: '+',
        source: '/path/to/test.bed',
      },
    ]);

    // Mock VEP API response
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'TEST_GENE',
            gene_id: 'ENSG00000123456',
            transcript_id: 'ENST00000123456',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON',
      features: {
        featuresByChrom: {},
        geneSets: new Map(),
      },
    };

    // Load features using the mocked loadFeatures function
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      bedFile: ['/path/to/test.bed'],
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    expect(result.annotationData).to.have.length(1);
    expect(result.annotationData[0]).to.have.property('user_feature_overlap');
    expect(result.annotationData[0].user_feature_overlap).to.have.length(1);
    expect(result.annotationData[0].user_feature_overlap[0]).to.deep.include({
      type: 'region',
      name: 'test_region',
      source: 'test.bed',
    });
  });

  it('should annotate variants with gene list overlaps', async () => {
    // Mock gene list content
    const geneListContent = 'TEST_GENE\nBRCA1\nTP53';
    fsStub.promises.readFile.resolves(geneListContent);

    // Mock VEP API response
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'TEST_GENE',
            gene_id: 'ENSG00000123456',
            transcript_id: 'ENST00000123456',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON',
    };

    // Load features
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      geneList: ['/path/to/genes.txt'],
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    expect(result.annotationData).to.have.length(1);
    expect(result.annotationData[0]).to.have.property('user_feature_overlap');
    expect(result.annotationData[0].user_feature_overlap).to.have.length(1);
    expect(result.annotationData[0].user_feature_overlap[0]).to.deep.include({
      type: 'gene',
      identifier: 'TEST_GENE',
      source: 'genes.txt',
    });
  });

  it('should annotate variants with JSON gene file overlaps', async () => {
    // Mock JSON gene file content
    const jsonContent = JSON.stringify([
      { gene_symbol: 'TEST_GENE', panel: 'cancer', description: 'Test gene for cancer' },
      { gene_symbol: 'BRCA1', panel: 'hereditary_cancer', description: 'Breast cancer gene' },
    ]);
    fsStub.promises.readFile.resolves(jsonContent);

    // Mock VEP API response
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'TEST_GENE',
            gene_id: 'ENSG00000123456',
            transcript_id: 'ENST00000123456',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON',
    };

    // Load features
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      jsonGenes: ['/path/to/genes.json'],
      jsonGeneMapping: '{"identifier":"gene_symbol","dataFields":["panel","description"]}',
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    expect(result.annotationData).to.have.length(1);
    expect(result.annotationData[0]).to.have.property('user_feature_overlap');
    expect(result.annotationData[0].user_feature_overlap).to.have.length(1);
    expect(result.annotationData[0].user_feature_overlap[0]).to.deep.include({
      type: 'gene',
      identifier: 'TEST_GENE',
      source: 'genes.json',
      panel: 'cancer',
      description: 'Test gene for cancer',
    });
  });

  it('should handle variants with no overlaps', async () => {
    // Mock empty BED file
    const bedContent = 'chr2\t100000\t200000\tother_region';
    fsStub.promises.readFile.resolves(bedContent);

    // Mock VEP API response for variant on chr1
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'UNRELATED_GENE',
            gene_id: 'ENSG00000999999',
            transcript_id: 'ENST00000999999',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON',
    };

    // Load features
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      bedFile: ['/path/to/test.bed'],
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    expect(result.annotationData).to.have.length(1);
    expect(result.annotationData[0]).to.have.property('user_feature_overlap');
    expect(result.annotationData[0].user_feature_overlap).to.have.length(0);
  });

  it('should include UserFeatureOverlap in CSV output', async () => {
    // Mock gene list content
    const geneListContent = 'TEST_GENE';
    fsStub.promises.readFile.resolves(geneListContent);

    // Mock VEP API response
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'TEST_GENE',
            gene_id: 'ENSG00000123456',
            transcript_id: 'ENST00000123456',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
            protein_start: 100,
            protein_end: 100,
            amino_acids: 'A/T',
            codons: 'gcC/acC',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'CSV',
    };

    // Load features
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      geneList: ['/path/to/test_genes.txt'],
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    // Check that the CSV output includes the UserFeatureOverlap column
    expect(result).to.be.a('string');
    expect(result).to.include('UserFeatureOverlap');
    expect(result).to.include('gene:TEST_GENE(test_genes.txt)');
  });

  it('should handle multiple feature types simultaneously', async () => {
    // Mock BED file
    const bedContent = 'chr1\t65000\t66000\tpromoter_region\t500\t+';
    // Mock gene list
    const geneContent = 'TEST_GENE\nBRCA1';

    fsStub.promises.readFile.onFirstCall().resolves(bedContent);
    fsStub.promises.readFile.onSecondCall().resolves(geneContent);

    // Configure interval tree mock to return overlapping regions
    intervalTreeInstance.search.returns([
      {
        low: 65000,
        high: 66000,
        name: 'promoter_region',
        score: 500,
        strand: '+',
        source: '/path/to/regions.bed',
      },
    ]);

    // Mock VEP API response
    const vepResponse = [
      {
        seq_region_name: '1',
        start: 65568,
        end: 65568,
        allele_string: 'A/C',
        most_severe_consequence: 'missense_variant',
        transcript_consequences: [
          {
            gene_symbol: 'TEST_GENE',
            gene_id: 'ENSG00000123456',
            transcript_id: 'ENST00000123456',
            consequence_terms: ['missense_variant'],
            impact: 'MODERATE',
          },
        ],
      },
    ];

    setupMock({
      baseUrl: apiConfig.ensembl.baseUrl,
      endpoint: '/vep/homo_sapiens/region',
      response: vepResponse,
      method: 'post',
    });

    const params = {
      variants: ['1-65568-A-C'],
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1', hgvs: '1' },
      cache: false,
      output: 'JSON',
    };

    // Load features
    const { loadFeatures } = featureParser;
    params.features = await loadFeatures({
      bedFile: ['/path/to/regions.bed'],
      geneList: ['/path/to/genes.txt'],
    });

    const result = await variantLinkerCore.analyzeVariant(params);

    expect(result.annotationData).to.have.length(1);
    expect(result.annotationData[0]).to.have.property('user_feature_overlap');
    expect(result.annotationData[0].user_feature_overlap).to.have.length(2);

    // Should have both gene and region overlaps (sorted by type)
    expect(result.annotationData[0].user_feature_overlap[0].type).to.equal('gene');
    expect(result.annotationData[0].user_feature_overlap[1].type).to.equal('region');
  });
});
