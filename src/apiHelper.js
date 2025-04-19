'use strict';
// src/apiHelper.js

/**
 * @fileoverview API Helper module to perform HTTP GET or POST requests with caching support.
 * It builds the full URL using the base API endpoint from the external configuration.
 * Implements exponential backoff retry for transient errors.
 */

const axios = require('axios');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
const cache = require('./cache');
const apiConfig = require('../config/apiConfig.json');

// Retry configuration from apiConfig.json
const MAX_RETRIES = apiConfig.requests?.retry?.maxRetries ?? 4; // Default: 4
const BASE_DELAY_MS = apiConfig.requests?.retry?.baseDelayMs ?? 1000; // Default: 1000ms
const RETRYABLE_STATUS_CODES = apiConfig.requests?.retry?.retryableStatusCodes ?? [
  429, 500, 502, 503, 504,
];

/**
 * Fetch data from an API endpoint using axios with optional caching.
 * Implements exponential backoff retry for transient errors (5xx status codes, network errors).
 *
 * @param {string} endpointPath - The API endpoint path (e.g. "/vep/homo_sapiens/region").
 * @param {Object} [queryOptions={}] - Optional query parameters.
 * @param {boolean} [cacheEnabled=false] - If true, cache the response.
 * @param {string} [method='GET'] - HTTP method: 'GET' or 'POST'.
 * @param {Object|null} [requestBody=null] - For POST requests, the JSON body.
 * @returns {Promise<Object>} The API response data.
 * @throws {Error} If the request fails after all retry attempts or for non-retryable errors.
 */
async function fetchApi(
  endpointPath,
  queryOptions = {},
  cacheEnabled = false,
  method = 'GET',
  requestBody = null
) {
  try {
    // Remove any content-type header from queryOptions.
    if (queryOptions['content-type']) {
      delete queryOptions['content-type'];
    }
    // Build the query string.
    const params = new URLSearchParams(queryOptions).toString();
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

    // Implement retry logic with exponential backoff
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Add delay before retries (not on first attempt)
      if (attempt > 0) {
        // Calculate delay with exponential backoff and jitter
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2);
        debugDetailed(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay.toFixed(0)}ms delay`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        let response;
        if (method.toUpperCase() === 'POST') {
          response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          response = await axios.get(url, {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // If we get here, the request succeeded
        if (cacheEnabled) {
          cache.setCache(url, response.data);
        }

        debugDetailed(`Response data: ${JSON.stringify(response.data)}`);
        return response.data;
      } catch (error) {
        lastError = error;
        const statusCode = error.response?.status;
        const isNetworkError = !statusCode && error.code;
        const isRetryableStatusCode = statusCode && RETRYABLE_STATUS_CODES.includes(statusCode);

        // Determine if error is retryable
        const isRetryable = isRetryableStatusCode || isNetworkError;

        // For special handling of 429 (rate limiting)
        const is429Error = statusCode === 429;

        // Special handling for 429 with Retry-After header
        if (
          is429Error &&
          error.response &&
          error.response.headers['retry-after'] &&
          attempt < MAX_RETRIES
        ) {
          const retryAfter = error.response.headers['retry-after'];
          const retryDelayMs = isNaN(retryAfter)
            ? new Date(retryAfter).getTime() - Date.now() // Date format
            : parseInt(retryAfter) * 1000; // Seconds format

          if (retryDelayMs > 0) {
            debugDetailed(
              `Rate limited (429). Waiting for ${retryDelayMs}ms based on Retry-After header`
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            continue;
          }
        }

        if (isRetryable && attempt < MAX_RETRIES) {
          debugDetailed(
            `Retryable error encountered (${statusCode || error.code}): ${error.message}`
          );
          continue; // Try again
        }

        // Non-retryable error or max retries reached
        debugAll(
          `Error in fetchApi (${attempt > 0 ? `after ${attempt} retries` : 'no retry'}): ${error.message}`
        );
        throw error;
      }
    }

    // This should not be reached due to the throw in the catch block above
    // or the return in the try block, but adding as a safeguard
    throw lastError;
  } catch (error) {
    debugAll(`Error in fetchApi: ${error.message}`);
    throw error;
  }
}

module.exports = { fetchApi };
