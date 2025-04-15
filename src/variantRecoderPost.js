'use strict';
// src/variantRecoderPost.js

/**
 * @fileoverview Provides functionality to fetch recoded information for a batch of genetic
 * variants
 * using the Ensembl Variant Recoder POST API.
 * @module variantRecoderPost
 */

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');

/**
 * Fetches the recoded information for multiple genetic variants using the Variant Recoder POST API.
 *
 * @param {Array<string>} variants - An array of genetic variants to be recoded (can be rsIDs,
 * HGVS notations, or VCF strings)
 * @param {Object} [options={}] - Optional parameters for the Variant Recoder API request.
 *                                (Example: { vcf_string: '1' } )
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of recoded variant
 * information.
 * @throws {Error} If the request to the Variant Recoder API fails.
 */
async function variantRecoderPost(variants, options = {}, cacheEnabled = false) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Variants must be provided as a non-empty array');
  }

  try {
    const defaultOptions = { vcf_string: '1' };
    const queryOptions = { ...defaultOptions, ...options };
    if (queryOptions['content-type']) {
      delete queryOptions['content-type'];
    }

    // Build the base endpoint path for POST request
    // The species parameter is usually part of the URL, defaulting to homo_sapiens
    const species = queryOptions.species || 'homo_sapiens';
    delete queryOptions.species; // Remove from query params as it's in the URL

    // The variant recoder endpoint for POST requests
    const endpoint = `${apiConfig.ensembl.endpoints.variantRecoderBase}/${species}`;
    debug(`Requesting Variant Recoder batch annotation for ${variants.length} variants`);
    debugDetailed(`Using endpoint: ${endpoint}`);
    debugDetailed(`With query options: ${JSON.stringify(queryOptions)}`);

    // Create the request body with the variants
    const requestBody = { ids: variants };
    debugDetailed(`Request body: ${JSON.stringify(requestBody)}`);

    // Use POST method with the variants in the request body
    const data = await fetchApi(endpoint, queryOptions, cacheEnabled, 'POST', requestBody);
    return data;
  } catch (error) {
    debugAll(`Error in variantRecoderPost: ${error.message}`);
    throw error;
  }
}

module.exports = variantRecoderPost;
