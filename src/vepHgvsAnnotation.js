// src/vepHgvsAnnotation.js

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

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
    
    // Log the full URL and parameters
    debug(`Requesting VEP Annotation for HGVS: ${hgvs} with transcript: ${transcript}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Request options: ${JSON.stringify(options)}`);
    
    const response = await axios.get(url);
    
    // Log the response
    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in vepHgvsAnnotation: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = vepHgvsAnnotation;
