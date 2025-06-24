// test/configHelper.test.js

'use strict';

const { expect } = require('chai');
const { getBaseUrl } = require('../src/configHelper');
const apiConfig = require('../config/apiConfig.json');

describe('configHelper', () => {
  describe('getBaseUrl(assembly)', () => {
    it('should return the legacy base URL for "hg19"', () => {
      const expectedUrl = apiConfig.ensembl.legacyBaseUrl;
      const result = getBaseUrl('hg19');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://grch37.rest.ensembl.org');
    });

    it('should return the legacy base URL for "HG19" (case-insensitive)', () => {
      const expectedUrl = apiConfig.ensembl.legacyBaseUrl;
      const result = getBaseUrl('HG19');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://grch37.rest.ensembl.org');
    });

    it('should return the legacy base URL for "Hg19" (mixed case)', () => {
      const expectedUrl = apiConfig.ensembl.legacyBaseUrl;
      const result = getBaseUrl('Hg19');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://grch37.rest.ensembl.org');
    });

    it('should return the standard base URL for "hg38"', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;
      const result = getBaseUrl('hg38');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://rest.ensembl.org');
    });

    it('should return the standard base URL for "GRCh38"', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;
      const result = getBaseUrl('GRCh38');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://rest.ensembl.org');
    });

    it('should return the standard base URL if assembly is null', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;
      const result = getBaseUrl(null);
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://rest.ensembl.org');
    });

    it('should return the standard base URL if assembly is undefined', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;
      const result = getBaseUrl(undefined);
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://rest.ensembl.org');
    });

    it('should return the standard base URL for empty string', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;
      const result = getBaseUrl('');
      expect(result).to.equal(expectedUrl);
      expect(result).to.equal('https://rest.ensembl.org');
    });

    it('should return the standard base URL for unrecognized assembly strings', () => {
      const expectedUrl = apiConfig.ensembl.baseUrl;

      expect(getBaseUrl('hg18')).to.equal(expectedUrl);
      expect(getBaseUrl('GRCh37')).to.equal(expectedUrl);
      expect(getBaseUrl('mm10')).to.equal(expectedUrl);
      expect(getBaseUrl('invalid')).to.equal(expectedUrl);
      expect(getBaseUrl('123')).to.equal(expectedUrl);
    });

    it('should handle whitespace in assembly parameter', () => {
      const expectedStandardUrl = apiConfig.ensembl.baseUrl;

      // Should NOT match hg19 due to whitespace (falls back to standard)
      expect(getBaseUrl(' hg19')).to.equal(expectedStandardUrl);
      expect(getBaseUrl('hg19 ')).to.equal(expectedStandardUrl);
      expect(getBaseUrl(' hg19 ')).to.equal(expectedStandardUrl);
    });

    it('should validate that configuration URLs are properly formatted', () => {
      // Ensure the config contains valid URLs
      expect(apiConfig.ensembl.baseUrl).to.be.a('string');
      expect(apiConfig.ensembl.legacyBaseUrl).to.be.a('string');
      expect(apiConfig.ensembl.baseUrl).to.match(/^https?:\/\/.+/);
      expect(apiConfig.ensembl.legacyBaseUrl).to.match(/^https?:\/\/.+/);

      // Verify they are different URLs
      expect(apiConfig.ensembl.baseUrl).to.not.equal(apiConfig.ensembl.legacyBaseUrl);
    });

    it('should return consistent results for repeated calls', () => {
      // Test idempotency
      const result1 = getBaseUrl('hg19');
      const result2 = getBaseUrl('hg19');
      const result3 = getBaseUrl('hg38');
      const result4 = getBaseUrl('hg38');

      expect(result1).to.equal(result2);
      expect(result3).to.equal(result4);
      expect(result1).to.not.equal(result3);
    });
  });
});
