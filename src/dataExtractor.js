/**
 * @fileoverview Helper module for extracting and formatting data from variant annotation objects.
 * This module provides functions for flattening nested annotation data into tabular format.
 * @module dataExtractor
 */

'use strict';

const debug = require('debug')('variant-linker:data-extractor');
// Removed: const { formatAnnotationsToVcf } = require('./vcfFormatter'); // Breaks circular dependency
const { getDefaultColumnConfig } = require('./output/columns');
const { formatVcfCsqString } = require('./output/csq');
const { formatToTabular } = require('./output/tabular');

/**
 * Detects scoring fields present in annotation data.
 * Scoring fields are those that don't exist in the standard VEP output
 * and are typically added by the scoring module.
 *
 * @param {import('./dataTypes').Annotation[]} annotationData - Array of annotation objects
 * @returns {Array<string>} Array of scoring field names found
 */
function detectScoringFields(annotationData) {
  if (!Array.isArray(annotationData) || annotationData.length === 0) {
    return [];
  }

  // Standard VEP fields that should be excluded
  const standardFields = new Set([
    'input',
    'originalInput',
    'inputFormat',
    'variantKey',
    'originalVariantKey',
    'seq_region_name',
    'start',
    'end',
    'strand',
    'allele_string',
    'most_severe_consequence',
    'transcript_consequences',
    'colocated_variants',
    'regulatory_feature_consequences',
    'motif_feature_consequences',
    'intergenic_consequences',
    'id',
    'assembly_name',
    'ancestral',
    'minor_allele',
    'minor_allele_freq',
    'pubmed',
    'failed',
    'somatic',
    'frequencies',
    'existing_variation',
    'error',
    'warning',
    'deducedInheritancePattern',
    'recoderData',
    'allele',
    'vcfString',
    'phenotypes',
    'dosage_sensitivity',
    'userFeatureOverlaps',
    'user_feature_overlap',
  ]);

  const scoringFields = new Set();

  // Check first few annotations for scoring fields
  const samplesToCheck = Math.min(3, annotationData.length);
  for (let i = 0; i < samplesToCheck; i++) {
    const annotation = annotationData[i];
    if (annotation && typeof annotation === 'object') {
      Object.keys(annotation).forEach((key) => {
        if (!standardFields.has(key) && !key.startsWith('_')) {
          // Check if it looks like a scoring field (typically ends with _score or contains score)
          // or is a field added by scoring formulas
          scoringFields.add(key);
        }
      });
    }
  }

  return Array.from(scoringFields).sort();
}

/**
 * Extracts a field value from an object based on field configuration.
 * Supports dot notation paths and custom formatting.
 *
 * @param {unknown} dataObject - The object to extract data from
 * @param {Pick<import('./analysisTypes').Column,'path'|'defaultValue'|'formatter'>} fieldConfig - Configuration for the field to extract
 * @returns {unknown} The extracted and formatted value
 */
