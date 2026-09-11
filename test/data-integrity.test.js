'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readVariantsFromVcf, iterateVcfRecords } = require('../src/vcfReader');
const { formatAnnotationsToVcf } = require('../src/vcfFormatter');
const gt = require('../src/inheritance/genotypeUtils');
const { analyzeInheritanceForSample } = require('../src/inheritance/inheritanceAnalyzer');
const { loadFeatures } = require('../src/featureParser');
const { annotateOverlaps } = require('../src/featureAnnotator');

const header = [
  '##fileformat=VCFv4.2',
  '##INFO=<ID=AF,Number=A,Type=Float,Description="Frequency">',
  '##INFO=<ID=AR,Number=R,Type=Integer,Description="Counts">',
  '##INFO=<ID=GL,Number=G,Type=Float,Description="Likelihoods">',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Depths">',
  '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Depth">',
  '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Quality">',
  '##FORMAT=<ID=PL,Number=G,Type=Integer,Description="Likelihoods">',
  '##FORMAT=<ID=PS,Number=1,Type=Integer,Description="Phase set">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild\tfather\tmother',
];

const pedigree = new Map([
  ['child', { fatherId: 'father', motherId: 'mother', sex: 1, affectedStatus: 2 }],
  ['father', { fatherId: '0', motherId: '0', sex: 1, affectedStatus: 1 }],
  ['mother', { fatherId: '0', motherId: '0', sex: 2, affectedStatus: 1 }],
]);
const roles = { index: 'child', father: 'father', mother: 'mother' };

