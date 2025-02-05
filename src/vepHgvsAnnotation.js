#!/usr/bin/env node
'use strict';
// src/vepHgvsAnnotation.js

/**
 * Retrieves VEP (Variant Effect Predictor) annotations for a given HGVS notation.
 *
 * @param {string} hgvs - The HGVS notation of the variant to be annotated.
 * @param {string} transcript - The transcript ID to be used in the annotation request.
 * @param {Object} [options={}] - Optional query parameters for the VEP API request.
 * @param {boolean} [cacheEnabled=false] - If true, cache the API response.
 * @returns {Promise<Object>} A promise that resolves to the annotation data retrieved from the VEP API.
 * @throws {Error} If the request to the VEP API fails.
 */
const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const cache = require('./cache'); // <-- new import

async function vepHgvsAnnotation(hgvs, transcript, options = {}, cacheEnabled = false) {
  try {
    if (options['content-type']) {
      delete options['content-type'];
    }
    const params = new URLSearchParams(options).toString();
    const url = `https://rest.ensembl.org/vep/human/hgvs/${hgvs}?${params}`;

    debug(`Requesting VEP Annotation for HGVS: ${hgvs} with transcript: ${transcript}`);
    debugDetailed(`Request URL: ${url}`);
    debugDetailed(`Query options: ${JSON.stringify(options)}`);

    if (cacheEnabled) {
      const cached = cache.getCache(url);
      if (cached) {
        debugDetailed(`Returning cached result for vepHgvsAnnotation: ${url}`);
        return cached;
      }
    }

    const response = await axios.get(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (cacheEnabled) {
      cache.setCache(url, response.data);
    }

    debugDetailed(`Response received: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in vepHgvsAnnotation: ${error.message}`);
    throw error;
  }
}

module.exports = vepHgvsAnnotation;
