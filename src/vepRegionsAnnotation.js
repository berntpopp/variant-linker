'use strict';
// src/vepRegionsAnnotation.js

/**
 * Retrieves VEP annotations for given variant(s) using the POST endpoint.
 *
 * @param {Array<string>} variants - An array of variant strings in the required POST format.
 *   For example, a VCF string "1-230710021-G-A" should be converted to "1 230710021 . G A . . ."
 * @param {Object} [options={}] - Optional query parameters for the VEP API request.
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @returns {Promise<Object>} A promise that resolves to the annotation data
 * retrieved from the VEP API.
 * @throws {Error} If the request to the VEP API fails.
 */

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');

/**
 * Retrieves VEP annotations for given variant(s) using the POST endpoint.
 * If the number of variants exceeds the configured chunk size, the function will split the request
 * into multiple smaller requests and aggregate the results.
 *
 * @param {Array<string>} variants - An array of variant strings in the required POST format.
 * @param {Object} [options={}] - Optional query parameters for the VEP API request.
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @param {Object} [proxyConfig=null] - Optional proxy configuration object.
 * @returns {Promise<Object>} A promise that resolves to the annotation data.
 * @throws {Error} If the request to the VEP API fails.
 */
async function vepRegionsAnnotation(
  variants,
  options = {},
  cacheEnabled = false,
  proxyConfig = null
) {
  try {
    // For the POST endpoint we simply use the base endpoint defined in our config.
    const endpoint = apiConfig.ensembl.endpoints.vepRegions; // e.g. "/vep/homo_sapiens/region"
    debug(`Requesting VEP Annotation for ${variants.length} variants`);
    debugDetailed(`Using endpoint: ${endpoint}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    // Get the configured chunk size with a default fallback of 200
    const chunkSize = apiConfig.ensembl.vepPostChunkSize || 200;

    // Check if we need to chunk the request
    if (variants.length <= chunkSize) {
      // If the number of variants is less than or equal to the chunk size,
      // proceed with a single request
      const requestBody = { variants };
      debugDetailed(`Request body: ${JSON.stringify(requestBody)}`);

      const data = await fetchApi(
        endpoint,
        options,
        cacheEnabled,
        'POST',
        requestBody,
        proxyConfig
      );
      return data;
    } else {
      // If the number of variants exceeds the chunk size, we need to chunk the requests
      debug(`Chunking ${variants.length} variants into batches of ${chunkSize}`);
      const allResults = [];

      // Process variants in chunks
      for (let i = 0; i < variants.length; i += chunkSize) {
        const chunk = variants.slice(i, i + chunkSize);
        const requestBody = { variants: chunk };

        debugDetailed(
          `Processing chunk ${Math.floor(i / chunkSize) + 1} with ${chunk.length} variants`
        );
        debugDetailed(`Chunk request body: ${JSON.stringify(requestBody)}`);

        const chunkResults = await fetchApi(
          endpoint,
          options,
          cacheEnabled,
          'POST',
          requestBody,
          proxyConfig
        );
        allResults.push(...chunkResults);

        // Add a small delay between chunks to be polite to the API
        if (i + chunkSize < variants.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      debug(`Completed processing all ${variants.length} variants in chunks`);
      return allResults;
    }
  } catch (error) {
    debugAll(`Error in vepRegionsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepRegionsAnnotation;
