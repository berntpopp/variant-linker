/**
 * @fileoverview Helper module for extracting and formatting data from variant annotation objects.
 * This module provides functions for flattening nested annotation data into tabular format.
 * @module dataExtractor
 */

'use strict';

const debug = require('debug')('variant-linker:data-extractor');
// Removed: const { formatAnnotationsToVcf } = require('./vcfFormatter'); // Breaks circular dependency

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
  const { includeInheritance = false } = options;

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
 * Maps VCF CSQ field names (VEP style) to paths within the annotation object
 * or provides special handling logic.
 * Uses getDefaultColumnConfig() as a base where possible.
 */
const csqFieldMapping = {
  Allele: (ann, alt) => alt || '', // Special case: Use provided ALT
  Consequence: (ann) => {
    // Get consequence terms from the first transcript consequence
    const cons = ann?.transcript_consequences?.[0];
    if (cons?.consequence_terms?.length > 0) {
      return cons.consequence_terms.join('&');
    }
    // Fallback to most_severe_consequence if no transcript consequences
    return ann?.most_severe_consequence || '';
  },
  IMPACT: (ann) => {
    // Find impact from the first transcript consequence matching the most severe consequence
    const matchingCons = ann?.transcript_consequences?.find((c) =>
      c.consequence_terms?.includes(ann.most_severe_consequence)
    );
    // Fallback to impact of the first consequence if no exact match
    return matchingCons?.impact || ann?.transcript_consequences?.[0]?.impact || '';
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
        // Create a temporary annotation object representing just this consequence
        // This ensures the handler functions correctly find the data within the current consequence context
        const tempAnnotationContext = {
          ...annotation, // Include top-level fields
          transcript_consequences: [consequence], // Focus on the current consequence
          // Specifically pass the consequence itself if needed, though handlers should use the array
          current_consequence: consequence,
        };
        // Call the handler with the modified context
        value = handler(tempAnnotationContext, altAllele);
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
