// test/variantRecoderPost.test.js

// Handle ESM modules correctly
const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const variantRecoderPost = require('../src/variantRecoderPost');
const apiConfig = require('../config/apiConfig.json');
const sinon = require('sinon');
const { fetchApi } = require('../src/apiHelper');

describe('variantRecoderPost', () => {
  // Use the environment variable override if set, otherwise use the config baseUrl
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  const variants = ['rs123', 'rs456', 'ENST00000366667:c.803C>T'];

  // Clock for testing timers (only used in specific tests)
  let clock;
  // Original setTimeout to restore after tests
  const originalSetTimeout = global.setTimeout;

  const responseMock = [
    {
      input: 'rs123',
      id: 'rs123',
      A: {
        hgvsg: ['NC_000001.11:g.1000A>T'],
        vcf_string: ['1-1000-A-T'],
      },
      T: {
        hgvsg: ['NC_000001.11:g.1000A>G'],
        vcf_string: ['1-1000-A-G'],
      },
    },
    {
      input: 'rs456',
      id: 'rs456',
      C: {
        hgvsg: ['NC_000002.12:g.2000G>C'],
        vcf_string: ['2-2000-G-C'],
      },
    },
    {
      input: 'ENST00000366667:c.803C>T',
      id: null,
      T: {
        hgvsg: ['NC_000010.11:g.52389C>T'],
        vcf_string: ['10-52389-C-T'],
      },
    },
  ];

  // We'll only set up nock in the specific test that needs it, not in beforeEach
  // This avoids issues with tests that don't use the network

  afterEach(() => {
    // Clean up any nock interceptors
    nock.cleanAll();

    // Restore real timers if they were faked
    if (clock && typeof clock.restore === 'function') {
      clock.restore();
      clock = null;
    }
  });

  it('should fetch recoded information for multiple variants', async () => {
    // Setup nock for this specific test
    nock(apiBaseUrl)
      .post(`${apiConfig.ensembl.endpoints.variantRecoderBase}/homo_sapiens`)
      .query(true)
      .reply(function (uri, requestBody) {
        // Verify the request body contains the expected variants
        expect(requestBody).to.have.property('ids').that.is.an('array');
        expect(requestBody.ids).to.deep.equal(variants);
        return [200, responseMock];
      });

    const options = { vcf_string: '1' };
    const result = await variantRecoderPost(variants, options);

    expect(result).to.be.an('array').with.lengthOf(3);

    // Check first variant result
    expect(result[0]).to.have.property('input', 'rs123');
    expect(result[0]).to.have.property('id', 'rs123');
    expect(result[0])
      .to.have.property('A')
      .that.has.property('vcf_string')
      .that.includes('1-1000-A-T');

    // Check second variant result
    expect(result[1]).to.have.property('input', 'rs456');
    expect(result[1]).to.have.property('id', 'rs456');
    expect(result[1])
      .to.have.property('C')
      .that.has.property('vcf_string')
      .that.includes('2-2000-G-C');

    // Check third variant result (HGVS notation)
    expect(result[2]).to.have.property('input', 'ENST00000366667:c.803C>T');
    expect(result[2])
      .to.have.property('T')
      .that.has.property('vcf_string')
      .that.includes('10-52389-C-T');
  });

  it('should reject empty variant arrays', async () => {
    try {
      await variantRecoderPost([]);
      throw new Error('Expected variantRecoderPost to throw an error for empty array');
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.include('Variants must be provided as a non-empty array');
    }
  });

  it('should handle API errors gracefully', async function () {
    this.timeout(30000); // Increase timeout for retries

    // Use real timers for this test
    // Avoid using fake timers for error tests with retries
    if (clock) {
      clock.restore();
      clock = null;
    }

    nock.cleanAll(); // Remove previous interceptors

    // Get retry configuration values
    const maxRetries = apiConfig.requests?.retry?.maxRetries ?? 4;

    // Set up mock to respond with 500 error enough times to exhaust all retries
    nock(apiBaseUrl)
      .post(`${apiConfig.ensembl.endpoints.variantRecoderBase}/homo_sapiens`)
      .query(true)
      .times(maxRetries + 1) // Original request + retries
      .reply(500, { error: 'Internal Server Error' });

    try {
      await variantRecoderPost(variants);
      throw new Error('Expected variantRecoderPost to throw an error for 500 status code');
    } catch (error) {
      // AxiosError is an error object but has specific structure
      expect(error).to.be.an.instanceof(Error);
      expect(error.response.status).to.equal(500);
    }
  });

  it('should chunk large variant arrays and make multiple requests', async function () {
    this.timeout(30000); // Increase timeout for this test

    // Set up fake timers for this test
    clock = sinon.useFakeTimers();

    // We need to stub fetchApi directly rather than mocking with nock when using fake timers
    global.setTimeout = function (fn, delay) {
      fn();
    }; // Mock setTimeout to call immediately

    // Create a large variant array to test chunking
    const largeVariantArray = [];
    for (let i = 1; i <= 250; i++) {
      largeVariantArray.push(`rs${i}`);
    }

    // Mock responses for the first and second chunks
    const firstChunkVariants = largeVariantArray.slice(0, 200);
    const secondChunkVariants = largeVariantArray.slice(200);

    // Mock response for first chunk
    const firstChunkResponse = firstChunkVariants.map((variant) => {
      return {
        input: variant,
        id: variant,
        A: {
          hgvsg: [`NC_000001.11:g.${variant.substring(2)}A>T`],
          vcf_string: [`1-${variant.substring(2)}-A-T`],
        },
      };
    });

    // Mock response for second chunk
    const secondChunkResponse = secondChunkVariants.map((variant) => {
      return {
        input: variant,
        id: variant,
        A: {
          hgvsg: [`NC_000001.11:g.${variant.substring(2)}A>T`],
          vcf_string: [`1-${variant.substring(2)}-A-T`],
        },
      };
    });

    // Stub fetchApi to return appropriate responses
    let callCount = 0;
    const apiHelper = require('../src/apiHelper');
    const fetchApiOriginal = apiHelper.fetchApi;
    apiHelper.fetchApi = function (endpoint, options, cacheEnabled, method, requestBody) {
      callCount++;
      if (callCount === 1) {
        expect(requestBody.ids).to.have.lengthOf(200);
        expect(requestBody.ids).to.deep.equal(firstChunkVariants);
        return Promise.resolve(firstChunkResponse);
      } else {
        expect(requestBody.ids).to.have.lengthOf(50);
        expect(requestBody.ids).to.deep.equal(secondChunkVariants);
        return Promise.resolve(secondChunkResponse);
      }
    };

    try {
      // Start the variantRecoderPost call but don't await it yet
      const resultPromise = variantRecoderPost(largeVariantArray);
      // Advance the clock to handle the inter-chunk delay
      await clock.tickAsync(150); // Advance past the 100ms delay

      // Now we can await the final result
      const result = await resultPromise;

      // Verify the combined results from both chunks
      expect(result).to.be.an('array').with.lengthOf(250);

      // Check first variant in the combined result
      expect(result[0]).to.have.property('input', 'rs1');
      expect(result[0]).to.have.property('id', 'rs1');

      // Check last variant in the combined result
      expect(result[249]).to.have.property('input', 'rs250');
      expect(result[249]).to.have.property('id', 'rs250');

      // Verify the API was called twice
      expect(callCount).to.equal(2);
    } finally {
      // Restore fetchApi
      apiHelper.fetchApi = fetchApiOriginal;
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should handle exact chunk size boundary', async function () {
    // No need for fake timers in this test since it's just one API call

    // Create an array of variants exactly at the chunk size boundary
    const exactSizeVariantArray = [];
    for (let i = 1; i <= 200; i++) {
      exactSizeVariantArray.push(`rs${i}`);
    }

    // Mock API response
    const mockExactResponse = exactSizeVariantArray.map((variant) => {
      return {
        input: variant,
        id: variant,
        A: {
          hgvsg: [`NC_000001.11:g.${variant.substring(2)}A>T`],
          vcf_string: [`1-${variant.substring(2)}-A-T`],
        },
      };
    });

    // Setup nock for exact chunk size
    nock(apiBaseUrl)
      .post(`${apiConfig.ensembl.endpoints.variantRecoderBase}/homo_sapiens`)
      .query(true)
      .reply(function (uri, requestBody) {
        expect(requestBody).to.have.property('ids').that.is.an('array');
        expect(requestBody.ids).to.have.lengthOf(200);
        expect(requestBody.ids).to.deep.equal(exactSizeVariantArray);
        return [200, mockExactResponse];
      });

    const result = await variantRecoderPost(exactSizeVariantArray);

    // Verify all results were processed correctly
    expect(result).to.be.an('array').with.lengthOf(200);

    // Check first and last variants
    expect(result[0]).to.have.property('input', 'rs1');
    expect(result[0]).to.have.property('id', 'rs1');
    expect(result[199]).to.have.property('input', 'rs200');
    expect(result[199]).to.have.property('id', 'rs200');
  });

  it('should respect a custom chunk size from config', async function () {
    this.timeout(30000); // Increase timeout for this test

    // Set up fake timers for this test
    clock = sinon.useFakeTimers();

    // Temporarily override the chunk size in the config
    const originalChunkSize = apiConfig.ensembl.recoderPostChunkSize;
    apiConfig.ensembl.recoderPostChunkSize = 100; // Set a smaller chunk size

    try {
      // Create a variant array that exceeds our custom chunk size
      const variantArray = [];
      for (let i = 1; i <= 150; i++) {
        variantArray.push(`rs${i}`);
      }

      // Mock API responses for each chunk
      const firstChunkVariants = variantArray.slice(0, 100);
      const secondChunkVariants = variantArray.slice(100);

      // Mock response for first chunk
      const firstChunkResponse = firstChunkVariants.map((variant) => {
        return {
          input: variant,
          id: variant,
          A: {
            hgvsg: [`NC_000001.11:g.${variant.substring(2)}A>T`],
            vcf_string: [`1-${variant.substring(2)}-A-T`],
          },
        };
      });

      // Mock response for second chunk
      const secondChunkResponse = secondChunkVariants.map((variant) => {
        return {
          input: variant,
          id: variant,
          A: {
            hgvsg: [`NC_000001.11:g.${variant.substring(2)}A>T`],
            vcf_string: [`1-${variant.substring(2)}-A-T`],
          },
        };
      });

      // Stub fetchApi to return appropriate responses
      let callCount = 0;
      const apiHelper = require('../src/apiHelper');
      apiHelper.fetchApi = function (endpoint, options, cacheEnabled, method, requestBody) {
        callCount++;
        if (callCount === 1) {
          expect(requestBody.ids).to.have.lengthOf(100); // First chunk should have 100 variants
          expect(requestBody.ids).to.deep.equal(firstChunkVariants);
          return Promise.resolve(firstChunkResponse);
        } else {
          expect(requestBody.ids).to.have.lengthOf(50); // Second chunk should have 50 variants
          expect(requestBody.ids).to.deep.equal(secondChunkVariants);
          return Promise.resolve(secondChunkResponse);
        }
      };

      // Start the variantRecoderPost call but don't await it yet
      const resultPromise = variantRecoderPost(variantArray);
      // Advance the clock to handle the inter-chunk delay
      await clock.tickAsync(150); // Advance past the 100ms delay

      // Now we can await the final result
      const result = await resultPromise;

      // Verify the combined results from both chunks
      expect(result).to.be.an('array').with.lengthOf(150);
      expect(callCount).to.equal(2); // Should make exactly two API calls
    } finally {
      // Restore original setTimeout and chunk size regardless of test outcome
      global.setTimeout = originalSetTimeout;
      apiConfig.ensembl.recoderPostChunkSize = originalChunkSize;

      // Restore fetchApi if it was replaced
      if (typeof require('../src/apiHelper').fetchApi !== 'function') {
        require('../src/apiHelper').fetchApi = fetchApi;
      }
    }
  });
});