function extractField(dataObject, fieldConfig) {
  if (!dataObject || typeof dataObject !== 'object' || !fieldConfig || !fieldConfig.path) {
    return fieldConfig?.defaultValue || '';
  }

  const source = /** @type {Record<string,unknown>} */ (dataObject);
  // Handle simple paths without dots
  if (!fieldConfig.path.includes('.')) {
    const value = /** @type {Record<string,unknown>} */ (dataObject)[fieldConfig.path];
    if (value === undefined || value === null) {
      return fieldConfig.formatter
        ? fieldConfig.formatter(fieldConfig.defaultValue, source)
        : fieldConfig.defaultValue;
    }
    return fieldConfig.formatter ? fieldConfig.formatter(value, source) : value;
  }

  // Handle nested paths with dot notation
  const parts = fieldConfig.path.split('.');
  /** @type {unknown} */
  let current = dataObject;
  let wildcardMode = false;
  /** @type {unknown[]} */
  let results = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Handle wildcards for array traversal
    if (part === '*') {
      wildcardMode = true;
      if (!Array.isArray(current)) {
        // If path expects an array but current is not, return default value
        return fieldConfig.defaultValue;
      }

      // Get the subpath remaining
      const subpath = parts.slice(i + 1).join('.');
      if (!subpath) {
        // If '*' is the last part, return the array itself
        results = current;
        break;
      }

      // For each array item, recursively extract the remaining path
      for (const item of current) {
        const subConfig = {
          path: subpath,
          defaultValue: fieldConfig.defaultValue, // Propagate defaultValue
        };
        const extracted = extractField(item, subConfig);
        // Only push non-default values? Or handle default at the end?
        // Let's push all extracted values and handle defaults later if needed
        results.push(extracted);
      }
      break; // Exit the loop after processing the wildcard level
    }

    // Move to the next part of the path
    if (current === undefined || current === null || typeof current !== 'object') {
      return fieldConfig.defaultValue;
    }

    current = /** @type {Record<string,unknown>} */ (current)[part];
  }

  // Handle wildcard results
  if (wildcardMode) {
    // Filter out default values IF the defaultValue itself isn't what we want
    // This is complex; let's return the raw results for now.
    // The formatter can handle filtering if needed.
    if (results.length === 0) {
      return fieldConfig.defaultValue;
    }
    // Apply formatter if present, otherwise return the array of results
    return fieldConfig.formatter ? fieldConfig.formatter(results, source) : results;
  }

  // Handle regular path result
  if (current === undefined || current === null) {
    return fieldConfig.defaultValue;
  }

  return fieldConfig.formatter ? fieldConfig.formatter(current, source) : current;
}

/**
 * Flattens annotation data into rows based on a "flatten by consequence" strategy.
 * Each row represents a single transcript consequence, with variant-level information repeated.
 *
 * @param {import('./dataTypes').Annotation[]} annotationData - Array of variant annotation objects
 * @param {import('./analysisTypes').Column[]} columnConfig - Configuration for columns to extract
 * @returns {Record<string,unknown>[]} Flattened array of row objects
 */
function flattenAnnotationData(annotationData, columnConfig = getDefaultColumnConfig()) {
  if (!Array.isArray(annotationData)) {
    debug('Warning: annotationData is not an array');
    return [];
  }

  const flatRows = [];
  debug(`Flattening ${annotationData.length} annotation(s)`);

  for (const annotation of annotationData) {
    // Extract top-level fields (non-consequence level)
    /** @type {Record<string,unknown>} */
    const topLevelData = {};

    columnConfig
      .filter((config) => !config.isConsequenceLevel)
      .forEach((config) => {
        topLevelData[config.header] = extractField(annotation, config);
      });

    // Process transcript consequences if they exist
    const hasConsequences =
      annotation.transcript_consequences &&
      Array.isArray(annotation.transcript_consequences) &&
      annotation.transcript_consequences.length > 0;

    if (hasConsequences) {
      // Create rows from consequence data
      for (const consequence of annotation.transcript_consequences || []) {
        const rowData = { ...topLevelData };

        // Add consequence-level fields
        columnConfig
          .filter((config) => config.isConsequenceLevel)
          .forEach((config) => {
            // Pass the consequence object to extractField
            rowData[config.header] = extractField(consequence, config);
          });

        flatRows.push(rowData);
      }
    } else {
      // For variants without consequences, create row with default consequence values
      const rowData = { ...topLevelData };

      columnConfig
        .filter((config) => config.isConsequenceLevel)
        .forEach((config) => {
          rowData[config.header] = config.defaultValue;
        });

      flatRows.push(rowData);
    }
  }

  debug(`Flattened to ${flatRows.length} row(s)`);
  return flatRows;
}

module.exports = {
  extractField,
  flattenAnnotationData,
  formatToTabular,
  formatVcfCsqString, // Export the function
  getDefaultColumnConfig, // Export the function
  detectScoringFields, // Export the new function
};
