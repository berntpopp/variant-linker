'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = require('../src');
const { readVariantsFromVcf } = require('../src/vcfReader');
const { readPedigree } = require('../src/pedReader');
const { loadFeatures } = require('../src/featureParser');

describe('Public in-memory data parsers', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-public-parsers-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  it('shares VCF allele, genotype and original-record semantics with the file reader', async () => {
    const text =
      '##fileformat=VCFv4.2\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild\n1\t100\tmulti\tA\tC,G\t.\t.\t.\tGT\t1|2\n1\t200\tref\tA\t.\t.\t.\t.\tGT\t0/0\n';
    const file = path.join(directory, 'input.vcf');
    fs.writeFileSync(file, text);
    const memory = api.parseVcfText(text),
      disk = await readVariantsFromVcf(file);
    const shape = (parsed) => ({
      variants: parsed.variantsToProcess,
      headers: parsed.headerLines,
      samples: parsed.samples,
      entries: [...parsed.vcfRecordMap].map(([key, value]) => ({
        key,
        line: value.originalLine,
        genotypes: [...value.genotypes],
        altIndex: value.altIndex,
      })),
    });
    assert.deepEqual(shape(memory), shape(disk));
    const output = api.formatAnnotationsToVcf([], memory.vcfRecordMap, memory.headerLines, [
      'Allele',
    ]);
    assert.ok(output.includes('1\t200\tref\tA\t.\t.\t.\t.\tGT\t0/0'));
    assert.throws(() => api.parseVcfText('1\t100\t.\tA\tC'), /header/);
  });
  it('shares pedigree parsing and retains parent and affected-status information', async () => {
    const text = '# family\nfam child dad mom 1 2\nfam mom 0 0 2 1\nfam dad 0 0 1 1\n';
    const file = path.join(directory, 'family.ped');
    fs.writeFileSync(file, text);
    assert.deepEqual(api.parsePedigreeText(text), await readPedigree(file));
    assert.equal(api.parsePedigreeText(text).get('child').motherId, 'mom');
  });
  it('builds real interval trees and gene metadata from in-memory feature data', async () => {
    const bed = 'chr1\t100\t200\tregion\n';
    const genes = 'GENE1\n';
    const data = [{ symbol: 'GENE1', rank: 7 }];
    const bedPath = path.join(directory, 'regions.bed'),
      genePath = path.join(directory, 'genes.txt'),
      jsonPath = path.join(directory, 'genes.json');
    fs.writeFileSync(bedPath, bed);
    fs.writeFileSync(genePath, genes);
    fs.writeFileSync(jsonPath, JSON.stringify(data));
    const mapping = { identifier: 'symbol', dataFields: ['rank'] };
    const features = api.buildFeatures({
      beds: [{ source: bedPath, regions: api.parseBedText(bed) }],
      geneLists: [{ source: genePath, genes: api.parseGeneListText(genes, genePath) }],
      jsonGenes: [{ source: jsonPath, genes: api.parseJsonGenesData(data, mapping, jsonPath) }],
    });
    const disk = await loadFeatures({
      bedFile: [bedPath],
      geneList: [genePath],
      jsonGenes: [jsonPath],
      jsonGeneMapping: JSON.stringify(mapping),
    });
    const annotations = [100, 101, 200, 201].map((start) => ({
      seq_region_name: '1',
      start,
      end: start,
      transcript_consequences: [{ gene_symbol: 'GENE1' }],
    }));
    assert.deepEqual(
      api.annotateOverlaps(structuredClone(annotations), features),
      api.annotateOverlaps(structuredClone(annotations), disk)
    );
    assert.equal(features.featuresByChrom['1'].search(100, 100).length, 0);
    assert.equal(features.featuresByChrom['1'].search(101, 101).length, 1);
    assert.equal(features.geneSets.get('GENE1')[1].rank, 7);
  });
  it('exports feature defaults and independent inheritance analysis', () => {
    assert.equal(api.parseGeneListText('GENE1')[0].source, 'genes');
    assert.equal(
      api.parseJsonGenesData([{ id: 'GENE1' }], { identifier: 'id' })[0].source,
      'genes.json'
    );
    assert.throws(() => api.parseJsonGenesData([], {}), /identifier/);
    assert.throws(() => api.parseJsonGenesData(null, { identifier: 'id' }), /array or object/);
    assert.equal(typeof api.inheritance.analyzeInheritanceForSample, 'function');
    assert.equal(api.buildFeatures().geneSets.size, 0);
  });
});
