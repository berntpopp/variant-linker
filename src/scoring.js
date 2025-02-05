'use strict';
// src/scoring.js

/**
 * @fileoverview Provides scoring functionality including reading scoring configuration
 * and applying scoring formulas to VEP annotation data.
 * Supports flexible variable assignments with conditional transformations using
 * schema.org–style configuration objects.
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
 * @param {string} configPath - The path to the scoring configuration directory.
 * @returns {{
 *   variables: Object,
 *   formulas: { annotation_level: Array, transcript_level: Array }
 * }}
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

    debugDetailed(
      `Variable Assignment Config: ${JSON.stringify(variableAssignmentConfig)}`
    );
    debugDetailed(
      `Formula Config Raw: ${JSON.stringify(formulaConfigRaw)}`
    );

    let formulas = { annotation_level: [], transcript_level: [] };

    if (formulaConfigRaw.formulas) {
      if (Array.isArray(formulaConfigRaw.formulas)) {
        formulas = {
          annotation_level: formulaConfigRaw.formulas,
          transcript_level: []
        };
      } else if (typeof formulaConfigRaw.formulas === 'object') {
        formulas = {
          annotation_level: formulaConfigRaw.formulas.annotation_level || [],
          transcript_level: formulaConfigRaw.formulas.transcript_level || []
        };
      }
    } else {
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
 * Parses a legacy mapping string (e.g. "max:cadd_phred_variant|default:25")
 * into an object with explicit properties.
 *
 * @param {string} mappingStr - The mapping string.
 * @returns {{
 *   target: string,
 *   aggregator: (string|null),
 *   defaultValue: number
 * }}
 */
function parseMappingString(mappingStr) {
  let aggregator = null;
  let variableName = mappingStr;
  let defaultValue = 0;
  if (mappingStr.includes('|')) {
    const parts = mappingStr.split('|');
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
  if (variableName.includes(':')) {
    const parts = variableName.split(':');
    aggregator = parts[0].toLowerCase();
    variableName = parts[1];
  }
  return {
    target: variableName,
    aggregator,
    defaultValue
  };
}

/**
 * Evaluates an optional condition on the raw value.
 *
 * @param {*} rawValue - The raw value extracted.
 * @param {string} condition - A JavaScript expression where "value" is the raw value.
 * @param {*} defaultValue - The default value to use if evaluation fails.
 * @returns {*} The result of the condition, or defaultValue if evaluation fails.
 */
function evaluateCondition(rawValue, condition, defaultValue) {
  try {
    // For safety, ensure that condition expressions are from trusted sources.
    const conditionFunc = new Function('value', `return ${condition};`);
    return conditionFunc(rawValue);
  } catch (e) {
    console.warn(`Error evaluating condition "${condition}": ${e.message}`);
    return defaultValue;
  }
}

/**
 * Extracts variables from an object (such as an annotation or transcript) based on the provided configuration.
 *
 * The variablesConfig can use either a string mapping (legacy) or an object mapping:
 * For object mapping, the following properties are supported:
 *   - target: the variable name to assign.
 *   - aggregator: (optional) one of "max", "min", "avg"/"average", "unique".
 *   - condition: (optional) a JavaScript expression that will be evaluated with "value" set to the raw value.
 *   - default: (optional) the default value if the raw value is missing.
 *
 * @param {Object} obj - The object to extract variables from.
 * @param {Object} variablesConfig - The configuration mapping.
 * @param {Object} [context] - Optional additional context for extraction.
 * @returns {Object} An object mapping variable names to their computed values.
 */
function extractVariables(obj, variablesConfig, context) {
  const variables = {};

  for (const [path, mapping] of Object.entries(variablesConfig)) {
    let config;
    if (typeof mapping === 'string') {
      config = parseMappingString(mapping);
    } else if (typeof mapping === 'object') {
      config = {
        target: mapping.target || '',
        aggregator: mapping.aggregator || null,
        condition: mapping.condition || null,
        defaultValue: mapping.default !== undefined ? mapping.default : 0
      };
    } else {
      // Skip if mapping is neither a string nor an object.
      continue;
    }

    let rawValue = getValueByPath(obj, path, context);
    debugDetailed(
      `Raw value for mapping "${mapping}" (target: ${config.target}) from path "${path}": ${JSON.stringify(rawValue)}`
    );

    // If rawValue is an array of arrays, flatten it.
    if (Array.isArray(rawValue) && rawValue.some(item => Array.isArray(item))) {
      rawValue = rawValue.flat(Infinity);
      debugDetailed(`Flattened raw value: ${JSON.stringify(rawValue)}`);
    }

    let finalValue;
    if (config.aggregator) {
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        finalValue = config.defaultValue;
        debugDetailed(`Using default value for aggregator "${config.aggregator}" for target "${config.target}": ${finalValue}`);
      } else {
        switch (config.aggregator.toLowerCase()) {
          case 'max':
            finalValue = Math.max(...rawValue);
            break;
          case 'min':
            finalValue = Math.min(...rawValue);
            break;
          case 'avg':
          case 'average':
            finalValue = rawValue.reduce((a, b) => a + b, 0) / rawValue.length;
            break;
          case 'unique':
            finalValue = Array.from(new Set(rawValue)).sort();
            break;
          default:
            debugAll(`Unknown aggregator "${config.aggregator}" for target "${config.target}". Using raw value.`);
            finalValue = rawValue;
        }
        debugDetailed(`Applied aggregator "${config.aggregator}" on value: ${JSON.stringify(rawValue)} -> ${finalValue}`);
      }
    } else {
      finalValue = rawValue !== undefined ? rawValue : config.defaultValue;
    }

    // If a condition is specified, evaluate it.
    if (config.condition) {
      finalValue = evaluateCondition(rawValue, config.condition, config.defaultValue);
      debugDetailed(`Condition "${config.condition}" applied for target "${config.target}": ${finalValue}`);
    }
    variables[config.target] = finalValue;
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
 * @param {string} formulaStr - The scoring formula as a string (e.g., "cadd_phred_variant * 2 + gnomade_variant").
 * @param {Object} variables - An object mapping variable names to numeric values.
 * @returns {number} The calculated score.
 */
function calculateScore(formulaStr, variables) {
  debugDetailed(`Evaluating formula: ${formulaStr}`);
  debugDetailed(`Variables for formula: ${JSON.stringify(variables)}`);

  // Build a substituted formula string for debugging.
  let substitutedFormula = formulaStr;
  for (const [key, value] of Object.entries(variables)) {
    substitutedFormula = substitutedFormula.replace(new RegExp(`\\b${key}\\b`, 'g'), JSON.stringify(value));
  }
  debugDetailed(`Substituted formula: ${substitutedFormula}`);

  // eslint-disable-next-line no-new-func
  const formula = new Function(...Object.keys(variables), `return ${formulaStr}`);
  const result = formula(...Object.values(variables));
  debugDetailed(`Result of formula: ${result}`);
  return result;
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

  // Process each annotation.
  annotationData.forEach((annotation) => {
    // Annotation-level variables.
    const annotationVariables = extractVariables(annotation, variablesConfig);

    annotation_level.forEach((formula) => {
      const scoreName = Object.keys(formula)[0];
      const formulaStr = formula[scoreName];
      const scoreValue = calculateScore(formulaStr, annotationVariables);
      annotation[scoreName] = scoreValue;
      debugDetailed(`Calculated ${scoreName} for annotation: ${scoreValue}`);
    });

    // Transcript-level formulas.
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

module.exports = {
  readScoringConfig,
  applyScoring
};
