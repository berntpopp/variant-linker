'use strict';
// src/scoring.js

/**
 * @fileoverview Provides scoring functionality including reading scoring configuration
 * and applying scoring formulas to VEP annotation data.
 * @module scoring
 */

const fs = require('fs');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Reads and parses the scoring configuration files from the specified directory.
 *
 * This function expects two files in the given directory:
 * - variable_assignment_config.json: containing a "variables" object.
 * - formula_config.json: containing scoring formulas.
 *
 * If the formula config file contains a property "formulas" that is an array, it is assumed
 * to represent annotation-level formulas and transcript-level formulas will be set empty.
 * Otherwise, if "formulas" is an object, the keys "annotation_level" and "transcript_level"
 * are used.
 *
 * @param {string} configPath - The path to the scoring configuration directory.
 * @returns {{ variables: Object, formulas: { annotation_level: Array, transcript_level: Array } }}
 *          An object containing the variables and formulas used for scoring.
 * @throws {Error} If there is an error reading or parsing the configuration files.
 */
function readScoringConfig(configPath) {
  try {
    const variableAssignmentPath = `${configPath}/variable_assignment_config.json`;
    const formulaPath = `${configPath}/formula_config.json`;

    debug(`Reading scoring configuration files from: ${configPath}`);

    const variableAssignmentRaw = fs.readFileSync(variableAssignmentPath, 'utf-8');
    const formulaRaw = fs.readFileSync(formulaPath, 'utf-8');

    const variableAssignmentConfig = JSON.parse(variableAssignmentRaw);
    const formulaConfigRaw = JSON.parse(formulaRaw);

    debugDetailed(`Variable Assignment Config: ${JSON.stringify(variableAssignmentConfig)}`);
    debugDetailed(`Formula Config Raw: ${JSON.stringify(formulaConfigRaw)}`);

    let formulas = { annotation_level: [], transcript_level: [] };

    if (formulaConfigRaw.formulas) {
      if (Array.isArray(formulaConfigRaw.formulas)) {
        // When formulas is an array, treat it as annotation-level formulas only.
        formulas = {
          annotation_level: formulaConfigRaw.formulas,
          transcript_level: []
        };
      } else if (typeof formulaConfigRaw.formulas === 'object') {
        // When formulas is an object, extract annotation_level and transcript_level.
        formulas = {
          annotation_level: formulaConfigRaw.formulas.annotation_level || [],
          transcript_level: formulaConfigRaw.formulas.transcript_level || []
        };
      }
    } else {
      // Fallback: look for top-level keys.
      formulas = {
        annotation_level: formulaConfigRaw.annotation_level || [],
        transcript_level: formulaConfigRaw.transcript_level || []
      };
    }

    return {
      variables: variableAssignmentConfig.variables,
      formulas: formulas
    };
  } catch (error) {
    debugAll(`Error reading scoring configuration files: ${error.message}`);
    throw error;
  }
}

/**
 * Applies the scoring algorithms to the provided VEP annotation data based on the scoring configuration.
 *
 * For each annotation in the annotationData array, annotation-level formulas are applied.
 * In addition, if transcript-level consequences exist, transcript-level formulas are applied.
 *
 * @param {Array} annotationData - The VEP annotation data.
 * @param {{ variables: Object, formulas: { annotation_level: Array, transcript_level: Array } }} scoringConfig
 *        The scoring configuration containing variables and formulas.
 * @returns {Array} The annotation data with additional scoring fields.
 */
function applyScoring(annotationData, scoringConfig) {
  debug(`Applying scoring with configuration: ${JSON.stringify(scoringConfig)}`);
  const variablesConfig = scoringConfig.variables;
  const formulasConfig = scoringConfig.formulas;
  const { annotation_level, transcript_level } = formulasConfig;

  // Process each annotation in the array.
  annotationData.forEach((annotation) => {
    // Apply annotation-level formulas.
    const annotationVariables = extractVariables(annotation, variablesConfig);

    annotation_level.forEach((formula) => {
      const scoreName = Object.keys(formula)[0];
      const formulaStr = formula[scoreName];
      const scoreValue = calculateScore(formulaStr, annotationVariables);
      annotation[scoreName] = scoreValue;
      debugDetailed(`Calculated ${scoreName} for annotation: ${scoreValue}`);
    });

    // Apply transcript-level formulas if transcript_consequences exist.
    if (Array.isArray(annotation.transcript_consequences)) {
      annotation.transcript_consequences.forEach((transcript) => {
        const transcriptVariables = extractVariables(transcript, variablesConfig, annotation);

        transcript_level.forEach((formula) => {
          const scoreName = Object.keys(formula)[0];
          const formulaStr = formula[scoreName];
          const scoreValue = calculateScore(formulaStr, transcriptVariables);
          transcript[scoreName] = scoreValue;
          debugDetailed(`Calculated ${scoreName} for transcript: ${scoreValue}`);
        });
      });
    }
  });

  return annotationData;
}

/**
 * Extracts variables from an object (such as an annotation or transcript) based on the provided configuration.
 *
 * The variablesConfig is an object where keys represent dot-separated paths and values represent the variable name.
 * Optionally, a mapping may be prefixed with an aggregator (e.g. "max:", "min:", "avg:" or "unique:"), which will be applied
 * if the extracted value is an array. Additionally, a default value can be specified using the syntax:
 *     aggregator:variableName|default:defaultValue
 * If the raw value is missing or an empty array, the default value is used.
 *
 * A context object may be provided for relative path lookups.
 *
 * @param {Object} obj - The object to extract variables from.
 * @param {Object} variablesConfig - An object mapping dot-separated paths to variable names or aggregator mappings.
 * @param {Object} [context] - Optional additional context for extraction.
 * @returns {Object} An object mapping variable names to their extracted (and possibly aggregated) values.
 */
