'use strict';
const assert = require('node:assert/strict');
const defaults = require('../config/scoringLimits.json');
const { validateLimits, limits } = require('../src/scoring/limits');

describe('Configured scoring resource limits', () => {
  it('loads the documented defaults into an immutable runtime snapshot', () => {
    assert.deepEqual(limits, defaults);
    assert.ok(Object.isFrozen(limits));
    const custom = validateLimits({ ...defaults, maxOperations: 1234 });
    assert.equal(custom.maxOperations, 1234);
    assert.ok(Object.isFrozen(custom));
  });
  it('rejects missing, unknown, fractional, nonfinite and unsafe budgets', () => {
    for (const value of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '10']) {
      assert.throws(() => validateLimits({ ...defaults, maxOperations: value }), /maxOperations/);
    }
    const missing = { ...defaults };
    delete missing.maxOperations;
    assert.throws(() => validateLimits(missing), /maxOperations/);
    assert.throws(() => validateLimits({ ...defaults, typo: 1 }), /Unknown/);
    assert.throws(() => validateLimits(null), /object/);
  });
});
