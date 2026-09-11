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
const { getValueByPath } = require('./utils/pathUtils');
const { evaluateExpression } = require('./scoring/expressionEvaluator');
const { checkName } = require('./scoring/expressionParser');
const { limits } = require('./scoring/limits');

/**
 * Parses scoring configuration from the provided JSON objects.
 *
 * This function expects two JSON objects:
 * - variableAssignmentJson: parsed content of variable_assignment_config.json,
 * - formulaJson: parsed content of formula_config.json.
 *
 * @param {{variables: import('./analysisTypes').ScoringConfig['variables']}} variableAssignmentJson - Parsed JSON containing a "variables" object.
 * @param {{formulas?: Record<string,string>[] | Partial<import('./analysisTypes').ScoringConfig['formulas']>, annotationLevel?:Record<string,string>[],transcriptLevel?:Record<string,string>[]}} formulaJson - Parsed JSON containing scoring formulas.
 * @returns {import('./analysisTypes').ScoringConfig} A structured configuration object with variables and formulas for scoring
 */
function parseScoringConfig(variableAssignmentJson, formulaJson) {
  const variables = variableAssignmentJson.variables;
  /** @type {import('./analysisTypes').ScoringConfig['formulas']} */
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
 * @returns {import('./analysisTypes').ScoringConfig} A structured configuration object containing the parsed scoring variables and formulas
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

    if (debugDetailed.enabled)
      debugDetailed(`Variable Assignment JSON: ${JSON.stringify(variableAssignmentJson)}`);
    if (debugDetailed.enabled) debugDetailed(`Formula JSON: ${JSON.stringify(formulaJson)}`);

    return parseScoringConfig(variableAssignmentJson, formulaJson);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
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
 *   defaultValue: number|string
 * }} An object containing the parsed target field, optional aggregator function, and default value
 */
