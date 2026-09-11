#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataset: defaults } = require('../../config/benchmarkConfig.json');
const ROOT = path.resolve(__dirname, '../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Derive an equivalent, ordered HGVS workload without making annotation calls. */
function deriveRecoderDataset(options = {}) {
  const sourceManifestPath =
    options.sourceManifestPath ??
    path.join(ROOT, defaults.provenanceDirectory, `1000genomes-${defaults.count}.json`);
  const source = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  if (source.source.assembly !== defaults.assembly)
    throw new Error(`Expected a ${defaults.assembly} dataset`);
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
      chromosome !== defaults.chromosome ||
      !/^[1-9]\d*$/.test(position) ||
      !/^[ACGT]$/.test(ref) ||
      !/^[ACGT]$/.test(alt) ||
      ref === alt
    )
      throw new Error('Expected a chromosome 22 biallelic SNV');
    return `${defaults.refseqAccession}:g.${position}${ref}>${alt}`;
  });
  const output = identifiers.join('\n') + '\n';
  const count = identifiers.length;
  const outputPath =
    options.outputPath ??
    path.join(ROOT, defaults.dataDirectory, `${defaults.name}-${count}.hgvs.txt`);
  const manifestPath =
    options.manifestPath ?? path.join(ROOT, defaults.provenanceDirectory, `recoder-${count}.json`);
  const manifest = {
    schemaVersion: 1,
    source: {
      provenancePath: path.relative(ROOT, sourceManifestPath).replace(/\\/g, '/'),
      vcfPath: path.relative(ROOT, inputPath).replace(/\\/g, '/'),
      sha256: source.dataset.sha256,
      assembly: defaults.assembly,
      originalSourceUrl: source.source.url ?? null,
    },
    transformation: {
      algorithm: `One-to-one VCF file-order conversion of biallelic SNVs to ${defaults.refseqAccession}:g.{POS}{REF}>{ALT}; retain original one-based coordinate and alleles`,
      accession: defaults.refseqAccession,
      chromosome: defaults.chromosome,
      assembly: 'GRCh37.p13 primary chromosome sequence (unchanged by assembly patches)',
      accessionEvidenceUrl: defaults.accessionEvidenceUrl,
      assemblyEvidenceUrl: defaults.assemblyEvidenceUrl,
      evidenceCheckedOn: defaults.evidenceCheckedOn,
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
