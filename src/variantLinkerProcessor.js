'use strict';
// src/variantLinkerProcessor.js

/**
 * @fileoverview Processes variant linking by combining data from Variant Recoder
 * and VEP annotation calls, filters and formats the results, and outputs them.
 * @module variantLinkerProcessor
 */

const fs = require('fs');
const debug = require('debug')('variant-linker:processor');

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
 * @returns {Promise<{ variantData: Object, annotationData: Object }>}
 *          A promise that resolves with an object containing the variant recoder data and annotation data.
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
 * An optional filter function may be provided to transform the results.
 * Currently, only JSON output is supported.
 *
 * @param {Object} results - The results object from variant processing.
 * @param {function} [filterFunction] - An optional function to filter/modify the results.
 * @param {string} format - The desired output format (e.g., 'JSON').
 * @returns {string} The filtered and formatted results as a string.
 * @throws {Error} If an unsupported format is specified.
 */
function filterAndFormatResults(results, filterFunction, format) {
  debug('Starting results filtering and formatting');
  const filteredResults = filterFunction ? filterFunction(results) : results;
  debug(`Filtered results: ${JSON.stringify(filteredResults)}`);

  let formattedResults;
  switch (format.toUpperCase()) {
    case 'JSON':
      formattedResults = JSON.stringify(filteredResults, null, 2);
      break;
    default:
      throw new Error('Unsupported format');
  }
  return formattedResults;
}

/**
 * Outputs the results either to the console or writes them to a file.
 *
 * @param {string} results - The results string to output.
 * @param {string} [filename] - An optional filename; if provided, results are saved to this file.
 */
function outputResults(results, filename) {
  debug('Starting results output');
  if (filename) {
    fs.writeFileSync(filename, results);
    debug(`Results saved to file: ${filename}`);
  } else {
    console.log(results);
  }
}

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults
};
