'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const { getValueByPath } = require('../src/utils/pathUtils');
const { applyScoring, parseScoringConfig } = require('../src/scoring');

describe('Scoring and path integrity', () => {
  it('produces the same scores when detailed debug diagnostics are enabled', () => {
    const debug = require('debug');
    const previous = debug.disable();
    const log = sinon.stub(debug, 'log');
    const config = parseScoringConfig(
      {
        variables: {
          'items.*.raw': { target: 'value', aggregator: 'max', default: 0 },
        },
      },
      { formulas: [{ score: 'value + 1' }] }
    );
    try {
      const quiet = applyScoring([{ items: [{ raw: 5 }] }], config)[0].score;
      debug.enable('variant-linker:*');
      assert.equal(applyScoring([{ items: [{ raw: 5 }] }], config)[0].score, quiet);
      assert.ok(log.called);
    } finally {
      log.restore();
      debug.enable(previous);
    }
  });
  it('returns values for terminal wildcards over arrays and objects', () => {
    assert.deepEqual(getValueByPath({ items: [2, 3] }, 'items.*'), [2, 3]);
    assert.deepEqual(getValueByPath({ items: { a: 2, b: 3 } }, 'items.*'), [2, 3]);
    assert.equal(getValueByPath({ items: [2] }, 'items.*'), 2);
    assert.deepEqual(getValueByPath({ items: [] }, 'items.*'), []);
  });

  it('avoids serializing values when debug logging is disabled', () => {
    const object = {
      target: 2,
      toJSON() {
        throw new Error('Serialization must remain lazy');
      },
    };
    assert.deepEqual(getValueByPath({ items: [object] }, 'items.*.target'), 2);
    const config = parseScoringConfig(
      {
        variables: {
          value: { target: 'scoreInput', condition: 'value.target', default: 0 },
        },
      },
      { formulas: [{ score: 'scoreInput + 1' }] }
    );
    assert.equal(applyScoring([{ value: object }], config)[0].score, 3);
  });

  it('reuses compiled formulas and conditions across records without reusing values', () => {
    const config = parseScoringConfig(
      {
        variables: {
          raw: { target: 'cachedInput', condition: 'value * 7.123', default: 0 },
        },
      },
      { formulas: [{ score: 'cachedInput + 9.321' }] }
    );
    const compiler = sinon.spy(global, 'Function');
    try {
      const output = applyScoring([{ raw: 1 }, { raw: 2 }, { raw: 3 }], config);
      assert.deepEqual(
        output.map((value) => value.score),
        [1, 2, 3].map((value) => value * 7.123 + 9.321)
      );
      assert.equal(compiler.callCount, 2);
    } finally {
      compiler.restore();
    }
  });

  it('applies numeric aggregators and preserves array-valued unique defaults', () => {
    const config = parseScoringConfig(
      {
        variables: {
          'items.*.x': { target: 'average', aggregator: 'average', default: 3 },
          'items.*.y': 'min:minimum|default:4',
          missing: { target: 'unique', aggregator: 'unique', default: [] },
        },
      },
      { formulas: [{ score: 'average + minimum + unique.length' }] }
    );
    assert.equal(
      applyScoring(
        [
          {
            items: [
              { x: 2, y: 9 },
              { x: 4, y: 7 },
            ],
          },
        ],
        config
      )[0].score,
      10
    );
    assert.equal(applyScoring([{}], config)[0].score, 7);
  });

  it('uses configured defaults after a condition error and propagates formula errors', () => {
    const config = parseScoringConfig(
      {
        variables: {
          missing: { target: 'fallback', condition: 'value.nonexistent()', default: 5 },
        },
      },
      { formulas: [{ score: 'fallback' }] }
    );
    const warning = sinon.stub(console, 'warn');
    try {
      assert.equal(applyScoring([{}], config)[0].score, 5);
      assert.equal(warning.callCount, 1);
    } finally {
      warning.restore();
    }
    const broken = parseScoringConfig(
      { variables: {} },
      { formulas: [{ score: 'notDeclared + 1' }] }
    );
    assert.throws(() => applyScoring([{}], broken), /notDeclared/);
  });

  it('handles nested wildcard lookups, scalar leaves and annotation context fallback', () => {
    assert.deepEqual(
      getValueByPath({ groups: [{ values: [1, 2] }, { values: [3, 4] }] }, 'groups.*.values.*'),
      [
        [1, 2],
        [3, 4],
      ]
    );
    assert.deepEqual(getValueByPath({ value: 4 }, 'value.*'), []);
    assert.equal(getValueByPath({}, 'missing'), undefined);
    assert.equal(getValueByPath({ transcript: {} }, 'transcript.score', { score: 4 }), 4);
    assert.equal(getValueByPath({ values: { a: { x: 2 }, b: {} } }, 'values.*.x'), 2);
  });
});
