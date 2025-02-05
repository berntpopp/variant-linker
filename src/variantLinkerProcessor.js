'use strict';
// src/variantLinkerProcessor.js

/**
 * @fileoverview Processes variant linking by combining data from Variant Recoder
 * and VEP annotation calls, filters and formats the results, and outputs them.
 * Additionally, a JSON API–compatible filter function is provided for flexible filtering.
 * Filtering statistics (before and after) for both annotation objects and nested transcript_consequences
 * are added to meta.stepsPerformed.
 * @module variantLinkerProcessor
 */

const fs = require('fs');
const debug = require('debug')('variant-linker:processor');

/**
 * Helper: Resolves a dot‐notation path from an object.
 *
 * This function supports wildcards (*) to collect values from arrays.
 *
 * For example, given an object with a property "transcript_consequences" that is an array,
 * a path "transcript_consequences.*.impact" returns an array of all impact values.
 *
 * @param {Object} obj - The object to query.
 * @param {string} path - The dot-separated path (e.g. "transcript_consequences.*.impact").
 * @returns {*} The value at the given path, or an array of values if wildcards are used.
 */
function getValueByPath(obj, path) {
  const parts = path.split('.');
  // start with a one-element array (our root)
  let current = [obj];

  for (const part of parts) {
    const next = [];
    for (const item of current) {
      if (part === '*') {
        if (Array.isArray(item)) {
          next.push(...item);
        }
      } else if (item != null && Object.prototype.hasOwnProperty.call(item, part)) {
        next.push(item[part]);
      }
    }
    current = next;
  }
  // If we end with a single value, return it; otherwise, return the array.
  return current.length === 1 ? current[0] : current;
}

/**
 * Helper: Applies an operator to a value.
 *
 * @param {*} value - The value from the object.
 * @param {string} operator - The operator (eq, ne, gt, gte, lt, lte, in, nin).
 * @param {*} target - The target value for the comparison.
 * @returns {boolean} True if the condition is satisfied, false otherwise.
 * @throws {Error} If the operator is not supported.
 */
function applyOperator(value, operator, target) {
  switch (operator) {
    case 'eq':
      return value === target;
    case 'ne':
      return value !== target;
    case 'gt':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "gt".`);
        return false;
      }
      return value > target;
    case 'gte':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "gte".`);
        return false;
      }
      return value >= target;
    case 'lt':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "lt".`);
        return false;
      }
      return value < target;
    case 'lte':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "lte".`);
        return false;
      }
      return value <= target;
    case 'in':
      if (!Array.isArray(target)) {
        throw new Error(`Operator "in" expects an array.`);
      }
      return target.includes(value);
    case 'nin':
      if (!Array.isArray(target)) {
        throw new Error(`Operator "nin" expects an array.`);
      }
      return !target.includes(value);
    default:
      throw new Error(`Unsupported operator "${operator}"`);
  }
}

/**
 * Filters an array of objects based on JSON API filter criteria.
 *
 * The filter criteria should be an object where keys are field names (which can use dot‐notation
 * and wildcards) and values are objects specifying operators and target values.
 *
 * For example:
 *   {
 *     "transcript_consequences.*.impact": { eq: "MODERATE" }
 *   }
 *
 * @param {Array<Object>} data - The array of objects to filter.
 * @param {Object} criteria - The filtering criteria.
 * @returns {Array<Object>} The filtered array.
 * @throws {Error} If an unsupported operator is used.
 */
function jsonApiFilter(data, criteria) {
  if (!Array.isArray(data)) {
    throw new Error('Data to be filtered must be an array.');
  }

  function matchesCriteria(obj) {
    for (const field in criteria) {
      if (!criteria.hasOwnProperty(field)) continue;
      const conditions = criteria[field];
      // Use getValueByPath if the field contains a dot or wildcard.
      let fieldValue = (field.includes('.') || field.includes('*'))
        ? getValueByPath(obj, field)
        : obj[field];
      // If the resolved value is an array, require that at least one element satisfies each condition.
      for (const operator in conditions) {
        if (!conditions.hasOwnProperty(operator)) continue;
        const target = conditions[operator];
        if (Array.isArray(fieldValue)) {
          if (!fieldValue.some(val => applyOperator(val, operator, target))) {
            return false;
          }
        } else {
          if (!applyOperator(fieldValue, operator, target)) {
            return false;
          }
        }
      }
    }
    return true;
  }
  return data.filter(matchesCriteria);
}

/**
 * Processes the variant linking by obtaining data from the Variant Recoder and VEP HGVS annotation.
 *
 * This function calls the provided variantRecoder and vepHgvsAnnotation functions to obtain
 * variant recoding data and VEP annotation data respectively. It then extracts a selected HGVS
 * notation (assumed to be found in variantData[0].T.hgvsc[0]) and uses it for the VEP call.
 *
 * @param {string} variant - The genetic variant to be analyzed.
 * @param {function} variantRecoder - A function that recodes the variant.
 * @param {function} vepHgvsAnnotation - A function that retrieves VEP annotations for a given HGVS.
 * @param {Object} recoderOptions - Optional parameters for the Variant Recoder API.
 * @param {Object} vepOptions - Optional parameters for the VEP API.
 * @returns {Promise<{variantData: Object, annotationData: Object}>} A promise that resolves with an object containing the variant recoder data and annotation data.
 * @throws {Error} If no data is returned from either API call.
 */
