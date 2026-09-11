'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const axios = require('axios');
const assembly = require('../src/assemblyConverter');
const { fetchApi } = require('../src/apiHelper');

function mapping(ref = 'A', strand = -1) {
  return {
    original: { seq_region_name: '1', start: 100, end: 99 + ref.length, strand: 1 },
    mapped: { seq_region_name: '2', start: 200, end: 199 + ref.length, strand },
  };
}

describe('Validated liftover contracts', () => {
  afterEach(() => sinon.restore());
  it('maps the entire REF span', () => {
    assert.equal(
      assembly.constructRegionString(assembly.parseVcfVariant('1-100-ATG-A')),
      '1:100-102'
    );
  });
  it('reverse complements both alleles', () => {
    assert.equal(
      assembly.constructLiftedVariant(assembly.parseVcfVariant('1-100-A-C'), mapping()),
      '2-200-T-G'
    );
  });
  it('never alters environment during an overlapping default request', async () => {
    const original = process.env.ENSEMBL_BASE_URL;
    let release;
    const stub = sinon.stub(axios, 'get').callsFake(async (url) => {
      if (url.includes('/map/'))
        return new Promise((resolve) => {
          release = () => resolve({ data: { mappings: [] } });
        });
      return { data: { url } };
    });
    const pending = assembly.liftOverCoordinates('1:100-100');
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    try {
      assert.equal(process.env.ENSEMBL_BASE_URL, original);
      const other = await fetchApi('/default');
      assert.match(other.url, /https:\/\/rest.ensembl.org/);
    } finally {
      release();
      await pending;
    }
    assert.match(stub.firstCall.args[0], /grch37/);
  });
  it('validates target reference and returns linked identities', async () => {
    sinon.stub(axios, 'get').callsFake(async (url) => ({
      data: url.includes('/map/') ? { mappings: [mapping()] } : { seq: 'T' },
    }));
    const result = await assembly.liftOverVariant('1-100-A-C');
    assert.equal(result.variant, '2-200-T-G');
    assert.equal(result.originalKey, '1-100-A-C');
    assert.equal(result.liftedKey, result.variant);
    assert.equal(result.targetAssembly, 'GRCh38');
  });
  it('rejects ambiguous mappings before obtaining target sequence', async () => {
    const transport = sinon
      .stub(axios, 'get')
      .resolves({ data: { mappings: [mapping(), mapping()] } });
    await assert.rejects(assembly.liftOverVariant('1-100-A-C'), /ambiguous/i);
    assert.equal(transport.callCount, 1);
  });
  it('rejects discontinuous and incomplete spans', async () => {
    sinon.stub(axios, 'get').resolves({ data: { mappings: [mapping()] } });
    await assert.rejects(assembly.liftOverVariant('1-100-ATG-A'), /span|incomplete/i);
  });
  it('rejects target reference disagreement', async () => {
    sinon.stub(axios, 'get').callsFake(async (url) => ({
      data: url.includes('/map/') ? { mappings: [mapping()] } : { seq: 'A' },
    }));
    await assert.rejects(assembly.liftOverVariant('1-100-A-C'), /reference.*mismatch/i);
  });
  it('reanchors negative strand deletions with validated preceding target sequence', async () => {
    const transport = sinon.stub(axios, 'get').callsFake(async (url) => {
      if (url.includes('/map/')) return { data: { mappings: [mapping('ATG')] } };
      return { data: { seq: url.includes('200..202') ? 'CAT' : 'G' } };
    });
    const result = await assembly.liftOverVariant('1-100-ATG-A');
    assert.equal(result.variant, '2-199-GCA-G');
    assert(transport.getCalls().some((call) => call.args[0].includes('100-102')));
  });
});
