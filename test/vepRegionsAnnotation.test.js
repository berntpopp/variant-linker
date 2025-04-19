// test/vepRegionsAnnotation.test.js

const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const vepRegionsAnnotation = require('../src/vepRegionsAnnotation');
const apiConfig = require('../config/apiConfig.json');
const sinon = require('sinon');
const { fetchApi } = require('../src/apiHelper');

describe('vepRegionsAnnotation', () => {
  // Use the environment variable override if set, otherwise use the config baseUrl
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;

  // Sample variant data for testing
  const sampleVariants = ['1 100 . A G . . .', '2 200 . C T . . .', '3 300 . G A . . .'];

  // Clock for testing timers (only used in specific tests)
  let clock;
  // Original setTimeout to restore after tests
  const originalSetTimeout = global.setTimeout;

  // Mock response for the API
  const mockResponse = [
    {
      input: '1 100 . A G . . .',
      assembly_name: 'GRCh38',
      seq_region_name: '1',
      start: 100,
      end: 100,
      allele_string: 'A/G',
      strand: 1,
      transcript_consequences: [
        {
          gene_id: 'ENSG00000123456',
          gene_symbol: 'GENE1',
          transcript_id: 'ENST00000123456',
          consequence_terms: ['missense_variant'],
        },
      ],
    },
    {
      input: '2 200 . C T . . .',
      assembly_name: 'GRCh38',
      seq_region_name: '2',
      start: 200,
      end: 200,
      allele_string: 'C/T',
      strand: 1,
      transcript_consequences: [
        {
          gene_id: 'ENSG00000234567',
          gene_symbol: 'GENE2',
          transcript_id: 'ENST00000234567',
          consequence_terms: ['synonymous_variant'],
        },
      ],
    },
    {
      input: '3 300 . G A . . .',
      assembly_name: 'GRCh38',
      seq_region_name: '3',
      start: 300,
      end: 300,
      allele_string: 'G/A',
      strand: 1,
      transcript_consequences: [
        {
          gene_id: 'ENSG00000345678',
          gene_symbol: 'GENE3',
          transcript_id: 'ENST00000345678',
          consequence_terms: ['intron_variant'],
        },
      ],
    },
  ];

  afterEach(() => {
    // Clean up any nock interceptors
    nock.cleanAll();

    // Restore real timers if they were faked
    if (clock && typeof clock.restore === 'function') {
      clock.restore();
      clock = null;
    }
  });

  it('should fetch VEP annotations for variants', async () => {
    // Setup nock to intercept the request
    nock(apiBaseUrl)
      .post(apiConfig.ensembl.endpoints.vepRegions)
      .query(true)
      .reply(function (uri, requestBody) {
        // Verify request body contains the expected variants
        expect(requestBody).to.have.property('variants').that.is.an('array');
        expect(requestBody.variants).to.deep.equal(sampleVariants);
        return [200, mockResponse];
      });

    const options = { hgvs: '1' };
    const result = await vepRegionsAnnotation(sampleVariants, options);

    expect(result).to.be.an('array').with.lengthOf(3);

    // Check first variant result
    expect(result[0]).to.have.property('input', '1 100 . A G . . .');
    expect(result[0]).to.have.property('seq_region_name', '1');

    // Check second variant result
    expect(result[1]).to.have.property('input', '2 200 . C T . . .');
    expect(result[1]).to.have.property('seq_region_name', '2');

    // Check third variant result
    expect(result[2]).to.have.property('input', '3 300 . G A . . .');
    expect(result[2]).to.have.property('seq_region_name', '3');
  });

  it('should handle chunking when variant count exceeds chunk size', async function () {
    this.timeout(30000); // Increase timeout for this test

    // Set up fake timers for this test
    clock = sinon.useFakeTimers();
    global.setTimeout = function (fn, delay) {
      fn();
    }; // Mock setTimeout to call immediately

    // Create a larger array of variants to test chunking
    const largeVariantArray = [];
    for (let i = 1; i <= 250; i++) {
      largeVariantArray.push(`${i} ${i * 100} . A G . . .`);
    }

    // Mock API responses for each chunk
    const firstChunkVariants = largeVariantArray.slice(0, 200);
    const secondChunkVariants = largeVariantArray.slice(200);

    // Mock response for first chunk
    const firstChunkResponse = firstChunkVariants.map((variant) => {
      const [chr, pos] = variant.split(' ');
      return {
        input: variant,
        assembly_name: 'GRCh38',
        seq_region_name: chr,
        start: parseInt(pos),
        end: parseInt(pos),
        allele_string: 'A/G',
      };
    });

    // Mock response for second chunk
    const secondChunkResponse = secondChunkVariants.map((variant) => {
      const [chr, pos] = variant.split(' ');
      return {
        input: variant,
        assembly_name: 'GRCh38',
        seq_region_name: chr,
        start: parseInt(pos),
        end: parseInt(pos),
        allele_string: 'A/G',
      };
    });

    // Stub fetchApi to return appropriate responses
    let callCount = 0;
    const apiHelper = require('../src/apiHelper');
    const fetchApiOriginal = apiHelper.fetchApi;

    try {
      apiHelper.fetchApi = function (endpoint, options, cacheEnabled, method, requestBody) {
        callCount++;
        if (callCount === 1) {
          expect(requestBody.variants).to.have.lengthOf(200);
          expect(requestBody.variants).to.deep.equal(firstChunkVariants);
          return Promise.resolve(firstChunkResponse);
        } else {
          expect(requestBody.variants).to.have.lengthOf(50);
          expect(requestBody.variants).to.deep.equal(secondChunkVariants);
          return Promise.resolve(secondChunkResponse);
        }
      };

      const result = await vepRegionsAnnotation(largeVariantArray);

      // Verify the combined results from both chunks
      expect(result).to.be.an('array').with.lengthOf(250);

      // Check first variant in the combined result
      expect(result[0]).to.have.property('input', '1 100 . A G . . .');
      expect(result[0]).to.have.property('seq_region_name', '1');

      // Check last variant in the combined result
      expect(result[249]).to.have.property('input', '250 25000 . A G . . .');
      expect(result[249]).to.have.property('seq_region_name', '250');

      // Verify the API was called twice
      expect(callCount).to.equal(2);
    } finally {
      // Restore the original fetchApi and setTimeout
      apiHelper.fetchApi = fetchApiOriginal;
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should handle exact chunk size boundary', async () => {
    // Create an array of variants exactly at the chunk size boundary
    const exactSizeVariantArray = [];
    for (let i = 1; i <= 200; i++) {
      exactSizeVariantArray.push(`${i} ${i * 100} . A G . . .`);
    }

    // Mock API response
    const mockExactResponse = exactSizeVariantArray.map((variant) => {
      const [chr, pos] = variant.split(' ');
      return {
        input: variant,
        assembly_name: 'GRCh38',
        seq_region_name: chr,
        start: parseInt(pos),
        end: parseInt(pos),
        allele_string: 'A/G',
      };
    });

    // Setup nock for exact chunk size
    nock(apiBaseUrl)
      .post(apiConfig.ensembl.endpoints.vepRegions)
      .query(true)
      .reply(function (uri, requestBody) {
        expect(requestBody).to.have.property('variants').that.is.an('array');
        expect(requestBody.variants).to.have.lengthOf(200);
        expect(requestBody.variants).to.deep.equal(exactSizeVariantArray);
        return [200, mockExactResponse];
      });

    const result = await vepRegionsAnnotation(exactSizeVariantArray);

    // Verify all results were processed correctly
    expect(result).to.be.an('array').with.lengthOf(200);

    // Check first and last variants
    expect(result[0]).to.have.property('input', '1 100 . A G . . .');
    expect(result[0]).to.have.property('seq_region_name', '1');
    expect(result[199]).to.have.property('input', '200 20000 . A G . . .');
    expect(result[199]).to.have.property('seq_region_name', '200');
  });

  it('should respect a custom chunk size from config', async function () {
    this.timeout(30000); // Increase timeout for this test

    // Set up fake timers for this test
    clock = sinon.useFakeTimers();
    global.setTimeout = function (fn, delay) {
      fn();
    }; // Mock setTimeout to call immediately

    // Temporarily override the chunk size in the config
    const originalChunkSize = apiConfig.ensembl.vepPostChunkSize;
    apiConfig.ensembl.vepPostChunkSize = 100; // Set a smaller chunk size

    try {
      // Create a variant array that exceeds our custom chunk size
      const variantArray = [];
      for (let i = 1; i <= 150; i++) {
        variantArray.push(`${i} ${i * 100} . A G . . .`);
      }

      // Mock API responses for each chunk
      const firstChunkVariants = variantArray.slice(0, 100);
      const secondChunkVariants = variantArray.slice(100);

      // Mock response for first chunk
      const firstChunkResponse = firstChunkVariants.map((variant) => {
        const [chr, pos] = variant.split(' ');
        return {
          input: variant,
          assembly_name: 'GRCh38',
          seq_region_name: chr,
          start: parseInt(pos),
          end: parseInt(pos),
          allele_string: 'A/G',
        };
      });

      // Mock response for second chunk
      const secondChunkResponse = secondChunkVariants.map((variant) => {
        const [chr, pos] = variant.split(' ');
        return {
          input: variant,
          assembly_name: 'GRCh38',
          seq_region_name: chr,
          start: parseInt(pos),
          end: parseInt(pos),
          allele_string: 'A/G',
        };
      });

      // Stub fetchApi to return appropriate responses
      let callCount = 0;
      const apiHelper = require('../src/apiHelper');

      apiHelper.fetchApi = (endpoint, options, cacheEnabled, method, requestBody) => {
        callCount++;
        if (callCount === 1) {
          expect(requestBody.variants).to.have.lengthOf(100); // Should match custom chunk size
          expect(requestBody.variants).to.deep.equal(firstChunkVariants);
          return Promise.resolve(firstChunkResponse);
        } else {
          expect(requestBody.variants).to.have.lengthOf(50); // Second chunk should have 50 variants
          expect(requestBody.variants).to.deep.equal(secondChunkVariants);
          return Promise.resolve(secondChunkResponse);
        }
      };

      const result = await vepRegionsAnnotation(variantArray);

      // Verify the combined results from both chunks
      expect(result).to.be.an('array').with.lengthOf(150);
      expect(callCount).to.equal(2); // Should make exactly two API calls
    } finally {
      // Restore original setTimeout and chunk size regardless of test outcome
      global.setTimeout = originalSetTimeout;
      apiConfig.ensembl.vepPostChunkSize = originalChunkSize;

      // Restore fetchApi if it was replaced
      if (typeof require('../src/apiHelper').fetchApi !== 'function') {
        require('../src/apiHelper').fetchApi = fetchApi;
      }
    }
  });
});
