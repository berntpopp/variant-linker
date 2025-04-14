'use strict';

/**
 * @fileoverview Converts VCF notation into Ensembl region/allele format.
 * Also provides a stub for converting Ensembl region format back to VCF.
 * Supports SNV, deletion, insertion, MNP, and complex indels.
 * Note: Converting from Ensembl to VCF requires reference sequence information.
 * @module convertVcfToEnsemblFormat
 */

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Converts a VCF string (in the format "chrom-pos-ref-alt") to the Ensembl region/allele format
 * required by the VEP API.
 *
 * This function supports several variant types:
 *
 * - **SNV:** Both REF and ALT are a single nucleotide.
 *   - *Example:* `"chr1-12345-A-T"` → `{ region: "1:12345-12345:1", allele: "T" }`
 *
 * - **Deletion:** In VCF, deletions include the base immediately preceding the deletion.
 *   The deletion is detected if REF is longer than one base and ALT equals the first base of REF.
 *   - *Example:* `"chr20-2-TC-T"` (where REF = "TC", ALT = "T") → `{ region: "20:3-3:1", allele: "-" }`
 *
 * - **Insertion:** In VCF, insertions are represented with REF of length 1 and ALT starting with that same base.
 *   - *Example:* `"chr8-12600-C-CA"` (insertion of "A") → `{ region: "8:12601-12600:1", allele: "A" }`
 *
 * - **Multi-nucleotide substitution (MNP):** REF and ALT have the same length (>1).
 *   - *Example:* `"chr1-100-AT-GC"` → `{ region: "1:100-101:1", allele: "GC" }`
 *
 * - **Complex indels:** When the lengths differ but the above conditions do not apply,
 *   common prefix and suffix are trimmed to isolate the variable part.
 *   If after trimming the REF portion is empty then it is treated as an insertion,
 *   and if the ALT portion is empty then it is treated as a deletion.
 *
 * @param {string} vcf - The VCF string (e.g. "chr1-12345-A-T", "20-2-TC-T", "8-12600-C-CA").
 * @returns {{ region: string, allele: string }} An object with the Ensembl region and the variant allele.
 * @throws {Error} If the VCF string does not have exactly four fields or if the position is invalid.
 */
function convertVcfToEnsemblFormat(vcf) {
  try {
    if (typeof vcf !== 'string' || !vcf) {
      throw new Error('VCF input must be a non-empty string');
    }

    // Remove any "chr" prefix (case-insensitive)
    vcf = vcf.replace(/^chr/i, '');
    const parts = vcf.split('-');
    if (parts.length !== 4) {
      throw new Error(
        `Invalid VCF format: expected "chrom-pos-ref-alt" with 4 fields but got ${parts.length}`
      );
    }

    const [chrom, posStr, ref, alt] = parts;
    const pos = parseInt(posStr, 10);
    if (isNaN(pos)) {
      throw new Error(`Invalid position value: ${posStr}`);
    }
    const strand = '1'; // Assumed positive strand

    debugDetailed(`Parsing VCF: chrom=${chrom}, pos=${pos}, ref=${ref}, alt=${alt}`);

    let region;
    let allele;

    // SNV: both ref and alt are one nucleotide.
    if (ref.length === 1 && alt.length === 1) {
      region = `${chrom}:${pos}-${pos}:${strand}`;
      allele = alt;
    }
    // Deletion: VCF deletion is represented with ref length > 1 and alt equal to the first base of ref.
    else if (ref.length > 1 && alt === ref[0]) {
      // The deleted sequence spans from pos+1 to pos + ref.length - 1.
      region = `${chrom}:${pos + 1}-${pos + ref.length - 1}:${strand}`;
      allele = '-';
    }
    // Insertion: VCF insertion is represented with a one-base ref and an alt that starts with that base.
    else if (ref.length === 1 && alt.length > 1 && alt.startsWith(ref)) {
      // For insertion, the region is a zero-length interval: start = pos+1, end = pos.
      region = `${chrom}:${pos + 1}-${pos}:${strand}`;
      allele = alt.substring(1);
    }
    // Multi-nucleotide substitution (MNP): ref and alt have the same length greater than 1.
    else if (ref.length === alt.length && ref.length > 1) {
      region = `${chrom}:${pos}-${pos + ref.length - 1}:${strand}`;
      allele = alt;
    }
    // Complex indel: variants that do not fall into the above categories.
    else {
      // Trim common prefix.
      let prefixLength = 0;
      while (
        prefixLength < ref.length &&
        prefixLength < alt.length &&
        ref[prefixLength] === alt[prefixLength]
      ) {
        prefixLength++;
      }
      // Trim common suffix.
      let suffixLength = 0;
      while (
        suffixLength < ref.length - prefixLength &&
        suffixLength < alt.length - prefixLength &&
        ref[ref.length - 1 - suffixLength] === alt[alt.length - 1 - suffixLength]
      ) {
        suffixLength++;
      }
      const trimmedRef = ref.slice(prefixLength, ref.length - suffixLength);
      const trimmedAlt = alt.slice(prefixLength, alt.length - suffixLength);
      // Adjust coordinates: the variable region starts at pos + prefixLength.
      const newStart = pos + prefixLength;
      const newEnd = pos + ref.length - suffixLength - 1;
      region = `${chrom}:${newStart}-${newEnd}:${strand}`;
      // Determine allele based on trimmed strings.
      if (trimmedRef === '' && trimmedAlt !== '') {
        // Insertion
        allele = trimmedAlt;
      } else if (trimmedAlt === '' && trimmedRef !== '') {
        // Deletion
        allele = '-';
      } else {
        // Otherwise, return the full ALT allele.
        allele = alt;
      }
    }

    debugDetailed(`Converted to Ensembl format: region=${region}, allele=${allele}`);
    return { region, allele };
  } catch (error) {
    debugAll(`Error in convertVcfToEnsemblFormat: ${error.message}`);
    throw error;
  }
}

/**
 * Placeholder function for converting Ensembl region format back to VCF format.
 *
 * Converting from Ensembl format (e.g. "chr:start-end:strand" and variant allele)
 * back to VCF format requires knowledge of the reference allele, which is not available
 * in the Ensembl input alone. Additional reference sequence information is required.
 *
 * @param {string} ensemblInput - The Ensembl region input string.
 * @throws {Error} Always throws an error indicating that conversion to VCF is not supported.
 */
function convertEnsemblToVcfFormat(ensemblInput) {
  throw new Error(
    'Conversion from Ensembl format to VCF format is not supported without reference sequence information.'
  );
}

module.exports = {
  convertVcfToEnsemblFormat,
  convertEnsemblToVcfFormat,
};
