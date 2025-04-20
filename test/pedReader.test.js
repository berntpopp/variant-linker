'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs').promises;
const debug = require('debug');

// Import the module to test
const { readPedigree } = require('../src/pedReader');

describe('pedReader', function () {
  // Use sandbox for managing stubs
  let sandbox;
  let debugStub;

  beforeEach(function () {
    // Create a sinon sandbox
    sandbox = sinon.createSandbox();
    // Stub debug to capture and verify logging
    debugStub = sandbox.stub();
    sandbox.stub(debug, 'default').returns(debugStub);
  });

  afterEach(function () {
    // Restore all stubs
    sandbox.restore();
  });

  describe('readPedigree', function () {
    it('should parse a valid tab-delimited PED file correctly', async function () {
      // Mock valid PED file content with tabs as delimiters
      const validPedContent =
        'FAM1	SAMPLE1	0	0	1	2\n' + 'FAM1	SAMPLE2	0	0	2	1\n' + 'FAM1	SAMPLE3	SAMPLE1	SAMPLE2	1	2\n';

      // Stub fs.access to succeed
      sandbox.stub(fs, 'access').resolves();
      // Stub fs.readFile to return our mock content
      sandbox.stub(fs, 'readFile').resolves(validPedContent);

      // Call the function
      const result = await readPedigree('/path/to/valid.ped');

      // Verify results
      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(3);

      // Check sample 1 (father, affected)
      expect(result.get('SAMPLE1')).to.deep.equal({
        familyId: 'FAM1',
        fatherId: '0',
        motherId: '0',
        sex: 1,
        affectedStatus: 2,
      });

      // Check sample 2 (mother, unaffected)
      expect(result.get('SAMPLE2')).to.deep.equal({
        familyId: 'FAM1',
        fatherId: '0',
        motherId: '0',
        sex: 2,
        affectedStatus: 1,
      });

      // Check sample 3 (child, affected)
      expect(result.get('SAMPLE3')).to.deep.equal({
        familyId: 'FAM1',
        fatherId: 'SAMPLE1',
        motherId: 'SAMPLE2',
        sex: 1,
        affectedStatus: 2,
      });
    });

    it('should parse a valid space-delimited PED file correctly', async function () {
      // Mock valid PED file content with spaces as delimiters
      const validPedContent =
        'FAM1 SAMPLE1 0 0 1 2\n' + 'FAM1 SAMPLE2 0 0 2 1\n' + 'FAM1 SAMPLE3 SAMPLE1 SAMPLE2 1 2\n';

      // Stub fs.access to succeed
      sandbox.stub(fs, 'access').resolves();
      // Stub fs.readFile to return our mock content
      sandbox.stub(fs, 'readFile').resolves(validPedContent);

      // Call the function
      const result = await readPedigree('/path/to/valid.ped');

      // Verify results
      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(3);

      // Check a sample to confirm proper parsing
      expect(result.get('SAMPLE3')).to.deep.equal({
        familyId: 'FAM1',
        fatherId: 'SAMPLE1',
        motherId: 'SAMPLE2',
        sex: 1,
        affectedStatus: 2,
      });
    });

    it('should handle mixed whitespace delimiters correctly', async function () {
      // Mock PED file with mixed delimiters (tabs and spaces)
      const mixedPedContent = 'FAM1\tSAMPLE1\t0 0\t1 2\n' + 'FAM1 SAMPLE2 0 0 2 1\n';

      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').resolves(mixedPedContent);

      const result = await readPedigree('/path/to/mixed.ped');

      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(2);
    });

    it('should skip comment lines starting with #', async function () {
      // Mock PED file with comments
      const pedWithComments =
        '# This is a comment line\n' +
        'FAM1\tSAMPLE1\t0\t0\t1\t2\n' +
        '# Another comment\n' +
        'FAM1\tSAMPLE2\t0\t0\t2\t1\n';

      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').resolves(pedWithComments);

      const result = await readPedigree('/path/to/comments.ped');

      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(2);
    });

    it('should skip empty lines', async function () {
      // Mock PED file with empty lines
      const pedWithEmptyLines =
        'FAM1\tSAMPLE1\t0\t0\t1\t2\n' +
        '\n' +
        '  \n' + // Whitespace-only line
        'FAM1\tSAMPLE2\t0\t0\t2\t1\n';

      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').resolves(pedWithEmptyLines);

      const result = await readPedigree('/path/to/empty-lines.ped');

      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(2);
    });

    it('should skip invalid lines with fewer than 6 columns and log a warning', async function () {
      // Mock PED file with an invalid line
      const pedWithInvalidLine =
        'FAM1\tSAMPLE1\t0\t0\t1\t2\n' + // Valid line
        'FAM1\tSAMPLE2\t0\t0\t2\n' + // Invalid (5 columns)
        'FAM1\tSAMPLE3\t0\t0\t1\t2\n'; // Valid line

      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').resolves(pedWithInvalidLine);

      const result = await readPedigree('/path/to/invalid-line.ped');

      expect(result).to.be.an.instanceOf(Map);
      expect(result.size).to.equal(2); // Should only have the valid lines
      expect(result.has('SAMPLE1')).to.be.true;
      expect(result.has('SAMPLE2')).to.be.false; // Invalid line should be skipped
      expect(result.has('SAMPLE3')).to.be.true;
    });

    it('should handle invalid sex and affected status codes by defaulting to 0', async function () {
      // Mock PED file with invalid codes
      const pedWithInvalidCodes = 'FAM1\tSAMPLE1\t0\t0\t3\t4\n'; // Invalid sex (3) and affected status (4)

      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').resolves(pedWithInvalidCodes);

      const result = await readPedigree('/path/to/invalid-codes.ped');

      expect(result).to.be.an.instanceOf(Map);
      expect(result.get('SAMPLE1')).to.deep.equal({
        familyId: 'FAM1',
        fatherId: '0',
        motherId: '0',
        sex: 0, // Should default to 0 for invalid
        affectedStatus: 0, // Should default to 0 for invalid
      });
    });

    it('should throw an error if the file does not exist', async function () {
      // Stub fs.access to fail with ENOENT
      const error = new Error('File not found');
      error.code = 'ENOENT';
      sandbox.stub(fs, 'access').rejects(error);

      try {
        await readPedigree('/path/to/nonexistent.ped');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('PED file not found');
      }
    });

    it('should throw an error if the file cannot be read (permission denied)', async function () {
      // Stub fs.access to fail with EACCES
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      sandbox.stub(fs, 'access').rejects(error);

      try {
        await readPedigree('/path/to/nopermission.ped');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('permission denied');
      }
    });

    it('should throw an error for other file reading errors', async function () {
      // Stub fs.access to succeed but fs.readFile to fail
      sandbox.stub(fs, 'access').resolves();
      sandbox.stub(fs, 'readFile').rejects(new Error('Disk error'));

      try {
        await readPedigree('/path/to/error.ped');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('Error reading PED file');
      }
    });
  });
});
