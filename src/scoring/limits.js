'use strict';
const defaults = require('../../config/scoringLimits.json');
/** @typedef {typeof defaults} ScoringLimits */
const keys = /** @type {const} */ ([
  'maxSourceLength',
  'maxVariables',
  'maxVariableNameLength',
  'maxAstNodes',
  'maxAstDepth',
  'maxEvaluationDepth',
  'maxValueDepth',
  'maxOperations',
  'maxCollectionSize',
  'expressionCacheSize',
  'conditionWarningCacheSize',
]);
/** Validate resource configuration; syntax capabilities remain fixed in the interpreter.
 * @param {unknown} input @returns {Readonly<ScoringLimits>}
 */
function validateLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Scoring limits must be an object');
  const record = /** @type {Record<string,unknown>} */ (input);
  for (const key of Object.keys(record)) {
    if (!keys.some((name) => name === key)) throw new Error(`Unknown scoring limit: ${key}`);
  }
  const result = { ...defaults };
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Scoring limit ${key} must be a positive safe integer`);
    result[key] = value;
  }
  return Object.freeze(result);
}
const limits = validateLimits(defaults);
module.exports = { limits, validateLimits };
