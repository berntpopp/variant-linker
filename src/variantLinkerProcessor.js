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
const {
  flattenAnnotationData,
  formatToTabular,
  getDefaultColumnConfig,
} = require('./dataExtractor');
const { hasUserFeatureOverlaps } = require('./featureAnnotator');
const { getValueByPath } = require('./utils/pathUtils');
const { formatAnnotationsToVcf } = require('./vcfFormatter');

/**
 * Helper function to check if annotations contain CNV data.
 * @param {Array} annotationData - Array of annotation objects
 * @returns {boolean} True if any annotation has CNV format or CNV-specific fields
 */
function hasCnvAnnotations(annotationData) {
  if (!Array.isArray(annotationData) || annotationData.length === 0) {
    return false;
  }

  return annotationData.some((annotation) => {
    // Check if annotation has CNV input format
    if (annotation.inputFormat === 'CNV') {
      return true;
    }

    // Check if annotation has CNV-specific fields (for edge cases)
    if (annotation.transcript_consequences && Array.isArray(annotation.transcript_consequences)) {
      return annotation.transcript_consequences.some(
        (consequence) =>
          consequence.bp_overlap !== undefined || consequence.percentage_overlap !== undefined
      );
    }

    // Check for top-level CNV fields
    return annotation.phenotypes !== undefined || annotation.dosage_sensitivity !== undefined;
  });
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
 * Filters annotation data to include only VEP-picked consequences.
 * For each annotation, finds the transcript consequence with pick === 1
 * and creates a new annotation with only that consequence.
 *
 * @param {Array<Object>} annotationData - Array of annotation objects.
 * @returns {Array<Object>} Array of annotations with only picked consequences.
 * @private
 */
function _pickConsequences(annotationData) {
  debug('Applying --pick-output filtering to annotations');

  if (!Array.isArray(annotationData)) {
    debug('No annotation data provided for pick filtering');
    return [];
  }

  return annotationData.map((annotation) => {
    const newAnnotation = { ...annotation };

    // Find the picked consequence
    const pickedConsequence = annotation.transcript_consequences?.find((tc) => tc.pick === 1);

    if (pickedConsequence) {
      // Set consequences array to contain only the picked one
      newAnnotation.transcript_consequences = [pickedConsequence];
      debug(`Found picked consequence for variant ${annotation.variantKey || annotation.input}`);
    } else {
      // Set consequences array to be empty if no pick found
      newAnnotation.transcript_consequences = [];
      debug(`No picked consequence found for variant ${annotation.variantKey || annotation.input}`);
    }

    return newAnnotation;
  });
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
 * @param {Object} [params] - Additional parameters including pickOutput flag.
 * @returns {string} The filtered and formatted results as a string.
 * @throws {Error} If an unsupported format is specified or if filtering fails.
 */
function filterAndFormatResults(results, filterParam, format, params = {}) {
  debug('Starting results filtering and formatting');
  let filteredResults = { ...results };

  // Apply --pick-output filtering FIRST, before any other filtering
  if (params.pickOutput === true) {
    const originalConsequences = filteredResults.annotationData.reduce(
      (sum, ann) => sum + (ann.transcript_consequences?.length || 0),
      0
    );

    filteredResults.annotationData = _pickConsequences(filteredResults.annotationData);

    const pickedConsequences = filteredResults.annotationData.reduce(
      (sum, ann) => sum + (ann.transcript_consequences?.length || 0),
      0
    );

    filteredResults.meta.stepsPerformed.push(
      `Picked consequence filtering applied: ${originalConsequences} total consequences ` +
        `reduced to ${pickedConsequences}.`
    );

    debug(
      `Pick filtering: ${originalConsequences} consequences -> ${pickedConsequences} consequences`
    );
  }

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

      // *** FIX: Conditionally include inheritance columns ***
      // Check the flag set in variantLinkerCore.js
      const includeInheritanceCols = Boolean(filteredResults.meta?.inheritanceCalculated);
      debug(`Include inheritance columns in ${format.toUpperCase()}: ${includeInheritanceCols}`);

      // *** FIX: Conditionally include user feature overlap columns ***
      // Check if any annotations have user feature overlaps
      const includeUserFeatureCols = hasUserFeatureOverlaps(annotationToUse);
      debug(`Include user feature columns in ${format.toUpperCase()}: ${includeUserFeatureCols}`);

      // *** FIX: Conditionally include CNV-specific columns ***
      // Check if any annotations are CNV variants
      const includeCnvCols = hasCnvAnnotations(annotationToUse);
      debug(`Include CNV columns in ${format.toUpperCase()}: ${includeCnvCols}`);

      const columnConfig = getDefaultColumnConfig({
        includeInheritance: includeInheritanceCols,
        includeUserFeatures: includeUserFeatureCols,
        includeCnv: includeCnvCols,
      });

      const flatRows = flattenAnnotationData(annotationToUse, columnConfig);

      // Check if this is called from streaming mode
      if (params.isStreaming) {
        // Return structured object for streaming
        const header = formatToTabular([], columnConfig, delimiter, true); // Get only the header
        const data = formatToTabular(flatRows, columnConfig, delimiter, false); // Get only the data rows
        formattedResults = { header, data };
      } else {
        // Format the flattened data as CSV/TSV
        formattedResults = formatToTabular(flatRows, columnConfig, delimiter, true);
      }

      // Update meta message
      const inheritanceMsg = includeInheritanceCols ? ' with inheritance columns' : '';
      filteredResults.meta.stepsPerformed.push(
        `Formatted output as ${format.toUpperCase()}${inheritanceMsg} using flatten-by-consequence strategy` +
          ` with ${flatRows.length} rows`
      );
      break;
    case 'VCF':
      debug(
        `Processing VCF output format. Has vcfRecordMap: ${Boolean(results.vcfRecordMap)},
        Has vcfHeaderLines: ${Boolean(results.vcfHeaderLines)}`
      );
      debug(`Input variant type: ${results.meta?.variantType || 'unknown'}`);
      debug(`Number of results to format as VCF: ${filteredResults.results?.length || 0}`);

      // Dump first result structure for debugging
      if (filteredResults.results && filteredResults.results.length > 0) {
        const firstResult = filteredResults.results[0];
        debug(`First result variantInfo: ${JSON.stringify(firstResult.variantInfo || {})}`);
        if (firstResult.colocated_variants && firstResult.colocated_variants.length > 0) {
          debug(`First result has ${firstResult.colocated_variants.length} colocated variants`);
        }
        if (firstResult.most_severe_consequence) {
          debug(
            `First result has most_severe_consequence:
              ${JSON.stringify(firstResult.most_severe_consequence)}`
          );
        }
      }

      // Define VL_CSQ format following VEP's convention
      const vlCsqFormat = [
        'Allele', // Derived ALT
        'Consequence', // Most severe consequence
        'IMPACT', // Impact of most severe consequence
        'SYMBOL', // Gene symbol
        'Gene', // Ensembl Gene ID
        'Feature_type', // Type of feature (e.g., Transcript)
        'Feature', // Ensembl Feature ID (e.g., ENST...)
        'BIOTYPE', // Biotype of the feature (e.g., protein_coding)
        'HGVSc', // HGVS coding sequence notation
        'HGVSp', // HGVS protein sequence notation
        'Protein_position', // Position in protein
        'Amino_acids', // Amino acid change
        'Codons', // Codon change
        'Existing_variation', // dbSNP IDs etc.
        'SIFT', // SIFT prediction/score
        'PolyPhen', // PolyPhen prediction/score
      ];

      // Format results as VCF using the dedicated formatter module
      // Pass the annotation data, VCF record map, and header lines from filtered results
      formattedResults = formatAnnotationsToVcf(
        filteredResults.annotationData,
        filteredResults.vcfRecordMap,
        filteredResults.vcfHeaderLines,
        vlCsqFormat
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
  // Quick validation for VCF output
  if (filename && filename.toLowerCase().endsWith('.vcf') && !results.includes('#CHROM')) {
    console.warn('Warning: The generated VCF output appears to be invalid (missing #CHROM line)');
  }
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

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults,
  jsonApiFilter, // Exported in case standalone use is desired.
  // No more internal VCF formatting functions to export
};
