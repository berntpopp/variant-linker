'use strict';

/**
 * @fileoverview Provides helper functions for configuration.
 * @module configHelper
 */

const apiConfig = require('../config/apiConfig.json');

/**
 * Returns the appropriate Ensembl base URL based on the genome assembly.
 *
 * @param {string} assembly - The genome assembly identifier ("hg38" or "hg19").
 * @returns {string} The base URL for the Ensembl API.
 */
function getBaseUrl(assembly) {
  if (assembly && assembly.toLowerCase() === 'hg19') {
    return apiConfig.ensembl.legacyBaseUrl;
  }
  return apiConfig.ensembl.baseUrl;
}

module.exports = { getBaseUrl };
