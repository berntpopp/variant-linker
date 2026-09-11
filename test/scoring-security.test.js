'use strict';
const assert = require('node:assert/strict');
const { applyScoring, readScoringConfigFromFiles } = require('../src/scoring');
const path = require('node:path');

function score(expression, value = 3) {
  return applyScoring([{ raw: value }], {
    variables: { raw: 'value' },
    formulas: { annotationLevel: [{ score: expression }], transcriptLevel: [] },
  })[0].score;
}

describe('Restricted scoring expressions', () => {
  it('rejects host globals and constructor escapes', () => {
    for (const expression of [
      'typeof process',
      'globalThis',
      'typeof require',
      'typeof Function',
      'typeof eval',
      'value.constructor',
      'value["con" + "structor"]',
      '({}).__proto__',
      'Math.exp.constructor',
      '(()=>1).constructor',
      'value.toString()',
      'Object.keys(value)',
      'Math.exp.call(null, 1)',
    ])
      assert.throws(() => score(expression), undefined, expression);
  });

  it('does not invoke supplied accessors, functions or coercion hooks', () => {
    let invoked = 0;
    const value = {
      get secret() {
        invoked++;
        return 1;
      },
      action() {
        invoked++;
        return 1;
      },
      valueOf() {
        invoked++;
        return 1;
      },
    };
    for (const expression of ['value.secret', 'value.action()', 'value + 1']) {
      assert.throws(() => score(expression, value));
    }
    assert.equal(invoked, 0);
    assert.throws(() => score('value.hidden', Object.create({ hidden: 42 })));
  });

  it('returns data objects without invoking implicit debug coercion', () => {
    const value = {
      target: 3,
      toString() {
        throw new Error('Unrequested coercion');
      },
    };
    assert.equal(score('value', value), value);
    assert.equal(score('({target: value})').target, 3);
  });

  it('rejects mutation and unsupported syntax even in unexecuted branches', () => {
    for (const expression of [
      'value = 5',
      'value++',
      'new Date()',
      'true ? 1 : process',
      '(function(){ return 1; })()',
      '(()=>{ while(true){} })()',
      '({get x(){ return 1; }}).x',
      'import("fs")',
      '/a+/.test("a")',
    ])
      assert.throws(() => score(expression), undefined, expression);
  });

  it('rejects prototype keys in score names and variable targets', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const annotation = { raw: 2 };
      const formulas = { annotationLevel: [{ [key]: '({changed: true})' }], transcriptLevel: [] };
      assert.throws(() => applyScoring([annotation], { variables: {}, formulas }));
      assert.equal(Object.getPrototypeOf(annotation), Object.prototype);
      assert.equal(Object.hasOwn(annotation, key), false);
      assert.throws(() =>
        applyScoring([annotation], {
          variables: { raw: { target: key } },
          formulas: { annotationLevel: [{ score: '1' }], transcriptLevel: [] },
        })
      );
    }
  });

  it('supports numerical expressions, safe lookup, callbacks and constant programs', () => {
    assert.equal(
      score('Math.max(...value.map(x => ({ HIGH: 4, LOW: 2 }[x] || 0)))', ['HIGH', 'LOW']),
      4
    );
    assert.equal(score('const x = value * 2; const y = Math.min(x, 10); return y + 1;'), 7);
    assert.equal(score('value > 2 && value < 5 ? Math.exp(0) : 0'), 1);
    assert.equal(score('value.target', { target: 8 }), 8);
    assert.equal(score('value ? 1 : value.missing', 0), undefined);
  });

  it('runs the bundled CNV model from its real configuration', () => {
    const config = readScoringConfigFromFiles(path.join(__dirname, '../scoring/cnv_score_example'));
    const result = applyScoring(
      [
        {
          dosage_sensitivity: { phaplo: 3, ptriplo: 0 },
          phenotypes: ['phenotype'],
          transcript_consequences: [
            {
              consequence_terms: ['feature_truncation'],
              bp_overlap: 60000,
            },
          ],
        },
      ],
      config
    )[0];
    assert.equal(result.cnv_pathogenicity_score, 46);
    assert.equal(result.transcript_consequences[0].transcript_cnv_impact, 'HIGH_IMPACT');
  });

  it('enforces syntax, collection, nested callback and string expansion budgets', () => {
    assert.throws(() => score('1'.repeat(16385)), /length limit/);
    assert.throws(() => score('[' + Array(2200).fill('1').join(',') + ']'), /complexity limit/);
    assert.throws(() => score('1+'.repeat(100) + '1'), /complexity limit/);
    assert.throws(() => score('value.map(x => x)', Array(10001).fill(1)), /collection size limit/);
    assert.throws(
      () => score('value.map(x => value.map(y => x + y))', Array(1000).fill(1)),
      /operation limit/
    );
    assert.throws(
      () => score('value.join(" ".repeat(100000))', [1, 2]),
      /Unsupported scoring method/
    );
    assert.throws(
      () => score('value.join("xxxxxxxxxxxxxxxxxxxx")', Array(10000).fill('')),
      /operation limit/
    );
    const doubling = Array.from(
      { length: 20 },
      (_, i) => `const a${i} = ${i ? `a${i - 1} + a${i - 1}` : '"xxxxxxxxxx"'};`
    ).join('');
    assert.throws(() => score(doubling + 'return a19;'), /operation limit/);
  });
});
