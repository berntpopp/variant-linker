'use strict';
const { checkName } = require('./expressionParser');
/** @typedef {{remaining:number, depth:number}} Budget */
/** @param {Budget} budget @param {number} [amount] */
function spend(budget, amount = 1) {
  budget.remaining -= amount;
  if (budget.remaining < 0) throw new Error('Scoring operation limit exceeded');
}
/** @param {unknown} value @returns {string} */
function keyOf(value) {
  if (value !== null && !['string', 'number', 'boolean', 'undefined'].includes(typeof value))
    throw new Error('Scoring property must be primitive data');
  const key = String(value);
  checkName(key);
  return key;
}
/** Read data without running accessors or following a prototype chain.
 * @param {unknown} value @param {string} key @returns {unknown}
 */
function read(value, key) {
  checkName(key);
  if (value === null || value === undefined) throw new Error('Cannot read missing scoring value');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    if (key in Object(value)) throw new Error(`Inherited scoring property is forbidden: ${key}`);
    return undefined;
  }
  if (!('value' in descriptor) || typeof descriptor.value === 'function')
    throw new Error(`Scoring property must contain data: ${key}`);
  return descriptor.value;
}
/** @param {unknown} value @param {Budget} budget @returns {unknown[]} */
function array(value, budget) {
  if (!Array.isArray(value)) throw new Error('Scoring method requires an array');
  const length = read(value, 'length');
  if (typeof length !== 'number' || length > 10000)
    throw new Error('Scoring collection size limit exceeded');
  spend(budget, length);
  return Array.from({ length }, (_, index) => read(value, String(index)));
}
/** Convert only data, never user-provided coercion hooks.
 * @param {unknown} value @param {Budget} budget @param {number} [depth]
 * @returns {string|number|boolean|null|undefined}
 */
function primitive(value, budget, depth = 0) {
  if (depth > 64) throw new Error('Scoring value depth limit exceeded');
  if (typeof value === 'string') spend(budget, value.length);
  if (value === null || ['undefined', 'number', 'string', 'boolean'].includes(typeof value)) {
    return /** @type {string|number|boolean|null|undefined} */ (value);
  }
  if (Array.isArray(value)) {
    const parts = array(value, budget).map((item) =>
      item === null || item === undefined ? '' : String(primitive(item, budget, depth + 1))
    );
    spend(
      budget,
      parts.reduce((length, item) => length + item.length + 1, 0)
    );
    return parts.join(',');
  }
  throw new Error('Scoring coercion requires primitive data');
}
/** JavaScript abstract equality over the supported primitive domain.
 * @param {ReturnType<typeof primitive>} left @param {ReturnType<typeof primitive>} right
 */
function equal(left, right) {
  if (left === right) return true;
  if ((left === null && right === undefined) || (left === undefined && right === null)) return true;
  if (left === null || right === null || left === undefined || right === undefined) return false;
  const a = typeof left === 'boolean' ? Number(left) : left;
  const b = typeof right === 'boolean' ? Number(right) : right;
  if (typeof a === typeof b) return a === b;
  return Number(a) === Number(b);
}
/** @param {string} operator @param {unknown} left @param {unknown} right @param {Budget} budget @returns {unknown} */
function binary(operator, left, right, budget) {
  if (operator === '===') return left === right;
  if (operator === '!==') return left !== right;
  if (
    (operator === '==' || operator === '!=') &&
    (left === null || left === undefined || right === null || right === undefined)
  ) {
    const same = (left === null || left === undefined) && (right === null || right === undefined);
    return operator === '==' ? same : !same;
  }
  if (
    (operator === '==' || operator === '!=') &&
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object'
  )
    return operator === '==' ? left === right : left !== right;
  const a = primitive(left, budget),
    b = primitive(right, budget);
  switch (operator) {
    // Abstract equality operates only on validated primitives.
    case '==':
      return equal(a, b);
    case '!=':
      return !equal(a, b);
    case '+':
      return typeof a === 'string' || typeof b === 'string'
        ? String(a) + String(b)
        : Number(a) + Number(b);
    case '-':
      return Number(a) - Number(b);
    case '*':
      return Number(a) * Number(b);
    case '/':
      return Number(a) / Number(b);
    case '%':
      return Number(a) % Number(b);
    case '**':
      return Number(a) ** Number(b);
    case '<':
      return typeof a === 'string' && typeof b === 'string' ? a < b : Number(a) < Number(b);
    case '<=':
      return typeof a === 'string' && typeof b === 'string' ? a <= b : Number(a) <= Number(b);
    case '>':
      return typeof a === 'string' && typeof b === 'string' ? a > b : Number(a) > Number(b);
    case '>=':
      return typeof a === 'string' && typeof b === 'string' ? a >= b : Number(a) >= Number(b);
    default:
      throw new Error(`Unsupported scoring operator: ${operator}`);
  }
}
module.exports = { spend, keyOf, read, array, primitive, binary };
