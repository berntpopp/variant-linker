// test/variantRecoder.test.js

const nock = require('nock');

describe('variantRecoder', () => {
  const apiBaseUrl = 'https://rest.ensembl.org';
  const variant = 'rs123';
  const responseMock = [
    {
      id: 'rs123',
      vcf_string: ['1-1000-A-T', '1-1000-A-G']
    }
  ];

  before(async function() {
    const chai = await import('chai');
    global.expect = chai.expect;
  });

  beforeEach(() => {
    nock(apiBaseUrl)
      .get(`/variant_recoder/human/${variant}`)
      .query(true)
      .reply(200, responseMock);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch recoded variant information', async () => {
    const variantRecoder = (await import('../src/variantRecoder.js')).default;
    const options = { vcf_string: '1' };
    const result = await variantRecoder(variant, options);

    expect(result).to.be.an('array');
    expect(result[0]).to.have.property('id', 'rs123');
    expect(result[0]).to.have.property('vcf_string').that.includes('1-1000-A-T');
  });

  it('should handle API errors gracefully', async () => {
    nock.cleanAll();
    nock(apiBaseUrl)
      .get(`/variant_recoder/human/${variant}`)
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    try {
      const variantRecoder = (await import('../src/variantRecoder.js')).default;
      await variantRecoder(variant);
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.include('Request failed with status code 500');
    }
  });
});
