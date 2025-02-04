#!/usr/bin/env node
'use strict';
// src/vepRegionsAnnotation.js

/**
 * @fileoverview Retrieves VEP annotations for a given genomic region and allele.
 * @module vepRegionsAnnotation
 */

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given genomic region and allele.
 *
 * @param {string} region - The genomic region in the format "chrom:start-end:strand".
 * @param {string} allele - The alternate allele for the region.
 * @param {Object} [options={}] - Optional query parameters for the VEP API request.
 * @returns {Promise<Object>} A promise that resolves to the annotation data retrieved from the VEP API.
 * @throws {Error} If the request to the VEP API fails.
 */
async function vepRegionsAnnotation(region, allele, options = {}) {
  try {
    if (options['content-type']) {
      delete options['content-type'];
    }
    const params = new URLSearchParams(options).toString();
    const url = `https://rest.ensembl.org/vep/homo_sapiens/region/${region}/${allele}?${params}`;

    debug(`Requesting VEP Annotation for region: ${region}, allele: ${allele}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    const response = await axios.get(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in vepRegionsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepRegionsAnnotation;
