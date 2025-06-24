// src/utils/pathUtils.js
'use strict';

/**
 * @fileoverview Utility functions for working with object paths
 * @module utils/pathUtils
 */

const debug = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Gets a value from an object using dot notation path.
 * Supports wildcard (*) for array iteration and object traversal.
 *
 * @param {Object} obj - The object to extract value from
 * @param {string} path - The dot notation path (e.g., "field.subfield" or "array.*.property")
 * @param {Object} [context] - Optional context object to fall back to if path not found in obj
 * @returns {*} The value at the path, or undefined if not found
 */
function getValueByPath(obj, path, context) {
  const parts = path.split('.');
  let value = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '*') {
      if (Array.isArray(value)) {
        debug(`Wildcard found, iterating over array: ${JSON.stringify(value)}`);
        const remainder = parts.slice(i + 1).join('.');
        const results = value
          .map((item) => getValueByPath(item, remainder, context))
          .filter((v) => v !== null && v !== undefined);
        return results.length === 1 ? results[0] : results;
      } else if (value && typeof value === 'object') {
        debug(`Wildcard encountered but value is not an array: ${JSON.stringify(value)}`);
        const remainder = parts.slice(i + 1).join('.');
        const results = [];
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const nestedValue = getValueByPath(value[key], remainder, context);
            if (nestedValue !== undefined) {
              results.push(nestedValue);
            }
          }
        }
        return results.length === 1 ? results[0] : results;
      } else {
        debug(`Wildcard found but value is not traversable: ${JSON.stringify(value)}`);
        return [];
      }
    } else if (value && Object.prototype.hasOwnProperty.call(value, part)) {
      value = value[part];
      debug(`Navigated to part: ${part}, value: ${JSON.stringify(value)}`);
    } else if (context && Object.prototype.hasOwnProperty.call(context, part)) {
      value = context[part];
      debug(`Using context for part ${part}; value: ${JSON.stringify(value)}`);
    } else {
      // Log part not found in debug mode
      debugAll(`Part not found: ${part}`);
      return undefined;
    }
  }

  debugAll(`Final value: ${JSON.stringify(value)}`);
  return value;
}

module.exports = {
  getValueByPath,
};
