'use strict';

/**
 * @fileoverview Provides helper functions for configuration.
 * @module configHelper
 */

const apiConfig = require('../config/apiConfig.json');

/**
 * Returns the appropriate Ensembl base URL based on the genome assembly.
 * Defaults to the standard URL unless the assembly is 'hg19' (case-insensitive),
 * in which case it returns the legacy URL for GRCh37 from apiConfig.
 *
 * @param {string} assembly - The genome assembly identifier (e.g., "hg38", "hg19").
 *                           Case-insensitive. If null, undefined, or unrecognized,
 *                           defaults to standard Ensembl URL.
 * @returns {string} The base URL for the Ensembl REST API.
 *                   - Returns legacyBaseUrl for "hg19" (any case)
 *                   - Returns baseUrl for all other cases
 */
function getBaseUrl(assembly) {
  if (assembly && assembly.toLowerCase() === 'hg19') {
    return apiConfig.ensembl.legacyBaseUrl;
  }
  return apiConfig.ensembl.baseUrl;
}

module.exports = { getBaseUrl };
