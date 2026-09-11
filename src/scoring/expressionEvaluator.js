'use strict';
const { parseExpression, propertyName } = require('./expressionParser');
const { spend, keyOf, read, array, primitive, binary } = require('./expressionValues');
/** @typedef {import('acorn').AnyNode} Node */
/** @typedef {Map<string,unknown>} Scope */
/** @typedef {{node:import('acorn').ArrowFunctionExpression,scope:Scope}} Closure */
/** @type {Map<string, import('acorn').Program>} */
const cache = new Map();
/** @type {Record<string,(...args:number[])=>number>} */
const math = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  trunc: Math.trunc,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  sign: Math.sign,
};
/** @type {Record<string,number>} */
const constants = { PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10, SQRT2: Math.SQRT2 };

/** Evaluate a restricted expression against data; cached syntax never retains values.
 * @param {string} source @param {Record<string,unknown>} variables @returns {unknown}
 */
function evaluateExpression(source, variables) {
  const names = Object.keys(variables);
  const key = JSON.stringify([source, names]);
  let program = cache.get(key);
  if (!program) {
    program = parseExpression(source, names);
    if (cache.size >= 256) cache.clear();
    cache.set(key, program);
  }
  const scope = new Map(names.map((name) => [name, read(variables, name)]));
  const budget = { remaining: 100000, depth: 0 };
  /** @type {WeakMap<object,Closure>} */
  const closures = new WeakMap();
  /** @param {unknown} value @returns {number} */
  const numeric = (value) => Number(primitive(value, budget));
  /** @param {unknown} value @returns {string} */
  const string = (value) => String(primitive(value, budget));

  /** @param {unknown} callback @param {unknown[]} args @returns {unknown} */
  function invoke(callback, args) {
    spend(budget);
    const closure = callback && typeof callback === 'object' ? closures.get(callback) : undefined;
    if (!closure) throw new Error('Scoring callback must be an expression arrow');
    const local = new Map(closure.scope);
    closure.node.params.forEach((parameter, index) => {
      if (parameter.type === 'Identifier') local.set(parameter.name, args[index]);
    });
    return evaluate(closure.node.body, local);
  }

  /** @param {string} method @param {unknown} receiver @param {unknown[]} args @returns {unknown} */
  function methodCall(method, receiver, args) {
    if (typeof receiver === 'string') {
      spend(budget, receiver.length);
      switch (method) {
        case 'includes':
          return receiver.includes(string(args[0]), args[1] === undefined ? 0 : numeric(args[1]));
        case 'indexOf':
          return receiver.indexOf(string(args[0]), args[1] === undefined ? 0 : numeric(args[1]));
        case 'startsWith':
          return receiver.startsWith(string(args[0]), args[1] === undefined ? 0 : numeric(args[1]));
        case 'endsWith':
          return receiver.endsWith(
            string(args[0]),
            args[1] === undefined ? undefined : numeric(args[1])
          );
        case 'slice':
          return receiver.slice(
            args[0] === undefined ? 0 : numeric(args[0]),
            args[1] === undefined ? undefined : numeric(args[1])
          );
        case 'toLowerCase':
          return receiver.toLowerCase();
        case 'toUpperCase':
          return receiver.toUpperCase();
        case 'trim':
          return receiver.trim();
        default:
          throw new Error(`Unsupported scoring string method: ${method}`);
      }
    }
    const items = array(receiver, budget);
    switch (method) {
      case 'map':
        return items.map((value, index) => invoke(args[0], [value, index, receiver]));
      case 'filter':
        return items.filter((value, index) => invoke(args[0], [value, index, receiver]));
      case 'some':
        return items.some((value, index) => invoke(args[0], [value, index, receiver]));
      case 'every':
        return items.every((value, index) => invoke(args[0], [value, index, receiver]));
      case 'reduce': {
        if (!items.length && args.length < 2)
          throw new Error('Cannot reduce an empty scoring array without an initial value');
        let accumulator = args.length >= 2 ? args[1] : items[0];
        for (let index = args.length >= 2 ? 0 : 1; index < items.length; index++)
          accumulator = invoke(args[0], [accumulator, items[index], index, receiver]);
        return accumulator;
      }
      case 'includes':
        return items.includes(args[0], args[1] === undefined ? 0 : numeric(args[1]));
      case 'indexOf':
        return items.indexOf(args[0], args[1] === undefined ? 0 : numeric(args[1]));
      case 'slice':
        return items.slice(
          args[0] === undefined ? 0 : numeric(args[0]),
          args[1] === undefined ? undefined : numeric(args[1])
        );
      case 'join': {
        const separator = args[0] === undefined ? ',' : string(args[0]);
        const parts = items.map((value) =>
          value === null || value === undefined ? '' : string(value)
        );
        spend(
          budget,
          parts.reduce((length, item) => length + item.length, 0) +
            Math.max(0, parts.length - 1) * separator.length
        );
        return parts.join(separator);
      }
      default:
        throw new Error(`Unsupported scoring array method: ${method}`);
    }
  }

  /** @param {(import('acorn').Expression|import('acorn').SpreadElement)[]} nodes @param {Scope} local @returns {unknown[]} */
  function argumentsFor(nodes, local) {
    const result = [];
    for (const node of nodes) {
      if (node.type === 'SpreadElement')
        result.push(...array(evaluate(node.argument, local), budget));
      else result.push(evaluate(node, local));
      if (result.length > 10000) throw new Error('Scoring collection size limit exceeded');
    }
    return result;
  }

  /** @param {import('acorn').CallExpression} node @param {Scope} local @returns {unknown} */
  function call(node, local) {
    const callee = node.callee;
    const args = argumentsFor(node.arguments, local);
    if (callee.type === 'Identifier') {
      switch (callee.name) {
        case 'Number':
          return args.length ? numeric(args[0]) : 0;
        case 'String':
          return args.length ? string(args[0]) : '';
        case 'isNaN':
          return Number.isNaN(numeric(args[0]));
        case 'isFinite':
          return Number.isFinite(numeric(args[0]));
        default:
          throw new Error('Unsupported scoring builtin');
      }
    }
    if (callee.type !== 'MemberExpression') throw new Error('Unsupported scoring call');
    const method = propertyName(callee.property);
    if (callee.object.type === 'Identifier' && callee.object.name === 'Math') {
      const operation = math[method];
      if (!Object.hasOwn(math, method) || !operation)
        throw new Error('Unsupported scoring Math method');
      return operation(...args.map(numeric));
    }
    return methodCall(method, evaluate(callee.object, local), args);
  }

  /** @param {Node} node @param {Scope} local @returns {unknown} */
  function evaluate(node, local) {
    spend(budget);
    if (++budget.depth > 128) throw new Error('Scoring evaluation depth limit exceeded');
    try {
      switch (node.type) {
        case 'Program': {
          let result;
          for (const statement of node.body) result = evaluate(statement, local);
          return result;
        }
        case 'ExpressionStatement':
          return evaluate(node.expression, local);
        case 'ReturnStatement':
          return node.argument ? evaluate(node.argument, local) : undefined;
        case 'VariableDeclaration':
          for (const declaration of node.declarations) {
            if (declaration.id.type === 'Identifier' && declaration.init)
              local.set(declaration.id.name, evaluate(declaration.init, local));
          }
          return undefined;
        case 'Identifier':
          if (local.has(node.name)) return local.get(node.name);
          if (node.name === 'undefined') return undefined;
          if (node.name === 'NaN') return NaN;
          if (node.name === 'Infinity') return Infinity;
          throw new Error(`Scoring builtin cannot be used as a value: ${node.name}`);
        case 'Literal':
          return node.value;
        case 'UnaryExpression': {
          const value = evaluate(node.argument, local);
          if (node.operator === '!') return !value;
          if (node.operator === 'typeof') return typeof value;
          return node.operator === '-' ? -numeric(value) : numeric(value);
        }
        case 'BinaryExpression':
          return binary(
            node.operator,
            evaluate(node.left, local),
            evaluate(node.right, local),
            budget
          );
        case 'LogicalExpression': {
          const left = evaluate(node.left, local);
          if (node.operator === '&&') return left ? evaluate(node.right, local) : left;
          if (node.operator === '||') return left ? left : evaluate(node.right, local);
          return left ?? evaluate(node.right, local);
        }
        case 'ConditionalExpression':
          return evaluate(node.test, local)
            ? evaluate(node.consequent, local)
            : evaluate(node.alternate, local);
        case 'MemberExpression': {
          const property = node.computed
            ? keyOf(evaluate(node.property, local))
            : propertyName(node.property);
          if (node.object.type === 'Identifier' && node.object.name === 'Math') {
            if (!Object.hasOwn(constants, property))
              throw new Error(`Unsupported scoring Math constant: ${property}`);
            return constants[property];
          }
          return read(evaluate(node.object, local), property);
        }
        case 'ObjectExpression': {
          /** @type {Record<string,unknown>} */
          const result = Object.create(null);
          for (const property of node.properties) {
            if (property.type !== 'Property') throw new Error('Unsupported scoring property');
            const key = property.computed
              ? keyOf(evaluate(property.key, local))
              : propertyName(property.key);
            result[key] = evaluate(property.value, local);
          }
          return result;
        }
        case 'ArrayExpression':
          return argumentsFor(
            node.elements.filter((item) => item !== null),
            local
          );
        case 'ArrowFunctionExpression': {
          const token = Object.create(null);
          closures.set(token, { node, scope: new Map(local) });
          return token;
        }
        case 'CallExpression':
          return call(node, local);
        default:
          throw new Error(`Unsupported scoring syntax: ${node.type}`);
      }
    } finally {
      budget.depth--;
    }
  }
  return evaluate(program, scope);
}
module.exports = { evaluateExpression };
