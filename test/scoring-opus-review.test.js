'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const debug = require('debug');
const { evaluateExpression } = require('../src/scoring/expressionEvaluator');
const { applyScoring, readScoringConfigFromFiles } = require('../src/scoring');
const path = require('node:path');

describe('Opus scoring review regressions', () => {
  afterEach(() => sinon.restore());
  it('caches invalid conditions and emits one diagnostic across repeated records', () => {
    const parser = sinon.spy(require('acorn'), 'parse');
    const warning = sinon.stub(console, 'warn');
    const result = applyScoring([{ raw: 1 }, { raw: 2 }, { raw: 3 }], {
      variables: {
        raw: { target: 'fallback', condition: 'process.invalidNegativeCache', default: 3 },
      },
      formulas: { annotationLevel: [{ score: 'fallback' }], transcriptLevel: [] },
    });
    assert.deepEqual(
      result.map((item) => item.score),
      [3, 3, 3]
    );
    assert.equal(parser.callCount, 2);
    assert.equal(warning.callCount, 1);
  });
  it('charges scope capture and callback bindings against the shared operation budget', () => {
    const variables = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`v${i}`, i]));
    variables.value = Array(1000).fill(1);
    assert.throws(() => evaluateExpression('value.map(x=>x)', variables), /operation limit/);
  });
  it('supports safe primitive table keys without invoking object coercion', () => {
    for (const value of [null, undefined, false, true]) {
      assert.equal(
        evaluateExpression('({null:1,undefined:2,false:3,true:4})[value]', { value }),
        [null, undefined, false, true].indexOf(value) + 1
      );
    }
    assert.throws(
      () =>
        evaluateExpression('({x:1})[value]', {
          value: {
            toString() {
              throw new Error('hook');
            },
          },
        }),
      /property/
    );
  });
  it('evaluates every named formula in the bundled aggregator model', () => {
    const config = readScoringConfigFromFiles(path.join(__dirname, '../scoring/test_aggregator'));
    const result = applyScoring(
      [{ colocated_variants: [{ frequencies: { C: { gnomade: 0.2267 } } }] }],
      config
    )[0];
    assert.equal(result.test_score, 0);
    assert.equal(result.actual_gnomade_value, 0.2267);
  });
  it('preserves documented string defaults in legacy mappings', () => {
    const result = applyScoring([{}], {
      variables: { missing: 'unique:impact|default:LOW' },
      formulas: { annotationLevel: [{ score: 'impact' }], transcriptLevel: [] },
    });
    assert.deepEqual(result[0].score, ['LOW']);
  });
  it('rejects invalid variable names identically with detailed debugging enabled', () => {
    const previous = debug.disable();
    const log = sinon.stub(debug, 'log');
    const config = {
      variables: { raw: { target: 'a)' } },
      formulas: { annotationLevel: [{ score: '1' }], transcriptLevel: [] },
    };
    try {
      debug.enable('variant-linker:*');
      assert.throws(() => applyScoring([{ raw: 1 }], config), /Invalid scoring variable/);
    } finally {
      log.restore();
      debug.enable(previous);
    }
  });
  it('rejects arrows outside callback positions instead of emitting opaque tokens', () => {
    for (const source of ['x=>x', 'typeof (x=>x)', '[1].map(x=>(y=>y))'])
      assert.throws(() => evaluateExpression(source, {}), /callback/);
  });
});
