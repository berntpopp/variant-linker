'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

describe('Equivalent Variant Recoder benchmark inputs', () => {
  let directory;
  let options;
  let provenance;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-recoder-input-'));
    const inputPath = path.join(directory, 'source.vcf');
    const input =
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n22\t16050075\t.\tA\tG\t.\tPASS\t.\n22\t16141716\t.\tT\tG\t.\tPASS\t.\n';
    fs.writeFileSync(inputPath, input);
    provenance = {
      source: { assembly: 'GRCh37' },
      dataset: {
        path: inputPath,
        variantCount: 2,
        sha256: crypto.createHash('sha256').update(input).digest('hex'),
      },
    };
    options = {
      sourceManifestPath: path.join(directory, 'source.json'),
      outputPath: path.join(directory, 'hgvs.txt'),
      manifestPath: path.join(directory, 'recoder.json'),
    };
    fs.writeFileSync(options.sourceManifestPath, JSON.stringify(provenance));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('preserves each source coordinate and allele in versioned GRCh37 genomic HGVS', () => {
    const { deriveRecoderDataset } = require('../scripts/benchmark/derive-recoder-dataset.cjs');
    const manifest = deriveRecoderDataset(options);
    const output = fs.readFileSync(options.outputPath, 'utf8');
    assert.equal(output, 'NC_000022.10:g.16050075A>G\nNC_000022.10:g.16141716T>G\n');
    assert.equal(manifest.dataset.variantCount, 2);
    assert.equal(manifest.dataset.sha256, crypto.createHash('sha256').update(output).digest('hex'));
    assert.equal(manifest.source.sha256, provenance.dataset.sha256);
  });

  it('refuses a source whose content differs from its provenance hash', () => {
    const { deriveRecoderDataset } = require('../scripts/benchmark/derive-recoder-dataset.cjs');
    fs.appendFileSync(provenance.dataset.path, '\n');
    assert.throws(() => deriveRecoderDataset(options), /SHA-256 mismatch/);
  });

  it('refuses the wrong genome assembly', () => {
    const { deriveRecoderDataset } = require('../scripts/benchmark/derive-recoder-dataset.cjs');
    provenance.source.assembly = 'GRCh38';
    fs.writeFileSync(options.sourceManifestPath, JSON.stringify(provenance));
    assert.throws(() => deriveRecoderDataset(options), /GRCh37/);
  });
});
