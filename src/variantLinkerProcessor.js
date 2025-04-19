// src/variantLinkerProcessor.js
'use strict';

/**
 * @fileoverview Processes variant linking by combining data from Variant Recoder
 * and VEP annotation calls, filters and formats the results, and outputs them.
 * Additionally, a JSON API–compatible filter function is provided for flexible filtering.
 * Filtering statistics (before/after) for annotations and transcript_consequences
 * are tracked in meta.stepsPerformed.
 * @module variantLinkerProcessor
 */

// Use fs only if in a Node environment.
const fs = typeof window === 'undefined' ? require('fs') : null;
const debug = require('debug')('variant-linker:processor');
const { flattenAnnotationData, formatToTabular, defaultColumnConfig } = require('./dataExtractor');

/**
 * Helper: Resolves a dot‐notation path from an object.
 *
 * This function supports wildcards (*) to collect values from arrays.
 *
 * For example, given an object with a property "transcript_consequences" that is an array,
 * a path "transcript_consequences.*.impact" returns an array of all impact values.
 *
 * @param {Object} obj - The object to query.
 * @param {string} path - The dot-separated path (e.g. "transcript_consequences.*.impact").
 * @returns {*} The value at the given path, or an array of values if wildcards are used.
 */
function getValueByPath(obj, path) {
  const parts = path.split('.');
  // start with a one-element array (our root)
  let current = [obj];

  for (const part of parts) {
    const next = [];
    for (const item of current) {
      if (part === '*') {
        if (Array.isArray(item)) {
          next.push(...item);
        }
      } else if (item != null && Object.prototype.hasOwnProperty.call(item, part)) {
        next.push(item[part]);
      }
    }
    current = next;
  }
  // If we end with a single value, return it; otherwise, return the array.
  return current.length === 1 ? current[0] : current;
}

/**
 * Helper: Applies an operator to a value.
 *
 * @param {*} value - The value from the object.
 * @param {string} operator - The operator (eq, ne, gt, gte, lt, lte, in, nin).
 * @param {*} target - The target value for the comparison.
 * @returns {boolean} True if the condition is satisfied, false otherwise.
 * @throws {Error} If the operator is not supported.
 */
