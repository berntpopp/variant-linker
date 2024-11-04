// src/scoring.js

const fs = require('fs');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Reads and parses the scoring configuration files.
 * 
 * @param {string} configPath - The path to the scoring configuration directory.
 * @returns {Object} The parsed scoring configuration.
 */
function readScoringConfig(configPath) {
  try {
    const variableAssignmentPath = `${configPath}/variable_assignment_config.json`;
    const formulaPath = `${configPath}/formula_config.json`;

    debug(`Reading scoring configuration files from: ${configPath}`);

    const variableAssignmentConfig = JSON.parse(fs.readFileSync(variableAssignmentPath, 'utf-8'));
    const formulaConfig = JSON.parse(fs.readFileSync(formulaPath, 'utf-8'));

    debug(`Variable Assignment Config: ${JSON.stringify(variableAssignmentConfig)}`);
    debug(`Formula Config: ${JSON.stringify(formulaConfig)}`);

    return { variableAssignmentConfig: variableAssignmentConfig.variables, formulaConfig: formulaConfig.formulas };
  } catch (error) {
    debug(`Error reading scoring configuration files: ${error.message}`);
    throw error;
  }
}

/**
 * Applies the scoring algorithm based on the configuration to the annotation data.
 * 
 * @param {Array} annotationData - The VEP annotation data.
 * @param {Object} scoringConfig - The scoring configuration.
 * @returns {Array} The annotation data with added meta scores.
 */
function applyScoring(annotationData, scoringConfig) {
  debug(`Applying scoring with configuration: ${JSON.stringify(scoringConfig)}`);

  const variablesConfig = scoringConfig.variableAssignmentConfig;
  const formulasConfig = scoringConfig.formulaConfig.formulas;

  if (!formulasConfig || !formulasConfig.annotation_level || !formulasConfig.transcript_level) {
    throw new Error('Formulas configuration should contain annotation_level and transcript_level formulas under formulas');
  }

  // Process each annotation in the annotationData array
  annotationData.forEach(annotation => {
    // Apply annotation-level formulas
    const annotationVariables = extractVariables(annotation, variablesConfig);

    formulasConfig.annotation_level.forEach(formula => {
      const scoreName = Object.keys(formula)[0];
      const formulaStr = formula[scoreName];
      annotation[scoreName] = calculateScore(formulaStr, annotationVariables);
      debugDetailed(`Calculated ${scoreName} for annotation: ${annotation[scoreName]}`);
    });

    // Apply transcript-level formulas if transcript_consequences exist
    if (annotation.transcript_consequences) {
      annotation.transcript_consequences.forEach(transcript => {
        const transcriptVariables = extractVariables(transcript, variablesConfig, annotation);

        formulasConfig.transcript_level.forEach(formula => {
          const scoreName = Object.keys(formula)[0];
          const formulaStr = formula[scoreName];
          transcript[scoreName] = calculateScore(formulaStr, transcriptVariables);
          debugDetailed(`Calculated ${scoreName} for transcript: ${transcript[scoreName]}`);
        });
      });
    }
  });

  return annotationData;
}

/**
 * Extracts variables from the annotation data based on the configuration.
 * 
 * @param {Object} transcript - A single transcript consequence object.
 * @param {Object} variablesConfig - The variables configuration.
 * @param {Object} annotation - The entire annotation object.
 * @returns {Object} The extracted variables.
 */
function extractVariables(transcript, variablesConfig, annotation) {
  const variables = {};

  for (const [path, variableName] of Object.entries(variablesConfig)) {
    const value = getValueByPath(annotation, path, transcript);
    debugDetailed(`Extracted variable: ${variableName} = ${value !== undefined ? value : 0}`);
    variables[variableName] = value !== undefined ? value : 0;
  }

  debug(`Extracted variables: ${JSON.stringify(variables)}`);
  return variables;
}

/**
 * Retrieves the value from an object by a dot-separated path.
 * This function supports wildcards (*) to traverse arrays within the object.
 * It can also use a context object for relative paths.
 * 
 * @param {Object} obj - The object to retrieve the value from.
 * @param {string} path - The dot-separated path to the value.
 * @param {Object} [context] - The optional context object to use for relative paths.
 * @returns {*} The value at the specified path.
 */
function getValueByPath(obj, path, context) {
  const parts = path.split('.');
  let value = obj;

  for (const part of parts) {
    if (part === '*') {
      if (Array.isArray(value)) {
        debugDetailed(`Wildcard found, iterating over array: ${JSON.stringify(value)}`);
        const results = value.flatMap(item => getValueByPath(item, parts.slice(parts.indexOf(part) + 1).join('.'), context)).filter(v => v !== null && v !== undefined);
        return results.length === 1 ? results[0] : results; // Return single value if only one result
      } else if (typeof value === 'object' && value !== null) {
        debugDetailed(`Wildcard found but value is not an array, continuing traversal: ${JSON.stringify(value)}`);
        const remainingPath = parts.slice(parts.indexOf(part) + 1).join('.');
        const result = [];
        for (const key in value) {
          if (Object.hasOwnProperty.call(value, key)) {
            const nestedValue = getValueByPath(value[key], remainingPath, context);
            if (nestedValue !== undefined) {
              result.push(nestedValue);
            }
          }
        }
        return result.length === 1 ? result[0] : result; // Return single value if only one result
      } else {
        debugDetailed(`Wildcard found but value is not traversable: ${JSON.stringify(value)}`);
        return [];
      }
    } else if (value && value[part] !== undefined) {
      value = value[part];
      debugDetailed(`Navigating to part: ${part}, value: ${JSON.stringify(value)}`);
    } else if (context && context[part] !== undefined) {
      value = context[part];
      debugDetailed(`Part not found in current value, using context: ${part}, value: ${JSON.stringify(value)}`);
    } else {
      debugAll(`Part not found: ${part}`);
      return undefined;
    }
  }

  debugAll(`Final value: ${JSON.stringify(value)}`);
  return value;
}

/**
 * Calculates the score based on the formula string and variables.
 * 
 * @param {string} formulaStr - The formula string.
 * @param {Object} variables - The variables to use in the formula.
 * @returns {number} The calculated score.
 */
function calculateScore(formulaStr, variables) {
  const formula = new Function(...Object.keys(variables), `return ${formulaStr}`);
  return formula(...Object.values(variables));
}

module.exports = {
  readScoringConfig,
  applyScoring
};
