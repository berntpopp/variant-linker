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

/**
 * Maps VCF CSQ field names (VEP style) to paths within the annotation object
 * or provides special handling logic.
 * Uses defaultColumnConfig as a base where possible.
 */
const csqFieldMapping = {
  Allele: (ann, alt) => alt || '', // Special case: Use provided ALT
  Consequence: (ann) => ann?.most_severe_consequence || '', // Direct mapping
  IMPACT: (ann) => {
    // Find impact from the most severe consequence within the transcript_consequences array
    const cons = ann?.transcript_consequences?.find((c) =>
      c.consequence_terms?.includes(ann.most_severe_consequence)
    );
    return cons?.impact || '';
  },
  SYMBOL: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.gene_symbol);
    return cons?.gene_symbol || '';
  },
  Gene: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.gene_id);
    return cons?.gene_id || '';
  },
  Feature_type: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.feature_type);
    return cons?.feature_type || '';
  },
  Feature: (ann) => {
    // Usually transcript_id for transcripts
    const cons = ann?.transcript_consequences?.find((c) => c.transcript_id);
    return cons?.transcript_id || '';
  },
  BIOTYPE: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.biotype);
    return cons?.biotype || '';
  },
  HGVSc: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.hgvsc);
    return cons?.hgvsc || '';
  },
  HGVSp: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.hgvsp);
    return cons?.hgvsp || '';
  },
  Protein_position: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.protein_start);
    if (!cons?.protein_start) return '';
    const end = cons.protein_end || cons.protein_start;
    return `${cons.protein_start}-${end}`;
  },
  Amino_acids: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.amino_acids);
    return cons?.amino_acids || '';
  },
  Codons: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.codons);
    return cons?.codons || '';
  },
  Existing_variation: (ann) =>
    Array.isArray(ann?.existing_variation)
      ? ann.existing_variation.join('&')
      : ann?.existing_variation || '',
  // Note: SIFT/PolyPhen often apply per-transcript. This gets the first one found.
  // A more complex implementation might try to match the specific transcript.
  SIFT: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.sift_prediction);
    return cons?.sift_prediction || '';
  },
  PolyPhen: (ann) => {
    const cons = ann?.transcript_consequences?.find((c) => c.polyphen_prediction);
    return cons?.polyphen_prediction || '';
  },
  // Add mappings for other VEP fields if needed
};

/**
 * Formats a single annotation object into a VCF CSQ string field value.
 *
 * @param {Object} annotation - The annotation object (usually from VEP results).
 * @param {Array<string>} csqFormatFields - An array of CSQ field names in the desired order
 *   (e.g., from vlCsqFormat in processor).
 * @param {string} altAllele - The specific ALT allele this consequence pertains to.
 * @returns {string} The formatted CSQ string (pipe-separated values), or empty string if no data.
 */
function formatVcfCsqString(annotation, csqFormatFields, altAllele) {
  if (!annotation || !Array.isArray(csqFormatFields) || csqFormatFields.length === 0) {
    return '';
  }

  const values = csqFormatFields.map((fieldName) => {
    const handler = csqFieldMapping[fieldName];
    let value = '';
    if (typeof handler === 'function') {
      value = handler(annotation, altAllele); // Pass annotation and altAllele
    } else {
      // Basic fallback: Look for a direct property match (lowercase)
      value = annotation[fieldName.toLowerCase()] || '';
      debug(
        `Warning: No specific CSQ handler for field '${fieldName}'. ` +
          'Using direct property lookup.'
      );
    }

    // Sanitize value: replace pipes, semicolons, commas, equals, spaces with underscore or encode?
    // VEP uses URL encoding for problematic characters within fields.
    // Simple approach: replace common delimiters. More robust: URL encode.
    // For now, just ensure it's a string and handle null/undefined.
    value = value === null || value === undefined ? '' : String(value);

    // Replace problematic characters (simple approach)
    // return value.replace(/[|;,=\s]/g, '_');
    // VEP standard: URL-encode
    return encodeURIComponent(value);
  });

  return values.join('|');
}

module.exports = {
  extractField,
  flattenAnnotationData,
  formatToTabular,
  formatVcfCsqString, // Export the new function
  defaultColumnConfig,
};