function parseMappingString(mappingStr) {
  let aggregator = null;
  let variableName = mappingStr;
  /** @type {number|string} */
  let defaultValue = 0;
  if (mappingStr.includes('|')) {
    const parts = mappingStr.split('|');
    const leftPart = parts[0].trim();
    const rightPart = parts[1].trim();
    if (rightPart.toLowerCase().startsWith('default:')) {
      const configuredDefault = rightPart.slice(rightPart.indexOf(':') + 1).trim();
      defaultValue = Number(configuredDefault);
      if (isNaN(defaultValue)) defaultValue = configuredDefault;
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

/** @type {Set<string>} */
const conditionWarnings = new Set();
/**
 * Evaluates an optional condition on the raw value.
 *
 * @param {unknown} rawValue - The raw value extracted.
 * @param {string} condition - A JavaScript expression where "value" is the raw value.
 * @param {unknown} defaultValue - The default value to use if evaluation fails.
 * @returns {unknown} The result of the condition, or defaultValue if evaluation fails.
 */
function evaluateCondition(rawValue, condition, defaultValue) {
  try {
    return evaluateExpression(condition, { value: rawValue });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const diagnostic = JSON.stringify([condition, e.message]);
    if (!conditionWarnings.has(diagnostic)) {
      if (conditionWarnings.size >= limits.conditionWarningCacheSize) conditionWarnings.clear();
      conditionWarnings.add(diagnostic);
      console.warn(`Error evaluating condition "${condition}": ${e.message}`);
    }
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
 * @param {Record<string,unknown>} obj - The object to extract variables from.
 * @param {import('./analysisTypes').VariableMappings} variablesConfig - The configuration mapping.
 * @param {Record<string,unknown>} [context] - Optional additional context for extraction.
 * @returns {Record<string,unknown>} An object mapping variable names to their computed values.
 */
function extractVariables(obj, variablesConfig, context) {
  /** @type {Record<string,unknown>} */
  const variables = {};

  for (const [path, mapping] of Object.entries(variablesConfig)) {
    /** @type {{target:string,aggregator:string|null,condition?:string|null,defaultValue:unknown}} */
    let config;
    if (typeof mapping === 'string') {
      config = parseMappingString(mapping);
    } else if (mapping && typeof mapping === 'object') {
      config = {
        target: mapping.target || '',
        aggregator: mapping.aggregator?.toLowerCase() || null,
        condition: mapping.condition || null,
        defaultValue: mapping.default !== undefined ? mapping.default : 0,
      };
    } else {
      continue;
    }

    checkName(config.target);
    let rawValue = getValueByPath(obj, path, context);

    // Wrap scalar values in array if using an aggregator to avoid substitution with default value
    if (config.aggregator && rawValue !== undefined && !Array.isArray(rawValue)) {
      rawValue = [rawValue];
      if (debugDetailed.enabled)
        debugDetailed(`Wrapped scalar value in array for aggregation: ${JSON.stringify(rawValue)}`);
    }

    if (debugDetailed.enabled)
      debugDetailed(
        `Raw value for mapping "${mapping}" (target: ${config.target})` +
          ` from path "${path}": ${JSON.stringify(rawValue)}`
      );

    // Normalize [] to undefined
    if (Array.isArray(rawValue) && rawValue.length === 0) {
      rawValue = undefined;
      debugDetailed(`Normalized raw value = [] to undefined`);
    }

    if (Array.isArray(rawValue) && rawValue.some((item) => Array.isArray(item))) {
      rawValue = rawValue.flat(Infinity);
      if (debugDetailed.enabled) debugDetailed(`Flattened raw value: ${JSON.stringify(rawValue)}`);
    }

    let finalValue;
    if (config.aggregator) {
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        finalValue =
          config.aggregator === 'unique'
            ? Array.isArray(config.defaultValue)
              ? config.defaultValue
              : [config.defaultValue]
            : config.defaultValue;
        debugDetailed(
          `Using default value for aggregator "${config.aggregator}"` +
            ` for target "${config.target}" (${typeof finalValue})`
        );
      } else {
        switch (config.aggregator.toLowerCase()) {
          case 'max':
            finalValue = Math.max(...rawValue.map(Number));
            break;
          case 'min':
            finalValue = Math.min(...rawValue.map(Number));
            break;
          case 'avg':
          case 'average':
            finalValue = rawValue.map(Number).reduce((a, b) => a + b, 0) / rawValue.length;
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
        if (debugDetailed.enabled)
          debugDetailed(
            `Applied aggregator "${config.aggregator}"` +
              ` on value: ${JSON.stringify(rawValue)} -> ${typeof finalValue}`
          );
      }
    } else {
      finalValue = rawValue !== undefined ? rawValue : config.defaultValue;
    }

    if (config.condition) {
      finalValue = evaluateCondition(rawValue, config.condition, config.defaultValue);
      debugDetailed(
        `Condition "${config.condition}" applied for target "${config.target}" (${typeof finalValue})`
      );
    }
    variables[config.target] = finalValue;
  }

  if (debugDetailed.enabled) debugDetailed(`Extracted variables: ${JSON.stringify(variables)}`);
  return variables;
}

/** @param {string} formulaStr @param {Record<string,unknown>} variables @returns {unknown} */
function calculateScore(formulaStr, variables) {
  debugDetailed(`Evaluating formula: ${formulaStr}`);
  if (debugDetailed.enabled) debugDetailed(`Variables for formula: ${JSON.stringify(variables)}`);

  const result = evaluateExpression(formulaStr, variables);
  debugDetailed(`Result of formula has type: ${typeof result}`);
  return result;
}

/**
 * Finds the prioritized transcript from annotation based on biological relevance.
 * Priority order: pick=1 > mane=1 > canonical=1 > first transcript
 *
 * @param {import('./dataTypes').Annotation} annotation - The VEP annotation data.
 * @returns {import('./dataTypes').Transcript|null} The prioritized transcript consequence or null if none found.
 */
function _findPrioritizedTranscript(annotation) {
  if (
    !Array.isArray(annotation.transcript_consequences) ||
    annotation.transcript_consequences.length === 0
  ) {
    return null;
  }

  const transcripts = annotation.transcript_consequences;

  // 1. Find first transcript with pick === 1
  let prioritized = transcripts.find((tc) => tc.pick === 1);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with pick=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 2. Find first transcript with mane === 1
  prioritized =
    transcripts.find((tc) => tc.mane_select || tc.mane === 1) ||
    transcripts.find((tc) => tc.mane_plus_clinical);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with mane=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 3. Find first transcript with canonical === 1
  prioritized = transcripts.find((tc) => tc.canonical === 1);
  if (prioritized) {
    debugDetailed(`Found prioritized transcript with canonical=1: ${prioritized.transcript_id}`);
    return prioritized;
  }

  // 4. Return first transcript as fallback
  debugDetailed(`Using first transcript as fallback: ${transcripts[0].transcript_id}`);
  return transcripts[0];
}

/** @param {import('./analysisTypes').ScoringConfig['variables']} config
 * @returns {config is import('./analysisTypes').ScopedVariables}
 */
function isScopedVariables(config) {
  return 'aggregates' in config || 'transcriptFields' in config;
}

/**
 * Extracts variables for annotation-level scoring using scoped variable extraction.
 * Uses globally aggregated variables for variant-level fields and prioritized transcript
 * data for transcript-specific fields.
 *
 * @param {import('./dataTypes').Annotation} annotation - The VEP annotation data.
 * @param {import('./analysisTypes').ScoringConfig['variables']} variablesConfig - The variables configuration.
 * @returns {Record<string,unknown>} An object mapping variable names to their computed values.
 */
function _extractAnnotationVariables(annotation, variablesConfig) {
  /** @type {Record<string,unknown>} */
  const variables = {};
  const prioritizedTranscript = _findPrioritizedTranscript(annotation);

  // Handle new scoped configuration format
  if (isScopedVariables(variablesConfig)) {
    // Extract globally aggregated variables (variant-level)
    if (variablesConfig.aggregates) {
      const aggregateVars = extractVariables(annotation, variablesConfig.aggregates);
      Object.assign(variables, aggregateVars);
    }

    // Extract transcript-specific fields from prioritized transcript
    if (variablesConfig.transcriptFields) {
      const transcriptVars = extractVariables(
        prioritizedTranscript || {},
        variablesConfig.transcriptFields
      );
      Object.assign(variables, transcriptVars);
    }
  } else {
    // Legacy format - extract all variables from annotation with aggregation
    const legacyVars = extractVariables(annotation, variablesConfig);
    Object.assign(variables, legacyVars);
  }

  if (debugDetailed.enabled) debugDetailed(`Annotation variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Extracts variables for transcript-level scoring using scoped variable extraction.
 * Uses globally aggregated variables for variant-level fields and individual transcript
 * data for transcript-specific fields.
 *
 * @param {import('./dataTypes').Transcript} transcript - The transcript consequence data.
 * @param {import('./dataTypes').Annotation} annotation - The full VEP annotation data for context.
 * @param {import('./analysisTypes').ScoringConfig['variables']} variablesConfig - The variables configuration.
 * @returns {Record<string,unknown>} An object mapping variable names to their computed values.
 */
function _extractTranscriptVariables(transcript, annotation, variablesConfig) {
  /** @type {Record<string,unknown>} */
  const variables = {};

  // Handle new scoped configuration format
  if (isScopedVariables(variablesConfig)) {
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

  if (debugDetailed.enabled) debugDetailed(`Transcript variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Applies scoring algorithms to the provided VEP annotation data.
 *
 * For each annotation in the annotationData array, annotation-level formulas are applied
 * using a prioritized transcript approach. Transcript-level formulas use individual
 * transcript data for context-specific scoring.
 *
 * @param {import('./dataTypes').Annotation[]} annotationData - The VEP annotation data.
 * @param {import('./analysisTypes').ScoringConfig} scoringConfig
 *        The scoring configuration containing variables and formulas.
 * @returns {import('./dataTypes').Annotation[]} The original annotation data enhanced with calculated score fields at both
 *          annotation and transcript levels based on the provided scoring configuration
 */
function applyScoring(annotationData, scoringConfig) {
  // Log scoring configuration in debug mode
  if (debug.enabled) debug(`Applying scoring: ${JSON.stringify(scoringConfig)}`);
  const variablesConfig = scoringConfig.variables;
  const formulasConfig = scoringConfig.formulas;
  const { annotationLevel, transcriptLevel } = formulasConfig;

  // Process each annotation.
  annotationData.forEach((annotation) => {
    // Annotation-level scoring with prioritized transcript approach
    const annotationVariables = _extractAnnotationVariables(annotation, variablesConfig);

    annotationLevel.forEach((formula) => {
      for (const [scoreName, formulaStr] of Object.entries(formula)) {
        checkName(scoreName);
        const scoreValue = calculateScore(formulaStr, annotationVariables);
        annotation[scoreName] = scoreValue;
        debugDetailed(`Calculated ${scoreName} for annotation (${typeof scoreValue})`);
      }
    });

    // Transcript-level formulas with individual transcript context
    if (Array.isArray(annotation.transcript_consequences)) {
      annotation.transcript_consequences.forEach((transcript) => {
        const transcriptVariables = _extractTranscriptVariables(
          transcript,
          annotation,
          variablesConfig
        );
        transcriptLevel.forEach((formula) => {
          for (const [scoreName, formulaStr] of Object.entries(formula)) {
            checkName(scoreName);
            const scoreValue = calculateScore(formulaStr, transcriptVariables);
            transcript[scoreName] = scoreValue;
            debugDetailed(`Calculated ${scoreName} for transcript (${typeof scoreValue})`);
          }
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
