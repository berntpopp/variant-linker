'use strict';
const assert = require('node:assert/strict');
const { deduceInheritancePatterns: deduce } = require('../src/inheritance/patternDeducer');
const { prioritizePattern } = require('../src/inheritance/patternPrioritizer');
const { checkSegregation } = require('../src/inheritance/segregationChecker');
const { isMale, isFemale } = require('../src/inheritance/pedigreeUtils');
const { analyzeCompoundHeterozygous } = require('../src/inheritance/compoundHetAnalyzer');
const { analyzeInheritanceForSample } = require('../src/inheritance/inheritanceAnalyzer');

const roles = { index: 'child', mother: 'mother', father: 'father' };
const trio = (child, mother, father) => new Map(Object.entries({ child, mother, father }));
const pedigree = new Map([
  ['child', { affectedStatus: 2, fatherId: 'father', motherId: 'mother', sex: 1 }],
  ['mother', { affectedStatus: 1, sex: 2 }],
  ['father', { affectedStatus: 1, sex: 1 }],
]);

describe('Inheritance family contracts', () => {
  it('distinguishes pedigree evidence when affected genotypes or disease status are absent', () => {
    assert.deepEqual(deduce(trio('./.', '0/1', '0/0'), pedigree, null, { chrom: '1' }), [
      'unknown_no_affected_with_genotype',
    ]);
    assert.deepEqual(
      deduce(new Map([['mother', '0/1']]), new Map([['mother', { affectedStatus: 1 }]]), null, {
        chrom: '1',
      }),
      ['unknown_no_affected_with_genotype']
    );
    const referenceAffected = deduce(trio('0/0', '0/1', '0/0'), pedigree, null, { chrom: '1' });
    assert.ok(referenceAffected.includes('incomplete_segregation'));
    assert.deepEqual(deduce(trio('0/0', '0/0', '0/0'), pedigree, null, { chrom: '1' }), [
      'reference',
    ]);
  });
  for (const [child, mother, father, expected] of [
    ['0/1', '0/0', '0/0', 'de_novo'],
    ['0/1', '0/0', './.', 'de_novo_candidate'],
    ['0/1', './.', '0/0', 'de_novo_candidate'],
    ['1/1', '0/1', '0/1', 'autosomal_recessive'],
    ['1/1', '0/1', './.', 'autosomal_recessive_possible'],
    ['1/1', './.', '0/1', 'autosomal_recessive_possible'],
    ['0/1', '0/1', '0/0', 'autosomal_dominant'],
    ['0/0', '0/1', '0/1', 'reference'],
    ['0/1', './.', './.', 'unknown_with_missing_data'],
    ['0/1', '1/1', '1/1', 'autosomal_dominant'],
    ['./.', '0/0', '0/0', 'unknown_missing_genotype'],
  ]) {
    it(`deduces ${expected} for child ${child}, mother ${mother}, father ${father}`, () => {
      assert.ok(
        deduce(trio(child, mother, father), null, roles, { chrom: '1' }).includes(expected)
      );
    });
  }

  it('reports a possible X-linked origin with unknown sex and maternal transmission', () => {
    const result = deduce(trio('1', '0/1', '0'), null, roles, { chrom: 'chrX' });
    assert.ok(result.includes('x_linked_recessive_possible'));
  });

  for (const [call, expected] of [
    ['0/1', 'dominant'],
    ['1/1', 'homozygous'],
    ['0', 'reference'],
    ['./.', 'unknown_missing_genotype'],
  ]) {
    it(`classifies a single sample ${call} as ${expected}`, () => {
      assert.deepEqual(deduce(new Map([['child', call]]), null, null, { chrom: '1' }), [expected]);
    });
  }

  it('uses the documented default trio order and detects missing explicit members', () => {
    assert.deepEqual(deduce(trio('0/1', '0/0', '0/0'), null, null, { chrom: '1' }), ['de_novo']);
    assert.deepEqual(
      deduce(trio('0/1', '0/0', '0/0'), null, { ...roles, father: 'absent' }, { chrom: '1' }),
      ['unknown_missing_trio_genotype']
    );
    assert.deepEqual(deduce(new Map(), null, null, { chrom: '1' }), ['unknown_missing_genotypes']);
  });

  it('distinguishes unavailable pedigrees, absent affected individuals and reference calls', () => {
    assert.equal(
      checkSegregation('autosomal_dominant', new Map(), pedigree),
      'unknown_missing_data'
    );
    assert.equal(
      checkSegregation('autosomal_dominant', trio('0/1', '0/0', '0/0'), new Map()),
      'unknown_missing_data'
    );
    assert.equal(
      checkSegregation('autosomal_dominant', trio('./.', '0/0', '0/0'), pedigree),
      'unknown_missing_data'
    );
    assert.equal(
      checkSegregation('autosomal_dominant', trio('0/0', '0/1', '0/1'), pedigree),
      'does_not_segregate'
    );
    assert.equal(
      checkSegregation(
        'autosomal_dominant',
        new Map([['mother', '0/1']]),
        new Map([['mother', { affectedStatus: 1 }]])
      ),
      'unknown_no_affected'
    );
  });

  it('prioritizes established segregation evidence and handles unsupported patterns', () => {
    assert.equal(prioritizePattern([], null), 'unknown');
    assert.equal(
      prioritizePattern(
        ['autosomal_dominant', 'de_novo'],
        new Map([['de_novo', 'does_not_segregate']])
      ),
      'autosomal_dominant'
    );
    assert.equal(
      prioritizePattern(
        ['autosomal_dominant', 'de_novo'],
        new Map([
          ['de_novo', 'does_not_segregate'],
          ['autosomal_dominant', 'does_not_segregate'],
        ])
      ),
      'de_novo'
    );
    assert.equal(prioritizePattern(['novel', 'autosomal_dominant'], null), 'autosomal_dominant');
  });

  it('reads known sex codes without mistaking unknown sex for a known code', () => {
    assert.equal(isMale('child', pedigree), true);
    assert.equal(isFemale('mother', pedigree), true);
    assert.equal(isFemale('child', pedigree), false);
    assert.equal(isMale('absent', pedigree), false);
    assert.equal(isFemale('absent', pedigree), false);
  });

  it('keeps compound pairs possible when parents or genotype evidence are unavailable', () => {
    const variants = [{ variantKey: 'a' }, { variantKey: 'b' }];
    const genotypes = new Map([
      ['a', trio('0/1', '0/1', '0/0')],
      ['b', trio('0/1', '0/0', '0/1')],
    ]);
    assert.equal(
      analyzeCompoundHeterozygous(variants, genotypes, null, 'child').pattern,
      'compound_heterozygous_possible_no_pedigree'
    );
    assert.equal(
      analyzeCompoundHeterozygous(variants, genotypes, new Map([['child', {}]]), 'child').pattern,
      'compound_heterozygous_possible_missing_parents'
    );
    genotypes.get('a').delete('father');
    assert.equal(
      analyzeCompoundHeterozygous(variants, genotypes, pedigree, 'child').pattern,
      'compound_heterozygous_possible_missing_parent_genotypes'
    );
    assert.equal(analyzeCompoundHeterozygous([], genotypes, pedigree, 'child'), null);
    assert.equal(
      analyzeCompoundHeterozygous([{ variantKey: 'absent' }, {}], genotypes, pedigree, 'child'),
      null
    );
  });

  it('accounts for absent genotype keys and can use genotype sample order without pedigree', () => {
    assert.equal(analyzeInheritanceForSample([], new Map(), null, null).size, 0);
    const annotations = [
      { variantKey: '1-100-A-C', transcript_consequences: [{ gene_symbol: 'GENE' }] },
    ];
    assert.equal(
      analyzeInheritanceForSample(annotations, new Map(), null, null).get('1-100-A-C')
        .prioritizedPattern,
      'unknown_missing_genotypes'
    );
    const genotypes = new Map([['1-100-A-C', new Map([['child', '0/1']])]]);
    assert.equal(
      analyzeInheritanceForSample(annotations, genotypes, null, null).get('1-100-A-C')
        .prioritizedPattern,
      'dominant'
    );
  });
});
