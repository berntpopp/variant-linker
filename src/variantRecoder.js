'use strict';
// src/variantRecoder.js

/**
 * @fileoverview Provides functionality to fetch recoded information for a given genetic
 * variant
 * using the Ensembl Variant Recoder API.
 * @module variantRecoder
 */

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');

/**
 * Fetches the recoded information of a given genetic variant using the Variant Recoder API.
 *
 * @param {string} variant - Genetic variant to be recoded (supports multiple formats).
 * @param {Object} [options={}] - Optional parameters for the Variant Recoder API request.
 *                               (Example: { vcf_string: '1' } )
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @param {Object} [proxyConfig=null] - Optional proxy configuration object.
 * @returns {Promise<Object>} A promise that resolves to the recoded variant information,
 *                            including various IDs and HGVS notations.
 * @throws {Error} If the request to the Variant Recoder API fails.
 */
async function variantRecoder(variant, options = {}, cacheEnabled = false, proxyConfig = null) {
  try {
    const defaultOptions = { vcf_string: '1' };
    const queryOptions = { ...defaultOptions, ...options };
    if (queryOptions['content-type']) {
      delete queryOptions['content-type'];
    }
    // Build the endpoint path using the configuration.
    const endpoint = `${apiConfig.ensembl.endpoints.variantRecoder}/${variant}`;
    debug(`Requesting Variant Recoder for variant: ${variant}`);
    debugDetailed(`Using endpoint: ${endpoint} with query: ${JSON.stringify(queryOptions)}`);

    const data = await fetchApi(endpoint, queryOptions, cacheEnabled, 'GET', null, proxyConfig);
    return data;
  } catch (error) {
    debugAll(`Error in variantRecoder: ${error.message}`);
    throw error;
  }
}

module.exports = variantRecoder;
