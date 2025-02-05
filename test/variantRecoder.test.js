// test/variantRecoder.test.js

const { expect } = require('chai');
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
      vcf_string: ['1-1000-A-T', '1-1000-A-G']
    }
  ];

  beforeEach(() => {
    nock(apiBaseUrl)
      .get(`${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`)
      .query(true)
      .reply(200, responseMock);
  });

  afterEach(() => {
    // Ensure that all expected HTTP calls have been made.
    if (!nock.isDone()) {
      console.error('Not all nock interceptors were used:', nock.pendingMocks());
      nock.cleanAll();
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  it('should fetch recoded variant information', async () => {
    const options = { vcf_string: '1' };
    const result = await variantRecoder(variant, options);

    expect(result).to.be.an('array');
    expect(result[0]).to.have.property('id', 'rs123');
    expect(result[0])
      .to.have.property('vcf_string')
      .that.includes('1-1000-A-T');
  });

  it('should handle API errors gracefully', async () => {
    nock.cleanAll(); // Remove previous interceptors
    nock(apiBaseUrl)
      .get(`${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`)
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    try {
      await variantRecoder(variant);
      throw new Error('Expected variantRecoder to throw an error for 500 status code');
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.include('Request failed with status code 500');
    }
  });
});
