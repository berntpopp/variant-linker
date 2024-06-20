// src/variantRecoder.js

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Fetches the recoded information of a given genetic variant using the Variant Recoder API.
 * 
 * @param {string} variant - The genetic variant to be recoded. The variant can be provided in multiple formats.
 * @param {Object} [options={}] - Optional parameters for the Variant Recoder API request.
 * @returns {Object} The recoded variant information, including various IDs and HGVS notations.
 * @throws Will throw an error if the request to the Variant Recoder API fails.
 */
async function variantRecoder(variant, options = { vcf_string: '1' }) {
  try {
    // Construct the query parameters from the options object
    const params = new URLSearchParams({ 'content-type': 'application/json', ...options }).toString();
    const url = `https://rest.ensembl.org/variant_recoder/human/${variant}?${params}`;
    
    // Log the full URL and parameters
    debug(`Requesting Variant Recoder for variant: ${variant}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Request options: ${JSON.stringify(options)}`);
    
    const response = await axios.get(url);
    
    // Log the response
    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in variantRecoder: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = variantRecoder;
