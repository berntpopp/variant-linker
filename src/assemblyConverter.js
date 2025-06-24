'use strict';

/**
 * @fileoverview Assembly converter module for lifting over coordinates between genome assemblies.
 * @module assemblyConverter
 */

const debug = require('debug')('variant-linker:assembly-converter');
const apiConfig = require('../config/apiConfig.json');
const { fetchApi } = require('./apiHelper');
const { getBaseUrl } = require('./configHelper');

/**
 * Lifts over coordinates from GRCh37/hg19 to GRCh38 using the Ensembl Assembly Mapper API.
 *
 * @param {string} region - The hg19 region string (e.g., "7:140453136-140453136")
 * @param {boolean} cacheEnabled - Whether to use caching for the API request
 * @returns {Promise<Object>} The API response containing mappings array
 * @throws {Error} If the API request fails
 */
async function liftOverCoordinates(region, cacheEnabled = false) {
  try {
    debug(`Attempting to lift over coordinates: ${region}`);

    // Construct the endpoint path with the region
    const endpoint = apiConfig.ensembl.endpoints.assemblyMap.replace(':region', region);

    // Set the environment variable to use the legacy base URL for GRCh37 assembly mapping
    const originalBaseUrl = process.env.ENSEMBL_BASE_URL;
    process.env.ENSEMBL_BASE_URL = getBaseUrl('hg19');

    debug(`Making liftover API call to: ${process.env.ENSEMBL_BASE_URL}${endpoint}`);

    try {
      const response = await fetchApi(endpoint, {}, cacheEnabled);
      debug(`Liftover API response for ${region}:`, JSON.stringify(response, null, 2));
      return response;
    } finally {
      // Restore the original base URL
      if (originalBaseUrl) {
        process.env.ENSEMBL_BASE_URL = originalBaseUrl;
      } else {
        delete process.env.ENSEMBL_BASE_URL;
      }
    }
  } catch (error) {
    debug(`Liftover API error for region ${region}:`, error.message);
    throw error;
  }
}

/**
 * Parses a VCF-format variant string into its components.
 *
 * @param {string} variant - VCF format variant (e.g., "1-12345-A-G" or "chr1:12345:A:G")
 * @returns {Object|null} Parsed variant object with chr, pos, ref, alt or null if invalid
 */
function parseVcfVariant(variant) {
  try {
    // Handle different VCF formats: "1-12345-A-G", "chr1:12345:A:G", "1:12345:A:G"
    let parts;

    if (variant.includes('-')) {
      parts = variant.split('-');
    } else if (variant.includes(':')) {
      parts = variant.split(':');
    } else {
      return null;
    }

    if (parts.length !== 4) {
      return null;
    }

    const [chr, pos, ref, alt] = parts;

    // Remove 'chr' prefix if present
    const cleanChr = chr.replace(/^chr/i, '');

    // Validate that position is numeric
    if (isNaN(parseInt(pos))) {
      return null;
    }

    return {
      chr: cleanChr,
      pos: parseInt(pos),
      ref: ref,
      alt: alt,
    };
  } catch (error) {
    debug(`Failed to parse VCF variant ${variant}:`, error.message);
    return null;
  }
}

/**
 * Constructs a region string from parsed variant components.
 *
 * @param {Object} parsedVariant - Parsed variant object
 * @returns {string} Region string in format "chr:start-end"
 */
function constructRegionString(parsedVariant) {
  const { chr, pos } = parsedVariant;
  return `${chr}:${pos}-${pos}`;
}

/**
 * Constructs a lifted variant string from the original variant and mapping result.
 *
 * @param {Object} parsedVariant - Original parsed variant
 * @param {Object} mapping - Mapping result from liftover API
 * @returns {string} New variant string in GRCh38 coordinates
 */
function constructLiftedVariant(parsedVariant, mapping) {
  const { ref, alt } = parsedVariant;
  const { seq_region_name: newChr, start: newPos } = mapping.mapped;

  return `${newChr}-${newPos}-${ref}-${alt}`;
}

module.exports = {
  liftOverCoordinates,
  parseVcfVariant,
  constructRegionString,
  constructLiftedVariant,
};
