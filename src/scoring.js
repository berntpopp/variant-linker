// src/scoring.js
'use strict';

/**
 * @fileoverview Provides scoring functionality including reading and parsing scoring configuration
 * and applying scoring formulas to VEP annotation data.
 * Supports flexible variable assignments with conditional transformations using
 * schema.org–style configuration objects.
 * @module scoring
 */

// Use fs only if in a Node environment.
const fs = typeof window === 'undefined' ? require('fs') : null;
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Parses scoring configuration from the provided JSON objects.
 *
 * This function expects two JSON objects:
 * - variableAssignmentJson: parsed content of variable_assignment_config.json,
 * - formulaJson: parsed content of formula_config.json.
 *
 * @param {Object} variableAssignmentJson - Parsed JSON containing a "variables" object.
 * @param {Object} formulaJson - Parsed JSON containing scoring formulas.
 * @returns {{
 *   variables: Object,
 *   formulas: { annotationLevel: Array, transcriptLevel: Array }
 * }} A structured configuration object with variables and formulas for scoring
 */
function parseScoringConfig(variableAssignmentJson, formulaJson) {
  const variables = variableAssignmentJson.variables;
  let formulas = { annotationLevel: [], transcriptLevel: [] };

  if (formulaJson.formulas) {
    if (Array.isArray(formulaJson.formulas)) {
      formulas = {
        annotationLevel: formulaJson.formulas,
        transcriptLevel: [],
      };
    } else if (typeof formulaJson.formulas === 'object') {
      formulas = {
        annotationLevel: formulaJson.formulas.annotationLevel || [],
        transcriptLevel: formulaJson.formulas.transcriptLevel || [],
      };
    }
  } else {
    formulas = {
      annotationLevel: formulaJson.annotationLevel || [],
      transcriptLevel: formulaJson.transcriptLevel || [],
    };
  }

  return {
    variables,
    formulas,
  };
}

/**
 * Reads and parses the scoring configuration files from the specified directory.
 *
 * This function expects two files in the given directory:
 * - variable_assignment_config.json: containing a "variables" object.
 * - formula_config.json: containing scoring formulas.
 *
 * This function is intended for use in Node environments.
 *
 * @param {string} configPath - The path to the scoring configuration directory.
 * @returns {{
 *   variables: Object,
 *   formulas: { annotationLevel: Array, transcriptLevel: Array }
 * }} A structured configuration object containing the parsed scoring variables and formulas
 * @throws {Error} If there is an error reading or parsing the configuration files.
 */
