#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Derive an equivalent, ordered HGVS workload without making annotation calls. */
function deriveRecoderDataset(options = {}) {
  const sourceManifestPath =
    options.sourceManifestPath ?? path.join(ROOT, 'docs/benchmarks/1000genomes-1000.json');
  const source = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  if (source.source.assembly !== 'GRCh37') throw new Error('Expected a GRCh37 dataset');
  const inputPath = path.resolve(ROOT, source.dataset.path);
  const input = fs.readFileSync(inputPath);
  if (sha256(input) !== source.dataset.sha256) throw new Error('Source VCF SHA-256 mismatch');
  const variants = input
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'));
  if (variants.length !== source.dataset.variantCount)
    throw new Error('Source variant count mismatch');
  const identifiers = variants.map((line) => {
    const [chromosome, position, , ref, alt] = line.split('\t');
    if (
      chromosome !== '22' ||
      !/^[1-9]\d*$/.test(position) ||
      !/^[ACGT]$/.test(ref) ||
      !/^[ACGT]$/.test(alt) ||
      ref === alt
    )
      throw new Error('Expected a chromosome 22 biallelic SNV');
    return `NC_000022.10:g.${position}${ref}>${alt}`;
  });
  const output = identifiers.join('\n') + '\n';
  const count = identifiers.length;
  const outputPath =
    options.outputPath ??
    path.join(ROOT, `local_data/benchmarks/1000genomes-chr22-grch37-${count}.hgvs.txt`);
  const manifestPath =
    options.manifestPath ?? path.join(ROOT, `docs/benchmarks/recoder-${count}.json`);
  const manifest = {
    schemaVersion: 1,
    source: {
      provenancePath: path.relative(ROOT, sourceManifestPath).replace(/\\/g, '/'),
      vcfPath: path.relative(ROOT, inputPath).replace(/\\/g, '/'),
      sha256: source.dataset.sha256,
      assembly: 'GRCh37',
      originalSourceUrl: source.source.url ?? null,
    },
    transformation: {
      algorithm:
        'One-to-one VCF file-order conversion of biallelic SNVs to NC_000022.10:g.{POS}{REF}>{ALT}; retain original one-based coordinate and alleles',
      accession: 'NC_000022.10',
      chromosome: '22',
      assembly: 'GRCh37.p13 primary chromosome sequence (unchanged by assembly patches)',
      accessionEvidenceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NC_000022.10',
      assemblyEvidenceUrl: 'https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_000001405.25/',
      evidenceCheckedOn: '2026-09-11',
      referenceValidation:
        'Reference alleles are inherited from the SHA-verified public VCF. This derivation does not independently download or compare the reference sequence.',
      samplePolicy: 'No sample genotype fields; identical sites and order to the VCF benchmark',
    },
    dataset: {
      path: path.relative(ROOT, outputPath).replace(/\\/g, '/'),
      variantCount: count,
      bytes: Buffer.byteLength(output),
      sha256: sha256(output),
      firstVariant: identifiers[0],
      lastVariant: identifiers.at(-1),
    },
    reuse: source.reuse ?? null,
    reproduction: {
      command: 'node scripts/benchmark/derive-recoder-dataset.cjs',
      node: process.version,
    },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(deriveRecoderDataset(), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
module.exports = { deriveRecoderDataset };
