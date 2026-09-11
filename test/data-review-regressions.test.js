'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sinon = require('sinon');
const axios = require('axios');
const { Writable } = require('node:stream');
const { readVariantsFromVcf, iterateVcfRecords } = require('../src/vcfReader');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { performLiftover } = require('../src/core/liftover');
const { processAndOutputChunk } = require('../src/cli/stream');
const { installFixtureApi } = require('./support/fixture-api.cjs');
const nock = require('nock');

describe('Independent data review regressions', function () {
  this.timeout(30000);
  let directory;
  const header = '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n';
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-data-review-'));
  });
  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function write(name, rows) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, header + rows.join('\n') + (rows.length ? '\n' : ''));
    return file;
  }
  function cli(file, stream = false) {
    const args = [
      '--vcf-input',
      file,
      '--output',
      'VCF',
      ...(stream ? ['--stream', '--chunk-size', '1'] : []),
    ];
    return spawnSync(
      process.execPath,
      [
        '-e',
        `require('./test/support/fixture-api.cjs').installFixtureApi();process.argv=['node','src/main.js',...JSON.parse(process.env.VL_REVIEW_ARGS)];require('./src/main.js');`,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, VL_REVIEW_ARGS: JSON.stringify(args) },
      }
    );
  }
  it('counts an HTTP error and continues to write the next successful chunk', async () => {
    const post = sinon.stub(axios, 'post');
    post
      .onFirstCall()
      .rejects(
        Object.assign(new Error('503'), { code: 'ERR_BAD_RESPONSE', response: { status: 503 } })
      );
    post.onSecondCall().callsFake(async (url, body) => ({
      data: body.variants.map((input) => ({ input, transcript_consequences: [] })),
    }));
    let written = '';
    const destination = new Writable({
      write(chunk, encoding, callback) {
        written += chunk;
        callback();
      },
    });
    const params = {
      output: 'TSV',
      streamState: { failed: 0 },
      destination,
      requestOptions: { maxRetries: 0 },
      cache: false,
    };
    const errors = sinon.stub(console, 'error');
    assert.equal(await processAndOutputChunk(['1-100-A-C'], true, params), false);
    assert.equal(params.streamState.failed, 1);
    assert.equal(await processAndOutputChunk(['1-200-A-C'], true, params), true);
    assert.match(written, /1-200-A-C/);
    assert.equal(errors.callCount, 1);
  });
  it('retains raw chr-prefixed liftover identities and their original VCF association', async () => {
    sinon.stub(axios, 'get').callsFake(async (url) => ({
      data: url.includes('/map/')
        ? {
            mappings: [
              {
                original: { seq_region_name: '1', start: 100, end: 100 },
                mapped: { seq_region_name: '2', start: 200, end: 200, strand: 1 },
              },
            ],
          }
        : { seq: 'A' },
    }));
    sinon.stub(axios, 'post').callsFake(async (url, body) => ({
      data: body.variants.map((input) => ({
        input,
        transcript_consequences: [{ consequence_terms: ['missense_variant'] }],
      })),
    }));
    const lifted = await performLiftover(['chr1-100-a-g']);
    assert.equal(lifted.originalToLiftedMap['2-200-A-G'], 'chr1-100-a-g');
    const file = path.join(directory, 'lift.vcf');
    fs.writeFileSync(
      file,
      '##fileformat=VCFv4.2\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild\tmother\tfather\nchr1\t100\traw\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\t0/0\n'
    );
    const parsed = await readVariantsFromVcf(file);
    const output = await analyzeVariant({
      vcfInput: file,
      variants: parsed.variantsToProcess,
      vcfRecordMap: parsed.vcfRecordMap,
      vcfHeaderLines: parsed.headerLines,
      assembly: 'hg19tohg38',
      output: 'VCF',
      cache: false,
      calculateInheritance: true,
      samples: parsed.samples,
      sampleMap: { index: 'child', mother: 'mother', father: 'father' },
    });
    assert.match(output, /chr1\t100\traw\tA\tG\t\.\t\.\tVL_CSQ=/);
    assert.match(output, /VL_DED_INH=de_novo/);
  });
  it('annotates each unique VCF allele once while retaining independent duplicate rows', async () => {
    const file = write('duplicates.vcf', ['1\t100\ta\tA\tC\t.\t.\t.', '1\t100\tb\tA\tC\t.\t.\t.']);
    const parsed = await readVariantsFromVcf(file);
    assert.deepEqual(parsed.variantsToProcess, ['1-100-A-C']);
    installFixtureApi();
    const output = await analyzeVariant({
      vcfInput: file,
      variants: parsed.variantsToProcess,
      vcfRecordMap: parsed.vcfRecordMap,
      vcfHeaderLines: parsed.headerLines,
      output: 'VCF',
      cache: false,
    });
    const rows = output
      .trim()
      .split('\n')
      .filter((line) => !line.startsWith('#'));
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.match(/VL_CSQ=([^;]+)/)[1].split(',').length, 2);
  });
  it('emits no blank lines and uses identical CSQ headers for empty and populated streams', () => {
    const full = cli(
      write('full.vcf', ['1\t100\ta\tA\tC\t.\t.\t.', '1\t200\tb\tA\tG\t.\t.\t.']),
      true
    );
    const empty = cli(write('empty.vcf', []), true);
    assert.equal(full.status, 0, full.stderr);
    assert.equal(empty.status, 0, empty.stderr);
    assert.ok(full.stdout.split('\n').slice(0, -1).every(Boolean));
    const csq = (text) => text.split('\n').find((line) => line.startsWith('##INFO=<ID=VL_CSQ,'));
    assert.equal(csq(empty.stdout), csq(full.stdout));
  });
  it('preserves ALT-dot records in file and streaming VCF output without annotation requests', async () => {
    const reference = '1\t100\treference\tA\t.\t.\t.\t.';
    for (const rows of [[reference], [reference, '1\t200\tvariant\tA\tC\t.\t.\t.']]) {
      const file = write(`reference-${rows.length}.vcf`, rows);
      const parsed = await readVariantsFromVcf(file);
      assert.equal(parsed.variantsToProcess.length, rows.length - 1);
      assert.equal(parsed.vcfRecordMap.size, rows.length);
      for (const streaming of [false, true]) {
        const output = cli(file, streaming);
        assert.equal(output.status, 0, output.stderr);
        assert.ok(output.stdout.split('\n').includes(reference));
        assert.equal(
          output.stdout
            .trim()
            .split('\n')
            .filter((line) => !line.startsWith('#')).length,
          rows.length
        );
      }
    }
  });

  it('continues to reject malformed ALT fields instead of silently dropping records', async () => {
    const file = write('malformed.vcf', ['1\t100\tbad\tA\t\t.\t.\t.']);
    await assert.rejects(readVariantsFromVcf(file), /Invalid VCF ALT/);
    await assert.rejects(async () => {
      for await (const record of iterateVcfRecords(file)) void record;
    }, /Invalid VCF ALT/);
  });
});
