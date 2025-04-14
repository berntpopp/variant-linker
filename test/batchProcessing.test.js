// test/batchProcessing.test.js

const { expect } = require('chai');
const nock = require('nock');
const { analyzeVariant } = require('../src/variantLinkerCore');
const apiConfig = require('../config/apiConfig.json');

describe('Batch Variant Processing', () => {
  // Use the environment variable override if set, otherwise use the config baseUrl.
  const apiBaseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
  
  // Test data
  const vcfVariant = '1-65568-A-C';
  const hgvsVariant = 'ENST00000366667:c.803C>T';
  const rsVariant = 'rs123';
  const variants = [vcfVariant, hgvsVariant, rsVariant];
  
  // Mock responses for the Recoder POST endpoint
  const recoderPostResponse = [
    // Response for the HGVS variant
    {
      input: hgvsVariant,
      id: null,
      T: {
        hgvsg: ['NC_000010.11:g.52389C>T'],
        vcf_string: ['10-52389-C-T']
      }
    },
    // Response for the rs variant
    {
      input: rsVariant,
      id: 'rs123',
      A: {
        hgvsg: ['NC_000001.11:g.1000A>T'],
        vcf_string: ['1-1000-A-T']
      }
    }
  ];
  
  // Mock response for VEP annotation (simplified for testing)
  const vepResponse = [
    {
      input: '1 65568 . A C . . .',
      id: 'variant1_1_65568_A_C',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000001',
          gene_id: 'ENSG00000001',
          consequence_terms: ['missense_variant']
        }
      ]
    },
    {
      input: '10 52389 . C T . . .',
      id: 'variant2_10_52389_C_T',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000366667',
          gene_id: 'ENSG00000002',
          consequence_terms: ['missense_variant']
        }
      ]
    },
    {
      input: '1 1000 . A T . . .',
      id: 'variant3_1_1000_A_T',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000003',
          gene_id: 'ENSG00000003',
          consequence_terms: ['synonymous_variant']
        }
      ]
    }
  ];

  beforeEach(() => {
    // Mock the Variant Recoder POST endpoint for HGVS and rsID variants
    nock(apiBaseUrl)
      .post(`${apiConfig.ensembl.endpoints.variantRecoderBase}/homo_sapiens`)
      .query(true)
      .reply(200, recoderPostResponse);

    // Mock the VEP regions POST endpoint
    nock(apiBaseUrl)
      .post(apiConfig.ensembl.endpoints.vepRegions)
      .query(true)
      .reply(200, vepResponse);
  });

  afterEach(() => {
    // Ensure all expected HTTP calls have been made
    if (!nock.isDone()) {
      console.error('Not all nock interceptors were used:', nock.pendingMocks());
      nock.cleanAll();
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  it('should process multiple variants in batch mode', async () => {
    const result = await analyzeVariant({
      variants: variants,
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1' },
      cache: false,
      output: 'JSON'
    });

    // Check the overall structure
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData').that.is.an('array');
    
    // Verify that all variants were processed
    expect(result.meta).to.have.property('batchSize', 3);
    expect(result.meta).to.have.property('batchProcessing', true);
    
    // Check that we have annotations for all variants
    expect(result.annotationData).to.have.lengthOf(3);
    
    // Verify we can find each variant in the results
    const vcfResult = result.annotationData.find(a => a.originalInput === vcfVariant);
    const hgvsResult = result.annotationData.find(a => a.originalInput === hgvsVariant);
    const rsResult = result.annotationData.find(a => a.originalInput === rsVariant);
    
    expect(vcfResult).to.exist;
    expect(hgvsResult).to.exist;
    expect(rsResult).to.exist;
    
    // Check specific details of each result
    expect(vcfResult).to.have.property('inputFormat', 'VCF');
    expect(hgvsResult).to.have.property('inputFormat', 'HGVS');
    expect(rsResult).to.have.property('inputFormat', 'HGVS');
    
    // Verify transcript consequences were properly mapped
    expect(vcfResult).to.have.property('transcript_consequences').that.is.an('array');
    expect(hgvsResult).to.have.property('transcript_consequences').that.is.an('array');
    expect(rsResult).to.have.property('transcript_consequences').that.is.an('array');
  });

  it('should maintain backward compatibility with single variant input', async () => {
    const result = await analyzeVariant({
      variant: vcfVariant, // Using the old single-variant parameter
      recoderOptions: { vcf_string: '1' },
      vepOptions: { CADD: '1' },
      cache: false,
      output: 'JSON'
    });

    // Check structure and processing
    expect(result).to.have.property('meta');
    expect(result).to.have.property('annotationData').that.is.an('array');
    
    // Should process as a single variant, not batch
    expect(result.meta).to.have.property('batchSize', 1);
    expect(result.meta).to.have.property('batchProcessing', false);
    
    // Check that we have one annotation
    expect(result.annotationData).to.have.lengthOf(1);
    
    // Verify details of the result
    const annotation = result.annotationData[0];
    expect(annotation).to.have.property('originalInput', vcfVariant);
    expect(annotation).to.have.property('inputFormat', 'VCF');
    expect(annotation).to.have.property('transcript_consequences').that.is.an('array');
  });
});
