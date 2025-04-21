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

// --- Helper for setImmediate as Promise ---
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));
// -----------------------------------------

/**
 * Fetches the recoded information for multiple genetic variants using the Variant Recoder POST API.
 * If the number of variants exceeds the configured chunk size, the function will split the request
 * into multiple smaller requests and aggregate the results.
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

    // Get the configured chunk size with a default fallback of 200
    const chunkSize = apiConfig.ensembl.recoderPostChunkSize || 200;

    // Check if we need to chunk the request
    if (variants.length <= chunkSize) {
      // If the number of variants is less than or equal to the chunk size,
      // proceed with a single request
      const requestBody = { ids: variants };
      debugDetailed(`Request body: ${JSON.stringify(requestBody)}`);

      const data = await fetchApi(endpoint, queryOptions, cacheEnabled, 'POST', requestBody);
      return data;
    } else {
      // If the number of variants exceeds the chunk size, we need to chunk the requests
      debug(`Chunking ${variants.length} variants into batches of ${chunkSize}`);
      console.log(`[variantRecoderPost Debug] Starting chunking loop for ${variants.length} variants.`); // DEBUG
      const allResults = [];

      // Process variants in chunks
      for (let i = 0; i < variants.length; i += chunkSize) {
        // --- DEBUG: Yield before processing each chunk ---
        await yieldToEventLoop();
        // -----------------------------------------------
        console.log(`[variantRecoderPost Debug] Loop iteration i = ${i}`); // DEBUG
        const chunk = variants.slice(i, i + chunkSize);
        const requestBody = { ids: chunk };

        debugDetailed(
          `Processing chunk ${Math.floor(i / chunkSize) + 1} with ${chunk.length} variants`
        );
        debugDetailed(`Chunk request body: ${JSON.stringify(requestBody)}`);

        console.log(`[variantRecoderPost Debug] Before await fetchApi for chunk ${Math.floor(i / chunkSize) + 1}`); // DEBUG
        const chunkResults = await fetchApi(
          endpoint,
          queryOptions,
          cacheEnabled,
          'POST',
          requestBody
        );
        console.log(`[variantRecoderPost Debug] After await fetchApi for chunk ${Math.floor(i / chunkSize) + 1}`); // DEBUG
        allResults.push(...chunkResults);

        // Add a small delay between chunks to be polite to the API
        if (i + chunkSize < variants.length) {
          console.log(`[variantRecoderPost Debug] Before await setTimeout delay`); // DEBUG
          await new Promise((resolve) => setTimeout(resolve, 100));
          console.log(`[variantRecoderPost Debug] After await setTimeout delay`); // DEBUG
        }
      }

      console.log(`[variantRecoderPost Debug] Exited chunking loop.`); // DEBUG
      debug(`Completed processing all ${variants.length} variants in chunks`);
      return allResults;
    }
  } catch (error) {
    console.error(`[variantRecoderPost Debug] Error caught: ${error.message}`); // DEBUG
    debugAll(`Error in variantRecoderPost: ${error.message}`);
    throw error;
  }
}

module.exports = variantRecoderPost;
