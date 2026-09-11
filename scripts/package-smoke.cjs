'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

async function smoke() {
  const root = path.resolve(__dirname, '..');
  const library = require('../src');
  assert.equal(typeof library.analyzeVariant, 'function');
  assert.equal(library.detectInputFormat('1-100-A-C'), 'VCF');

  const requests = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    ReadableStream,
    Request,
    Response,
    Headers,
    FormData,
    Blob,
    fetch: async (request) => {
      requests.push(typeof request === 'string' ? request : request.url);
      const data = requests.at(-1).includes('/vep/')
        ? [
            {
              input: (await request.json()).variants[0],
              seq_region_name: '1',
              start: 100,
              end: 100,
              allele_string: 'A/C',
              most_severe_consequence: 'missense_variant',
              transcript_consequences: [
                {
                  gene_symbol: 'GENE1',
                  transcript_id: 'ENST1',
                  consequence_terms: ['missense_variant'],
                },
              ],
            },
          ]
        : { fixture: true };
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'dist/variant-linker.bundle.js'), 'utf8'),
    context,
    { timeout: 10000, filename: 'variant-linker.bundle.js' }
  );
  assert.equal(typeof context.VariantLinker.analyzeVariant, 'function');
  const response = await context.VariantLinker.apiHelper.fetchApi('/audit-smoke', {}, false);
  assert.equal(response.fixture, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/rest\.ensembl\.org\/audit-smoke/);

  context.Function = function blockedDynamicCode() {
    throw new Error('Scoring must not construct executable JavaScript');
  };
  const scored = context.VariantLinker.scoring.applyScoring([{ values: [2, 3] }], {
    variables: { values: 'values' },
    formulas: {
      annotationLevel: [{ score: 'Math.max(...values.map(value => value * 2))' }],
      transcriptLevel: [],
    },
  });
  assert.equal(scored[0].score, 6);
  const annotated = await context.VariantLinker.analyzeVariant({
    variants: ['1-100-A-C'],
    features: {
      featuresByChrom: {},
      geneSets: new Map([['GENE1', [{ source: '/public/genes.json', type: 'json' }]]]),
    },
  });
  assert.equal(annotated.annotationData[0].user_feature_overlap[0].source, 'genes.json');

  const browser = context.VariantLinker;
  const vcf = browser.parseVcfText(
    '##fileformat=VCFv4.2\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild\tmom\tdad\n1\t100\tpublic-fixture\tA\tC\t.\tPASS\t.\tGT\t0/1\t0/0\t0/0\n'
  );
  const features = browser.buildFeatures({
    beds: [{ source: 'regions.bed', regions: browser.parseBedText('1\t99\t100\tregion\n') }],
    geneLists: [{ source: 'genes.txt', genes: browser.parseGeneListText('GENE1\n') }],
    jsonGenes: [
      {
        source: 'genes.json',
        genes: browser.parseJsonGenesData([{ symbol: 'GENE1', rank: 7 }], {
          identifier: 'symbol',
          dataFields: ['rank'],
        }),
      },
    ],
  });
  const family = await browser.analyzeVariant({
    variants: vcf.variantsToProcess,
    vcfInput: true,
    vcfRecordMap: vcf.vcfRecordMap,
    vcfHeaderLines: vcf.headerLines,
    samples: vcf.samples,
    pedigreeData: browser.parsePedigreeText(
      'fam child dad mom 1 2\nfam mom 0 0 2 1\nfam dad 0 0 1 1\n'
    ),
    calculateInheritance: true,
    features,
    scoringConfig: {
      variables: {},
      formulas: { annotationLevel: [{ score: '7' }], transcriptLevel: [] },
    },
  });
  assert.equal(family.annotationData[0].score, 7);
  assert.equal(family.annotationData[0].user_feature_overlap.length, 3);
  const familyVcf = browser.filterAndFormatResults(family, null, 'VCF', {});
  assert.match(familyVcf, /VL_DED_INH=de_novo/);
  assert.match(familyVcf, /GT\t0\/1\t0\/0\t0\/0/);
  const dataset = JSON.parse(browser.filterAndFormatResults(family, null, 'SCHEMA', {}));
  assert.equal(dataset['@type'], 'Dataset');
  assert.equal(dataset.annotationData.length, 1);

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this smoke through npm run test:package');
  const pack = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (pack.error) throw pack.error;
  assert.equal(pack.status, 0, pack.stderr);
  const files = new Set(JSON.parse(pack.stdout)[0].files.map((file) => file.path));
  for (const required of [
    'src/index.js',
    'src/main.js',
    'dist/variant-linker.bundle.js',
    'schema/variant_annotation.schema.json',
  ])
    assert.ok(files.has(required), `Missing ${required}`);
  console.log('Node exports, browser HTTP transport, and package contents verified.');
}

smoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