function readScoringConfigFromFiles(configPath) {
  if (!fs) {
    throw new Error(
      "readScoringConfigFromFiles requires Node's fs module which is not available in the browser."
    );
  }
  try {
    const variableAssignmentPath = `${configPath}/variable_assignment_config.json`;
    const formulaPath = `${configPath}/formula_config.json`;

    debug(`Reading scoring configuration files from: ${configPath}`);

    const variableAssignmentRaw = fs.readFileSync(variableAssignmentPath, 'utf-8');
    const formulaRaw = fs.readFileSync(formulaPath, 'utf-8');

    const variableAssignmentJson = JSON.parse(variableAssignmentRaw);
    const formulaJson = JSON.parse(formulaRaw);

    debugDetailed(`Variable Assignment JSON: ${JSON.stringify(variableAssignmentJson)}`);
    debugDetailed(`Formula JSON: ${JSON.stringify(formulaJson)}`);

    return parseScoringConfig(variableAssignmentJson, formulaJson);
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
 * }} An object containing the parsed target field, optional aggregator function, and default value
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
    defaultValue,
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
 * Extracts variables from an object (annotation or transcript) based on the
 * provided configuration.
 *
 * The variablesConfig can use either a string mapping (legacy) or
 * an object mapping:
 * For object mapping, the following properties are supported:
 *   - target: the variable name to assign.
 *   - aggregator: (optional) one of "max", "min", "avg"/"average", "unique".
 *   - condition: (optional) a JavaScript expression evaluated with "value"
 *     set to the raw value.
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
        defaultValue: mapping.default !== undefined ? mapping.default : 0,
      };
    } else {
      continue;
    }

    let rawValue = getValueByPath(obj, path, context);
    debugDetailed(
      `Raw value for mapping "${mapping}" (target: ${config.target})` +
        ` from path "${path}": ${JSON.stringify(rawValue)}`
    );

    if (Array.isArray(rawValue) && rawValue.some((item) => Array.isArray(item))) {
      rawValue = rawValue.flat(Infinity);
      debugDetailed(`Flattened raw value: ${JSON.stringify(rawValue)}`);
    }

    let finalValue;
    if (config.aggregator) {
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        finalValue = config.defaultValue;
        debugDetailed(
          `Using default value for aggregator "${config.aggregator}"` +
            ` for target "${config.target}": ${finalValue}`
        );
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
            debugAll(
              `Unknown aggregator "${config.aggregator}"` +
                ` for target "${config.target}". Using raw value.`
            );
            finalValue = rawValue;
        }
        debugDetailed(
          `Applied aggregator "${config.aggregator}"` +
            ` on value: ${JSON.stringify(rawValue)} -> ${finalValue}`
        );
      }
    } else {
      finalValue = rawValue !== undefined ? rawValue : config.defaultValue;
    }

    if (config.condition) {
      finalValue = evaluateCondition(rawValue, config.condition, config.defaultValue);
      debugDetailed(
        `Condition "${config.condition}" applied for target "${config.target}": ${finalValue}`
      );
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
          .map((item) => getValueByPath(item, remainder, context))
          .filter((v) => v !== null && v !== undefined);
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
      debugDetailed(`Using context for part ${part}; value: ${JSON.stringify(value)}`);
    } else {
      // Log part not found in debug mode
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
 * @param {string} formulaStr - The scoring formula as a string
 * (e.g., "cadd_phred_variant * 2 + gnomade_variant").
 * @param {Object} variables - An object mapping variable names to numeric values.
 * @returns {number} The calculated score.
 */
function calculateScore(formulaStr, variables) {
  debugDetailed(`Evaluating formula: ${formulaStr}`);
  debugDetailed(`Variables for formula: ${JSON.stringify(variables)}`);

  // Build a substituted formula string for debugging.
  let substitutedFormula = formulaStr;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\b${key}\\b`, 'g');
    substitutedFormula = substitutedFormula.replace(pattern, JSON.stringify(value));
  }
  debugDetailed(`Substituted formula: ${substitutedFormula}`);

  // eslint-disable-next-line no-new-func
  const formula = new Function(...Object.keys(variables), `return ${formulaStr}`);
  const result = formula(...Object.values(variables));
  debugDetailed(`Result of formula: ${result}`);
  return result;
}

/**
 * Finds the prioritized transcript from annotation based on biological relevance.
 * Priority order: pick=1 > mane=1 > canonical=1 > first transcript
 *
 * @param {Object} annotation - The VEP annotation data.
 * @returns {Object|null} The prioritized transcript consequence or null if none found.
 */
function _findPrioritizedTranscript(annotation) {
  if (!Array.isArray(annotation.transcript_consequences) || annotation.transcript_consequences.length === 0) {
    return null;
  }

  const transcripts = annotation.transcript_consequences;

  // 1. Find first transcript with pick === 1
  let prioritized = transcripts.find(tc => tc.pick === 1);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with pick=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 2. Find first transcript with mane === 1
  prioritized = transcripts.find(tc => tc.mane === 1);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with mane=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 3. Find first transcript with canonical === 1
  prioritized = transcripts.find(tc => tc.canonical === 1);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with canonical=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 4. Return first transcript as fallback
  debugDetailed(`Using first transcript as fallback: ${transcripts[0].transcript_id}`);
  return transcripts[0];
}

/**
 * Extracts variables for annotation-level scoring using scoped variable extraction.
 * Uses globally aggregated variables for variant-level fields and prioritized transcript
 * data for transcript-specific fields.
 *
 * @param {Object} annotation - The VEP annotation data.
 * @param {Object} variablesConfig - The variables configuration.
 * @returns {Object} An object mapping variable names to their computed values.
 */
function _extractAnnotationVariables(annotation, variablesConfig) {
  const variables = {};
  const prioritizedTranscript = _findPrioritizedTranscript(annotation);

  // Handle new scoped configuration format
  if (variablesConfig.aggregates || variablesConfig.transcriptFields) {
    // Extract globally aggregated variables (variant-level)
    if (variablesConfig.aggregates) {
      const aggregateVars = extractVariables(annotation, variablesConfig.aggregates);
      Object.assign(variables, aggregateVars);
    }

    // Extract transcript-specific fields from prioritized transcript
    if (variablesConfig.transcriptFields && prioritizedTranscript) {
      const transcriptVars = extractVariables(prioritizedTranscript, variablesConfig.transcriptFields);
      Object.assign(variables, transcriptVars);
    }
  } else {
    // Legacy format - extract all variables from annotation with aggregation
    const legacyVars = extractVariables(annotation, variablesConfig);
    Object.assign(variables, legacyVars);
  }

  debugDetailed(`Annotation variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Extracts variables for transcript-level scoring using scoped variable extraction.
 * Uses globally aggregated variables for variant-level fields and individual transcript
 * data for transcript-specific fields.
 *
 * @param {Object} transcript - The transcript consequence data.
 * @param {Object} annotation - The full VEP annotation data for context.
 * @param {Object} variablesConfig - The variables configuration.
 * @returns {Object} An object mapping variable names to their computed values.
 */
function _extractTranscriptVariables(transcript, annotation, variablesConfig) {
  const variables = {};

  // Handle new scoped configuration format
  if (variablesConfig.aggregates || variablesConfig.transcriptFields) {
    // Extract globally aggregated variables (variant-level) from annotation
    if (variablesConfig.aggregates) {
      const aggregateVars = extractVariables(annotation, variablesConfig.aggregates);
      Object.assign(variables, aggregateVars);
    }

    // Extract transcript-specific fields from this specific transcript
    if (variablesConfig.transcriptFields) {
      const transcriptVars = extractVariables(transcript, variablesConfig.transcriptFields);
      Object.assign(variables, transcriptVars);
    }
  } else {
    // Legacy format - extract variables with transcript as primary context
    const legacyVars = extractVariables(transcript, variablesConfig, annotation);
    Object.assign(variables, legacyVars);
  }

  debugDetailed(`Transcript variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Applies scoring algorithms to the provided VEP annotation data.
 *
 * For each annotation in the annotationData array, annotation-level formulas are applied
 * using a prioritized transcript approach. Transcript-level formulas use individual
 * transcript data for context-specific scoring.
 *
 * @param {Array} annotationData - The VEP annotation data.
 * @param {{ variables: Object, formulas: Object }} scoringConfig
 *        The scoring configuration containing variables and formulas.
 * @returns {Array} The original annotation data enhanced with calculated score fields at both
 *          annotation and transcript levels based on the provided scoring configuration
 */
function applyScoring(annotationData, scoringConfig) {
  // Log scoring configuration in debug mode
  debug(`Applying scoring: ${JSON.stringify(scoringConfig)}`);
  const variablesConfig = scoringConfig.variables;
  const formulasConfig = scoringConfig.formulas;
  const { annotationLevel, transcriptLevel } = formulasConfig;

  // Process each annotation.
  annotationData.forEach((annotation) => {
    // Annotation-level scoring with prioritized transcript approach
    const annotationVariables = _extractAnnotationVariables(annotation, variablesConfig);

    annotationLevel.forEach((formula) => {
      const scoreName = Object.keys(formula)[0];
      const formulaStr = formula[scoreName];
      const scoreValue = calculateScore(formulaStr, annotationVariables);
      annotation[scoreName] = scoreValue;
      debugDetailed(`Calculated ${scoreName} for annotation: ${scoreValue}`);
    });

    // Transcript-level formulas with individual transcript context
    if (Array.isArray(annotation.transcript_consequences)) {
      annotation.transcript_consequences.forEach((transcript) => {
        const transcriptVariables = _extractTranscriptVariables(transcript, annotation, variablesConfig);
        transcriptLevel.forEach((formula) => {
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
  // Export the new functions:
  readScoringConfigFromFiles,
  parseScoringConfig,
  // Export the rest of the functionality:
  applyScoring,
  // Export helper functions for testing:
  _findPrioritizedTranscript,
  _extractAnnotationVariables,
  _extractTranscriptVariables,
};
