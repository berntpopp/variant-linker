'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const proxyquire = require('proxyquire');
const { readVariantsFromVcf } = require('../src/vcfReader');
const { filterAndFormatResults } = require('../src/variantLinkerProcessor');

describe('VCF stream and filter integrity', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-stream-integrity-'));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const header = '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n';

  it('bounds retained original duplicate records as well as unique keys', async () => {
    const input = path.join(directory, 'duplicates.vcf');
    fs.writeFileSync(
      input,
      header + Array.from({ length: 25 }, () => '1\t100\t.\tA\tC\t.\t.\t.\n').join('')
    );
    const sizes = [];
    const { processVcfStream } = proxyquire('../src/cli/vcfStream', {
      './stream': {
        prepareStream: async (params) => ({ ...params, streamState: { failed: 0 } }),
        processAndOutputChunk: async (chunk, first, params) => {
          sizes.push(
            [...params.vcfRecordMap.values()].reduce(
              (sum, entry) => sum + (entry.records?.length || 1),
              0
            )
          );
          return true;
        },
      },
    });
    await processVcfStream({ vcfInput: input, output: 'VCF', chunkSize: 10 });
    assert.deepEqual(sizes, [10, 10, 5]);
  });

  it('removes excluded VCF records while preserving a selected multiallelic row', async () => {
    const input = path.join(directory, 'filter.vcf');
    const lines = ['1\t100\tfirst\tA\tC\t20\tPASS\t.', '1\t200\tsecond\tA\tC,G\t30\t.\t.'];
    fs.writeFileSync(input, header + lines.join('\n') + '\n');
    const vcf = await readVariantsFromVcf(input);
    const annotationData = vcf.variantsToProcess.map((key) => ({
      variantKey: key,
      start: Number(key.split('-')[1]),
      transcript_consequences: [],
    }));
    const output = filterAndFormatResults(
      {
        annotationData,
        meta: { stepsPerformed: [] },
        vcfRecordMap: vcf.vcfRecordMap,
        vcfHeaderLines: vcf.headerLines,
      },
      { start: { gt: 150 } },
      'VCF'
    );
    const rows = output.split('\n').filter((line) => line && !line.startsWith('#'));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].split('\t').slice(0, 7), lines[1].split('\t').slice(0, 7));
    assert.equal(vcf.vcfRecordMap.size, 3);
  });

  it('accounts for a failed liftover even when another variant was annotated', async () => {
    const { processAndOutputChunk } = proxyquire('../src/cli/stream', {
      '../variantLinkerCore': {
        analyzeVariant: async () => ({
          annotationData: [{ variantKey: '1-200-A-C' }],
          meta: { liftoverMeta: { first: { status: 'success' }, second: { status: 'error' } } },
        }),
      },
      '../variantLinkerProcessor': {
        filterAndFormatResults: () => ({ header: 'Header', data: 'data' }),
      },
      './write': { writeOutput: async () => {} },
    });
    const params = { output: 'TSV', streamState: { failed: 0 } };
    assert.equal(await processAndOutputChunk(['first', 'second'], true, params), true);
    assert.equal(params.streamState.failed, 1);
  });
});
