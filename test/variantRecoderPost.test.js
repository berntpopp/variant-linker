// test/variantRecoderPost.test.js

// Handle ESM modules correctly
const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const variantRecoderPost = require('../src/variantRecoderPost');
const apiConfig = require('../config/apiConfig.json');

describe('variantRecoderPost', () => {
  // Use the environment variable override if set, otherwise use the config baseUrl
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  const variants = ['rs123', 'rs456', 'ENST00000366667:c.803C>T'];

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

  it('should handle API errors gracefully', async () => {
    nock.cleanAll(); // Remove previous interceptors
    nock(apiBaseUrl)
      .post(`${apiConfig.ensembl.endpoints.variantRecoderBase}/homo_sapiens`)
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    try {
      await variantRecoderPost(variants);
      throw new Error('Expected variantRecoderPost to throw an error for 500 status code');
    } catch (error) {
      // AxiosError is an error object but has specific structure
      expect(error).to.be.an.instanceof(Error);
      expect(error.message).to.include('Request failed with status code 500');
    }
  });
});
