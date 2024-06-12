// src/variantLinkerProcessor.js

const fs = require('fs');
const debug = require('debug')('variant-linker:processor');

/**
 * Processes the variant linking by obtaining data from the variantRecoder and vepAnnotation.
 * 
 * @param {string} variant - The genetic variant to be analyzed.
 * @param {function} variantRecoder - Function to recode the variant into various formats.
 * @param {function} vepAnnotation - Function to annotate the variant using VEP.
 * @param {Object} recoderOptions - Optional parameters for the Variant Recoder API request.
 * @param {Object} vepOptions - Optional parameters for the VEP API request.
 * @returns {Object} An object containing the variant data and the annotation data.
 * @throws Will throw an error if no data is returned from variantRecoder or vepAnnotation.
 */
async function processVariantLinking(variant, variantRecoder, vepAnnotation, recoderOptions, vepOptions) {
  try {
    const variantData = await variantRecoder(variant, recoderOptions);
    if (!variantData || variantData.length === 0) {
      throw new Error('No data returned from Variant Recoder');
    }

    // Logic to extract HGVS and transcript (can be expanded for more versatility)
    const selectedHgvs = variantData[0].T.hgvsc[0];
    const selectedTranscript = selectedHgvs.split(':')[0];

    const annotationData = await vepAnnotation(selectedHgvs, selectedTranscript, vepOptions);
    if (!annotationData || annotationData.length === 0) {
      throw new Error('No annotation data returned from VEP');
    }

    return { variantData, annotationData };
  } catch (error) {
    debug(`Error in processVariantLinking: ${error.message}`);
    throw error;
  }
}

/**
 * Filters and formats the results from variant processing.
 * 
 * @param {Object} results - The results object from variant processing.
 * @param {function} [filterFunction] - An optional function to filter the results.
 * @param {string} format - The desired output format (e.g., 'JSON').
 * @returns {string} The filtered and formatted results as a string.
 * @throws Will throw an error if an unsupported format is provided.
 */
function filterAndFormatResults(results, filterFunction, format) {
  // Apply the filter
  const filteredResults = filterFunction ? filterFunction(results) : results;

  // Format the results
  switch (format.toUpperCase()) {
    case 'JSON':
      return JSON.stringify(filteredResults, null, 2);
    // Add more formats here if needed
    default:
      throw new Error('Unsupported format');
  }
}

/**
 * Outputs the results to either the console or a file.
 * 
 * @param {string} results - The results to output.
 * @param {string} [filename] - An optional filename to save the results to a file.
 */
function outputResults(results, filename) {
  if (filename) {
    fs.writeFileSync(filename, results);
  } else {
    console.log(results);
  }
}

module.exports = {
  processVariantLinking,
  filterAndFormatResults,
  outputResults
};
