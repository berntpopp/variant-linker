'use strict';
// src/vepHgvsAnnotation.js

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given HGVS notation.
 *
 * @param {string} hgvs - The HGVS notation of the variant to be annotated.
 * @param {string} transcript - The transcript ID to be used in the annotation request.
 * @param {Object} [options={}] - Optional query parameters for the VEP API request.
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @returns {Promise<Object>} A promise that resolves to the annotation data retrieved from the VEP API.
 * @throws {Error} If the request to the VEP API fails.
 */
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');

async function vepHgvsAnnotation(hgvs, transcript, options = {}, cacheEnabled = false) {
  try {
    // Build the endpoint path using the external configuration.
    const endpoint = `${apiConfig.ensembl.endpoints.vepHgvs}/${hgvs}`;
    debug(`Requesting VEP Annotation for HGVS: ${hgvs} with transcript: ${transcript}`);
    debugDetailed(`Using endpoint: ${endpoint}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    const data = await fetchApi(endpoint, options, cacheEnabled);
    return data;
  } catch (error) {
    debugAll(`Error in vepHgvsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepHgvsAnnotation;
