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

describe('assemblyConverter', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe('liftOverCoordinates', () => {
    const testRegion = '7:140453136-140453136';
    const grch37BaseUrl = 'https://grch37.rest.ensembl.org';

    it('should successfully lift over coordinates', async () => {
      const mockResponse = {
        mappings: [
          {
            original: {
              seq_region_name: '7',
              start: 140453136,
              end: 140453136,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh37',
            },
            mapped: {
              seq_region_name: '7',
              start: 140753336,
              end: 140753336,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh38',
            },
          },
        ],
      };

      nock(grch37BaseUrl).get(`/map/human/GRCh37/${testRegion}/GRCh38`).reply(200, mockResponse);

      const result = await liftOverCoordinates(testRegion, false);
      expect(result).to.deep.equal(mockResponse);
      expect(result.mappings).to.have.lengthOf(1);
      expect(result.mappings[0].mapped.seq_region_name).to.equal('7');
      expect(result.mappings[0].mapped.start).to.equal(140753336);
    });

    it('should handle failed liftover with empty mappings', async () => {
      const mockResponse = {
        mappings: [],
      };

      nock(grch37BaseUrl).get(`/map/human/GRCh37/${testRegion}/GRCh38`).reply(200, mockResponse);

      const result = await liftOverCoordinates(testRegion, false);
      expect(result).to.deep.equal(mockResponse);
      expect(result.mappings).to.have.lengthOf(0);
    });

    it('should handle multiple mappings (ambiguous liftover)', async () => {
      const mockResponse = {
        mappings: [
          {
            original: {
              seq_region_name: '7',
              start: 140453136,
              end: 140453136,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh37',
            },
            mapped: {
              seq_region_name: '7',
              start: 140753336,
              end: 140753336,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh38',
            },
          },
          {
            original: {
              seq_region_name: '7',
              start: 140453136,
              end: 140453136,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh37',
            },
            mapped: {
              seq_region_name: '7',
              start: 140753337,
              end: 140753337,
              strand: 1,
              coord_system: 'chromosome',
              assembly: 'GRCh38',
            },
          },
        ],
      };

      nock(grch37BaseUrl).get(`/map/human/GRCh37/${testRegion}/GRCh38`).reply(200, mockResponse);

      const result = await liftOverCoordinates(testRegion, false);
      expect(result).to.deep.equal(mockResponse);
      expect(result.mappings).to.have.lengthOf(2);
    });

    it('should throw error on API failure', async () => {
      // Mock multiple retries for 500 error
      nock(grch37BaseUrl)
        .get(`/map/human/GRCh37/${testRegion}/GRCh38`)
        .times(5) // Match the retry attempts
        .reply(500, { error: 'Internal server error' });

      try {
        await liftOverCoordinates(testRegion, false);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.be.a('string');
      }
    }).timeout(30000); // Increase timeout for retry testing

    it('should handle network errors', async () => {
      nock(grch37BaseUrl)
        .get(`/map/human/GRCh37/${testRegion}/GRCh38`)
        .replyWithError('Network error');

      try {
        await liftOverCoordinates(testRegion, false);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.be.a('string');
      }
    });

    it('should construct correct API endpoint with region replacement', async () => {
      const customRegion = '1:12345-12345';
      const mockResponse = { mappings: [] };

      const scope = nock(grch37BaseUrl)
        .get(`/map/human/GRCh37/${customRegion}/GRCh38`)
        .reply(200, mockResponse);

      await liftOverCoordinates(customRegion, false);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('parseVcfVariant', () => {
    it('should parse dash-separated VCF variant', () => {
      const variant = '1-12345-N-G';
      const result = parseVcfVariant(variant);

      expect(result).to.deep.equal({
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      });
    });

    it('should parse colon-separated VCF variant', () => {
      const variant = '1:12345:N:G';
      const result = parseVcfVariant(variant);

      expect(result).to.deep.equal({
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      });
    });

    it('should handle chr prefix and remove it', () => {
      const variant = 'chr1-12345-N-G';
      const result = parseVcfVariant(variant);

      expect(result).to.deep.equal({
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      });
    });

    it('should handle case-insensitive chr prefix', () => {
      const variant = 'CHR1:12345:N:G';
      const result = parseVcfVariant(variant);

      expect(result).to.deep.equal({
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      });
    });

    it('should handle sex chromosomes', () => {
      const variantX = 'X-12345-N-G';
      const variantY = 'Y:54321:N:T';

      expect(parseVcfVariant(variantX)).to.deep.equal({
        chr: 'X',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      });

      expect(parseVcfVariant(variantY)).to.deep.equal({
        chr: 'Y',
        pos: 54321,
        ref: 'N',
        alt: 'T',
      });
    });

    it('should handle multi-character alleles', () => {
      const variant = '1-12345-ATG-C';
      const result = parseVcfVariant(variant);

      expect(result).to.deep.equal({
        chr: '1',
        pos: 12345,
        ref: 'ATG',
        alt: 'C',
      });
    });

    it('should return null for invalid format', () => {
      const invalidVariants = [
        '1-12345-N', // Missing alt
        '1-12345', // Missing ref and alt
        '1-12345-N-G-T', // Too many parts
        '1-abc-N-G', // Non-numeric position
        '', // Empty string
        'rs123', // rsID format
        'ENST00000123:c.123A>G', // HGVS format
      ];

      invalidVariants.forEach((variant) => {
        expect(parseVcfVariant(variant)).to.be.null;
      });
    });

    it('should handle parsing errors gracefully', () => {
      expect(parseVcfVariant(null)).to.be.null;
      expect(parseVcfVariant(undefined)).to.be.null;
    });
  });

  describe('constructRegionString', () => {
    it('should construct region string for single position', () => {
      const parsedVariant = {
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      };

      const result = constructRegionString(parsedVariant);
      expect(result).to.equal('1:12345-12345');
    });

    it('should handle sex chromosomes in region string', () => {
      const parsedVariantX = {
        chr: 'X',
        pos: 54321,
        ref: 'N',
        alt: 'T',
      };

      const result = constructRegionString(parsedVariantX);
      expect(result).to.equal('X:54321-54321');
    });

    it('should handle large position numbers', () => {
      const parsedVariant = {
        chr: '1',
        pos: 247249719, // Near end of chr1
        ref: 'N',
        alt: 'G',
      };

      const result = constructRegionString(parsedVariant);
      expect(result).to.equal('1:247249719-247249719');
    });
  });

  describe('constructLiftedVariant', () => {
    it('should construct lifted variant string', () => {
      const parsedVariant = {
        chr: '7',
        pos: 140453136,
        ref: 'C',
        alt: 'T',
      };

      const mapping = {
        mapped: {
          seq_region_name: '7',
          start: 140753336,
          end: 140753336,
          strand: 1,
          coord_system: 'chromosome',
          assembly: 'GRCh38',
        },
      };

      const result = constructLiftedVariant(parsedVariant, mapping);
      expect(result).to.equal('7-140753336-C-T');
    });

    it('should handle chromosome name changes', () => {
      const parsedVariant = {
        chr: '1',
        pos: 12345,
        ref: 'N',
        alt: 'G',
      };

      const mapping = {
        mapped: {
          seq_region_name: 'chr1', // Different format in GRCh38
          start: 12346,
          end: 12346,
          strand: 1,
          coord_system: 'chromosome',
          assembly: 'GRCh38',
        },
      };

      const result = constructLiftedVariant(parsedVariant, mapping);
      expect(result).to.equal('chr1-12346-N-G');
    });

    it('should preserve complex alleles', () => {
      const parsedVariant = {
        chr: '2',
        pos: 98765,
        ref: 'ATCG',
        alt: 'A',
      };

      const mapping = {
        mapped: {
          seq_region_name: '2',
          start: 98766,
          end: 98766,
          strand: 1,
          coord_system: 'chromosome',
          assembly: 'GRCh38',
        },
      };

      const result = constructLiftedVariant(parsedVariant, mapping);
      expect(result).to.equal('2-98766-ATCG-A');
    });
  });
});
