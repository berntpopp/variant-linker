#!/usr/bin/env node
'use strict';
// src/variantRecoder.js

/**
 * @fileoverview Provides functionality to fetch recoded information for a given genetic variant
 * using the Ensembl Variant Recoder API.
 * @module variantRecoder
 */

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Fetches the recoded information of a given genetic variant using the Variant Recoder API.
 *
 * @param {string} variant - The genetic variant to be recoded. This may be provided in multiple formats.
 * @param {Object} [options={}] - Optional parameters for the Variant Recoder API request.
 *                                (Example: { vcf_string: '1' } )
 * @returns {Promise<Object>} A promise that resolves to the recoded variant information,
 *                            including various IDs and HGVS notations.
 * @throws {Error} If the request to the Variant Recoder API fails.
 */
async function variantRecoder(variant, options = {}) {
  try {
    // Merge with default options.
    const defaultOptions = { vcf_string: '1' };
    const queryOptions = { ...defaultOptions, ...options };
    // Remove any unwanted keys (like content-type) if present.
    if (queryOptions['content-type']) {
      delete queryOptions['content-type'];
    }
    const params = new URLSearchParams(queryOptions).toString();
    const url = `https://rest.ensembl.org/variant_recoder/human/${variant}?${params}`;

    debug(`Requesting Variant Recoder for variant: ${variant}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Query options: ${JSON.stringify(queryOptions)}`);

    const response = await axios.get(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in variantRecoder: ${error.message}`);
    throw error; // Rethrow after logging.
  }
}

module.exports = variantRecoder;
