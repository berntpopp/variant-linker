// src/convertVcfToEnsemblFormat.js

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Converts VCF notation to Ensembl region and allele format for the VEP API.
 * 
 * @param {string} vcf - The VCF notation in the format "chrom-pos-ref-alt".
 * @returns {Object} An object containing the Ensembl region format and the allele.
 */
function convertVcfToEnsemblFormat(vcf) {
  try {
    // Remove "chr" prefix if present
    vcf = vcf.replace(/^chr/, '');

    const [chrom, pos, ref, alt] = vcf.split('-');
    const start = parseInt(pos);
    const end = start + ref.length - 1;
    const strand = '1'; // Assuming positive strand

    debugDetailed(`Parsing VCF: chrom=${chrom}, pos=${pos}, ref=${ref}, alt=${alt}`);

    let region, allele;

    if (ref.length === 1 && alt.length === 1) {
      // Single nucleotide variant (SNV)
      region = `${chrom}:${start}-${start}:${strand}`;
      allele = alt;
    } else if (ref.length > 1 && alt === '-') {
      // Deletion
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = '-';
    } else if (ref === '-' && alt.length > 1) {
      // Insertion
      region = `${chrom}:${start + 1}-${start}:${strand}`;
      allele = alt.slice(1); // Remove the first base which matches the reference
    } else {
      // Complex indel (e.g., substitution with different lengths of ref and alt)
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = alt.slice(1); // Remove the first base which matches the reference
    }

    debugDetailed(`Converted to Ensembl format: region=${region}, allele=${allele}`);
    return { region, allele };
  } catch (error) {
    debugAll(`Error in convertVcfToEnsemblFormat: ${error.message}`);
    throw error; // Rethrow the error after logging
  }
}

module.exports = convertVcfToEnsemblFormat;
