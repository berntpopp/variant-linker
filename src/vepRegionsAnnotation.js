// src/vepRegionsAnnotation.js

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given genomic region and allele.
 * 
 * @param {string} region - The genomic region in the format "chrom:start-end:strand".
 * @param {string} allele - The alternate allele for the region.
 * @param {Object} [options={}] - Optional parameters for the VEP API request.
 * @returns {Object} The annotation data retrieved from the VEP API.
 * @throws Will throw an error if the request to the VEP API fails.
 */
async function vepRegionsAnnotation(region, allele, options = {}) {
  try {
    // Construct the query parameters from the options object
    const params = new URLSearchParams({ 'content-type': 'application/json', ...options }).toString();
    const url = `https://rest.ensembl.org/vep/homo_sapiens/region/${region}/${allele}?${params}`;
    
    // Log the full URL and parameters
    debug(`Requesting VEP Annotation for region: ${region}, allele: ${allele}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Request options: ${JSON.stringify(options)}`);
    
    const response = await axios.get(url);
    
    // Log the response
    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in vepRegionsAnnotation: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = vepRegionsAnnotation;
