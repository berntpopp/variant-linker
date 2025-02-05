#!/usr/bin/env node
'use strict';
// src/apiHelper.js

/**
 * @fileoverview API Helper module to perform HTTP GET requests with caching support.
 * It builds the full URL using the base API endpoint from the external configuration.
 */

const axios = require('axios');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const cache = require('./cache');
const apiConfig = require('../config/apiConfig.json');

/**
 * Fetch data from an API endpoint using axios with optional caching.
 *
 * @param {string} endpointPath - The API endpoint path (e.g. "/vep/homo_sapiens/region/...")
 * @param {Object} [queryOptions={}] - Optional query parameters.
 * @param {boolean} [cacheEnabled=false] - If true, cache the response.
 * @returns {Promise<Object>} The API response data.
 * @throws {Error} If the request fails.
 */
async function fetchApi(endpointPath, queryOptions = {}, cacheEnabled = false) {
  try {
    // Remove any content-type header from queryOptions.
    if (queryOptions['content-type']) {
      delete queryOptions['content-type'];
    }
    // Build the query string.
    const params = new URLSearchParams(queryOptions).toString();
    // Allow override of the base URL via an environment variable.
    const baseUrl = process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
    const url = params ? `${baseUrl}${endpointPath}?${params}` : `${baseUrl}${endpointPath}`;
    debugDetailed(`Constructed API URL: ${url}`);

    if (cacheEnabled) {
      const cached = cache.getCache(url);
      if (cached) {
        debugDetailed(`Returning cached result for: ${url}`);
        return cached;
      }
    }

    const response = await axios.get(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (cacheEnabled) {
      cache.setCache(url, response.data);
    }

    debugDetailed(`Response data: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    debugAll(`Error in fetchApi: ${error.message}`);
    throw error;
  }
}

module.exports = { fetchApi };
