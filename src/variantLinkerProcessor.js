// src/variantLinkerProcessor.js

const fs = require('fs');
const debug = require('debug')('variant-linker:processor');

/**
 * Processes the variant linking by obtaining data from the variantRecoder and vepHgvsAnnotation.
 * 
 * @param {string} variant - The genetic variant to be analyzed.
 * @param {function} variantRecoder - Function to recode the variant into various formats.
 * @param {function} vepHgvsAnnotation - Function to annotate the variant using VEP.
 * @param {Object} recoderOptions - Optional parameters for the Variant Recoder API request.
 * @param {Object} vepOptions - Optional parameters for the VEP API request.
 * @returns {Object} An object containing the variant data and the annotation data.
 * @throws Will throw an error if no data is returned from variantRecoder or vepHgvsAnnotation.
 */
async function processVariantLinking(variant, variantRecoder, vepHgvsAnnotation, recoderOptions, vepOptions) {
  try {
    debug('Starting variant linking process');
    const variantData = await variantRecoder(variant, recoderOptions);
    debug(`Variant Recoder data received: ${JSON.stringify(variantData)}`);
    if (!variantData || variantData.length === 0) {
      throw new Error('No data returned from Variant Recoder');
    }

    // Logic to extract HGVS and transcript (can be expanded for more versatility)
    const selectedHgvs = variantData[0].T.hgvsc[0];
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
 * Filters and formats the results from variant processing.
 * 
 * @param {Object} results - The results object from variant processing.
 * @param {function} [filterFunction] - An optional function to filter the results.
 * @param {string} format - The desired output format (e.g., 'JSON').
 * @returns {string} The filtered and formatted results as a string.
 * @throws Will throw an error if an unsupported format is provided.
 */
function filterAndFormatResults(results, filterFunction, format) {
  debug('Starting results filtering and formatting');
  // Apply the filter
  const filteredResults = filterFunction ? filterFunction(results) : results;
  debug(`Filtered results: ${JSON.stringify(filteredResults)}`);

  // Format the results
  let formattedResults;
  switch (format.toUpperCase()) {
    case 'JSON':
      formattedResults = JSON.stringify(filteredResults, null, 2);
      break;
    // Add more formats here if needed
    default:
      throw new Error('Unsupported format');
  }
  debug(`Formatted results: ${formattedResults}`);
  return formattedResults;
}

/**
 * Outputs the results to either the console or a file.
 * 
 * @param {string} results - The results to output.
 * @param {string} [filename] - An optional filename to save the results to a file.
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
