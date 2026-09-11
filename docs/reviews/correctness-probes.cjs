'use strict';
// Read-only probes: no real network calls and no repository writes.
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'package.json'));
const proxyquire = req('proxyquire');
const formatter = req('./src/vcfFormatter').formatAnnotationsToVcf;
const deduce = req('./src/inheritance/patternDeducer').deduceInheritancePatterns;
const scorer = req('./src/scoring');
const header =
  '##fileformat=VCFv4.2\n##INFO=<ID=AF,Number=A,Type=Float,Description="Frequency">\n##FILTER=<ID=q10,Description="Quality below 10">\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild\tmother\tfather';
async function parse(rows) {
  const content = header + '\n' + rows.join('\n') + '\n';
  const reader = proxyquire(path.join(root, 'src/vcfReader.js'), {
    fs: { existsSync: () => true, readFileSync: () => content },
  });
  return reader.readVariantsFromVcf('mock.vcf');
}
function show(name, result) {
  console.log(name, JSON.stringify(result));
}
(async () => {
  const r = await parse(['1\t100\t.\tA\tC,G\t50\tPASS\tAF=0.1,0.2\tGT\t0/1\t0/0\t0/0']);
  show(
    'multiallelic_genotypes',
    [...r.vcfRecordMap].map(([key, v]) => [key, [...v.genotypes]])
  );
  show(
    'multiallelic_patterns',
    [...r.vcfRecordMap].map(([key, v]) => [
      key,
      deduce(
        v.genotypes,
        null,
        { index: 'child', mother: 'mother', father: 'father' },
        { chrom: '1' }
      ),
    ])
  );
  // Expected G allele absent from child; observed both alleles called de_novo.
  const separate = await parse([
    '1\t100\trsA;rsB\tA\tC\t50\t.\tAF=0.1\tGT\t0/1\t0/0\t0/0',
    '1\t100\trsG\tA\tG\t10\tq10\tAF=0.2\tGT\t0/0\t0/0\t0/0',
  ]);
  const out = formatter(
    [
      {
        variantKey: '1-100-A-C',
        vcfString: '1-100-A-C',
        transcript_consequences: [{ variant_allele: 'C', consequence_terms: ['missense_variant'] }],
      },
    ],
    separate.vcfRecordMap,
    separate.headerLines,
    ['Allele']
  );
  const lines = out.split('\n').filter((l) => l.startsWith('#CHROM') || (l && !l.startsWith('#')));
  show(
    'vcf_column_counts',
    lines.map((l) => l.split('\t').length)
  ); // Expected [12,12,12], actual [12,8].
  show('vcf_records', lines.slice(1)); // Two records collapsed; AF/QUAL/FILTER lost; ID delimiter changed.
  const lift = req('./src/assemblyConverter');
  show(
    'negative_strand_liftover',
    lift.constructLiftedVariant(
      { chr: '1', pos: 100, ref: 'A', alt: 'C' },
      { mapped: { seq_region_name: '1', start: 200, end: 200, strand: -1 } }
    )
  ); // Expected 1-200-T-G.
  show(
    'deletion_mapping_region',
    lift.constructRegionString({ chr: '1', pos: 100, ref: 'ATG', alt: 'A' })
  ); // Expected full interval 1:100-102.
  const ped = new Map([
    ['child', { motherId: 'mother', fatherId: 'father', sex: '1', affectedStatus: '2' }],
    ['mother', { sex: '2', affectedStatus: '1' }],
    ['father', { sex: '1', affectedStatus: '1' }],
  ]);
  const cg = new Map([
    [
      '1-100-A-C',
      new Map([
        ['child', '0/1'],
        ['mother', './.'],
        ['father', '0/1'],
      ]),
    ],
    [
      '1-200-A-C',
      new Map([
        ['child', '0/1'],
        ['mother', '0/1'],
        ['father', './.'],
      ]),
    ],
  ]);
  const anns = [
    { variantKey: '1-100-A-C', transcript_consequences: [{ gene_symbol: 'GENE1' }] },
    { variantKey: '1-200-A-C', transcript_consequences: [{ gene_symbol: 'GENE1' }] },
  ];
  show(
    'ambiguous_comphet',
    req('./src/inheritance/compoundHetAnalyzer').analyzeCompoundHeterozygous(anns, cg, ped, 'child')
  ); // Expected possible, not confirmed.
  const full = req('./src/inheritance/inheritanceAnalyzer').analyzeInheritanceForSample(
    anns,
    cg,
    ped,
    null
  );
  show('ambiguous_comphet_full', [...full]);
  show('haploid_gt_checks', {
    variant: req('./src/inheritance/genotypeUtils').isVariant('1'),
    reference: req('./src/inheritance/genotypeUtils').isRef('0'),
    missing: req('./src/inheritance/genotypeUtils').isMissing('1'),
  }); // Expected true,true,false; observed false,false,false.
  show(
    'haploid_trio_pattern',
    deduce(
      new Map([
        ['child', '1'],
        ['mother', '0/1'],
        ['father', '0'],
      ]),
      null,
      { index: 'child', mother: 'mother', father: 'father' },
      { chrom: 'X' }
    )
  );
  try {
    scorer.applyScoring([{ most_severe_consequence: 'intergenic_variant' }], {
      variables: { transcriptFields: { cadd_phred: { target: 'cadd', default: 0 } } },
      formulas: { annotationLevel: [{ score: 'cadd+1' }], transcriptLevel: [] },
    });
  } catch (e) {
    show('no_transcript_scoring_error', e.message);
  } // Expected score=1 using default.
  try {
    scorer.applyScoring(
      [{ most_severe_consequence: 'intergenic_variant' }],
      scorer.readScoringConfigFromFiles(path.join(root, 'scoring/nephro_variant_score'))
    );
  } catch (e) {
    show('bundled_nephro_intergenic_error', e.message);
  }
  show(
    'mane_priority',
    scorer._findPrioritizedTranscript({
      transcript_consequences: [
        { transcript_id: 'other', canonical: 1 },
        { transcript_id: 'mane', mane_select: 'NM_000001.2' },
      ],
    })
  ); // Expected MANE transcript under documented priority.
})();
