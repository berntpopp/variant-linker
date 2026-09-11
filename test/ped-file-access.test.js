'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sinon = require('sinon');
const { readPedigree } = require('../src/pedReader');

describe('Atomic pedigree file acquisition', () => {
  let directory;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'variant-linker-ped-'));
  });
  afterEach(async () => {
    sinon.restore();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('reads a valid file without a separate path access check', async () => {
    const file = path.join(directory, 'family.ped');
    await fs.writeFile(file, 'family child father mother 1 2\n');
    sinon.stub(fs, 'access').rejects(new Error('Separate path checks are not atomic'));
    const pedigree = await readPedigree(file);
    assert.equal(pedigree.get('child').fatherId, 'father');
  });

  it('preserves a useful missing-file error from the read operation', async () => {
    await assert.rejects(readPedigree(path.join(directory, 'missing.ped')), (error) => {
      assert.match(error.message, /PED file not found/);
      assert.equal(error.cause.code, 'ENOENT');
      return true;
    });
  });
});
