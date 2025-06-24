'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const {
  liftOverCoordinates,
  parseVcfVariant,
  constructRegionString,
  constructLiftedVariant,
} = require('../src/assemblyConverter');

describe('Liftover Simple Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    delete process.env.ENSEMBL_BASE_URL;
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
    delete process.env.ENSEMBL_BASE_URL;
  });

  describe('Basic liftover functionality', () => {
    it('should successfully lift over coordinates', async () => {
      const testRegion = '17:7578406-7578406';

      nock('https://grch37.rest.ensembl.org')
        .get(`/map/human/GRCh37/${testRegion}/GRCh38`)
        .reply(200, {
          mappings: [
            {
              original: {
                seq_region_name: '17',
                start: 7578406,
                end: 7578406,
              },
              mapped: {
                seq_region_name: '17',
                start: 7675088,
                end: 7675088,
              },
            },
          ],
        });

      const result = await liftOverCoordinates(testRegion, false);
      expect(result.mappings).to.have.lengthOf(1);
      expect(result.mappings[0].mapped.start).to.equal(7675088);
    });

    it('should handle failed liftover', async () => {
      const testRegion = '1:12345-12345';

      nock('https://grch37.rest.ensembl.org')
        .get(`/map/human/GRCh37/${testRegion}/GRCh38`)
        .reply(200, { mappings: [] });

      const result = await liftOverCoordinates(testRegion, false);
      expect(result.mappings).to.have.lengthOf(0);
    });
  });

  describe('Variant parsing', () => {
    it('should parse various coordinate formats', () => {
      const testCases = [
        { input: 'chr17-7578406-C-A', expected: { chr: '17', pos: 7578406, ref: 'C', alt: 'A' } },
        { input: '17:7578406:C:A', expected: { chr: '17', pos: 7578406, ref: 'C', alt: 'A' } },
        { input: 'X-12345-N-T', expected: { chr: 'X', pos: 12345, ref: 'N', alt: 'T' } },
        { input: '1-100-ATCG-A', expected: { chr: '1', pos: 100, ref: 'ATCG', alt: 'A' } },
      ];

      testCases.forEach((testCase) => {
        const result = parseVcfVariant(testCase.input);
        expect(result).to.deep.equal(testCase.expected, `Failed for input: ${testCase.input}`);
      });
    });

    it('should reject invalid formats', () => {
      const invalidInputs = ['rs6025', 'ENST00000123:c.123A>G', '1-12345-A', '1-abc-A-G'];

      invalidInputs.forEach((input) => {
        expect(parseVcfVariant(input)).to.be.null;
      });
    });
  });

  describe('Helper functions', () => {
    it('should construct region strings', () => {
      const variant = { chr: '17', pos: 7578406, ref: 'C', alt: 'A' };
      const result = constructRegionString(variant);
      expect(result).to.equal('17:7578406-7578406');
    });

    it('should construct lifted variants', () => {
      const originalVariant = { chr: '17', pos: 7578406, ref: 'C', alt: 'A' };
      const mapping = {
        mapped: { seq_region_name: '17', start: 7675088, end: 7675088 },
      };

      const result = constructLiftedVariant(originalVariant, mapping);
      expect(result).to.equal('17-7675088-C-A');
    });
  });
});
