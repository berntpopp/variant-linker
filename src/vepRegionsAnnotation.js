#!/usr/bin/env node
'use strict';
// src/vepRegionsAnnotation.js

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for given variant(s) using the POST endpoint.
 *
 * @param {Array<string>} variants - An array of variant strings in the required POST format.
 *   For example, a VCF string "1-230710021-G-A" should be converted to "1 230710021 . G A . . ."
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

async function vepRegionsAnnotation(variants, options = {}, cacheEnabled = false) {
  try {
    // For the POST endpoint we simply use the base endpoint defined in our config.
    const endpoint = apiConfig.ensembl.endpoints.vepRegions; // e.g. "/vep/homo_sapiens/region"
    debug(`Requesting VEP Annotation for variants: ${JSON.stringify(variants)}`);
    debugDetailed(`Using endpoint: ${endpoint}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    // Build the request body per Ensembl's POST spec.
    const requestBody = { variants };
    debugDetailed(`Request body: ${JSON.stringify(requestBody)}`);

    // Use POST method.
    const data = await fetchApi(endpoint, options, cacheEnabled, 'POST', requestBody);
    return data;
  } catch (error) {
    debugAll(`Error in vepRegionsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepRegionsAnnotation;
