'use strict';
const assert = require('node:assert/strict');
const sinon = require('sinon');
const { evaluateExpression: evaluate } = require('../src/scoring/expressionEvaluator');
const { applyScoring, readScoringConfigFromFiles } = require('../src/scoring');
const path = require('node:path');

describe('Scoring expression compatibility and boundaries', () => {
  it('preserves arithmetic, comparison, coercion and lazy operators', () => {
    assert.equal(evaluate('value == null', { value: {} }), false);
    assert.equal(evaluate('undefined != value', { value: {} }), true);
    const cases = [
      ['1 + 2 * 3', 7],
      ['10 / 2 - 1', 4],
      ['7 % 4', 3],
      ['2 ** 3', 8],
      ['"a" + 1', 'a1'],
      ['+"4"', 4],
      ['-2', -2],
      ['!0', true],
      ['typeof 3', 'number'],
      ['1 === 1', true],
      ['1 !== "1"', true],
      ['1 == "1"', true],
      ['true == 1', true],
      ['false == "0"', true],
      ['null == undefined', true],
      ['null == 0', false],
      ['1 != 2', true],
      ['"a" == "b"', false],
      ['NaN == NaN', false],
      ['false == false', true],
      ['[] == []', false],
      ['[] != []', true],
      ['value == value', true],
      ['"a" < "b"', true],
      ['"a" <= "a"', true],
      ['"b" > "a"', true],
      ['"b" >= "a"', true],
      ['2 < 3', true],
      ['2 <= 2', true],
      ['3 >= 2', true],
      ['false && null.missing', false],
      ['true && 3', 3],
      ['true || null.missing', true],
      ['false || 3', 3],
      ['0 ?? null.missing', 0],
      ['null ?? 3', 3],
      ['true ? 1 : null.missing', 1],
      ['false ? null.missing : 2', 2],
      ['Number()', 0],
      ['Number("2")', 2],
      ['Number(["2"])', 2],
      ['String()', ''],
      ['String([1,null,[2,3]])', '1,,2,3'],
      ['isNaN("x")', true],
      ['isFinite(Infinity)', false],
      ['Math.PI', Math.PI],
      ['Math.pow(2,3)', 8],
      ['[1,...[2,3]].length', 3],
      ['({x: 4}).x', 4],
      ['({["x"]: 3})["x"]', 3],
      ['"abc"[1]', 'b'],
      ['const x = 2, y = 3; return x + y;', 5],
      ['value > 0.8', true],
    ];
    for (const [source, expected] of cases)
      assert.deepEqual(evaluate(source, { value: [0.9] }), expected, source);
  });

  it('supports only explicit data methods and interpreted callbacks', () => {
    const input = { value: [1, 2] };
    assert.deepEqual(evaluate('value.map((x,i,a)=>a===value)', input), [true, true]);
    assert.equal(evaluate('value.reduce((sum,x,i,a)=>sum+(a===value ? x : 0),0)', input), 3);
    const cases = [
      ['[1,2,3].map((x,i,a)=>x+i+a.length)', [4, 6, 8]],
      ['[1,2,3].filter(x=>x>1)', [2, 3]],
      ['[1,2].some(x=>x===2)', true],
      ['[1,2].every(x=>x>0)', true],
      ['[1,2,3].reduce((sum,x)=>sum+x,0)', 6],
      ['[1,2,3].reduce((sum,x)=>sum+x)', 6],
      ['[].reduce((sum,x)=>sum+x,4)', 4],
      ['[1,2].includes(1)', true],
      ['[1,2].includes(1,1)', false],
      ['[1,2].indexOf(2)', 1],
      ['[1,2].indexOf(1,1)', -1],
      ['[1,2,3].slice(1,2)', [2]],
      ['[1,2].slice()', [1, 2]],
      ['[1,null,2].join()', '1,,2'],
      ['[1,2].join("-")', '1-2'],
      ['"abc".includes("a")', true],
      ['"abc".includes("a",1)', false],
      ['"abc".indexOf("b")', 1],
      ['"abc".indexOf("a",1)', -1],
      ['"abc".startsWith("a")', true],
      ['"abc".startsWith("b",1)', true],
      ['"abc".endsWith("c")', true],
      ['"abc".endsWith("b",2)', true],
      ['"abc".slice()', 'abc'],
      ['"abc".slice(1,2)', 'b'],
      ['" X ".trim().toLowerCase().toUpperCase()', 'X'],
    ];
    for (const [source, expected] of cases)
      assert.deepEqual(evaluate(source, {}), expected, source);
    for (const source of [
      '[].reduce(x=>x)',
      '[1].map(3)',
      '"x".map(x=>x)',
      '[1].trim()',
      '3.includes(1)',
      'null.x',
      'Math',
      'Math.exp',
      'Math.unknown',
    ]) {
      assert.throws(() => evaluate(source, {}), undefined, source);
    }
  });

  it('rejects unsupported programs, callbacks, properties and variable bindings', () => {
    for (const source of [
      '',
      'const x=1;',
      'return;',
      'let x=1; return x;',
      'const {x}=value; return x;',
      'const x=1; const x=2; return x;',
      'const Math=1; return Math;',
      'true; return 1;',
      'value?.x',
      'value?.map(x=>x)',
      'value["map"](x=>x)',
      'value.map(async x=>x)',
      'value.map(({x})=>x)',
      'value.map(Math=>Math)',
      '[,1]',
      '({...value})',
      'delete value.x',
      '"x" in value',
      '1n',
      '({constructor: 1})',
      '({["__proto__"]: 1})',
    ])
      assert.throws(() => evaluate(source, { value: [1] }), undefined, source);
    for (const name of ['__proto__', 'constructor', 'prototype', 'Math', 'has space']) {
      const values = Object.create(null);
      values[name] = 3;
      assert.throws(() => evaluate('1', values), undefined, name);
    }
  });

  it('uses a bounded parsed-source cache without retaining variable values', () => {
    const parser = sinon.spy(require('acorn'), 'parse');
    const executable = sinon.spy(global, 'Function');
    try {
      for (let index = 0; index < 260; index++)
        assert.equal(evaluate(`value + ${10000 + index}`, { value: index }), 10000 + 2 * index);
      const before = parser.callCount;
      assert.equal(evaluate('value + 10259', { value: 1 }), 10260);
      assert.equal(parser.callCount, before);
      assert.equal(evaluate('value + 10000', { value: 2 }), 10002);
      assert.equal(parser.callCount, before + 1);
      assert.equal(executable.callCount, 0);
    } finally {
      parser.restore();
      executable.restore();
    }
  });

  it('runs every bundled model with real configuration and intergenic defaults', () => {
    for (const name of [
      'cnv_score_example',
      'meta_score_example',
      'nephro_variant_score',
      'test_aggregator',
    ]) {
      const config = readScoringConfigFromFiles(path.join(__dirname, '../scoring', name));
      const variants = [
        {
          transcript_consequences: [
            { cadd_phred: 20, impact: 'LOW', consequence_terms: ['synonymous_variant'] },
          ],
        },
        {},
      ];
      const result = applyScoring(variants, config);
      assert.equal(result.length, 2);
      for (const formula of config.formulas.annotationLevel) {
        const field = Object.keys(formula)[0];
        assert.notEqual(result[0][field], undefined, `${name}: ${field}`);
        assert.notEqual(result[1][field], undefined, `${name}: intergenic ${field}`);
      }
    }
  });
});
