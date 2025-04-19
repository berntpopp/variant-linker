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
  defaultColumnConfig,
  formatVcfCsqString,
} = require('./dataExtractor');

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
      debug(
        `Processing VCF output format. Has vcfRecordMap: ${Boolean(results.vcfRecordMap)},
        Has vcfHeaderLines: ${Boolean(results.vcfHeaderLines)}`
      );
      debug(`Input variant type: ${results.meta?.variantType || 'unknown'}`);
      debug(`Number of results to format as VCF: ${filteredResults.results?.length || 0}`);

      // Create default VCF structures if original VCF data not available
      const vcfRecordMap = results.vcfRecordMap || new Map();
      const vcfHeaderLines = results.vcfHeaderLines || _generateDefaultVcfHeader();

      debug(`Using ${vcfHeaderLines.length} VCF header lines and ${vcfRecordMap.size} VCF records`);

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

      // Format results as VCF
      // Ensure we use the VCF record map and header lines stored in the filteredResults object
      // (which should have been populated during variant analysis)
      formattedResults = _formatResultsToVcf(
        filteredResults,
        filteredResults.vcfRecordMap || vcfRecordMap,
        filteredResults.vcfHeaderLines || vcfHeaderLines
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

/**
 * Formats annotation results to VCF format with annotations added as INFO fields.
 *
 * Handles both VCF and non-VCF original inputs.
 * For non-VCF inputs, it prioritizes parsing the `vcfString` from annotation results.
 *
 * @param {Object} results - The filtered annotation results object, containing an
 *   `annotationData` array.
 * @param {Map} [vcfRecordMap] - Optional map of variant keys to original VCF record data
 *   (used if input was VCF).
 * @param {Array<string>} [vcfHeaderLines] - Optional original VCF header lines
 *   (used if input was VCF).
 * @returns {string} The VCF formatted content.
 * @private
 */
function _formatResultsToVcf(results, vcfRecordMap, vcfHeaderLines) {
  const debugOutput = require('debug')('variant-linker:vcf-output'); // Use a specific debug namespace

  // ... rest of the code remains the same ...
  // Use results.annotationData directly as passed from analyzeVariant
  const annotationData = results?.annotationData;
  if (!annotationData || !Array.isArray(annotationData) || annotationData.length === 0) {
    debugOutput('No annotation data found in results for VCF output');
    // If no results, but header was provided (from input VCF), return just the header.
    // Otherwise, return an empty string or a minimal default header.
    const minimalHeader =
      vcfHeaderLines && vcfHeaderLines.length > 0 ? vcfHeaderLines : _generateDefaultVcfHeader();
    // Ensure the minimal header ends with a newline if it contains lines
    return minimalHeader.length > 0 ? minimalHeader.join('\n') + '\n' : '';
  }
  debugOutput(`Formatting VCF output with ${annotationData.length} annotation results...`);

  // Determine if the input was likely a VCF file based on presence of vcfRecordMap/vcfHeaderLines
  const hasVcfInput =
    (vcfRecordMap && vcfRecordMap.size > 0) || (vcfHeaderLines && vcfHeaderLines.length > 0);

  // Use provided header or generate a default one if missing
  let finalVcfHeaderLines =
    vcfHeaderLines && vcfHeaderLines.length > 0
      ? [...vcfHeaderLines] // Use a copy
      : _generateDefaultVcfHeader();

  // Ensure ##fileformat=VCFv4.2 is always the first line
  const fileformatRegex = /^##fileformat=/i;
  const hasFileformat =
    finalVcfHeaderLines.length > 0 && fileformatRegex.test(finalVcfHeaderLines[0]);
  if (!hasFileformat) {
    // Remove any fileformat lines elsewhere (shouldn't happen, but KISS/DRY)
    finalVcfHeaderLines = finalVcfHeaderLines.filter((line) => !fileformatRegex.test(line));
    // Insert at the top
    finalVcfHeaderLines.unshift('##fileformat=VCFv4.2');
  }

  // Define VL_CSQ format following VEP's convention - ensure this matches _generateDefaultVcfHeader
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
    // Add other relevant fields extracted by dataExtractor if needed
  ]; // Define once

  // Check if INFO header already exists for VL_CSQ in the final header lines
  let hasVlCsqHeader = finalVcfHeaderLines.some((line) => line.includes('ID=VL_CSQ'));

  // Add VL_CSQ INFO header if not present
  if (!hasVlCsqHeader) {
    const infoFieldDescBase = '##INFO=<ID=VL_CSQ,Number=.,Type=String,Description=';
    const infoFieldDescDesc = '"VariantLinker Consequence Annotation using VEP/Custom. ';
    const infoFieldDescFormat = `Format: ${vlCsqFormat.join('|')}">`;
    const infoFieldDescription = infoFieldDescBase + infoFieldDescDesc + infoFieldDescFormat;

    const chromLineIdx = finalVcfHeaderLines.findIndex((line) => line.startsWith('#CHROM'));
    if (chromLineIdx >= 0) {
      finalVcfHeaderLines.splice(chromLineIdx, 0, infoFieldDescription);
    } else {
      // If #CHROM is missing (shouldn't happen with default header), add at the end before data
      finalVcfHeaderLines.push(infoFieldDescription);
      finalVcfHeaderLines.push('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO'); // Add #CHROM line if missing
    }
    debugOutput('Added missing VL_CSQ header line.');
    hasVlCsqHeader = true; // Mark as added
  }

  const outputLines = [...finalVcfHeaderLines];

  // Group records by position for multi-allelic handling
  // Structure: Map<posKey, {
  //   chrom, pos, ref, id,
  //   alts: Map<altAllele, { annotation, originalInfo?, originalQual?, originalFilter? }>
  // }>
  const positionGroups = new Map();

  // Logic depends on whether original input was VCF
  if (hasVcfInput && vcfRecordMap && vcfRecordMap.size > 0) {
    debugOutput('Processing results using original VCF record map.');
    // Map results data to variant keys for faster lookup
    const annotationsByKey = {};
    for (const annotation of annotationData) {
      // Use the input identifier that links back to the VCF record
      // Prioritize originalInput if available
      const key = annotation.originalInput || annotation.input;
      if (key) {
        // If multiple annotations map to the same key (e.g., split multi-allelic), store as array
        if (!annotationsByKey[key]) {
          annotationsByKey[key] = [];
        }
        annotationsByKey[key].push(annotation);
      }
    }
    debugOutput(`Mapped ${Object.keys(annotationsByKey).length} unique input keys to annotations.`);

    // Process based on the original VCF structure preserved in vcfRecordMap
    for (const [key, entry] of vcfRecordMap.entries()) {
      const { originalRecord, alt } = entry; // the specific ALT allele from the original VCF line
      if (!originalRecord) {
        debugOutput(`Warning: No original record found for VCF entry key: ${key}`);
        continue;
      }

      const chrom = originalRecord.CHROM || '';
      const pos = originalRecord.POS || '';
      const ref = originalRecord.REF || '';
      const id = originalRecord.ID && originalRecord.ID !== '.' ? originalRecord.ID : '.'; // Prefer original ID
      const posKey = `${chrom}:${pos}:${ref}`;

      if (!positionGroups.has(posKey)) {
        positionGroups.set(posKey, {
          chrom,
          pos,
          ref,
          id, // Use ID from the first VCF record for this position
          // Map<altAllele, { annotations[], info?, qual?, filter? }>
          alts: new Map(),
        });
      }

      const group = positionGroups.get(posKey);
      const matchingAnnotations = annotationsByKey[key] || [];

      // Find the specific annotation that corresponds to this ALT allele
      // VEP results might be split, so we look for the one matching the VCF ALT
      // Simple case: only one annotation for this input key
      let annotationForAlt = null;
      if (matchingAnnotations.length === 1) {
        annotationForAlt = matchingAnnotations[0];
      } else {
        // More complex: find annotation matching the ALT (might need vcfString comparison)
        annotationForAlt = matchingAnnotations.find((ann) => {
          if (ann.vcfString) {
            const [, , , annAlt] = ann.vcfString.split('-');
            return annAlt === alt;
          }
          // Fallback if vcfString isn't available (less reliable)
          return ann.input?.includes(alt); // Basic check
        });
      }

      if (!annotationForAlt) {
        debugOutput(
          `Warning: Could not find matching annotation for VCF key ${key} and ALT ${alt}`
        );
        // Still add the ALT, but with empty annotation list
        if (!group.alts.has(alt)) {
          group.alts.set(alt, {
            annotations: [],
            originalInfo: originalRecord.INFO,
            originalQual: originalRecord.QUAL,
            originalFilter: originalRecord.FILTER,
          });
        } else {
          // Merge if ALT already exists (should be rare for VCF input path)
          group.alts.get(alt).annotations.push(...[]); // No annotation found
        }
      } else {
        if (!group.alts.has(alt)) {
          group.alts.set(alt, {
            annotations: [annotationForAlt],
            originalInfo: originalRecord.INFO,
            originalQual: originalRecord.QUAL,
            originalFilter: originalRecord.FILTER,
          });
        } else {
          // Add annotation if ALT allele exists (e.g. duplicate line in VCF)
          group.alts.get(alt).annotations.push(annotationForAlt);
        }
      }
    }
  } else {
    // Handle non-VCF input: Construct VCF fields primarily from annotationData.vcfString
    debugOutput('Processing results assuming non-VCF input. Using annotation.vcfString.');
    for (const annotation of annotationData) {
      if (!annotation || !annotation.vcfString) {
        debugOutput(
          `Warning: Skipping annotation due to missing 'vcfString'.
           Input: ${annotation?.originalInput || annotation?.input}`
        );
        continue;
      }

      // Parse vcfString: CHROM-POS-REF-ALT
      const parts = annotation.vcfString.split('-');
      if (parts.length !== 4) {
        debugOutput(
          `Warning: Skipping due to unexpected vcfString format: '${annotation.vcfString}'.
           Expected CHROM-POS-REF-ALT. Input: ${annotation?.originalInput}`
        );
        continue;
      }
      const [chrom, posStr, ref, alt] = parts;
      const pos = parseInt(posStr, 10);

      if (isNaN(pos)) {
        debugOutput(
          `Invalid POS in vcfString: '${posStr}'.
           Input: ${annotation?.originalInput}`
        );
        continue;
      }

      if (!chrom || !ref || !alt) {
        debugOutput(
          `Warning: Missing CHROM/REF/ALT in vcfString: '${annotation.vcfString}'.
           Input: ${annotation?.originalInput}`
        );
        continue;
      }

      // Determine ID: Use original input (rsID, HGVS) or fallback
      const id =
        annotation.originalInput && annotation.originalInput !== annotation.vcfString
          ? annotation.originalInput
          : '.';

      const posKey = `${chrom}:${pos}:${ref}`;

      if (!positionGroups.has(posKey)) {
        positionGroups.set(posKey, {
          chrom,
          pos,
          ref,
          id, // Use ID from the first annotation encountered for this position
          alts: new Map(), // Map<altAllele, { annotations: [] }>
        });
      }

      const group = positionGroups.get(posKey);
      // Use the ID from the *first* annotation seen for this posKey, but allow others if '.'
      if (group.id === '.' && id !== '.') {
        group.id = id;
      }

      if (!group.alts.has(alt)) {
        group.alts.set(alt, { annotations: [annotation] });
      } else {
        // If this ALT allele already exists for the position, add the annotation
        // This could happen if the same variant was input multiple times (e.g., rsID and HGVS)
        group.alts.get(alt).annotations.push(annotation);
      }
    }
  }

  // Process grouped positions to generate VCF lines
  debugOutput(`Generating VCF lines from ${positionGroups.size} grouped positions.`);
  for (const [, group] of positionGroups.entries()) {
    if (!group.alts || group.alts.size === 0) {
      debugOutput(
        `Skipping position ${group.chrom}:${group.pos}:${group.ref}
         as it has no ALT alleles with annotations.`
      );
      continue;
    }

    const alts = Array.from(group.alts.keys());
    const altAllelesString = alts.join(',');

    const infoFields = [];
    let firstAltData = null; // Used for QUAL/FILTER if from VCF input

    // Generate VL_CSQ field by combining annotations for all ALTs at this position
    const allCsqStrings = [];
    for (const [altAllele, altData] of group.alts.entries()) {
      if (!firstAltData) firstAltData = altData; // Capture data from the first ALT processed
      if (altData.annotations && altData.annotations.length > 0) {
        for (const annotation of altData.annotations) {
          // Pass the specific ALT allele this annotation corresponds to
          const csqString = formatVcfCsqString(annotation, vlCsqFormat, altAllele);
          if (csqString) {
            allCsqStrings.push(csqString);
          }
        }
      }
    }

    if (allCsqStrings.length > 0) {
      infoFields.push(`VL_CSQ=${allCsqStrings.join(',')}`);
    }

    // Add original INFO fields if input was VCF, merging carefully
    // For simplicity here, we just take INFO from the *first* ALT encountered for the position
    // A more sophisticated merge might be needed for complex VCF inputs
    let originalInfoString = '.';
    if (hasVcfInput && firstAltData && firstAltData.originalInfo) {
      // Avoid duplicating VL_CSQ if it somehow existed in original INFO
      originalInfoString = Object.entries(firstAltData.originalInfo)
        .filter(([key]) => key !== 'VL_CSQ')
        .map(([key, value]) => (value === true ? key : `${key}=${value}`))
        .join(';');
    }

    // Combine original INFO (if any) and new VL_CSQ
    let finalInfoString = infoFields.join(';');
    if (originalInfoString && originalInfoString !== '.') {
      if (finalInfoString) {
        finalInfoString = `${originalInfoString};${finalInfoString}`;
      } else {
        finalInfoString = originalInfoString;
      }
    }
    if (!finalInfoString) {
      finalInfoString = '.'; // VCF requires '.' if INFO is empty
    }

    // Determine QUAL and FILTER (use original if available, otherwise '.')
    const qual =
      hasVcfInput && firstAltData && firstAltData.originalQual !== undefined
        ? firstAltData.originalQual
        : '.';
    const filter =
      hasVcfInput && firstAltData && firstAltData.originalFilter
        ? firstAltData.originalFilter.join(';')
        : 'PASS'; // Default to PASS if non-VCF or no filter

    // Construct the VCF data line
    // Using '.' for QUAL, FILTER, FORMAT, SAMPLE as we don't have info for non-VCF inputs
    // For original VCF inputs, we could potentially carry over QUAL/FILTER if needed.
    const vcfDataLine = [
      group.chrom,
      group.pos,
      group.id, // Use the determined ID for the position
      group.ref,
      altAllelesString,
      qual,
      filter,
      finalInfoString,
    ].join('\t');

    outputLines.push(vcfDataLine);
  }

  // Final check: if only header lines are present, maybe something went wrong
  // Or maybe there were simply no annotatable variants in the input.
  if (outputLines.length === finalVcfHeaderLines.length && annotationData.length > 0) {
    debugOutput(
      'Warning: VCF output contains only header lines, but there were annotations to process. Check grouping or formatting logic.'
    );
    // Optionally return just the header in this case, or the empty outputLines array if appropriate
    // For now, return what we have, which is just the header.
  } else if (outputLines.length === finalVcfHeaderLines.length && annotationData.length === 0) {
    debugOutput('VCF output contains only header lines because no annotations were provided.');
  } else if (positionGroups.size === 0 && annotationData.length > 0) {
    // This case indicates annotations existed but none could be grouped
    debugOutput('No valid VCF positions could be derived from the annotations.');
  }

  // Join lines and add a trailing newline for valid VCF format
  return outputLines.join('\n') + (outputLines.length > 0 ? '\n' : '');
}

/**
 * Generates default VCF header lines when original VCF data is not available.
 *
 * @returns {Array<string>} Array of default VCF header lines
 * @private
 */
function _generateDefaultVcfHeader() {
  // Create a minimal VCF header with variant linker specific fields
  const headerLines = [
    '##fileformat=VCFv4.2',
    `##fileDate=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    '##source=variant-linker',
    '##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Consequence annotations from variant-linker. Format: Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen">',
    '##INFO=<ID=VARIANT_LINKER,Number=0,Type=Flag,Description="Variant processed by variant-linker">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  ];

  return headerLines;
}

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults,
  jsonApiFilter, // Exported in case standalone use is desired.
  // Export for testing
  _formatResultsToVcf,
  _generateDefaultVcfHeader, // Export for testing
};
