'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');

const header = [
  '##fileformat=VCFv4.2',
  '##reference=GRCh37',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE',
];
const records = [
  '22\t100\trs1\tA\tC\t100\tPASS\tAC=1;AN=2\tGT\t0|1',
  '22\t101\trs2\tA\tAT\t100\tPASS\tAC=1\tGT\t0|1',
  '22\t102\trs3\tA\tC,G\t100\tPASS\tAC=1,1\tGT\t1|2',
  '22\t103\trs4\tA\tT\t10\tLowQual\tAC=1\tGT\t0|1',
  '22\t104\trs5\tN\tG\t100\tPASS\tAC=1\tGT\t0|1',
  '22\t105\trs6\tG\tT\t100\tPASS\tAC=1;AN=2\tGT\t0|1',
  '22\t106\trs7\tG\tA\t100\tPASS\tAC=1\tGT\t0|1',
];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('Public benchmark dataset acquisition', () => {
  let directory;
  let server;
  let source;
  let requestHeaders;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vl-dataset-'));
    source = gzipSync([...header, ...records, ''].join('\n'));
    server = http.createServer((request, response) => {
      requestHeaders = request.headers;
      response.writeHead(206, {
        'Content-Type': 'application/gzip',
        'Content-Range': `bytes 0-${source.length - 1}/${source.length}`,
        'Content-Length': source.length,
      });
      response.end(source);
    });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => {
      server.close(resolve);
    });
    await fs.rm(directory, { recursive: true, force: true });
  });
  function options(count = 2) {
    return {
      url: `http://127.0.0.1:${server.address().port}/fixture.vcf.gz`,
      count,
      outputPath: path.join(directory, 'subset.vcf'),
      manifestPath: path.join(directory, 'provenance.json'),
    };
  }

  it('selects exact PASS biallelic SNVs, removes samples, and hashes provenance', async () => {
    const { fetchDataset } = require('../scripts/benchmark/fetch-dataset.cjs');
    const manifest = await fetchDataset(options());
    const result = await fs.readFile(options().outputPath, 'utf8');
    const selected = result.split('\n').filter((line) => line && !line.startsWith('#'));
    assert.deepEqual(
      selected,
      [records[0], records[5]].map((line) => line.split('\t').slice(0, 8).join('\t'))
    );
    assert.ok(result.includes('##FORMAT=<ID=GT'));
    assert.ok(result.includes('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n'));
    assert.ok(!result.includes('\tSAMPLE'));
    assert.equal(manifest.dataset.sha256, sha256(result));
    assert.equal(manifest.dataset.variantCount, 2);
    assert.equal(manifest.selection.recordsExamined, 6);
    assert.equal(manifest.source.headerSha256, sha256(header.join('\n') + '\n'));
    assert.equal(
      manifest.source.decompressedPrefixSha256,
      sha256([...header, ...records.slice(0, 6), ''].join('\n'))
    );
    assert.equal(manifest.transfer.compressedBytesReceived, source.length);
    assert.match(requestHeaders.range, /^bytes=0-/);
    assert.deepEqual(JSON.parse(await fs.readFile(options().manifestPath, 'utf8')), manifest);
  });

  it('fails an undersized source without publishing a partial dataset', async () => {
    const { fetchDataset } = require('../scripts/benchmark/fetch-dataset.cjs');
    await assert.rejects(fetchDataset(options(4)), /Only 3 eligible/);
    await assert.rejects(fs.stat(options().outputPath), { code: 'ENOENT' });
  });

  it('recreates identical dataset bytes on a second acquisition', async () => {
    const { fetchDataset } = require('../scripts/benchmark/fetch-dataset.cjs');
    const first = await fetchDataset(options());
    const second = await fetchDataset(options());
    assert.equal(first.dataset.sha256, second.dataset.sha256);
    assert.equal(first.source.decompressedPrefixSha256, second.source.decompressedPrefixSha256);
  });
});
