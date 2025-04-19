/**
 * @fileoverview Helper module for extracting and formatting data from variant annotation objects.
 * This module provides functions for flattening nested annotation data into tabular format.
 * @module dataExtractor
 */

'use strict';

const debug = require('debug')('variant-linker:data-extractor');

/**
 * Default column configuration for CSV/TSV output.
 * Each entry defines a column with:
 * - header: The column header name
 * - path: Dot-notation path to the data within the object
 * - isConsequenceLevel: Whether the path is relative to a consequence (true) or annotation (false)
 * - defaultValue: Value to use if the path is not found
 * - formatter: Optional function to format the extracted value
 */
const defaultColumnConfig = [
  {
    header: 'OriginalInput',
    path: 'input',
    isConsequenceLevel: false,
    defaultValue: '',
  },
  {
    header: 'VEPInput',
    path: 'id',
    isConsequenceLevel: false,
    defaultValue: '',
  },
  {
    header: 'Location',
    path: 'seq_region_name',
    isConsequenceLevel: false,
    defaultValue: '',
    formatter: (value, obj) => {
      if (!value) return '';
      const start = obj.start || '';
      const end = obj.end || '';
      const strand = obj.strand || '';
      return `${value}:${start}-${end}(${strand})`;
    },
  },
  {
    header: 'Allele',
    path: 'allele_string',
    isConsequenceLevel: false,
    defaultValue: '',
  },
  {
    header: 'MostSevereConsequence',
    path: 'most_severe_consequence',
    isConsequenceLevel: false,
    defaultValue: '',
  },
  {
    header: 'Impact',
    path: 'impact',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'GeneSymbol',
    path: 'gene_symbol',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'GeneID',
    path: 'gene_id',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'FeatureType',
    path: 'feature_type',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'TranscriptID',
    path: 'transcript_id',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'ConsequenceTerms',
    path: 'consequence_terms',
    isConsequenceLevel: true,
    defaultValue: '',
    formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
  },
  {
    header: 'MANE',
    path: 'mane',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'HGVSc',
    path: 'hgvsc',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'HGVSp',
    path: 'hgvsp',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'ProteinPosition',
    path: 'protein_start',
    isConsequenceLevel: true,
    defaultValue: '',
    formatter: (value, obj) => {
      if (!value) return '';
      const end = obj.protein_end || value;
      return `${value}-${end}`;
    },
  },
  {
    header: 'Amino_acids',
    path: 'amino_acids',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'Codons',
    path: 'codons',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'ExistingVariation',
    path: 'existing_variation',
    isConsequenceLevel: false,
    defaultValue: '',
    formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
  },
  {
    header: 'CADD',
    path: 'cadd_phred',
    isConsequenceLevel: false,
    defaultValue: '',
  },
  {
    header: 'SIFT',
    path: 'transcript_consequences.*.sift_prediction',
    isConsequenceLevel: true,
    defaultValue: '',
  },
  {
    header: 'PolyPhen',
    path: 'transcript_consequences.*.polyphen_prediction',
    isConsequenceLevel: true,
    defaultValue: '',
  },
];

/**
 * Extracts a field value from an object based on field configuration.
 * Supports dot notation paths and custom formatting.
 *
 * @param {Object} dataObject - The object to extract data from
 * @param {Object} fieldConfig - Configuration for the field to extract
 * @param {string} fieldConfig.path - Dot-notation path to the data
 * @param {*} fieldConfig.defaultValue - Default value if path not found
 * @param {Function} [fieldConfig.formatter] - Optional function to format the value
 * @returns {*} The extracted and formatted value
 */
