'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const axios = require('axios');
const { processBatchVariants } = require('../src/core/batchVariants');
const { processSingleVariant } = require('../src/core/singleVariant');
const { alignResponses } = require('../src/core/responseMatching');
const { performLiftover } = require('../src/core/liftover');

describe('Core acquisition identity and accounting', () => {
  afterEach(() => sinon.restore());
  const dependencies = {
    vepRegionsAnnotation: async (inputs) => inputs.map((input) => ({ input })).reverse(),
    variantRecoderPost: async (inputs) =>
      inputs.map((input) => ({ A: { input, vcf_string: ['1-100-A-C'] } })),
    variantRecoder: async (input) => [{ A: { input, vcf_string: ['1-100-A-C'] } }],
  };

  it('rejects duplicate response identities instead of overwriting a variant', () => {
    assert.throws(
      () =>
        alignResponses(
          [
            { input: 'a', marker: 1 },
            { input: 'a', marker: 2 },
          ],
          ['a', 'b']
        ),
      /duplicate/i
    );
  });
  it('does not silently accept a mismatched single response', async () => {
    await assert.rejects(
      processSingleVariant(
        '1-100-A-C',
        {},
        {
          ...dependencies,
          vepRegionsAnnotation: async () => [{ input: '1 200 . A C . . .' }],
        }
      ),
      /identity/i
    );
  });
  it('accounts for missing single responses', async () => {
    const result = await processSingleVariant(
      '1-100-A-C',
      {},
      { ...dependencies, vepRegionsAnnotation: async () => [] }
    );
    assert.equal(result.annotationData.length, 1);
    assert.match(result.annotationData[0].error, /No annotation/);
  });
  it('preserves input order for mixed types and duplicate inputs', async () => {
    const inputs = ['rs1', '1-200-A-C', 'rs1', '1:500-600:DEL'];
    const result = await processBatchVariants(inputs, {}, dependencies);
    assert.deepEqual(
      result.annotationData.map((record) => record.originalInput),
      inputs
    );
  });
  it('prevents response metadata from overwriting validated identities', async () => {
    const result = await processSingleVariant(
      'chr1-100-A-C',
      {},
      {
        ...dependencies,
        vepRegionsAnnotation: async (inputs) => [
          { input: inputs[0], originalInput: 'forged', variantKey: 'forged' },
        ],
      }
    );
    assert.equal(result.annotationData[0].originalInput, 'chr1-100-A-C');
    assert.equal(result.annotationData[0].variantKey, '1-100-A-C');
  });
  it('returns per-input errors when recoder cannot map one input', async () => {
    const result = await processBatchVariants(
      ['rs1', 'rs2'],
      {},
      {
        ...dependencies,
        variantRecoderPost: async () => [
          { A: { input: 'rs1', vcf_string: ['1-100-A-C'] } },
          { A: { input: 'rs2', error: 'unrecognized' } },
        ],
      }
    );
    assert.equal(result.annotationData.length, 2);
    assert.equal(result.annotationData[0].originalInput, 'rs1');
    assert.equal(result.annotationData[1].originalInput, 'rs2');
    assert.match(result.annotationData[1].error, /VCF|unrecognized/);
  });
  it('integrates reference-validated liftover and original lookup keys', async () => {
    sinon.stub(axios, 'get').callsFake(async (url) => ({
      data: url.includes('/map/')
        ? {
            mappings: [
              {
                original: { start: 100, end: 100, seq_region_name: '1', strand: 1 },
                mapped: { start: 200, end: 200, seq_region_name: '2', strand: -1 },
              },
            ],
          }
        : { seq: 'T' },
    }));
    const result = await performLiftover(['1-100-A-C', 'rs1'], false);
    assert.deepEqual(result.liftedVariants, ['2-200-T-G']);
    assert.equal(result.originalToLiftedMap['2-200-T-G'], '1-100-A-C');
    assert.equal(result.liftoverMeta['1-100-A-C'].targetAssembly, 'GRCh38');
    assert.equal(result.liftoverMeta.rs1.status, 'error');
  });

  it('retries transcript versions without mutating caller options', async () => {
    const recoder = sinon.stub();
    recoder.onFirstCall().resolves([{ A: { vcf_string: ['unsupported'] } }]);
    recoder.onSecondCall().resolves([{ A: { vcf_string: ['1-100-A-C'] } }]);
    const result = await processSingleVariant('NM_123.2:c.1A>C', Object.freeze({}), {
      ...dependencies,
      variantRecoder: recoder,
    });
    assert.equal(recoder.secondCall.args[0], 'NM_123:c.1A>C');
    assert.equal(result.transcriptVersionFallback.fallbackVariant, 'NM_123:c.1A>C');
    assert.equal(result.annotationData[0].variantKey, '1-100-A-C');
  });

  it('preserves both error contexts when transcript fallback fails', async () => {
    const recoder = sinon.stub();
    recoder.onFirstCall().resolves([{ A: { vcf_string: ['unsupported'] } }]);
    recoder.onSecondCall().rejects(new Error('fallback unavailable'));
    await assert.rejects(
      processSingleVariant(
        'NM_123.2:c.1A>C',
        {},
        {
          ...dependencies,
          variantRecoder: recoder,
        }
      ),
      /Original error:.*Fallback error: fallback unavailable/
    );
  });

  it('returns errors for invalid coordinate spans while preserving the other results', async () => {
    const result = await processBatchVariants(['1:200-100:DEL', '1-100-A-C', ''], {}, dependencies);
    assert.match(result.annotationData[0].error, /span/);
    assert.equal(result.annotationData[1].variantKey, '1-100-A-C');
    assert.match(result.annotationData[2].error, /No variant/);
  });

  it('annotates distinct recoder alleles once and keeps their association', async () => {
    const result = await processBatchVariants(
      ['rs1'],
      {},
      {
        ...dependencies,
        variantRecoderPost: async () => [
          {
            A: { input: 'rs1', vcf_string: ['1-100-A-C', '1-100-A-C'] },
            G: { input: 'rs1', vcf_string: ['1-100-A-G'] },
          },
        ],
      }
    );
    assert.deepEqual(
      result.annotationData.map((entry) => entry.variantKey),
      ['1-100-A-C', '1-100-A-G']
    );
    assert.deepEqual(
      result.annotationData.map((entry) => entry.allele),
      ['A', 'G']
    );
  });

  it('normalizes supported CNV types in single requests', async () => {
    for (const [variant, expected] of [
      ['chr1:100-200:DUP', '1 100 200 duplication 1'],
      ['1:100-200:INV', '1 100 200 CNV 1'],
    ]) {
      const result = await processSingleVariant(variant, {}, dependencies);
      assert.equal(result.annotationData[0].input, expected);
    }
  });

  it('validates response shapes and conflicting nested identities', () => {
    assert.throws(() => alignResponses({}, ['a']), /array/);
    assert.throws(() => alignResponses([null], ['a']), /objects/);
    assert.throws(
      () => alignResponses([{ A: { input: 'a' }, C: { input: 'b' } }], ['a'], true),
      /conflicting/
    );
    assert.deepEqual(
      alignResponses([{ input: 'a' }, { input: 'a' }], ['a', 'a']).map((entry) => entry.input),
      ['a', 'a']
    );
  });

  it('validates recoder payloads without coercing invalid VCF values', async () => {
    const { processVariantRecoderResponse } = require('../src/core/input');
    for (const value of [null, [], [null], [{ A: {} }], [{ A: { vcf_string: [null, {}, 7] } }]]) {
      await assert.rejects(processVariantRecoderResponse(value, 'rs1'), /Variant Recoder|No valid/);
    }
    assert.deepEqual(
      await processVariantRecoderResponse([{ vcf_string: ['chr1:100:A:C'] }], 'rs1'),
      { vcfString: '1-100-A-C' }
    );
  });

  it('records failed and errored liftover outcomes explicitly', async () => {
    const transport = sinon.stub(axios, 'get');
    transport.onFirstCall().resolves({ data: { mappings: [] } });
    transport.onSecondCall().rejects(new Error('network unavailable'));
    const result = await performLiftover(['1-100-A-C', '1-101-A-C']);
    assert.equal(result.liftoverMeta['1-100-A-C'].status, 'failed');
    assert.equal(result.liftoverMeta['1-101-A-C'].status, 'error');
    assert.deepEqual(result.liftedVariants, []);
  });

  it('rejects target-key collisions rather than assigning the second original record to the first', async () => {
    sinon.stub(axios, 'get').callsFake(async (url) => {
      if (!url.includes('/map/')) return { data: { seq: 'A' } };
      const position = Number(url.match(/1:(\d+)-/)[1]);
      return {
        data: {
          mappings: [
            {
              original: { seq_region_name: '1', start: position, end: position },
              mapped: { seq_region_name: '2', start: 200, end: 200, strand: 1 },
            },
          ],
        },
      };
    });
    const result = await performLiftover(['1-100-A-C', '1-101-A-C']);
    assert.deepEqual(result.liftedVariants, ['2-200-A-C']);
    assert.equal(result.originalToLiftedMap['2-200-A-C'], '1-100-A-C');
    assert.notEqual(result.liftoverMeta['1-101-A-C'].status, 'success');
    assert.match(result.liftoverMeta['1-101-A-C'].message, /same target identity/);
  });
});
