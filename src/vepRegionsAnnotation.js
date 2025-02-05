#!/usr/bin/env node
'use strict';
// src/vepRegionsAnnotation.js

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given genomic region and allele.
 *
 * @param {string} region - The genomic region in the format "chrom:start-end:strand".
 * @param {string} allele - The alternate allele for the region.
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

async function vepRegionsAnnotation(region, allele, options = {}, cacheEnabled = false) {
  try {
    // Build the endpoint path using the external configuration.
    const endpoint = `${apiConfig.ensembl.endpoints.vepRegions}/${region}/${allele}`;
    debug(`Requesting VEP Annotation for region: ${region}, allele: ${allele}`);
    debugDetailed(`Using endpoint: ${endpoint}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    const data = await fetchApi(endpoint, options, cacheEnabled);
    return data;
  } catch (error) {
    debugAll(`Error in vepRegionsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepRegionsAnnotation;
