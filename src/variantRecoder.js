// src/variantRecoder.js

const axios = require('axios');
const debug = require('debug')('variant-linker:variantRecoder');


/**
 * Fetches the recoded information of a given genetic variant using the Variant Recoder API.
 * 
 * @param {string} variant - The genetic variant to be recoded. The variant can be provided in multiple formats.
 * @returns {Object} The recoded variant information, including various IDs and HGVS notations.
 * @throws Will throw an error if the request to the Variant Recoder API fails.
 */
async function variantRecoder(variant) {
  try {
    debug(`Requesting Variant Recoder for variant: ${variant}`);
    const response = await axios.get(`https://rest.ensembl.org/variant_recoder/human/${variant}?content-type=application/json`);
    debug(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debug(`Error in variantRecoder: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = variantRecoder;
