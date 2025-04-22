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
// const cache = require('./cache'); // <-- Remove this line
const { getCache, setCache } = require('./cache'); // <-- Import specific functions
const apiConfig = require('../config/apiConfig.json');

// Retry configuration from apiConfig.json
const MAX_RETRIES = apiConfig.requests?.retry?.maxRetries ?? 4; // Default: 4
const BASE_DELAY_MS = apiConfig.requests?.retry?.baseDelayMs ?? 1000; // Default: 1000ms
const RETRYABLE_STATUS_CODES = apiConfig.requests?.retry?.retryableStatusCodes ?? [
  429, 500, 502, 503, 504,
];
// Max length for request body logging
const MAX_BODY_LOG_LENGTH = 500;

/**
 * Helper to truncate potentially large request bodies for logging.
 * @param {any} body - The request body.
 * @returns {string} - A string representation, possibly truncated.
 */
function formatRequestBodyForLog(body) {
    if (!body) {
        return 'None';
    }
    try {
        const bodyString = JSON.stringify(body);
        if (bodyString.length > MAX_BODY_LOG_LENGTH) {
            return `${bodyString.substring(0, MAX_BODY_LOG_LENGTH)}... (truncated)`;
        }
        return bodyString;
    } catch (e) {
        return '[Error formatting request body for log]';
    }
}


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
    // Don't log the full URL here yet, log it inside the loop for retries

    if (cacheEnabled) {
    //   const cached = cache.getCache(url); // <-- Change this call
      const cached = getCache(url); // <-- Use imported function directly
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
        // Incorporate Retry-After header value if present in lastError
        let retryDelayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2);
        const retryAfterHeader = lastError?.response?.headers?.['retry-after'];

        if (lastError?.response?.status === 429 && retryAfterHeader) {
            const retryAfterSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(retryAfterSeconds)) {
                const retryAfterMs = retryAfterSeconds * 1000;
                // Use the larger of the calculated delay or the header value, add jitter
                retryDelayMs = Math.max(retryDelayMs, retryAfterMs) + (Math.random() * 100);
                debugDetailed(`Rate limited (429). Using Retry-After header: ${retryAfterSeconds}s. ` +
                              `Effective delay: ${retryDelayMs.toFixed(0)}ms`);
            } else {
                // Handle date format for Retry-After (less common)
                try {
                    const retryDate = new Date(retryAfterHeader).getTime();
                    const now = Date.now();
                    if (retryDate > now) {
                         const retryAfterMs = retryDate - now;
                         retryDelayMs = Math.max(retryDelayMs, retryAfterMs) + (Math.random() * 100);
                         debugDetailed(`Rate limited (429). Using Retry-After header (date). ` +
                                       `Effective delay: ${retryDelayMs.toFixed(0)}ms`);
                    }
                } catch (dateParseError) {
                    debugDetailed(`Could not parse Retry-After date: ${retryAfterHeader}. Using standard backoff.`);
                }
            }
        }

        debugDetailed(`Retry attempt ${attempt}/${MAX_RETRIES} after ${retryDelayMs.toFixed(0)}ms delay`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }

      // --- Enhanced Debug Logging for Request Details ---
      const requestHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' }; // Added Accept header
      debugDetailed(
          `Attempt ${attempt + 1}/${MAX_RETRIES + 1}: Sending API Request...` +
          `\n  Method: ${method.toUpperCase()}` +
          `\n  URL: ${url}` +
          `\n  Headers: ${JSON.stringify(requestHeaders)}` +
          (method.toUpperCase() === 'POST' ? `\n  Body: ${formatRequestBodyForLog(requestBody)}` : '')
      );
      // --- End Enhanced Debug Logging ---

      try {
        let response;
        if (method.toUpperCase() === 'POST') {
          response = await axios.post(url, requestBody, { headers: requestHeaders });
        } else {
          response = await axios.get(url, { headers: requestHeaders });
        }

        // If we get here, the request succeeded
        debugDetailed(
          `Attempt ${attempt + 1} Succeeded (Status: ${response.status}). ` +
          `Response data length: ${JSON.stringify(response.data)?.length || 0}`
        );
        // Optionally log truncated response data for detailed debugging:
        // debugDetailed(`Response Data (Truncated): ${formatRequestBodyForLog(response.data)}`);

        if (cacheEnabled) {
        //   cache.setCache(url, response.data); // <-- Change this call
          setCache(url, response.data); // <-- Use imported function directly
        }

        return response.data;

      } catch (error) {
        lastError = error; // Store the error for potential Retry-After parsing
        const statusCode = error.response?.status;
        const isNetworkError = !statusCode && error.code; // e.g., ECONNRESET, ETIMEDOUT
        const isRetryableStatusCode = statusCode && RETRYABLE_STATUS_CODES.includes(statusCode);

        // Determine if error is retryable
        const isRetryable = isRetryableStatusCode || isNetworkError;

        if (isRetryable && attempt < MAX_RETRIES) {
          debugDetailed(
            `Attempt ${attempt + 1} Failed. Retryable error ` +
              `(${statusCode || error.code}): ${error.message}. Retrying...`
          );
          // The delay calculation is now at the beginning of the loop
          continue; // Go to the next attempt
        }

        // Non-retryable error or max retries reached
        // Log more context about the failed request
        debugAll(
          `Failed request details:`+
          `\n  Method: ${method.toUpperCase()}` +
          `\n  URL: ${url}` +
          (method.toUpperCase() === 'POST' ? `\n  Body (Truncated): ${formatRequestBodyForLog(requestBody)}` : '')
        );
        debugAll(
          `Exhausted all ${attempt + 1} attempts or non-retryable error for URL: ${url}. ` +
            `Last error (${statusCode || error.code}): ${error.message}`
        );
        if (error.response) {
             // Log truncated response data on error
             debugAll(`Error Response Data (Truncated): ${formatRequestBodyForLog(error.response.data)}`);
             debugAll(`Error Response Headers: ${JSON.stringify(error.response.headers)}`);
        } else if (error.request) {
             debugAll('Error: No response received from server.');
        } else {
             debugAll(`Error Details: ${error.message}`);
        }
        throw error; // Throw the last encountered error
      }
    } // End of retry loop

    // This point should technically not be reached due to throw/return within the loop
    // Throw the last error if the loop finishes unexpectedly (e.g., MAX_RETRIES is -1)
    debugAll(`Exiting fetchApi loop unexpectedly for ${url}. Throwing last error.`);
    throw lastError;

  } catch (error) {
    // Catch any synchronous errors from initial setup (URL building, etc.)
    debugAll(`Error in fetchApi setup or final throw: ${error.message}`);
    throw error; // Re-throw the error
  }
}

module.exports = { fetchApi };
