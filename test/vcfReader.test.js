'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const { readVariantsFromVcf } = require('../src/vcfReader');

describe('VCF Reader', () => {
  let sandbox;
  const testVcfPath = path.join(__dirname, 'fixtures', 'test.vcf');

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Create a mock VCF file content with header and data
    const mockVcfContent = `##fileformat=VCFv4.2
##reference=GRCh38
##contig=<ID=1,length=248956422>
##contig=<ID=2,length=242193529>
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">
##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE1
1\t12345\t.\tA\tG\t.\tPASS\tDP=50;AF=0.5\tGT\t0/1
2\t23456\t.\tT\tC,G\t.\tPASS\tDP=60;AF=0.3,0.1\tGT\t0/1
`;

    // Mock the fs module to return our test VCF content
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').withArgs(testVcfPath, 'utf8').returns(mockVcfContent);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should parse variants from a VCF file', async () => {
    const result = await readVariantsFromVcf(testVcfPath);

    // Check the results
    expect(result).to.be.an('object');
    expect(result.variantsToProcess).to.be.an('array');
    expect(result.vcfRecordMap).to.be.instanceOf(Map);
    expect(result.headerText).to.be.a('string');
    expect(result.headerLines).to.be.an('array');

    // Check the parsed variants
    // We have 3 variants: 1 from line 1 (A->G) + 2 from line 2 (T->C and T->G)
    expect(result.variantsToProcess).to.have.lengthOf(3);
    expect(result.variantsToProcess).to.include('1-12345-A-G'); // First variant
    expect(result.variantsToProcess).to.include('2-23456-T-C'); // Second variant, first alt
    expect(result.variantsToProcess).to.include('2-23456-T-G'); // Second variant, second alt

    // *** FIX: Check the VCF record map keys using hyphenated format ***
    expect(result.vcfRecordMap.size).to.equal(3);
    expect(result.vcfRecordMap.has('1-12345-A-G')).to.be.true; // Use hyphen
    expect(result.vcfRecordMap.has('2-23456-T-C')).to.be.true; // Use hyphen
    expect(result.vcfRecordMap.has('2-23456-T-G')).to.be.true; // Use hyphen

    // Check the header was properly preserved
    expect(result.headerLines).to.have.lengthOf(8); // 7 metadata lines + 1 CHROM line

    // Check that sample information was extracted correctly
    expect(result).to.have.property('samples');
    expect(result.samples).to.be.an('array');
    expect(result.samples).to.have.lengthOf(1);
    expect(result.samples[0]).to.equal('SAMPLE1');

    // Check that genotype information was extracted correctly
    // *** FIX: Use hyphenated key to retrieve record ***
    const variant1Record = result.vcfRecordMap.get('1-12345-A-G');
    expect(variant1Record).to.be.an('object'); // Add basic check that record exists
    expect(variant1Record).to.have.property('genotypes');
    expect(variant1Record.genotypes).to.be.instanceOf(Map);
    // We'll check for the presence of a genotype, but not its exact value
    // since that depends on VCF parser implementation
    expect(variant1Record.genotypes.has('SAMPLE1')).to.be.true;
    expect(result.headerLines[0]).to.equal('##fileformat=VCFv4.2');
    expect(result.headerLines[7]).to.equal(
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE1'
    );
  });

  it('should handle missing fileformat header gracefully', async () => {
    // Modify the mock VCF content to omit the fileformat line
    const mockVcfContentWithoutFileformat = `##reference=GRCh38
##contig=<ID=1,length=248956422>
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO
1\t12345\t.\tA\tG\t.\tPASS\tDP=50;AF=0.5
`;

    // Replace the readFileSync stub to return our new content
    fs.readFileSync.restore();
    sandbox
      .stub(fs, 'readFileSync')
      .withArgs(testVcfPath, 'utf8')
      .returns(mockVcfContentWithoutFileformat);

    const result = await readVariantsFromVcf(testVcfPath);

    // Check that parsing still works without fileformat
    expect(result).to.be.an('object');
    expect(result.variantsToProcess).to.be.an('array');
    expect(result.headerLines).to.be.an('array');
    expect(result.headerLines).to.have.lengthOf(3); // 2 header lines + CHROM line
    // The header should be preserved as-is, with the first line being ##reference=GRCh38
    expect(result.headerLines[0]).to.equal('##reference=GRCh38');
  });

  it('should throw an error if the VCF file does not exist', async () => {
    // Restore the existsSync stub and make it return false
    fs.existsSync.restore();
    sandbox.stub(fs, 'existsSync').returns(false);

    try {
      await readVariantsFromVcf(testVcfPath);
      // If we get here, the test should fail
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('VCF file not found');
    }
  });
});
