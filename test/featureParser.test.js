// test/featureParser.test.js
/**
 * Tests for the featureParser module.
 */

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire');

chai.use(chaiAsPromised);
chai.use(sinonChai);
const { expect } = chai;

describe('featureParser', () => {
  let sandbox;
  let fsStub;
  let parseBedFile;
  let parseGeneListFile;
  let parseJsonGeneFile;
  let loadFeatures;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fsStub = {
      readFile: sandbox.stub(),
    };

    // Use proxyquire to mock fs
    const featureParser = proxyquire('../src/featureParser', {
      fs: { promises: fsStub },
    });

    // Destructure the functions
    ({ parseBedFile, parseGeneListFile, parseJsonGeneFile, loadFeatures } = featureParser);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('parseBedFile', () => {
    it('should parse a valid 3-column BED file', async () => {
      const bedContent = 'chr1\t1000\t2000\nchr2\t3000\t4000\tregion2';
      fsStub.readFile.resolves(bedContent);

      const result = await parseBedFile('/path/to/test.bed');

      expect(result).to.have.length(2);
      expect(result[0]).to.deep.equal({
        chrom: '1',
        start: 1000,
        end: 2000,
        name: 'region_1',
        score: null,
        strand: null,
      });
      expect(result[1]).to.deep.equal({
        chrom: '2',
        start: 3000,
        end: 4000,
        name: 'region2',
        score: null,
        strand: null,
      });
    });

    it('should parse a valid 6-column BED file', async () => {
      const bedContent = 'chr1\t1000\t2000\tregion1\t100\t+\nchr2\t3000\t4000\tregion2\t200\t-';
      fsStub.readFile.resolves(bedContent);

      const result = await parseBedFile('/path/to/test.bed');

      expect(result).to.have.length(2);
      expect(result[0]).to.deep.equal({
        chrom: '1',
        start: 1000,
        end: 2000,
        name: 'region1',
        score: 100,
        strand: '+',
      });
      expect(result[1]).to.deep.equal({
        chrom: '2',
        start: 3000,
        end: 4000,
        name: 'region2',
        score: 200,
        strand: '-',
      });
    });

    it('should skip comment lines and empty lines', async () => {
      const bedContent =
        '#This is a comment\n\nchr1\t1000\t2000\ntrack name=test\nbrowser position chr1:1-1000\nchr2\t3000\t4000';
      fsStub.readFile.resolves(bedContent);

      const result = await parseBedFile('/path/to/test.bed');

      expect(result).to.have.length(2);
      expect(result[0].chrom).to.equal('1');
      expect(result[1].chrom).to.equal('2');
    });

    it('should remove chr prefix from chromosome names', async () => {
      const bedContent = 'CHR1\t1000\t2000\nchrX\t3000\t4000\nchrY\t5000\t6000';
      fsStub.readFile.resolves(bedContent);

      const result = await parseBedFile('/path/to/test.bed');

      expect(result).to.have.length(3);
      expect(result[0].chrom).to.equal('1');
      expect(result[1].chrom).to.equal('X');
      expect(result[2].chrom).to.equal('Y');
    });

    it('should skip invalid lines', async () => {
      const bedContent =
        'chr1\t1000\t2000\ninvalid\tchr2\t3000\t4000\nchr3\tNaN\t5000\nchr4\t6000\t5000\nchr5\t7000\t8000';
      fsStub.readFile.resolves(bedContent);

      const result = await parseBedFile('/path/to/test.bed');

      expect(result).to.have.length(2);
      expect(result[0].chrom).to.equal('1');
      expect(result[1].chrom).to.equal('5');
    });

    it('should throw error on file read failure', async () => {
      fsStub.readFile.rejects(new Error('File not found'));

      await expect(parseBedFile('/path/to/nonexistent.bed')).to.be.rejectedWith(
        'Error parsing BED file'
      );
    });
  });

  describe('parseGeneListFile', () => {
    it('should parse a valid gene list file', async () => {
      const geneContent = 'BRCA1\nBRCA2\n\nTP53\n#This is a comment\nMYC';
      fsStub.readFile.resolves(geneContent);

      const result = await parseGeneListFile('/path/to/genes.txt');

      expect(result).to.have.length(4);
      expect(result[0]).to.deep.equal({
        identifier: 'BRCA1',
        source: 'genes.txt',
        line: 1,
      });
      expect(result[1]).to.deep.equal({
        identifier: 'BRCA2',
        source: 'genes.txt',
        line: 2,
      });
      expect(result[2]).to.deep.equal({
        identifier: 'TP53',
        source: 'genes.txt',
        line: 4,
      });
      expect(result[3]).to.deep.equal({
        identifier: 'MYC',
        source: 'genes.txt',
        line: 6,
      });
    });

    it('should handle empty file', async () => {
      fsStub.readFile.resolves('');

      const result = await parseGeneListFile('/path/to/empty.txt');

      expect(result).to.have.length(0);
    });

    it('should throw error on file read failure', async () => {
      fsStub.readFile.rejects(new Error('Permission denied'));

      await expect(parseGeneListFile('/path/to/genes.txt')).to.be.rejectedWith(
        'Error parsing gene list file'
      );
    });
  });

  describe('parseJsonGeneFile', () => {
    it('should parse a valid JSON array with simple mapping', async () => {
      const jsonContent = JSON.stringify([
        { gene_symbol: 'BRCA1', panel: 'cancer' },
        { gene_symbol: 'BRCA2', panel: 'cancer' },
        { gene_symbol: 'TP53', panel: 'tumor_suppressor' },
      ]);
      fsStub.readFile.resolves(jsonContent);

      const mapping = { identifier: 'gene_symbol', dataFields: ['panel'] };
      const result = await parseJsonGeneFile('/path/to/genes.json', mapping);

      expect(result).to.have.length(3);
      expect(result[0]).to.deep.equal({
        identifier: 'BRCA1',
        source: 'genes.json',
        panel: 'cancer',
      });
    });

    it('should parse a valid JSON object with mapping', async () => {
      const jsonContent = JSON.stringify({
        gene1: { symbol: 'BRCA1', description: 'Breast cancer gene' },
        gene2: { symbol: 'TP53', description: 'Tumor suppressor' },
      });
      fsStub.readFile.resolves(jsonContent);

      const mapping = { identifier: 'symbol', dataFields: ['description'] };
      const result = await parseJsonGeneFile('/path/to/genes.json', mapping);

      expect(result).to.have.length(2);
      expect(result.find((g) => g.identifier === 'BRCA1')).to.deep.equal({
        identifier: 'BRCA1',
        source: 'genes.json',
        description: 'Breast cancer gene',
      });
    });

    it('should skip items without identifier field', async () => {
      const jsonContent = JSON.stringify([
        { gene_symbol: 'BRCA1', panel: 'cancer' },
        { panel: 'orphan' }, // Missing gene_symbol
        { gene_symbol: 'TP53', panel: 'tumor_suppressor' },
      ]);
      fsStub.readFile.resolves(jsonContent);

      const mapping = { identifier: 'gene_symbol', dataFields: ['panel'] };
      const result = await parseJsonGeneFile('/path/to/genes.json', mapping);

      expect(result).to.have.length(2);
      expect(result.map((g) => g.identifier)).to.deep.equal(['BRCA1', 'TP53']);
    });

    it('should throw error for missing identifier in mapping', async () => {
      fsStub.readFile.resolves('[]');

      const mapping = { dataFields: ['panel'] }; // Missing identifier
      await expect(parseJsonGeneFile('/path/to/genes.json', mapping)).to.be.rejectedWith(
        'JSON gene mapping must include "identifier" field'
      );
    });

    it('should throw error for invalid JSON', async () => {
      fsStub.readFile.resolves('{ invalid json }');

      const mapping = { identifier: 'gene_symbol' };
      await expect(parseJsonGeneFile('/path/to/genes.json', mapping)).to.be.rejectedWith(
        'Invalid JSON format'
      );
    });

    it('should throw error on file read failure', async () => {
      fsStub.readFile.rejects(new Error('File not found'));

      const mapping = { identifier: 'gene_symbol' };
      await expect(parseJsonGeneFile('/path/to/genes.json', mapping)).to.be.rejectedWith(
        'Error parsing JSON gene file'
      );
    });
  });

  describe('loadFeatures', () => {
    let IntervalTreeStub;
    let intervalTreeInstance;

    beforeEach(() => {
      intervalTreeInstance = {
        insert: sandbox.stub(),
        count: 5,
      };
      IntervalTreeStub = sandbox.stub().returns(intervalTreeInstance);

      featureParser = proxyquire('../src/featureParser', {
        fs: { promises: fsStub },
        'node-interval-tree': IntervalTreeStub,
      });

      // Re-destructure the loadFeatures function for this test suite
      ({ loadFeatures } = featureParser);
    });

    it('should load BED files and create interval trees', async () => {
      const bedContent = 'chr1\t1000\t2000\tregion1\nchr2\t3000\t4000\tregion2';
      fsStub.readFile.resolves(bedContent);

      const params = {
        bedFile: ['/path/to/test.bed'],
      };

      const result = await loadFeatures(params);

      expect(result.featuresByChrom).to.have.property('1');
      expect(result.featuresByChrom).to.have.property('2');
      expect(IntervalTreeStub).to.have.been.calledTwice;
      expect(intervalTreeInstance.insert).to.have.been.calledTwice;
      expect(result.geneSets.size).to.equal(0);
    });

    it('should load gene list files', async () => {
      const geneContent = 'BRCA1\nBRCA2\nTP53';
      fsStub.readFile.resolves(geneContent);

      const params = {
        geneList: ['/path/to/genes.txt'],
      };

      const result = await loadFeatures(params);

      expect(Object.keys(result.featuresByChrom)).to.have.length(0);
      expect(result.geneSets.size).to.equal(3);
      expect(result.geneSets.has('BRCA1')).to.be.true;
      expect(result.geneSets.has('BRCA2')).to.be.true;
      expect(result.geneSets.has('TP53')).to.be.true;
    });

    it('should load JSON gene files with mapping', async () => {
      const jsonContent = JSON.stringify([
        { gene_symbol: 'BRCA1', panel: 'cancer' },
        { gene_symbol: 'TP53', panel: 'tumor_suppressor' },
      ]);
      fsStub.readFile.resolves(jsonContent);

      const params = {
        jsonGenes: ['/path/to/genes.json'],
        jsonGeneMapping: '{"identifier":"gene_symbol","dataFields":["panel"]}',
      };

      const result = await loadFeatures(params);

      expect(result.geneSets.size).to.equal(2);
      expect(result.geneSets.has('BRCA1')).to.be.true;
      expect(result.geneSets.get('BRCA1')[0]).to.have.property('panel', 'cancer');
    });

    it('should throw error for JSON genes without mapping', async () => {
      const params = {
        jsonGenes: ['/path/to/genes.json'],
        // Missing jsonGeneMapping
      };

      await expect(loadFeatures(params)).to.be.rejectedWith(
        '--json-gene-mapping is required when using --json-genes'
      );
    });

    it('should throw error for invalid JSON mapping', async () => {
      const params = {
        jsonGenes: ['/path/to/genes.json'],
        jsonGeneMapping: '{ invalid json }',
      };

      await expect(loadFeatures(params)).to.be.rejectedWith('Invalid JSON gene mapping');
    });

    it('should handle multiple files of same type', async () => {
      const geneContent1 = 'BRCA1\nBRCA2';
      const geneContent2 = 'TP53\nMYC';
      fsStub.readFile.onFirstCall().resolves(geneContent1);
      fsStub.readFile.onSecondCall().resolves(geneContent2);

      const params = {
        geneList: ['/path/to/genes1.txt', '/path/to/genes2.txt'],
      };

      const result = await loadFeatures(params);

      expect(result.geneSets.size).to.equal(4);
      expect(result.geneSets.has('BRCA1')).to.be.true;
      expect(result.geneSets.has('MYC')).to.be.true;
    });

    it('should handle empty parameters', async () => {
      const params = {};

      const result = await loadFeatures(params);

      expect(Object.keys(result.featuresByChrom)).to.have.length(0);
      expect(result.geneSets.size).to.equal(0);
    });

    it('should propagate file loading errors', async () => {
      fsStub.readFile.rejects(new Error('Permission denied'));

      const params = {
        bedFile: ['/path/to/inaccessible.bed'],
      };

      await expect(loadFeatures(params)).to.be.rejectedWith('Permission denied');
    });
  });
});