function applyOperator(value, operator, target) {
  switch (operator) {
    case 'eq':
      return value === target;
    case 'ne':
      return value !== target;
    case 'gt':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "gt".`);
        return false;
      }
      return value > target;
    case 'gte':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "gte".`);
        return false;
      }
      return value >= target;
    case 'lt':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "lt".`);
        return false;
      }
      return value < target;
    case 'lte':
      if (typeof value !== 'number') {
        console.warn(`Value is not numeric; cannot apply operator "lte".`);
        return false;
      }
      return value <= target;
    case 'in':
      if (!Array.isArray(target)) {
        throw new Error(`Operator "in" expects an array.`);
      }
      return target.includes(value);
    case 'nin':
      if (!Array.isArray(target)) {
        throw new Error(`Operator "nin" expects an array.`);
      }
      return !target.includes(value);
    default:
      throw new Error(`Unsupported operator "${operator}"`);
  }
}

/**
 * Filters an array of objects based on JSON API filter criteria.
 *
 * The filter criteria should be an object where keys are field names (which can use dot‐notation
 * and wildcards) and values are objects specifying operators and target values.
 *
 * For example:
 *   {
 *     "transcript_consequences.*.impact": { eq: "MODERATE" }
 *   }
 *
 * @param {Array<Object>} data - The array of objects to filter.
 * @param {Object} criteria - The filtering criteria.
 * @returns {Array<Object>} The filtered array.
 * @throws {Error} If an unsupported operator is used.
 */
function jsonApiFilter(data, criteria) {
  if (!Array.isArray(data)) {
    throw new Error('Data to be filtered must be an array.');
  }

  /**
   * Helper function to determine if an object matches all the specified filter criteria
   * @param {Object} obj - The object to check against criteria
   * @returns {boolean} True if the object matches all criteria, false otherwise
   */
  function matchesCriteria(obj) {
    for (const field in criteria) {
      if (!criteria.hasOwnProperty(field)) continue;
      const conditions = criteria[field];
      // Use getValueByPath if the field contains a dot or wildcard.
      // Get field value with dot notation or wildcard support
      const fieldValue =
        field.includes('.') || field.includes('*') ? getValueByPath(obj, field) : obj[field];
      // Check if one element in array satisfies conditions
      // Check each operator in the conditions
      for (const operator in conditions) {
        if (!conditions.hasOwnProperty(operator)) continue;
        const target = conditions[operator];
        if (Array.isArray(fieldValue)) {
          if (!fieldValue.some((val) => applyOperator(val, operator, target))) {
            return false;
          }
        } else {
          if (!applyOperator(fieldValue, operator, target)) {
            return false;
          }
        }
      }
    }
    return true;
  }
  return data.filter(matchesCriteria);
}

/**
 * Processes the variant linking by obtaining data from the Variant Recoder and VEP HGVS annotation.
 *
 * This function calls the provided variantRecoder and vepHgvsAnnotation functions to obtain
 * variant recoding data and VEP annotation data respectively. It then extracts a selected HGVS
 * notation (assumed to be found in variantData[0].T.hgvsc[0]) and uses it for the VEP call.
 *
 * @param {string} variant - The genetic variant to be analyzed.
 * @param {function} variantRecoder - A function that recodes the variant.
 * @param {function} vepHgvsAnnotation - A function that retrieves VEP annotations for a given HGVS.
 * @param {Object} recoderOptions - Optional parameters for the Variant Recoder API.
 * @param {Object} vepOptions - Optional parameters for the VEP API.
 * @returns {Promise<{variantData: Object, annotationData: Object}>} A promise that resolves
 * with an object containing variant recoder data and annotation data.
 * @throws {Error} If no data is returned from either API call.
 */
async function processVariantLinking(
  variant,
  variantRecoder,
  vepHgvsAnnotation,
  recoderOptions,
  vepOptions
) {
  try {
    debug('Starting variant linking process');
    const variantData = await variantRecoder(variant, recoderOptions);
    debug(`Variant Recoder data received: ${JSON.stringify(variantData)}`);

    if (!variantData || variantData.length === 0) {
      throw new Error('No data returned from Variant Recoder');
    }

    // Extract HGVS notation and transcript ID.
    // This logic assumes the structure: variantData[0].T.hgvsc is an array.
    const selectedHgvs =
      variantData[0].T && Array.isArray(variantData[0].T.hgvsc)
        ? variantData[0].T.hgvsc[0]
        : undefined;

    if (!selectedHgvs) {
      throw new Error('No valid HGVS notation found in Variant Recoder response');
    }

    const selectedTranscript = selectedHgvs.split(':')[0];
    debug(`Selected HGVS: ${selectedHgvs}, Selected Transcript: ${selectedTranscript}`);

    const annotationData = await vepHgvsAnnotation(selectedHgvs, selectedTranscript, vepOptions);
    debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);

    if (!annotationData || annotationData.length === 0) {
      throw new Error('No annotation data returned from VEP');
    }

    debug('Variant linking process completed successfully');
    return { variantData, annotationData };
  } catch (error) {
    debug(`Error in variant linking process: ${error.message}`);
    throw error;
  }
}

/**
 * Filters and formats the results from the variant processing.
 *
 * An optional filter can be provided to transform the results before formatting.
 * The filter parameter can be either a function or a JSON API–compatible filter criteria object.
 * When a criteria object is provided, filtering is applied to:
 *   1. The top-level annotationData array.
 *   2. And, if criteria keys start with "transcript_consequences", the nested
 *      transcript_consequences arrays are filtered accordingly.
 * Additionally, statistics on the number of annotations (and transcript consequences)
 * before and after filtering are added to meta.stepsPerformed.
 *
 * @param {Object} results - The results object from variant processing.
 * @param {(function|Object)} [filterParam] - An optional filter function or filter criteria object.
 * @param {string} format - The desired output format (e.g., 'JSON').
 * @returns {string} The filtered and formatted results as a string.
 * @throws {Error} If an unsupported format is specified or if filtering fails.
 */
function filterAndFormatResults(results, filterParam, format) {
  debug('Starting results filtering and formatting');
  let filteredResults = { ...results };

  if (filterParam) {
    if (typeof filterParam === 'function') {
      filteredResults = filterParam(results);
      // In this branch we only count the top-level annotationData.
      if (Array.isArray(results.annotationData)) {
        const originalCount = results.annotationData.length;
        const newCount = Array.isArray(filteredResults.annotationData)
          ? filteredResults.annotationData.length
          : 'N/A';
        filteredResults.meta.stepsPerformed.push(
          `Top-level filter applied: ${originalCount} annotations before,` +
            ` ${newCount} after filtering.`
        );
      }
    } else if (typeof filterParam === 'object') {
      // Separate top-level criteria from transcript_consequences criteria.
      const topLevelCriteria = {};
      const transcriptCriteria = {};
      for (const key in filterParam) {
        if (Object.prototype.hasOwnProperty.call(filterParam, key)) {
          if (key.startsWith('transcript_consequences')) {
            const newKey = key.replace(/^transcript_consequences\./, '');
            transcriptCriteria[newKey] = filterParam[key];
          } else {
            topLevelCriteria[key] = filterParam[key];
          }
        }
      }
      const topLevelOriginalCount = results.annotationData.length;
      let topLevelFiltered = results.annotationData;
      if (Object.keys(topLevelCriteria).length > 0) {
        topLevelFiltered = jsonApiFilter(results.annotationData, topLevelCriteria);
        filteredResults.meta.stepsPerformed.push(
          `Top-level filter applied: ${topLevelOriginalCount} before,` +
            ` ${topLevelFiltered.length} after filtering.`
        );
      }
      let totalTCBefore = 0;
      let totalTCAfter = 0;
      topLevelFiltered.forEach((annotation) => {
        if (
          annotation.transcript_consequences &&
          Array.isArray(annotation.transcript_consequences) &&
          Object.keys(transcriptCriteria).length > 0
        ) {
          const originalTC = annotation.transcript_consequences.length;
          totalTCBefore += originalTC;
          annotation.transcript_consequences = jsonApiFilter(
            annotation.transcript_consequences,
            transcriptCriteria
          );
          const newTC = annotation.transcript_consequences.length;
          totalTCAfter += newTC;
        }
      });
      // Only add transcript filtering statistics if we applied transcript criteria
      if (Object.keys(transcriptCriteria).length > 0) {
        filteredResults.meta.stepsPerformed.push(
          `Transcript consequences filter applied: ${totalTCBefore} consequences` +
            ` before filtering, ${totalTCAfter} after filtering.`
        );
      }
      filteredResults.annotationData = topLevelFiltered;
    } else {
      throw new Error('Filter parameter must be a function or a filter criteria object.');
    }
    // Log filtered results with detailed information
    debug(`Filtered results: ${JSON.stringify(filteredResults)}`);
  }

  let formattedResults;
  switch (format.toUpperCase()) {
    case 'JSON':
      formattedResults = JSON.stringify(filteredResults, null, 2);
      break;
    case 'CSV':
    case 'TSV':
      const delimiter = format.toUpperCase() === 'CSV' ? ',' : '\t';

      // Ensure we're working with clean filtered data before flattening
      const annotationToUse = Array.isArray(filteredResults.annotationData)
        ? filteredResults.annotationData
        : [];

      // Flatten the nested annotation data using the "flatten by consequence" strategy
      const flatRows = flattenAnnotationData(annotationToUse, defaultColumnConfig);

      // Format the flattened data as CSV/TSV
      formattedResults = formatToTabular(flatRows, defaultColumnConfig, delimiter, true);

      filteredResults.meta.stepsPerformed.push(
        `Formatted output as ${format.toUpperCase()} using flatten-by-consequence strategy` +
          ` with ${flatRows.length} rows`
      );
      break;
    case 'VCF':
      // Ensure necessary VCF data is provided
      if (!results.vcfRecordMap || !results.vcfHeaderLines) {
        throw new Error('VCF output requires VCF input data');
      }

      // Format results as VCF
      formattedResults = _formatResultsToVcf(
        filteredResults,
        results.vcfRecordMap,
        results.vcfHeaderLines
      );

      filteredResults.meta.stepsPerformed.push(
        `Formatted output as VCF with annotations added as VL_CSQ INFO field`
      );
      break;
    case 'SCHEMA':
      // Existing SCHEMA support will be added later
      formattedResults = JSON.stringify(filteredResults, null, 2);
      break;
    default:
      throw new Error(
        `Unsupported format: ${format}. Valid formats are JSON, CSV, TSV, VCF, and SCHEMA`
      );
  }
  return formattedResults;
}

/**
 * Outputs the results either to the console or writes them to a file.
 *
 * In a browser environment, file writing is not supported.
 *
 * @param {string} results - The results string to output.
 * @param {string} [filename] - An optional filename; if provided, results are saved to this file.
 */
function outputResults(results, filename) {
  debug('Starting results output');
  if (filename) {
    if (!fs) {
      console.warn('File output is not supported in a browser environment.');
    } else {
      fs.writeFileSync(filename, results);
      debug(`Results saved to file: ${filename}`);
    }
  } else {
    console.log(results);
  }
}

/**
 * Formats annotation results to VCF format with annotations added as INFO fields.
 *
 * @param {Object} results - The filtered annotation results
 * @param {Map} vcfRecordMap - Map of variant keys to original VCF record data
 * @param {Array<string>} vcfHeaderLines - Original VCF header lines
 * @returns {string} Formatted VCF content
 * @private
 */
function _formatResultsToVcf(results, vcfRecordMap, vcfHeaderLines) {
  const outputLines = [];

  // Define the format for the VL_CSQ INFO field
  // These fields are derived from defaultColumnConfig in dataExtractor.js
  const vlCsqFormat = [
    'Allele',
    'Consequence',
    'IMPACT',
    'SYMBOL',
    'Gene',
    'Feature_type',
    'Feature',
    'BIOTYPE',
    'HGVSc',
    'HGVSp',
    'Protein_position',
    'Amino_acids',
    'Codons',
    'SIFT',
    'PolyPhen',
  ];

  // Create VL_CSQ info field definition
  const csqInfoDef = `##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Variant Linker consequence annotations. Format: ${vlCsqFormat.join('|')}">`;

  // Process header
  let hasFileFormat = false;
  let hasInfoVlCsq = false;
  let chromLine = null;

  // First pass to check for required headers
  for (const line of vcfHeaderLines) {
    if (line.startsWith('##fileformat=')) {
      hasFileFormat = true;
    } else if (line.startsWith('##INFO=<ID=VL_CSQ,')) {
      hasInfoVlCsq = true;
    } else if (line.startsWith('#CHROM')) {
      chromLine = line;
    }
  }

  // Generate final header
  // Add fileformat if missing
  if (!hasFileFormat) {
    outputLines.push('##fileformat=VCFv4.2');
    debug('Added missing ##fileformat line to VCF output');
  }

  // Add all original header lines except #CHROM (which goes last)
  for (const line of vcfHeaderLines) {
    if (!line.startsWith('#CHROM')) {
      outputLines.push(line);
    }
  }

  // Add VL_CSQ info definition if not already present
  if (!hasInfoVlCsq) {
    outputLines.push(csqInfoDef);
  }

  // Add #CHROM line last in header
  if (chromLine) {
    outputLines.push(chromLine);
  } else {
    // Fallback CHROM line if original not available
    outputLines.push('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO');
    debug('Added default #CHROM line to VCF output');
  }

  // Group annotations by variant key for faster lookup
  const annotationsByKey = {};
  if (Array.isArray(results.annotationData)) {
    for (const annotation of results.annotationData) {
      // Use the originalInput field which is in the format 'CHROM-POS-REF-ALT'
      if (annotation.originalInput) {
        // Convert from 'CHROM-POS-REF-ALT' format to 'CHROM:POS:REF:ALT' for key matching
        const parts = annotation.originalInput.split('-');
        if (parts.length === 4) {
          const key = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
          annotationsByKey[key] = annotation;
        }
      }
    }
  }

  debug(`Mapped ${Object.keys(annotationsByKey).length} annotations for VCF output`);

  // Group records by position for multi-allelic handling
  const positionGroups = new Map();

  // First pass - group by chrom:pos:ref
  for (const [key, entry] of vcfRecordMap.entries()) {
    const { originalRecord } = entry;
    if (!originalRecord) {
      debug(`Warning: No original record found for variant key: ${key}`);
      continue;
    }

    const chrom = originalRecord.CHROM || '';
    const pos = originalRecord.POS || '';
    const ref = originalRecord.REF || '';

    // Use chrom:pos:ref as the key for grouping
    const posKey = `${chrom}:${pos}:${ref}`;

    if (!positionGroups.has(posKey)) {
      positionGroups.set(posKey, {
        records: [],
        annotations: [],
      });
    }

    const group = positionGroups.get(posKey);
    group.records.push({
      key,
      entry,
    });

    // Add annotations if available
    const annotation = annotationsByKey[key];
    if (annotation) {
      group.annotations.push({
        alt: entry.alt,
        annotation,
      });
    }
  }

  // Second pass - create VCF lines by position group
  for (const [, group] of positionGroups.entries()) {
    if (group.records.length === 0) continue;

    // Use the first record as the base
    const baseRecord = group.records[0].entry.originalRecord;
    const chrom = baseRecord.CHROM || '';
    const pos = baseRecord.POS || '';
    const id = baseRecord.ID
      ? Array.isArray(baseRecord.ID)
        ? baseRecord.ID.join(';')
        : baseRecord.ID
      : '.';
    const ref = baseRecord.REF || '';

    // Collect all ALT alleles
    const altAlleles = group.records.map((r) => r.entry.alt).filter(Boolean);
    const uniqueAltAlleles = [...new Set(altAlleles)];
    const alt = uniqueAltAlleles.join(',');

    const qual = baseRecord.QUAL || '.';
    const filter = baseRecord.FILTER
      ? Array.isArray(baseRecord.FILTER)
        ? baseRecord.FILTER.join(';')
        : baseRecord.FILTER
      : '.';

    // Collect INFO fields from the base record
    let info = baseRecord.INFO
      ? Object.entries(baseRecord.INFO)
          .map(([key, val]) => {
            if (val === true) return key;
            return `${key}=${val}`;
          })
          .join(';')
      : '.';

    // Build VL_CSQ values for each allele
    const alleleToConsqMap = new Map();

    for (const { alt, annotation } of group.annotations) {
      if (
        !annotation.transcript_consequences ||
        !Array.isArray(annotation.transcript_consequences) ||
        annotation.transcript_consequences.length === 0
      ) {
        continue;
      }

      const csqValues = [];

      for (const consequence of annotation.transcript_consequences) {
        // Create a pipe-delimited string following vlCsqFormat
        const csqParts = vlCsqFormat.map((field) => {
          switch (field) {
            case 'Allele':
              return alt || '';
            case 'Consequence':
              return Array.isArray(consequence.consequence_terms)
                ? consequence.consequence_terms.join('&')
                : consequence.consequence_terms || '';
            case 'IMPACT':
              return consequence.impact || '';
            case 'SYMBOL':
              return consequence.gene_symbol || '';
            case 'Gene':
              return consequence.gene_id || '';
            case 'Feature_type':
              return consequence.feature_type || '';
            case 'Feature':
              return consequence.transcript_id || '';
            case 'BIOTYPE':
              return consequence.biotype || '';
            case 'HGVSc':
              return consequence.hgvsc || '';
            case 'HGVSp':
              return consequence.hgvsp || '';
            case 'Protein_position':
              if (!consequence.protein_start) return '';
              const end = consequence.protein_end || consequence.protein_start;
              return `${consequence.protein_start}-${end}`;
            case 'Amino_acids':
              return consequence.amino_acids || '';
            case 'Codons':
              return consequence.codons || '';
            case 'SIFT':
              return consequence.sift_prediction || '';
            case 'PolyPhen':
              return consequence.polyphen_prediction || '';
            default:
              return '';
          }
        });

        csqValues.push(csqParts.join('|'));
      }

      if (csqValues.length > 0) {
        alleleToConsqMap.set(alt, csqValues);
      }
    }

    // Combine all CSQ values
    const allCsqValues = [];
    for (const [, csqValues] of alleleToConsqMap.entries()) {
      allCsqValues.push(...csqValues);
    }

    // Add VL_CSQ to INFO field if we have values
    if (allCsqValues.length > 0) {
      const vlCsqValue = allCsqValues.join(',');
      info = info === '.' ? `VL_CSQ=${vlCsqValue}` : `${info};VL_CSQ=${vlCsqValue}`;
    }

    // Construct the final VCF line
    const vcfLine = `${chrom}\t${pos}\t${id}\t${ref}\t${alt}\t${qual}\t${filter}\t${info}`;
    outputLines.push(vcfLine);
  }

  return outputLines.join('\n');
}

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults,
  jsonApiFilter, // Exported in case standalone use is desired.
  // Export for testing
  _formatResultsToVcf,
};
