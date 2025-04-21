// src/vcfReader.js

/**
 * @fileoverview VCF file parsing functionality for variant-linker.
 * Provides functions to read variants from standard VCF files, preserving header
 * information, sample genotypes, and properly handling multi-allelic sites.
 * @module vcfReader
 */

'use strict';

const fs = require('fs');

const debug = require('debug')('variant-linker:vcf-reader');
const debugDetailed = require('debug')('variant-linker:detailed');
// Using direct require with eslint disable for @gmod/vcf package
/* eslint-disable node/no-missing-require */
const VCF = require('@gmod/vcf').default;
/* eslint-enable node/no-missing-require */

/**
 * Reads variants from a VCF file and extracts them for processing.
 * Handles multi-allelic sites by splitting them into separate variants.
 * Extracts genotype information for each sample.
 * Preserves the original VCF header and records for later use in VCF output.
 *
 * @async
 * @param {string} filePath - Path to the VCF file to read
 * @returns {Promise<Object>} Object containing:
 *   - variantsToProcess {Array<string>}: Array of variant strings in the format "CHROM-POS-REF-ALT"
 *   - vcfRecordMap {Map}: Map of variant keys to original VCF record data with genotypes
 *   - headerText {string}: The complete original VCF header text
 *   - headerLines {Array<string>}: Array of header lines
 *   - samples {Array<string>}: Array of sample IDs found in the VCF
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

    // Get sample IDs from the header
    const samples = [];
    const headerFieldLine = headerLines.find((line) => line.startsWith('#CHROM'));
    if (headerFieldLine) {
      const headerFields = headerFieldLine.split('\t');
      // VCF format: The first 9 columns are fixed, samples start at index 9
      if (headerFields.length > 9) {
        samples.push(...headerFields.slice(9));
        debug(`Found ${samples.length} samples in VCF file: ${samples.join(', ')}`);
      } else {
        debug('No samples found in VCF file (single-sample or no genotypes)');
      }
    } else {
      debug('Warning: Missing #CHROM header line in VCF file');
    }

    // Process each data line
    const dataLines = lines.filter((line) => !line.startsWith('#') && line.trim() !== '');

    for (const line of dataLines) {
      // Try to parse the line, but handle any parsing errors
      let record;
      try {
        record = parser.parseLine(line);
        debugDetailed(
          `VCF Record (${record?.CHROM}:${record?.POS}): Has samples = ${Boolean(record?.SAMPLES)}`
        );
        // Note: record.SAMPLES is a function, record.SAMPLES() returns the data
        // Logging record.SAMPLES directly might not show the genotypes
      } catch (parseError) {
        debug(
          `Warning: Failed to parse VCF line: ${line.substring(0, 100)}... ` +
            `(Error: ${parseError.message})`
        );
        continue; // Skip this line and continue with the next one
      }

      // Verify we have required fields
      if (!record || !record.CHROM || !record.POS || !record.REF) {
        debug(
          `Warning: Missing required fields in VCF record, skipping line: ` +
            `${line.substring(0, 100)}...`
        );
        continue;
      }

      const chrom = record.CHROM;
      const pos = record.POS;
      const ref = record.REF;
      const altAlleles = record.ALT;

      // Validate altAlleles is iterable before processing
      if (!altAlleles || !Array.isArray(altAlleles)) {
        debug(
          `Warning: Invalid ALT field in record at ${chrom}:${pos}, ` +
            `skipping: ${JSON.stringify(record)}`
        );
        continue; // Skip this record and continue with the next one
      }

      // Skip records with empty ALT arrays
      if (altAlleles.length === 0) {
        debug(`Warning: Empty ALT field in record at ${chrom}:${pos}, skipping`);
        continue;
      }

      // Check for missing alternative alleles (represented as periods in VCF)
      if (altAlleles.length === 1 && altAlleles[0] === '.') {
        debug(
          `Warning: Missing alternative allele (ALT=.) in record at ${chrom}:${pos}, ` +
            `skipping: This is a valid VCF format for reference-only variants, ` +
            `but requires an alternative allele for annotation.`
        );
        continue;
      }

      // Handle each alternative allele as a separate variant
      for (const alt of altAlleles) {
        // Skip invalid alt values
        if (alt === null || alt === undefined || alt === '') {
          debug(
            `Warning: Invalid ALT value in record at ${chrom}:${pos}, ` + `skipping this alt allele`
          );
          continue;
        }

        // Create a unique key for the variant
        const key = `${chrom}:${pos}:${ref}:${alt}`;

        // Format variant for internal processing
        const formattedVariant = `${chrom}-${pos}-${ref}-${alt}`;

        // Add to variants to process
        variantsToProcess.push(formattedVariant);

        // Store genotypes for this variant (CHROM/POS/REF/ALT)
        const genotypes = new Map();

        // Check if the parser actually returned a GENOTYPES function and if samples exist
        if (typeof record.GENOTYPES === 'function' && samples.length > 0) {
          let parsedGenotypes = null;
          try {
            // Call the function to parse genotypes lazily - **CORRECTED FUNCTION NAME**
            parsedGenotypes = record.GENOTYPES(); // <-- FIX IS HERE
            debugDetailed(`Parsed Genotypes object for ${key}: ${JSON.stringify(parsedGenotypes)}`);
          } catch (e) {
            // Log the specific error when calling GENOTYPES()
            debugDetailed(`Error calling record.GENOTYPES() for ${key}: ${e.message}`);
            // Continue without genotypes if parsing fails for this record
          }

          if (parsedGenotypes) {
            // Check if parsing succeeded
            for (const sampleId of samples) {
              // Access the genotype string using the sampleId as the key
              // The value might be an array (e.g., ['0/1']), handle this
              const gtValue = parsedGenotypes[sampleId];
              let gtString = './.'; // Default to missing

              if (Array.isArray(gtValue) && gtValue.length > 0) {
                gtString = String(gtValue[0]); // Take the first element if it's an array
              } else if (gtValue !== undefined && gtValue !== null) {
                gtString = String(gtValue); // Use it directly if not an array
              }

              debugDetailed(
                `Processing sample ${sampleId}: Extracted GT string = ${JSON.stringify(gtString)}`
              );

              // Check for undefined, null, or empty string representations
              // AFTER potential array access
              if (
                gtString !== undefined &&
                gtString !== null &&
                gtString.trim() !== '' &&
                gtString !== '.'
              ) {
                // Store the extracted genotype string (e.g., "0/1", "0|0")
                // Ensure it's stored as a string
                genotypes.set(sampleId, gtString);
                debugDetailed(` -> Storing GT '${gtString}' for sample ${sampleId}`);
              } else {
                // Use './.' if GT is missing, null, empty, or explicitly '.'
                genotypes.set(sampleId, './.');
                debugDetailed(
                  ` -> Sample ${sampleId}: GT missing/empty/invalid ('${gtString}'), storing './.'`
                );
              }
            }
          } else {
            // If parsedGenotypes is null/undefined (e.g., due to error or no samples in record)
            // Fill with missing for all expected samples
            debugDetailed(
              `No parsed genotype object available for ${key}. Storing './.' for all samples.`
            );
            for (const sampleId of samples) {
              genotypes.set(sampleId, './.');
            }
          }
        } else {
          // If no GENOTYPES function or no samples defined in header, store missing
          debugDetailed(
            `No GENOTYPES function or no samples found for ${key}. Using './.' for all samples.`
          );
          for (const sampleId of samples) {
            genotypes.set(sampleId, './.');
          }
        }

        // Log the final genotypes Map before storing
        debugDetailed(
          `Final genotypes for ${key}: ${JSON.stringify(Array.from(genotypes.entries()))}`
        );

        // Store original record info with genotypes
        vcfRecordMap.set(key, {
          chrom,
          pos,
          ref,
          alt,
          genotypes, // Store the populated or default genotypes map
          originalRecord: record, // Keep original record if needed elsewhere
        });
      }
    }

    debug(`Processed ${variantsToProcess.length} variants from VCF file`);

    return {
      variantsToProcess,
      vcfRecordMap,
      headerText,
      headerLines,
      samples,
    };
  } catch (error) {
    // Provide more detailed error message for debugging
    const errorDetails = error.stack ? `\n${error.stack}` : '';
    debug(`VCF parsing error: ${error.message}${errorDetails}`);
    throw new Error(`Error parsing VCF file: ${error.message}`);
  }
}

module.exports = {
  readVariantsFromVcf,
};