function extractVariables(obj, variablesConfig, context) {
  const variables = {};

  for (const [path, mapping] of Object.entries(variablesConfig)) {
    let aggregator = null;
    let variableName = mapping;
    let defaultValue = 0; // fallback default

    // Check for a default value specified using a pipe separator.
    if (mapping.includes('|')) {
      const parts = mapping.split('|');
      const leftPart = parts[0].trim();
      const rightPart = parts[1].trim();
      if (rightPart.toLowerCase().startsWith('default:')) {
        defaultValue = Number(rightPart.split(':')[1]);
        if (isNaN(defaultValue)) {
          defaultValue = 0;
        }
      }
      variableName = leftPart;
    }

    // Check for an aggregator specified with a colon.
    if (variableName.includes(':')) {
      const parts = variableName.split(':');
      aggregator = parts[0].toLowerCase();
      variableName = parts[1];
    }

    let rawValue = getValueByPath(obj, path, context);
    debugDetailed(`Raw value for mapping "${mapping}" (key: ${variableName}) from path "${path}": ${JSON.stringify(rawValue)}`);
    
    // If rawValue is an array of arrays, flatten it.
    if (Array.isArray(rawValue) && rawValue.some(item => Array.isArray(item))) {
      rawValue = rawValue.flat(Infinity);
      debugDetailed(`Flattened raw value: ${JSON.stringify(rawValue)}`);
    }
    
    let finalValue;
    if (aggregator) {
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        finalValue = defaultValue;
        debugDetailed(`Using default value for aggregator "${aggregator}" for variable "${variableName}": ${finalValue}`);
      } else {
        if (aggregator === 'max') {
          finalValue = Math.max(...rawValue);
        } else if (aggregator === 'min') {
          finalValue = Math.min(...rawValue);
        } else if (aggregator === 'avg' || aggregator === 'average') {
          finalValue = rawValue.reduce((a, b) => a + b, 0) / rawValue.length;
        } else if (aggregator === 'unique') {
          // Remove duplicates and sort the values.
          const uniqueArray = Array.from(new Set(rawValue));
          uniqueArray.sort();
          finalValue = uniqueArray;
        } else {
          debugAll(`Unknown aggregator "${aggregator}" for variable "${variableName}". Using raw value.`);
          finalValue = rawValue;
        }
        debugDetailed(`Applied aggregator "${aggregator}" on value: ${JSON.stringify(rawValue)} -> ${finalValue}`);
      }
    } else {
      finalValue = rawValue !== undefined ? rawValue : defaultValue;
    }
    variables[variableName] = finalValue;
  }

  debugDetailed(`Extracted variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Retrieves the value from an object using a dot-separated path.
 * This function supports wildcards (*) in the path to traverse arrays.
 *
 * @param {Object} obj - The object to retrieve the value from.
 * @param {string} path - The dot-separated path (e.g., "a.b.*.c").
 * @param {Object} [context] - Optional context object for relative lookups.
 * @returns {*} The value at the specified path, or undefined if not found.
 */
function getValueByPath(obj, path, context) {
  const parts = path.split('.');
  let value = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '*') {
      if (Array.isArray(value)) {
        debugDetailed(`Wildcard found, iterating over array: ${JSON.stringify(value)}`);
        const remainder = parts.slice(i + 1).join('.');
        const results = value
          .map(item => getValueByPath(item, remainder, context))
          .filter(v => v !== null && v !== undefined);
        return results.length === 1 ? results[0] : results;
      } else if (value && typeof value === 'object') {
        debugDetailed(`Wildcard encountered but value is not an array: ${JSON.stringify(value)}`);
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
        debugDetailed(`Wildcard found but value is not traversable: ${JSON.stringify(value)}`);
        return [];
      }
    } else if (value && Object.prototype.hasOwnProperty.call(value, part)) {
      value = value[part];
      debugDetailed(`Navigated to part: ${part}, value: ${JSON.stringify(value)}`);
    } else if (context && Object.prototype.hasOwnProperty.call(context, part)) {
      value = context[part];
      debugDetailed(`Part not found in current object; using context for ${part}, value: ${JSON.stringify(value)}`);
    } else {
      debugAll(`Part not found: ${part}`);
      return undefined;
    }
  }

  debugAll(`Final value: ${JSON.stringify(value)}`);
  return value;
}

/**
 * Calculates a score based on a formula string and a set of variables.
 *
 * NOTE: This function uses the Function constructor to evaluate the formula.
 * Ensure that formulas are from trusted sources to avoid potential code injection risks.
 *
 * @param {string} formulaStr - The scoring formula as a string (e.g., "cadd_phred * 2 + gnomad").
 * @param {Object} variables - An object mapping variable names to numeric values.
 * @returns {number} The calculated score.
 */
function calculateScore(formulaStr, variables) {
  debugDetailed(`Evaluating formula: ${formulaStr}`);
  debugDetailed(`Variables for formula: ${JSON.stringify(variables)}`);
  
  // Build a substituted formula string for debugging purposes.
  let substitutedFormula = formulaStr;
  for (const [key, value] of Object.entries(variables)) {
    // Replace whole word occurrences of the variable name with its JSON stringified value.
    substitutedFormula = substitutedFormula.replace(new RegExp(`\\b${key}\\b`, 'g'), JSON.stringify(value));
  }
  debugDetailed(`Substituted formula: ${substitutedFormula}`);
  
  // eslint-disable-next-line no-new-func
  const formula = new Function(...Object.keys(variables), `return ${formulaStr}`);
  const result = formula(...Object.values(variables));
  debugDetailed(`Result of formula: ${result}`);
  return result;
}

module.exports = {
  readScoringConfig,
  applyScoring
};
