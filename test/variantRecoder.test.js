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

  it('should propagate API errors when retries are disabled', async () => {
    nock.cleanAll(); // Remove previous interceptors

    const scope = nock(apiBaseUrl)
      .get(`${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`)
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    try {
      await variantRecoder(variant, {}, false, null, { maxRetries: 0 });
      throw new Error('Expected variantRecoder to throw an error for 500 status code');
    } catch (error) {
      // AxiosError is an error object but has specific structure
      expect(error).to.be.an.instanceof(Error);
      expect(error.response.status).to.equal(500);
    }
    expect(scope.isDone()).to.equal(true);
  });
});
