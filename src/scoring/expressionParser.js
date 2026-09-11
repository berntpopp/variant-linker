'use strict';
const acorn = require('acorn');
const FORBIDDEN = new Set(['constructor', 'prototype', '__proto__']);
const GLOBALS = new Set([
  'Math',
  'Number',
  'String',
  'isNaN',
  'isFinite',
  'undefined',
  'NaN',
  'Infinity',
]);
const MATH = new Set([
  'abs',
  'ceil',
  'floor',
  'round',
  'trunc',
  'sqrt',
  'exp',
  'log',
  'log10',
  'log2',
  'pow',
  'min',
  'max',
  'sign',
]);
const METHODS = new Set([
  'map',
  'filter',
  'some',
  'every',
  'reduce',
  'includes',
  'indexOf',
  'join',
  'slice',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'startsWith',
  'endsWith',
]);
const BINARY = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
]);
/** @typedef {import('acorn').AnyNode} Node */
/** @param {string} name */
function checkName(name) {
  if (FORBIDDEN.has(name)) throw new Error(`Forbidden scoring property: ${name}`);
}
/** @param {Node} node @returns {string} */
function propertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number'))
    return String(node.value);
  throw new Error('Scoring property must be a string or number');
}

/** Parse and validate the entire source, including branches not evaluated.
 * @param {string} source @param {string[]} names @returns {import('acorn').Program}
 */
function parseExpression(source, names) {
  if (source.length > 16384) throw new Error('Scoring source length limit exceeded');
  const scope = new Set(names);
  for (const name of names) {
    checkName(name);
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || GLOBALS.has(name))
      throw new Error(`Invalid scoring variable: ${name}`);
  }
  let program;
  try {
    program = acorn.parse(`(${source}\n)`, { ecmaVersion: 2022 });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    program = acorn.parse(source, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
  }
  let count = 0;
  /** @param {Node} node @param {Set<string>} bound @param {number} depth @returns {void} */
  function validate(node, bound, depth) {
    if (++count > 2048 || depth > 64) throw new Error('Scoring syntax complexity limit exceeded');
    /** @param {Node} child @returns {void} */
    const next = (child) => validate(child, bound, depth + 1);
    switch (node.type) {
      case 'Program': {
        if (node.body.length === 1 && node.body[0].type === 'ExpressionStatement')
          return next(node.body[0]);
        if (!node.body.length || node.body.at(-1)?.type !== 'ReturnStatement')
          throw new Error('Scoring program requires a final return');
        for (const [index, statement] of node.body.entries()) {
          if (
            statement.type !== 'VariableDeclaration' &&
            !(statement.type === 'ReturnStatement' && index === node.body.length - 1)
          )
            throw new Error('Only const declarations and a final return are supported');
          next(statement);
        }
        return;
      }
      case 'ExpressionStatement':
        return next(node.expression);
      case 'ReturnStatement':
        if (!node.argument) throw new Error('Scoring return requires a value');
        return next(node.argument);
      case 'VariableDeclaration':
        if (node.kind !== 'const') throw new Error('Only const declarations are supported');
        for (const declaration of node.declarations) {
          if (declaration.id.type !== 'Identifier' || !declaration.init)
            throw new Error('Scoring const requires an initialized name');
          const name = declaration.id.name;
          checkName(name);
          if (bound.has(name) || GLOBALS.has(name))
            throw new Error(`Duplicate scoring variable: ${name}`);
          next(declaration.init);
          bound.add(name);
        }
        return;
      case 'Identifier':
        checkName(node.name);
        if (!bound.has(node.name) && !GLOBALS.has(node.name))
          throw new Error(`Unknown scoring variable: ${node.name}`);
        return;
      case 'Literal':
        if ('regex' in node || 'bigint' in node)
          throw new Error('Regular expressions and bigint are unsupported');
        return;
      case 'UnaryExpression':
        if (!['!', '+', '-', 'typeof'].includes(node.operator))
          throw new Error(`Unsupported unary operator: ${node.operator}`);
        return next(node.argument);
      case 'BinaryExpression':
        if (!BINARY.has(node.operator))
          throw new Error(`Unsupported binary operator: ${node.operator}`);
        next(node.left);
        return next(node.right);
      case 'LogicalExpression':
        next(node.left);
        return next(node.right);
      case 'ConditionalExpression':
        next(node.test);
        next(node.consequent);
        return next(node.alternate);
      case 'ArrayExpression':
        for (const item of node.elements) {
          if (!item) throw new Error('Sparse array literals are unsupported');
          next(item);
        }
        return;
      case 'SpreadElement':
        return next(node.argument);
      case 'ObjectExpression':
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.kind !== 'init' || property.method)
            throw new Error('Only object data properties are supported');
          if (property.computed) next(property.key);
          else checkName(propertyName(property.key));
          next(property.value);
        }
        return;
      case 'MemberExpression':
        if (node.optional) throw new Error('Optional access is unsupported');
        next(node.object);
        if (node.computed) next(node.property);
        else checkName(propertyName(node.property));
        return;
      case 'ArrowFunctionExpression': {
        if (node.async || node.body.type === 'BlockStatement')
          throw new Error('Only expression arrow callbacks are supported');
        const inner = new Set(bound);
        for (const parameter of node.params) {
          if (parameter.type !== 'Identifier') throw new Error('Callback parameters must be names');
          checkName(parameter.name);
          if (GLOBALS.has(parameter.name))
            throw new Error('Callback cannot shadow scoring builtins');
          inner.add(parameter.name);
        }
        return validate(node.body, inner, depth + 1);
      }
      case 'CallExpression': {
        if (node.optional) throw new Error('Optional calls are unsupported');
        const callee = node.callee;
        if (callee.type === 'Identifier') {
          if (!['Number', 'String', 'isNaN', 'isFinite'].includes(callee.name))
            throw new Error(`Unsupported scoring call: ${callee.name}`);
        } else if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier'
        ) {
          const method = callee.property.name;
          const allowed =
            callee.object.type === 'Identifier' && callee.object.name === 'Math' ? MATH : METHODS;
          if (!allowed.has(method)) throw new Error(`Unsupported scoring method: ${method}`);
          next(callee.object);
        } else throw new Error('Only explicit scoring builtin calls are supported');
        for (const argument of node.arguments) next(argument);
        return;
      }
      default:
        throw new Error(`Unsupported scoring syntax: ${node.type}`);
    }
  }
  validate(program, scope, 0);
  return program;
}
module.exports = { parseExpression, checkName, propertyName };