async function processVariantLinking(
  variant,
  variantRecoder,
  vepHgvsAnnotation,
  recoderOptions,
  vepOptions
) {
  try {
    debug('Starting variant linking process');
    const variantData = await variantRecoder(variant, recoderOptions);
    debug(`Variant Recoder data received: ${JSON.stringify(variantData)}`);

    if (!variantData || variantData.length === 0) {
      throw new Error('No data returned from Variant Recoder');
    }

    // Extract HGVS notation and transcript ID.
    // This logic assumes the structure: variantData[0].T.hgvsc is an array.
    const selectedHgvs =
      variantData[0].T && Array.isArray(variantData[0].T.hgvsc)
        ? variantData[0].T.hgvsc[0]
        : undefined;

    if (!selectedHgvs) {
      throw new Error(
        'No valid HGVS notation found in Variant Recoder response'
      );
    }

    const selectedTranscript = selectedHgvs.split(':')[0];
    debug(
      `Selected HGVS: ${selectedHgvs}, Selected Transcript: ${selectedTranscript}`
    );

    const annotationData = await vepHgvsAnnotation(
      selectedHgvs,
      selectedTranscript,
      vepOptions
    );
    debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);

    if (!annotationData || annotationData.length === 0) {
      throw new Error('No annotation data returned from VEP');
    }

    debug('Variant linking process completed successfully');
    return { variantData, annotationData };
  } catch (error) {
    debug(`Error in variant linking process: ${error.message}`);
    throw error;
  }
}

/**
 * Filters and formats the results from the variant processing.
 *
 * An optional filter can be provided to transform the results before formatting.
 * The filter parameter can be either a function or a JSON API–compatible filter criteria object.
 * When a criteria object is provided, filtering is applied to:
 *   1. The top-level annotationData array.
 *   2. And, if criteria keys start with "transcript_consequences", the nested transcript_consequences arrays
 *      are filtered accordingly.
 * Additionally, statistics on the number of annotations (and transcript consequences) before and after filtering
 * are added to meta.stepsPerformed.
 *
 * @param {Object} results - The results object from variant processing.
 * @param {(function|Object)} [filterParam] - An optional filter function or filter criteria object.
 * @param {string} format - The desired output format (e.g., 'JSON').
 * @returns {string} The filtered and formatted results as a string.
 * @throws {Error} If an unsupported format is specified or if filtering fails.
 */
function filterAndFormatResults(results, filterParam, format) {
  debug('Starting results filtering and formatting');
  let filteredResults = { ...results };

  if (filterParam) {
    if (typeof filterParam === 'function') {
      filteredResults = filterParam(results);
      // In this branch we only count the top-level annotationData.
      if (Array.isArray(results.annotationData)) {
        const originalCount = results.annotationData.length;
        const newCount = Array.isArray(filteredResults.annotationData)
          ? filteredResults.annotationData.length
          : 'N/A';
        filteredResults.meta.stepsPerformed.push(
          `Top-level filter (function) applied: ${originalCount} annotations before, ${newCount} after filtering.`
        );
      }
    } else if (typeof filterParam === 'object') {
      // Separate top-level criteria from transcript_consequences criteria.
      const topLevelCriteria = {};
      const transcriptCriteria = {};
      for (const key in filterParam) {
        if (Object.prototype.hasOwnProperty.call(filterParam, key)) {
          if (key.startsWith('transcript_consequences')) {
            // Remove the prefix "transcript_consequences." if present.
            const newKey = key.replace(/^transcript_consequences\./, '');
            transcriptCriteria[newKey] = filterParam[key];
          } else {
            topLevelCriteria[key] = filterParam[key];
          }
        }
      }
      // First, filter the top-level annotationData (if any criteria exist).
      let topLevelOriginalCount = results.annotationData.length;
      let topLevelFiltered = results.annotationData;
      if (Object.keys(topLevelCriteria).length > 0) {
        topLevelFiltered = jsonApiFilter(results.annotationData, topLevelCriteria);
        filteredResults.meta.stepsPerformed.push(
          `Top-level filter applied: ${topLevelOriginalCount} annotations before, ${topLevelFiltered.length} after filtering.`
        );
      }
      // Now, for each annotation, if transcriptCriteria exists, filter its transcript_consequences.
      let totalTCBefore = 0;
      let totalTCAfter = 0;
      topLevelFiltered.forEach(annotation => {
        if (
          annotation.transcript_consequences &&
          Array.isArray(annotation.transcript_consequences) &&
          Object.keys(transcriptCriteria).length > 0
        ) {
          const originalTC = annotation.transcript_consequences.length;
          totalTCBefore += originalTC;
          annotation.transcript_consequences = jsonApiFilter(
            annotation.transcript_consequences,
            transcriptCriteria
          );
          const newTC = annotation.transcript_consequences.length;
          totalTCAfter += newTC;
        }
      });
      if (Object.keys(transcriptCriteria).length > 0) {
        filteredResults.meta.stepsPerformed.push(
          `Transcript consequences filter applied: ${totalTCBefore} consequences before filtering, ${totalTCAfter} after filtering.`
        );
      }
      filteredResults.annotationData = topLevelFiltered;
    } else {
      throw new Error(
        'Filter parameter must be a function or a filter criteria object.'
      );
    }
    debug(`Filtered results: ${JSON.stringify(filteredResults)}`);
  }

  let formattedResults;
  switch (format.toUpperCase()) {
    case 'JSON':
      formattedResults = JSON.stringify(filteredResults, null, 2);
      break;
    default:
      throw new Error('Unsupported format');
  }
  return formattedResults;
}

/**
 * Outputs the results either to the console or writes them to a file.
 *
 * @param {string} results - The results string to output.
 * @param {string} [filename] - An optional filename; if provided, results are saved to this file.
 */
function outputResults(results, filename) {
  debug('Starting results output');
  if (filename) {
    fs.writeFileSync(filename, results);
    debug(`Results saved to file: ${filename}`);
  } else {
    console.log(results);
  }
}

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults,
  jsonApiFilter // Exported in case standalone use is desired.
};