function extractField(dataObject, fieldConfig) {
  if (!dataObject || !fieldConfig || !fieldConfig.path) {
    return fieldConfig?.defaultValue || '';
  }

  // Handle simple paths without dots
  if (!fieldConfig.path.includes('.')) {
    const value = dataObject[fieldConfig.path];
    if (value === undefined || value === null) {
      return fieldConfig.defaultValue;
    }
    return fieldConfig.formatter ? fieldConfig.formatter(value, dataObject) : value;
  }

  // Handle nested paths with dot notation
  const parts = fieldConfig.path.split('.');
  let current = dataObject;
  let wildcardMode = false;
  let results = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Handle wildcards for array traversal
    if (part === '*') {
      wildcardMode = true;
      if (!Array.isArray(current)) {
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
          defaultValue: fieldConfig.defaultValue,
        };
        const extracted = extractField(item, subConfig);
        if (extracted !== fieldConfig.defaultValue) {
          results.push(extracted);
        }
      }
      break;
    }

    if (current === undefined || current === null) {
      return fieldConfig.defaultValue;
    }

    current = current[part];
  }

  // Handle wildcard results
  if (wildcardMode) {
    if (results.length === 0) {
      return fieldConfig.defaultValue;
    }
    // Remove duplicates
    results = [...new Set(results)];
    return fieldConfig.formatter ? fieldConfig.formatter(results, dataObject) : results;
  }

  // Handle regular path result
  if (current === undefined || current === null) {
    return fieldConfig.defaultValue;
  }

  return fieldConfig.formatter ? fieldConfig.formatter(current, dataObject) : current;
}

/**
 * Flattens annotation data into rows based on a "flatten by consequence" strategy.
 * Each row represents a single transcript consequence, with variant-level information repeated.
 *
 * @param {Array<Object>} annotationData - Array of variant annotation objects
 * @param {Array<Object>} columnConfig - Configuration for columns to extract
 * @returns {Array<Object>} Flattened array of row objects
 */
function flattenAnnotationData(annotationData, columnConfig = defaultColumnConfig) {
  if (!Array.isArray(annotationData)) {
    debug('Warning: annotationData is not an array');
    return [];
  }

  const flatRows = [];
  debug(`Flattening ${annotationData.length} annotation(s)`);

  for (const annotation of annotationData) {
    // Extract top-level fields (non-consequence level)
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
      for (const consequence of annotation.transcript_consequences) {
        const rowData = { ...topLevelData };

        // Add consequence-level fields
        columnConfig
          .filter((config) => config.isConsequenceLevel)
          .forEach((config) => {
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

/**
 * Formats flattened data rows into a tabular format (CSV/TSV)
 *
 * @param {Array<Object>} flatRows - Flattened data rows from flattenAnnotationData
 * @param {Array<Object>} columnConfig - Configuration for columns
 * @param {string} delimiter - Delimiter character (',' for CSV, '\t' for TSV)
 * @param {boolean} [includeHeader=true] - Whether to include the header row
 * @returns {string} Formatted CSV/TSV string
 */
function formatToTabular(
  flatRows,
  columnConfig = defaultColumnConfig,
  delimiter,
  includeHeader = true
) {
  if (!Array.isArray(flatRows) || flatRows.length === 0) {
    return includeHeader ? columnConfig.map((col) => col.header).join(delimiter) : '';
  }

  const lines = [];
  const headers = columnConfig.map((col) => col.header);

  // Add header row if requested
  if (includeHeader) {
    lines.push(headers.join(delimiter));
  }

  // Add data rows
  for (const row of flatRows) {
    const rowValues = headers.map((header) => {
      let value = row[header];

      // Handle different data types
      if (value === undefined || value === null) {
        value = '';
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }

      // Apply CSV escaping for comma-delimited files
      if (
        delimiter === ',' &&
        (value.includes(',') || value.includes('"') || value.includes('\n'))
      ) {
        // Escape quotes by doubling them and wrap the value in quotes
        value = `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    });

    lines.push(rowValues.join(delimiter));
  }

  return lines.join('\n');
}

module.exports = {
  extractField,
  flattenAnnotationData,
  formatToTabular,
  defaultColumnConfig,
};
