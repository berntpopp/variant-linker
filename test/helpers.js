// test/helpers.js
// Common test utilities and mock data for variant-linker tests

// Handle ESM modules correctly
const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const apiConfig = require('../config/apiConfig.json');

/**
 * Standard mock responses for common API endpoints
 */
// Common test variant formats used across tests
const vcfVariant = '1-65568-A-C';
const hgvsVariant = 'ENST00000366667:c.803C>T';
const rsVariant = 'rs123';
const mixedVariants = [vcfVariant, hgvsVariant, rsVariant];

const mockResponses = {
  // Common variant formats for easy reference
  variantFormats: {
    vcfVariant,
    hgvsVariant,
    rsVariant,
    mixedVariants,
  },

  // Common Variant Recoder GET response (single variant)
  variantRecoderGet: {
    rs123: {
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
  },

  // Common Variant Recoder POST response (multiple variants)
  variantRecoderPost: [
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
      T: {
        hgvsg: ['NC_000010.11:g.52389C>T'],
        vcf_string: ['10-52389-C-T'],
      },
    },
  ],

  // VEP response for VCF variant
  vepVcfResponse: [
    {
      input: '1 65568 . A C . . .',
      id: 'variant1_1_65568_A_C',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000001',
          gene_id: 'ENSG00000001',
          gene_symbol: 'GENE1',
          consequence_terms: ['missense_variant'],
          impact: 'MODERATE',
          polyphen_score: 0.85,
          sift_score: 0.1,
        },
        {
          transcript_id: 'ENST00000002',
          gene_id: 'ENSG00000001',
          gene_symbol: 'GENE1',
          consequence_terms: ['5_prime_UTR_variant'],
          impact: 'MODIFIER',
        },
      ],
    },
  ],

  // VEP response for HGVS variant
  vepHgvsResponse: [
    {
      input: '10 52389 . C T . . .',
      id: 'variant2_10_52389_C_T',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000366667',
          gene_id: 'ENSG00000002',
          gene_symbol: 'GENE2',
          consequence_terms: ['missense_variant'],
          impact: 'MODERATE',
          polyphen_score: 0.92,
          sift_score: 0.05,
          cadd_phred: 25.1,
        },
      ],
    },
  ],
};

/**
 * Sets up common nock interceptors for the test
 * @param {Object} options Configuration options for mocking
 * @param {string} options.baseUrl Base URL for the Ensembl API
 * @param {string} options.endpoint Endpoint path to mock
 * @param {Object|Array} options.response Response data to return
 * @param {number} options.statusCode HTTP status code to return (default: 200)
 * @param {string} options.method HTTP method to mock (default: 'GET')
 * @param {Function} options.requestValidator Optional function to validate the request
 * @returns {Object} Nock interceptor
 */
function setupMock({
  baseUrl,
  endpoint,
  response,
  statusCode = 200,
  method = 'GET',
  requestValidator = null,
}) {
  const mock = nock(baseUrl)[method.toLowerCase()](endpoint).query(true); // Accept any query params

  if (requestValidator) {
    return mock.reply(function (uri, requestBody) {
      try {
        requestValidator(uri, requestBody);
        return [statusCode, response];
      } catch (error) {
        console.error('Request validation failed:', error.message);
        return [400, { error: error.message }];
      }
    });
  }

  return mock.reply(statusCode, response);
}

/**
 * Creates a sample realistic VEP annotation result for testing
 * @param {Object} options Options for customizing the VEP response
 * @param {string} options.input Input variant identifier
 * @param {string} options.consequence Consequence type
 * @param {string} options.impact Impact level (HIGH, MODERATE, LOW, MODIFIER)
 * @param {number} options.polyphen Polyphen score (0-1)
 * @param {number} options.sift SIFT score (0-1)
 * @param {number} options.cadd CADD score
 * @returns {Object} A realistic VEP annotation object
 */
function createVepAnnotation({
  input = '1 65568 . A C . . .',
  consequence = 'missense_variant',
  impact = 'MODERATE',
  polyphen = 0.85,
  sift = 0.1,
  cadd = 20.5,
}) {
  return {
    input: input,
    id: `variant_${input.replace(/\s+/g, '_').substr(0, 20)}`,
    most_severe_consequence: consequence,
    transcript_consequences: [
      {
        transcript_id: 'ENST00000001',
        gene_id: 'ENSG00000001',
        gene_symbol: 'GENE1',
        consequence_terms: [consequence],
        impact: impact,
        polyphen_score: polyphen,
        sift_score: sift,
        cadd_phred: cadd,
      },
    ],
  };
}

/**
 * Get the API base URL for tests
 * Will use environment variable if set, otherwise use config
 * @returns {string} API base URL
 */
function getApiBaseUrl() {
  return process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
}

module.exports = {
  expect,
  mockResponses,
  setupMock,
  createVepAnnotation,
  getApiBaseUrl,
  // Export variant format constants for direct use in tests
  vcfVariant,
  hgvsVariant,
  rsVariant,
  mixedVariants,
};
