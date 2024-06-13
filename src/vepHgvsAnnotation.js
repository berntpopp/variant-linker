// src/vepHgvsAnnotation.js

const axios = require('axios');
const debug = require('debug')('variant-linker:vepHgvsAnnotation');

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given HGVS notation.
 * 
 * @param {string} hgvs - The HGVS notation of the variant to be annotated.
 * @param {string} transcript - The transcript ID to be used in the annotation request.
 * @param {Object} [options={}] - Optional parameters for the VEP API request.
 * @returns {Object} The annotation data retrieved from the VEP API.
 * @throws Will throw an error if the request to the VEP API fails.
 */
async function vepHgvsAnnotation(hgvs, transcript, options = {}) {
  try {
    // Construct the query parameters from the options object
    const params = new URLSearchParams({ 'content-type': 'application/json', ...options }).toString();
    const url = `https://rest.ensembl.org/vep/human/hgvs/${hgvs}?${params}`;
    
    debug(`Requesting VEP Annotation for HGVS: ${hgvs} with transcript: ${transcript} and options: ${JSON.stringify(options)}`);
    const response = await axios.get(url);
    debug(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debug(`Error in vepHgvsAnnotation: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = vepHgvsAnnotation;