describe('Real data integrity contracts', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-integrity-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const record = (pos, calls, alt = 'C,G') =>
    `1\t${pos}\trs1;rs2\tA\t${alt}\t51.00\t.\tAF=0.10,0.20;AR=8,4,2;GL=0,-1,-2,-3,-4,-5\tGT\t${calls.join('\t')}`;
  async function read(lines) {
    const file = path.join(dir, 'input.vcf');
    fs.writeFileSync(file, [...header, ...lines, ''].join('\n'));
    return readVariantsFromVcf(file);
  }

  it('retains original rows when annotations are empty and marks conflicting repeat calls uncertain', async () => {
    const first = record(100, ['0/1', '0/0', '0/0'], 'C');
    const second = record(100, ['0/0', '0/0', '0/0'], 'C');
    const parsed = await read([first, second]);
    assert.equal(parsed.vcfRecordMap.get('1-100-A-C').genotypes.get('child'), './.');
    const output = formatAnnotationsToVcf([], parsed.vcfRecordMap, parsed.headerLines, ['Allele']);
    assert.deepEqual(
      output
        .trim()
        .split('\n')
        .filter((line) => !line.startsWith('#')),
      [first, second]
    );
  });

  it('reports missing headers and iterator file failures, and preserves header-only inputs', async () => {
    await read([]);
    const file = path.join(dir, 'input.vcf');
    const rows = [];
    for await (const row of iterateVcfRecords(file)) rows.push(row);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].entries, []);
    fs.writeFileSync(file, '1\t100\t.\tA\tC\t.\t.\t.\n');
    await assert.rejects(readVariantsFromVcf(file), /No header/);
    await assert.rejects(async () => {
      for await (const row of iterateVcfRecords(file)) assert.fail(row);
    }, /No header/);
    await assert.rejects(async () => {
      for await (const row of iterateVcfRecords(path.join(dir, 'absent.vcf'))) assert.fail(row);
    }, /not found/);
  });

  it('projects each ALT genotype without losing phase, ploidy, or missingness', async () => {
    const calls = ['0/1', '0/2', '1/2', '2/2', '1', '2|.', './.'];
    const expected = [
      ['0/1', '0/0'],
      ['0/0', '0/1'],
      ['1/0', '0/1'],
      ['0/0', '1/1'],
      ['1', '0'],
      ['0|.', '1|.'],
      ['./.', './.'],
    ];
    const parsed = await read(calls.map((call, i) => record(100 + i, [call, '0/0', '0/0'])));
    calls.forEach((call, i) =>
      ['C', 'G'].forEach((alt, j) => {
        const entry = parsed.vcfRecordMap.get(`1-${100 + i}-A-${alt}`);
        assert.equal(entry.genotypes.get('child'), expected[i][j]);
        assert.equal(entry.originalGenotypes.get('child'), call);
        assert.equal(entry.altIndex, j + 1);
      })
    );
  });

  it('does not assign de novo to an ALT absent from the child', async () => {
    const parsed = await read([record(100, ['0/1', '0/0', '0/0'])]);
    const genotypes = new Map(
      [...parsed.vcfRecordMap].map(([key, entry]) => [key, entry.genotypes])
    );
    const annotations = parsed.variantsToProcess.map((variantKey) => ({ variantKey }));
    const result = analyzeInheritanceForSample(annotations, genotypes, pedigree, roles);
    assert.equal(result.get('1-100-A-C').prioritizedPattern, 'de_novo');
    assert.equal(result.get('1-100-A-G').prioritizedPattern, 'reference');
  });

  it('preserves independent same-site rows, sample strings, and original INFO cardinalities', async () => {
    const samples = [
      '1|2:8,4,2:14:99:90,80,70,60,50,0:100',
      '0/1:8,4,0:12:80:0,10,20,30,40,50:.',
      '0/0:9,0,0:9:70:0,1,2,3,4,5:.',
    ];
    const first = record(100, samples).replace('\tGT\t', '\tGT:AD:DP:GQ:PL:PS\t');
    const second = record(100, ['0/1', '0/0', '0/0'], 'T');
    const duplicate = first.replace('rs1;rs2', 'independent');
    const parsed = await read([first, second, duplicate]);
    const annotations = [...new Set(parsed.variantsToProcess)].map((variantKey) => ({
      variantKey,
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [{ consequence_terms: ['missense_variant'] }],
    }));
    const result = formatAnnotationsToVcf(annotations, parsed.vcfRecordMap, parsed.headerLines, [
      'Allele',
      'Consequence',
    ]);
    const rows = result
      .trim()
      .split('\n')
      .filter((line) => !line.startsWith('#'));
    assert.equal(rows.length, 3);
    rows.forEach((line, index) => {
      const original = [first, second, duplicate][index].split('\t');
      const fields = line.split('\t');
      assert.deepEqual(fields.slice(0, 7), original.slice(0, 7));
      assert.deepEqual(fields.slice(8), original.slice(8));
      assert.ok(fields[7].startsWith(original[7] + ';VL_CSQ='));
    });
  });

  it('treats haploid calls as valid without calling them diploid homozygotes', () => {
    assert.equal(gt.isVariant('1'), true);
    assert.equal(gt.isRef('0'), true);
    assert.equal(gt.isHomAlt('1'), false);
    assert.equal(gt.isMissing('1'), false);
    assert.equal(gt.isMissing('1/.'), true);
  });

  it('recognizes a haploid X call during actual inheritance analysis', () => {
    const result = analyzeInheritanceForSample(
      [{ variantKey: 'X-100-A-C' }],
      new Map([['X-100-A-C', new Map([['child', '1']])]]),
      null,
      { index: 'child' }
    );
    assert.equal(result.get('X-100-A-C').prioritizedPattern, 'potential_x_linked');
  });

  it('does not promote an ambiguous third allele when two other alleles establish a pair', async () => {
    const parsed = await read([
      record(100, ['0/1', '0/1', '0/0'], 'C'),
      record(200, ['0/1', '0/0', '0/1'], 'C'),
      record(300, ['0/1', './.', '0/1'], 'C'),
    ]);
    const annotations = parsed.variantsToProcess.map((variantKey) => ({
      variantKey,
      transcript_consequences: [{ gene_symbol: 'GENE' }],
    }));
    const genotypes = new Map(
      [...parsed.vcfRecordMap].map(([key, entry]) => [key, entry.genotypes])
    );
    const results = analyzeInheritanceForSample(annotations, genotypes, pedigree, roles);
    assert.equal(results.get('1-100-A-C').compHetDetails.isCandidate, true);
    assert.equal(results.get('1-300-A-C').compHetDetails.isCandidate, false);
    assert.equal(results.get('1-300-A-C').segregationStatus.compound_heterozygous, undefined);
  });

  it('streams real records with the same allele projections and stable row identities', async () => {
    const parsed = await read([record(100, ['1|2', '0/1', '0/2']), record(200, ['1', '0', '0'])]);
    const rows = [];
    for await (const row of iterateVcfRecords(path.join(dir, 'input.vcf'))) rows.push(row);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].recordId, rows[1].recordId);
    assert.deepEqual(rows[0].headerLines, parsed.headerLines);
    for (const row of rows)
      for (const entry of row.entries) {
        assert.deepEqual(entry.genotypes, parsed.vcfRecordMap.get(entry.key).genotypes);
      }
  });

  it('keeps opposite missing parents uncertain in the merged inheritance result', async () => {
    const parsed = await read([
      record(100, ['0/1', '0/1', './.'], 'C'),
      record(200, ['0/1', './.', '0/1'], 'C'),
    ]);
    const annotations = parsed.variantsToProcess.map((variantKey) => ({
      variantKey,
      transcript_consequences: [{ gene_symbol: 'GENE' }],
    }));
    const genotypes = new Map(
      [...parsed.vcfRecordMap].map(([key, entry]) => [key, entry.genotypes])
    );
    for (const result of analyzeInheritanceForSample(
      annotations,
      genotypes,
      pedigree,
      roles
    ).values()) {
      assert.equal(result.compHetDetails.isCandidate, false);
      assert.equal(result.compHetDetails.isPossible, true);
      assert.equal(result.segregationStatus.compound_heterozygous, undefined);
      assert.equal(result.segregationStatus[result.prioritizedPattern], 'unknown');
    }
  });

  it('finds compound heterozygous pairs in a shared secondary transcript gene', async () => {
    const parsed = await read([
      record(100, ['0/1', '0/1', '0/0'], 'C'),
      record(200, ['0/1', '0/0', '0/1'], 'C'),
    ]);
    const annotations = parsed.variantsToProcess.map((variantKey, i) => ({
      variantKey,
      transcript_consequences: [{ gene_symbol: `FIRST${i}` }, { gene_symbol: 'SHARED' }],
    }));
    const genotypes = new Map(
      [...parsed.vcfRecordMap].map(([key, entry]) => [key, entry.genotypes])
    );
    for (const result of analyzeInheritanceForSample(
      annotations,
      genotypes,
      pedigree,
      roles
    ).values()) {
      assert.equal(result.prioritizedPattern, 'compound_heterozygous');
      assert.equal(result.compHetDetails.geneSymbol, 'SHARED');
    }
  });

  it('uses real interval-tree BED half-open boundaries and returns normalized coordinates', async () => {
    const bed = path.join(dir, 'regions.bed');
    fs.writeFileSync(bed, 'chr1\t100\t200\ttarget\t7\t+\n');
    const features = await loadFeatures({ bedFile: [bed] });
    const results = annotateOverlaps(
      [100, 101, 200, 201].map((start) => ({
        seq_region_name: '1',
        start,
        end: start,
      })),
      features
    );
    assert.deepEqual(
      results.map((a) => a.user_feature_overlap.length),
      [0, 1, 1, 0]
    );
    assert.equal(results[1].user_feature_overlap[0].region_start, 101);
    assert.equal(results[1].user_feature_overlap[0].region_end, 200);
  });
});
