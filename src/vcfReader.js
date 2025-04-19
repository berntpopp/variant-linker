/**
 * @fileoverview VCF file parsing functionality for variant-linker.
 * Provides functions to read variants from standard VCF files, preserving header
 * information and properly handling multi-allelic sites.
 * @module vcfReader
 */

'use strict';

const fs = require('fs');

const debug = require('debug')('variant-linker:vcf-reader');
// Using direct require with eslint disable for @gmod/vcf package
/* eslint-disable node/no-missing-require */
const VCF = require('@gmod/vcf').default;
/* eslint-enable node/no-missing-require */

/**
 * Reads variants from a VCF file and extracts them for processing.
 * Handles multi-allelic sites by splitting them into separate variants.
 * Preserves the original VCF header and records for later use in VCF output.
 *
 * @async
 * @param {string} filePath - Path to the VCF file to read
 * @returns {Promise<Object>} Object containing:
 *   - variantsToProcess {Array<string>}: Array of variant strings in the format "CHROM-POS-REF-ALT"
 *   - vcfRecordMap {Map}: Map of variant keys to original VCF record data
 *   - headerText {string}: The complete original VCF header text
 * @throws {Error} If there's an issue reading or parsing the VCF file
 */
async function readVariantsFromVcf(filePath) {
  debug(`Reading VCF file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`VCF file not found: ${filePath}`);
  }

  // Initialize return values
  const variantsToProcess = [];
  const vcfRecordMap = new Map();
  let headerText = '';
  let headerLines = [];

  try {
    // Read the file line by line to extract the header correctly
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    // Collect header lines
    headerLines = lines.filter((line) => line.startsWith('#'));
    headerText = headerLines.join('\n');

    if (headerLines.length === 0) {
      throw new Error('No header lines found in VCF file');
    }

    debug(`Found ${headerLines.length} header lines`);

    // Create VCF parser with the header
    const parser = new VCF({ header: headerText });

    // Log a warning if essential headers are missing
    if (!headerLines.some((line) => line.startsWith('##fileformat='))) {
      debug('Warning: Missing ##fileformat in VCF header');
    }

    // Process each data line
    const dataLines = lines.filter((line) => !line.startsWith('#') && line.trim() !== '');

    for (const line of dataLines) {
      const record = parser.parseLine(line);

      const chrom = record.CHROM;
      const pos = record.POS;
      const ref = record.REF;
      const altAlleles = record.ALT;

      // Handle each alternative allele as a separate variant
      for (const alt of altAlleles) {
        // Create a unique key for the variant
        const key = `${chrom}:${pos}:${ref}:${alt}`;

        // Format variant for internal processing
        const formattedVariant = `${chrom}-${pos}-${ref}-${alt}`;

        // Add to variants to process
        variantsToProcess.push(formattedVariant);

        // Store original record info
        vcfRecordMap.set(key, {
          chrom,
          pos,
          ref,
          alt,
          originalRecord: record,
        });
      }
    }

    debug(`Processed ${variantsToProcess.length} variants from VCF file`);

    return {
      variantsToProcess,
      vcfRecordMap,
      headerText,
      headerLines,
    };
  } catch (error) {
    throw new Error(`Error parsing VCF file: ${error.message}`);
  }
}

module.exports = {
  readVariantsFromVcf,
};
