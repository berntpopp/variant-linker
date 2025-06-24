/**
 * Integration tests for the --pick-output CLI functionality
 */

'use strict';

const { expect } = require('chai');
const nock = require('nock');
const { analyzeVariant } = require('../src/variantLinkerCore');
const apiConfig = require('../config/apiConfig.json');

describe('--pick-output Integration Tests', function () {
  // Increase timeout for API mocking tests
  // eslint-disable-next-line no-invalid-this
  this.timeout(10000);

  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  const vepEndpoint = apiConfig.ensembl.endpoints.vepRegions;

  beforeEach(() => {
    // Clean up any existing mocks
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should add pick=1 to VEP API request when --pick-output is used', async () => {
    // Mock the VEP API call
    const vepMock = nock(apiBaseUrl)
      .post(vepEndpoint)
      .query((actualQuery) => {
        // Verify that pick=1 is included in the query
        expect(actualQuery).to.have.property('pick', '1');
        return true;
      })
      .reply(200, [
        {
          input: '1-12345-A-G',
          seq_region_name: '1',
          start: 12345,
          end: 12345,
          allele_string: 'A/G',
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            {
              transcript_id: 'ENST00000456',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['missense_variant'],
              impact: 'MODERATE',
              pick: 1, // This is the picked consequence
            },
            {
              transcript_id: 'ENST00000789',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['downstream_gene_variant'],
              impact: 'LOW',
              // No pick flag - should be filtered out
            },
          ],
        },
      ]);

    // Call analyzeVariant with pickOutput enabled
    const result = await analyzeVariant({
      variants: ['1-12345-A-G'],
      output: 'JSON',
      pickOutput: true,
      cache: false,
      vepOptions: { pick: '1' }, // Add pick as would be done by main.js
      recoderOptions: {},
    });

    // Verify the API was called correctly
    expect(vepMock.isDone()).to.be.true;

    // Verify the response contains only picked consequences
    expect(result.annotationData).to.have.lengthOf(1);
    const annotation = result.annotationData[0];
    expect(annotation.transcript_consequences).to.have.lengthOf(1);
    expect(annotation.transcript_consequences[0].pick).to.equal(1);
    expect(annotation.transcript_consequences[0].transcript_id).to.equal('ENST00000456');

    // Verify meta tracking
    expect(result.meta.stepsPerformed).to.include.match(/Picked consequence filtering applied/);
  });

  it('should return CSV with only picked consequences', async () => {
    // Mock the VEP API call
    nock(apiBaseUrl)
      .post(vepEndpoint)
      .query(() => true)
      .reply(200, [
        {
          input: '1-12345-A-G',
          seq_region_name: '1',
          start: 12345,
          end: 12345,
          allele_string: 'A/G',
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            {
              transcript_id: 'ENST00000456',
              gene_symbol: 'PICKED_GENE',
              consequence_terms: ['missense_variant'],
              impact: 'MODERATE',
              pick: 1,
            },
            {
              transcript_id: 'ENST00000789',
              gene_symbol: 'OTHER_GENE',
              consequence_terms: ['downstream_gene_variant'],
              impact: 'LOW',
            },
          ],
        },
      ]);

    // Call analyzeVariant with CSV output and pickOutput enabled
    const result = await analyzeVariant({
      variants: ['1-12345-A-G'],
      output: 'CSV',
      pickOutput: true,
      cache: false,
      vepOptions: { pick: '1' }, // Add pick as would be done by main.js
      recoderOptions: {},
    });

    // Result should be a CSV string
    expect(result).to.be.a('string');

    // Split into lines
    const lines = result.trim().split('\n');

    // Should have header + 1 data row (only the picked consequence)
    expect(lines.length).to.equal(2);

    // Check that the data row contains only the picked consequence data
    const dataRow = lines[1];
    expect(dataRow).to.include('PICKED_GENE');
    expect(dataRow).to.include('ENST00000456');
    expect(dataRow).to.include('MODERATE');
    expect(dataRow).not.to.include('OTHER_GENE');
    expect(dataRow).not.to.include('ENST00000789');
  });

  it('should work without pick-output flag (normal behavior)', async () => {
    // Mock the VEP API call
    const vepMock = nock(apiBaseUrl)
      .post(vepEndpoint)
      .query((actualQuery) => {
        // Verify that pick is NOT included when pickOutput is false
        expect(actualQuery).to.not.have.property('pick');
        return true;
      })
      .reply(200, [
        {
          input: '1-12345-A-G',
          seq_region_name: '1',
          start: 12345,
          end: 12345,
          allele_string: 'A/G',
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            {
              transcript_id: 'ENST00000456',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['missense_variant'],
              impact: 'MODERATE',
            },
            {
              transcript_id: 'ENST00000789',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['downstream_gene_variant'],
              impact: 'LOW',
            },
          ],
        },
      ]);

    // Call analyzeVariant without pickOutput
    const result = await analyzeVariant({
      variants: ['1-12345-A-G'],
      output: 'JSON',
      pickOutput: false,
      cache: false,
      vepOptions: {},
      recoderOptions: {},
    });

    // Verify the API was called correctly
    expect(vepMock.isDone()).to.be.true;

    // Verify the response contains all consequences
    expect(result.annotationData).to.have.lengthOf(1);
    const annotation = result.annotationData[0];
    expect(annotation.transcript_consequences).to.have.lengthOf(2);

    // Verify no pick filtering was applied
    const hasPickStep = result.meta.stepsPerformed.some((step) =>
      step.includes('Picked consequence filtering applied')
    );
    expect(hasPickStep).to.be.false;
  });

  it('should handle variants with no picked consequences gracefully', async () => {
    // Mock the VEP API call with no pick flags
    nock(apiBaseUrl)
      .post(vepEndpoint)
      .query(() => true)
      .reply(200, [
        {
          input: '1-12345-A-G',
          seq_region_name: '1',
          start: 12345,
          end: 12345,
          allele_string: 'A/G',
          most_severe_consequence: 'missense_variant',
          transcript_consequences: [
            {
              transcript_id: 'ENST00000456',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['missense_variant'],
              impact: 'MODERATE',
              // No pick flag
            },
            {
              transcript_id: 'ENST00000789',
              gene_symbol: 'TEST_GENE',
              consequence_terms: ['downstream_gene_variant'],
              impact: 'LOW',
              // No pick flag
            },
          ],
        },
      ]);

    // Call analyzeVariant with pickOutput enabled
    const result = await analyzeVariant({
      variants: ['1-12345-A-G'],
      output: 'JSON',
      pickOutput: true,
      cache: false,
      vepOptions: {},
      recoderOptions: {},
    });

    // Verify the response contains no consequences (empty array)
    expect(result.annotationData).to.have.lengthOf(1);
    const annotation = result.annotationData[0];
    expect(annotation.transcript_consequences).to.have.lengthOf(0);

    // Verify pick filtering was applied and tracked
    expect(result.meta.stepsPerformed).to.include.match(/Picked consequence filtering applied/);
    expect(result.meta.stepsPerformed).to.include.match(/2 total consequences reduced to 0/);
  });
});
