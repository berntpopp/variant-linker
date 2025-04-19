// test/variantRecoder.test.js

// Handle ESM modules correctly
const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const variantRecoder = require('../src/variantRecoder');
const apiConfig = require('../config/apiConfig.json');

describe('variantRecoder', () => {
  // Use the environment variable override if set, otherwise use the config baseUrl.
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  const variant = 'rs123';
  const responseMock = [
    {
      id: 'rs123',
      vcf_string: ['1-1000-A-T', '1-1000-A-G'],
    },
  ];

  beforeEach(() => {
    nock(apiBaseUrl)
      .get(`${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`)
      .query(true)
      .reply(200, responseMock);
  });

  afterEach(() => {
    // Clean up any nock interceptors, including persistent ones
    nock.cleanAll();
  });

  it('should fetch recoded variant information', async () => {
    const options = { vcf_string: '1' };
    const result = await variantRecoder(variant, options);

    expect(result).to.be.an('array');
    expect(result[0]).to.have.property('id', 'rs123');
    expect(result[0]).to.have.property('vcf_string').that.includes('1-1000-A-T');
  });

  it('should handle API errors gracefully', async function () {
    this.timeout(30000); // Increase timeout for retries

    nock.cleanAll(); // Remove previous interceptors

    // Get retry configuration values
    const maxRetries = apiConfig.requests?.retry?.maxRetries ?? 4;

    // Set up mock to respond with 500 error enough times to exhaust all retries
    nock(apiBaseUrl)
      .get(`${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`)
      .query(true)
      .times(maxRetries + 1) // Original request + retries
      .reply(500, { error: 'Internal Server Error' });

    try {
      await variantRecoder(variant);
      throw new Error('Expected variantRecoder to throw an error for 500 status code');
    } catch (error) {
      // AxiosError is an error object but has specific structure
      expect(error).to.be.an.instanceof(Error);
      expect(error.response.status).to.equal(500);
    }
  });
});
