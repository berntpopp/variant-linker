#!/usr/bin/env node
'use strict';

// Explicit dataset acquisition command. Ordinary tests use a loopback HTTP fixture.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { createInterface } = require('node:readline');
const { parseArgs } = require('node:util');

const SOURCE_URL =
  'https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/' +
  'ALL.chr22.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz';
const ROOT = path.resolve(__dirname, '../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requestPrefix(url, maxBytes, timeoutMs) {
  const address = new URL(url);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname);
  if (address.protocol !== 'https:' && !(address.protocol === 'http:' && local))
    throw new Error('Dataset URLs require HTTPS (HTTP is allowed only for loopback fixtures)');
  return new Promise((resolve, reject) => {
    const transport = address.protocol === 'https:' ? https : http;
    const request = transport.get(
      address,
      { headers: { Range: `bytes=0-${maxBytes - 1}`, 'Accept-Encoding': 'identity' } },
      (response) => {
        if (![200, 206].includes(response.statusCode)) {
          response.resume();
          reject(new Error(`Dataset HTTP status ${response.statusCode}`));
          return;
        }
        if (
          response.statusCode === 206 &&
          !/^bytes 0-\d+\/\d+$/.test(response.headers['content-range'] || '')
        ) {
          response.destroy();
          reject(new Error('Dataset response does not start at byte zero'));
          return;
        }
        resolve({ request, response });
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Dataset request timed out')));
    request.on('error', reject);
  });
}

async function fetchDataset(options = {}) {
  const count = options.count ?? 1000;
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error('count must be a positive integer');
  const url = options.url ?? SOURCE_URL;
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 120000;
  const outputPath =
    options.outputPath ??
    path.join(ROOT, `local_data/benchmarks/1000genomes-chr22-grch37-${count}.vcf`);
  const manifestPath =
    options.manifestPath ?? path.join(ROOT, `docs/benchmarks/1000genomes-${count}.json`);
  const { request, response } = await requestPrefix(url, maxBytes, timeoutMs);
  let compressedBytesReceived = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      compressedBytesReceived += chunk.length;
      callback(
        compressedBytesReceived > maxBytes
          ? new Error('Compressed download budget exceeded')
          : null,
        chunk
      );
    },
  });
  const gunzip = createGunzip();
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  let transferError;
  const transfer = pipeline(response, counter, gunzip).catch((error) => {
    transferError = error;
  });
  const timer = setTimeout(
    () => request.destroy(new Error('Dataset acquisition deadline exceeded')),
    timeoutMs
  );
  const sourceHeader = crypto.createHash('sha256');
  const sourcePrefix = crypto.createHash('sha256');
  const output = [];
  let prefixBytes = 0;
  let selected = 0;
  let examined = 0;
  let sampleCount = 0;
  let sawColumns = false;
  let firstVariant;
  let lastVariant;
  try {
    for await (const line of lines) {
      const normalized = line + '\n';
      sourcePrefix.update(normalized);
      prefixBytes += Buffer.byteLength(normalized);
      if (line.startsWith('#')) {
        sourceHeader.update(normalized);
        if (line.startsWith('#CHROM\t')) {
          const fields = line.split('\t');
          sampleCount = Math.max(0, fields.length - 9);
          if (fields.slice(0, 8).join('\t') !== '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO')
            throw new Error('Unexpected VCF column header');
          output.push(`##variant_linker_subset=first_${count}_PASS_biallelic_SNVs_sites_only`);
          output.push(fields.slice(0, 8).join('\t'));
          sawColumns = true;
        } else output.push(line);
        continue;
      }
      if (!line) continue;
      if (!sawColumns) throw new Error('VCF records precede the column header');
      examined++;
      const fields = line.split('\t');
      if (fields.length < 8) throw new Error(`Malformed VCF record ${examined}`);
      const [chromosome, position, id, ref, alt, , filter] = fields;
      if (filter !== 'PASS' || !/^[ACGT]$/.test(ref) || !/^[ACGT]$/.test(alt) || ref === alt)
        continue;
      if (chromosome !== '22' || !/^[1-9]\d*$/.test(position))
        throw new Error('Expected positive GRCh37 chromosome 22 coordinates');
      output.push(fields.slice(0, 8).join('\t'));
      const identity = { chromosome, position: Number(position), id, ref, alt };
      firstVariant ??= identity;
      lastVariant = identity;
      if (++selected === count) break;
    }
  } finally {
    clearTimeout(timer);
    lines.close();
    request.destroy();
    response.destroy();
    gunzip.destroy();
    await transfer;
  }
  if (selected !== count)
    throw new Error(`Only ${selected} eligible variants found; requested ${count}`, {
      cause: transferError,
    });
  const dataset = output.join('\n') + '\n';
  const manifest = {
    schemaVersion: 1,
    source: {
      project: '1000 Genomes Project, phase 3',
      release: '20130502, integrated v5b chromosome 22',
      assembly: 'GRCh37',
      url,
      accessedAt: new Date().toISOString(),
      lastModified: response.headers['last-modified'] ?? null,
      etag: response.headers.etag ?? null,
      sourceHeaderSampleCount: sampleCount,
      headerSha256: sourceHeader.digest('hex'),
      decompressedPrefixSha256: sourcePrefix.digest('hex'),
      decompressedPrefixBytes: prefixBytes,
      hashNormalization:
        'UTF-8 lines with LF terminators; prefix ends after the last selected original record, including its source genotype columns',
    },
    selection: {
      algorithm:
        'Scan source file order from byte zero; select first N chromosome 22 records with FILTER=PASS and different single A/C/G/T REF and ALT bases',
      requestedCount: count,
      recordsExamined: examined,
      samplePolicy:
        'Sites only: preserve original CHROM, POS, ID, REF, ALT, QUAL, FILTER and INFO verbatim; remove FORMAT and every genotype/sample column; retain source metadata and add one subset metadata line',
      firstVariant,
      lastVariant,
      limitation:
        'Deterministic regional SNV workload; not a random or genome-wide representative sample and not an inheritance benchmark',
    },
    dataset: {
      path: path.relative(ROOT, outputPath).replace(/\\/g, '/'),
      variantCount: selected,
      bytes: Buffer.byteLength(dataset),
      sha256: sha256(dataset),
    },
    transfer: {
      method:
        'HTTPS byte-range prefix request, streaming gzip/BGZF decompression; cancel after N eligible records',
      requestedRange: `bytes=0-${maxBytes - 1}`,
      responseStatus: response.statusCode,
      contentRange: response.headers['content-range'] ?? null,
      compressedBytesReceived,
      bytesDefinition:
        'Compressed HTTP entity bytes delivered to the counting stream before cancellation; excludes HTTP/TLS overhead and unconsumed socket buffers',
      completeSourceDownloaded: response.complete && response.statusCode === 200,
      integrityScope:
        'Derived dataset and consumed decompressed prefix are hashed; the full upstream gzip object was not downloaded or hashed',
    },
    reuse: {
      policy:
        '1000 Genomes Project data are available without embargo after final publication; cite the project and follow IGSR/EMBL-EBI terms. No software or publication license is assigned to the dataset here.',
      policyUrl: 'https://www.internationalgenome.org/IGSR_disclaimer/',
      citationUrl: 'https://www.internationalgenome.org/faq/how-do-I-cite-IGSR/',
      publication:
        'The 1000 Genomes Project Consortium. A global reference for human genetic variation. Nature 526, 68–74 (2015). doi:10.1038/nature15393',
      releaseReadmeUrl:
        'https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/README_phase3_callset_20150220',
      sourceIndexUrl: 'https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/',
    },
    reproduction: {
      command: `node scripts/benchmark/fetch-dataset.cjs --count ${count}`,
      node: process.version,
    },
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(outputPath, dataset);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (require.main === module) {
  const { values } = parseArgs({
    options: { count: { type: 'string', default: '1000' } },
  });
  fetchDataset({ count: Number(values.count) }).then(
    (manifest) => console.log(JSON.stringify(manifest, null, 2)),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
module.exports = { fetchDataset, SOURCE_URL };
