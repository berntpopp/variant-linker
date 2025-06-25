/**
 * @fileoverview Helper module for extracting and formatting data from variant annotation objects.
 * This module provides functions for flattening nested annotation data into tabular format.
 * @module dataExtractor
 */

'use strict';

const debug = require('debug')('variant-linker:data-extractor');
// Removed: const { formatAnnotationsToVcf } = require('./vcfFormatter'); // Breaks circular dependency
const { formatUserFeatureOverlaps } = require('./featureAnnotator');

/**
 * Default column configuration for CSV/TSV output.
 * Each entry defines a column with:
 * - header: The column header name
 * - path: Dot-notation path to the data within the object
 * - isConsequenceLevel: Whether the path is relative to a consequence (true) or annotation (false)
 * - defaultValue: Value to use if the path is not found
 * - formatter: Optional function to format the extracted value
 */
/**
 * Gets the default column configuration for data extraction.
 * @param {Object} options - Optional settings for column generation
 * @param {boolean} options.includeInheritance - Whether to include inheritance pattern columns
 * @returns {Array} Array of column configuration objects
 */
function getDefaultColumnConfig(options = {}) {
  const { includeInheritance = false, includeUserFeatures = false, includeCnv = false } = options;

  // Start with core columns that are always included
  const defaultColumns = [
    {
      header: 'OriginalInput',
      path: 'originalInput', // <-- FIX: Use originalInput field added by processor
      isConsequenceLevel: false,
      defaultValue: '',
    },
  ];

  // Add inheritance pattern columns if requested
  if (includeInheritance) {
    defaultColumns.push(
      {
        header: 'DeducedInheritancePattern',
        path: 'deducedInheritancePattern.prioritizedPattern',
        isConsequenceLevel: false,
        defaultValue: '',
      },
      {
        header: 'CompHetPartner',
        path: 'deducedInheritancePattern.compHetDetails.partnerVariantKeys',
        isConsequenceLevel: false,
        defaultValue: '',
        formatter: (value) => (Array.isArray(value) ? value.join(',') : value),
      },
      {
        header: 'CompHetGene',
        path: 'deducedInheritancePattern.compHetDetails.geneSymbol',
        isConsequenceLevel: false,
        defaultValue: '',
      }
    );
  }

  // Add remaining standard columns
  defaultColumns.push(
    {
      header: 'VEPInput',
      path: 'input', // <-- FIX: Use the 'input' field which holds the VEP-formatted input
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
        return `${value}:${start}-${end}(${strand || '1'})`; // Ensure strand defaults to 1 if missing
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
      path: 'impact', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'GeneSymbol',
      path: 'gene_symbol', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'GeneID',
      path: 'gene_id', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'FeatureType',
      path: 'feature_type', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'TranscriptID',
      path: 'transcript_id', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ConsequenceTerms',
      path: 'consequence_terms', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
    },
    {
      header: 'MANE',
      path: 'mane', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      // Ensure MANE array values are handled correctly (e.g., join or take first)
      formatter: (value) => {
        if (!value) return '';
        // VEP returns MANE values like ["MANE_Select"], ["MANE_Plus_Clinical"] or null
        // We want to extract the string inside if present
        if (Array.isArray(value) && value.length > 0) {
          // Handle potential nested arrays or complex structures if needed
          // Simple approach: join strings if multiple, otherwise take the first element
          return value.map(String).join(',');
        } else if (typeof value === 'string') {
          return value;
        }
        return ''; // Default if not array or string
      },
    },
    {
      header: 'HGVSc',
      path: 'hgvsc', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'HGVSp',
      path: 'hgvsp', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ProteinPosition',
      path: 'protein_start', // Base path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      formatter: (value, obj) => {
        // obj here is the consequence object
        if (!value) return '';
        const end = obj.protein_end || value;
        return `${value}-${end}`;
      },
    },
    {
      header: 'Amino_acids',
      path: 'amino_acids', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'Codons',
      path: 'codons', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ExistingVariation',
      path: 'existing_variation',
      isConsequenceLevel: false, // This IS annotation level
      defaultValue: '',
      formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
    },
    {
      header: 'CADD',
      // CADD scores are often top-level, but check VEP response structure.
      // If cadd_phred exists within consequence, change isConsequenceLevel to true
      // Assuming it's annotation level for now based on previous structure.
      path: 'cadd_phred',
      isConsequenceLevel: false, // This IS annotation level
      defaultValue: '',
    },
    {
      header: 'SIFT',
      path: 'sift_prediction', // <-- FIX: Path relative to consequence
      isConsequenceLevel: true, // Should be true
      defaultValue: '',
    },
    {
      header: 'PolyPhen',
      path: 'polyphen_prediction', // <-- FIX: Path relative to consequence
      isConsequenceLevel: true, // Should be true
      defaultValue: '',
    }
    // Add any other custom score columns here if needed
    // e.g., from the scoring module output, which might be top-level or consequence-level
  );

  // Add user feature overlap column if requested
  if (includeUserFeatures) {
    defaultColumns.push({
      header: 'UserFeatureOverlap',
      path: 'user_feature_overlap',
      isConsequenceLevel: false,
      defaultValue: '',
      formatter: formatUserFeatureOverlaps,
    });
  }

  // Add CNV-specific columns if requested
  if (includeCnv) {
    defaultColumns.push(
      {
        header: 'BP_Overlap',
        path: 'bp_overlap',
        isConsequenceLevel: true, // This is a per-consequence field from VEP
        defaultValue: '',
      },
      {
        header: 'Percentage_Overlap',
        path: 'percentage_overlap',
        isConsequenceLevel: true, // This is a per-consequence field from VEP
        defaultValue: '',
      },
      {
        header: 'Phenotypes',
        path: 'phenotypes',
        isConsequenceLevel: false, // This is a top-level annotation field
        defaultValue: '',
        formatter: (value) => {
          if (!value) return '';
          if (Array.isArray(value)) {
            return value.map((p) => p.phenotype || p).join(';');
          }
          return value;
        },
      },
      {
        header: 'DosageSensitivity',
        path: 'dosage_sensitivity',
        isConsequenceLevel: false, // This is a top-level annotation field
        defaultValue: '',
        formatter: (value) => {
          if (!value) return '';
          if (typeof value === 'object') {
            // Format dosage sensitivity information
            const parts = [];
            if (value.gene_name) parts.push(`Gene:${value.gene_name}`);
            if (value.phaplo) parts.push(`Haplo:${value.phaplo}`);
            if (value.ptriplo) parts.push(`Triplo:${value.ptriplo}`);
            return parts.join(';');
          }
          return value;
        },
      }
    );
  }

  return defaultColumns;
}

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

    current = current[part];
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
function flattenAnnotationData(annotationData, columnConfig = getDefaultColumnConfig()) {
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
  columnConfig = getDefaultColumnConfig(),
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
        // Handle arrays specifically if needed, otherwise stringify
        if (Array.isArray(value)) {
          value = value.join(';'); // Example: join arrays with semicolon
        } else {
          value = JSON.stringify(value);
        }
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
 * Helper function for CSQ handlers that prioritizes current consequence but falls back
 * to most severe consequence logic when field is missing.
 * @param {Object} annotation - The annotation object with current_consequence
 * @param {string} fieldName - The field name to extract from the consequence
 * @returns {*} The field value from current consequence or fallback logic
 */
function getConsequenceFieldWithFallback(annotation, fieldName) {
  if (!annotation?.transcript_consequences?.length) {
    return '';
  }

  const currentConsequence = annotation.current_consequence;

  // First, try to get the field from the current consequence being processed
  if (
    currentConsequence &&
    currentConsequence[fieldName] !== undefined &&
    currentConsequence[fieldName] !== null &&
    currentConsequence[fieldName] !== ''
  ) {
    return currentConsequence[fieldName];
  }

  // If current consequence doesn't have the field, apply most-severe-consequence fallback
  const mostSevereConsequence = annotation.most_severe_consequence;

  if (mostSevereConsequence) {
    // Try to find the transcript consequence that matches the most severe consequence
    const matchingCons = annotation.transcript_consequences.find((c) =>
      c.consequence_terms?.includes(mostSevereConsequence)
    );

    if (
      matchingCons &&
      matchingCons[fieldName] !== undefined &&
      matchingCons[fieldName] !== null &&
      matchingCons[fieldName] !== ''
    ) {
      return matchingCons[fieldName];
    }
  }

  // Final fallback: find the first consequence that has this field with a non-empty value
  const fallbackCons = annotation.transcript_consequences.find(
    (c) => c[fieldName] !== undefined && c[fieldName] !== null && c[fieldName] !== ''
  );

  return fallbackCons?.[fieldName] || '';
}

/**
 * Maps VCF CSQ field names (VEP style) to paths within the annotation object
 * or provides special handling logic.
 * This mapping prioritizes extracting data from the transcript consequence that matches
 * the top-level most_severe_consequence field. Falls back to the first available data
 * if a match is not found.
 * Uses getDefaultColumnConfig() as a base where possible.
 */
const csqFieldMapping = {
  Allele: (ann, alt) => alt || '', // Special case: Use provided ALT
  Consequence: (ann) => {
    // Get consequence terms from the current transcript being processed
    const currentConsequence = ann.current_consequence;
    if (currentConsequence?.consequence_terms?.length > 0) {
      return currentConsequence.consequence_terms.join('&');
    }
    // Fallback to first transcript consequence if current is not available
    const cons = ann?.transcript_consequences?.[0];
    if (cons?.consequence_terms?.length > 0) {
      return cons.consequence_terms.join('&');
    }
    // Final fallback to most_severe_consequence if no transcript consequences
    return ann?.most_severe_consequence || '';
  },
  IMPACT: (ann) => getConsequenceFieldWithFallback(ann, 'impact'),
  SYMBOL: (ann) => getConsequenceFieldWithFallback(ann, 'gene_symbol'),
  Gene: (ann) => getConsequenceFieldWithFallback(ann, 'gene_id'),
  Feature_type: (ann) => getConsequenceFieldWithFallback(ann, 'feature_type'),
  Feature: (ann) => getConsequenceFieldWithFallback(ann, 'transcript_id'),
  BIOTYPE: (ann) => getConsequenceFieldWithFallback(ann, 'biotype'),
  HGVSc: (ann) => getConsequenceFieldWithFallback(ann, 'hgvsc'),
  HGVSp: (ann) => getConsequenceFieldWithFallback(ann, 'hgvsp'),
  Protein_position: (ann) => {
    if (!ann?.transcript_consequences?.length) return '';

    const currentConsequence = ann.current_consequence;

    // First, try current consequence
    if (currentConsequence?.protein_start) {
      const end = currentConsequence.protein_end || currentConsequence.protein_start;
      return `${currentConsequence.protein_start}-${end}`;
    }

    // If current consequence doesn't have protein_start, apply most-severe-consequence fallback
    const mostSevereConsequence = ann.most_severe_consequence;
    let targetCons = null;

    if (mostSevereConsequence) {
      targetCons = ann.transcript_consequences.find(
        (c) => c.consequence_terms?.includes(mostSevereConsequence) && c.protein_start
      );
    }

    if (!targetCons) {
      targetCons = ann.transcript_consequences.find((c) => c.protein_start);
    }

    if (!targetCons?.protein_start) return '';
    const end = targetCons.protein_end || targetCons.protein_start;
    return `${targetCons.protein_start}-${end}`;
  },
  Amino_acids: (ann) => getConsequenceFieldWithFallback(ann, 'amino_acids'),
  Codons: (ann) => getConsequenceFieldWithFallback(ann, 'codons'),
  Existing_variation: (ann) =>
    Array.isArray(ann?.existing_variation)
      ? ann.existing_variation.join('&')
      : ann?.existing_variation || '',
  // SIFT/PolyPhen are now extracted from the most severe consequence when possible
  SIFT: (ann) => getConsequenceFieldWithFallback(ann, 'sift_prediction'),
  PolyPhen: (ann) => getConsequenceFieldWithFallback(ann, 'polyphen_prediction'),
  // Add mappings for other VEP fields if needed
};

/**
 * Formats a single annotation object into a VCF CSQ string field value.
 * Generates a comma-separated list of CSQ strings, one for each transcript consequence.
 *
 * @param {Object} annotation - The annotation object (usually from VEP results).
 * @param {Array<string>} csqFormatFields - An array of CSQ field names in the desired order
 *   (e.g., from vlCsqFormat in processor).
 * @param {string} altAllele - The specific ALT allele this consequence pertains to.
 * @returns {string} The formatted CSQ string (pipe-separated values, comma-separated for multiple consequences),
 *                   or empty string if no data.
 */
function formatVcfCsqString(annotation, csqFormatFields, altAllele) {
  if (!annotation || !Array.isArray(csqFormatFields) || csqFormatFields.length === 0) {
    return '';
  }

  // Check if there are any consequences before generating CSQ string
  if (!annotation.transcript_consequences || annotation.transcript_consequences.length === 0) {
    return '';
  }

  // Generate a CSQ string for each transcript consequence
  const csqStrings = annotation.transcript_consequences.map((consequence) => {
    const values = csqFormatFields.map((fieldName) => {
      const handler = csqFieldMapping[fieldName];
      let value = '';
      if (typeof handler === 'function') {
        // Call the handler with the original annotation context so it can make decisions
        // across all transcripts, but also provide the current consequence being processed
        const contextWithCurrentConsequence = {
          ...annotation,
          current_consequence: consequence,
        };
        value = handler(contextWithCurrentConsequence, altAllele);
      } else {
        // Basic fallback: Look for a direct property match (lowercase) in the consequence itself first
        value =
          consequence[fieldName.toLowerCase()] !== undefined
            ? consequence[fieldName.toLowerCase()]
            : annotation[fieldName.toLowerCase()] || ''; // Fallback to top-level annotation

        // Only log warning if data is expected but not found
        if (value === '') {
          debug(
            `Warning: No specific CSQ handler or direct property found for field '${fieldName}'. ` +
              'Using empty string.'
          );
        }
      }

      // Ensure value is a string and handle null/undefined
      value = value === null || value === undefined ? '' : String(value);

      // VEP standard: URL-encode potentially problematic characters like pipe (|), comma (,), semicolon (;)
      // Use encodeURIComponent for broader safety, although VEP's exact encoding might differ slightly.
      // Avoid encoding empty strings.
      return value ? encodeURIComponent(value) : '';
    });

    return values.join('|'); // Pipe-separate fields within a single CSQ string
  });

  // Comma-separate the CSQ strings for different consequences
  return csqStrings.join(',');
}

module.exports = {
  extractField,
  flattenAnnotationData,
  formatToTabular,
  formatVcfCsqString, // Export the function
  getDefaultColumnConfig, // Export the function
};
