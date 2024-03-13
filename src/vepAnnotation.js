// src/vepAnnotation.js

const axios = require('axios');
const debug = require('debug')('variant-linker:vepAnnotation');


/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given HGVS notation.
 * 
 * @param {string} hgvs - The HGVS notation of the variant to be annotated.
 * @param {string} transcript - The transcript ID to be used in the annotation request.
 * @returns {Object} The annotation data retrieved from the VEP API.
 * @throws Will throw an error if the request to the VEP API fails.
 */
async function vepAnnotation(hgvs, transcript) {
  try {
    const url = `https://rest.ensembl.org/vep/human/hgvs/${hgvs}?content-type=application/json`;
    debug(`Requesting VEP Annotation for HGVS: ${hgvs} with transcript: ${transcript}`);
    const response = await axios.get(url);
    debug(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debug(`Error in vepAnnotation: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = vepAnnotation;
