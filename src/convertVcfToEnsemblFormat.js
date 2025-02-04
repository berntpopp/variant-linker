#!/usr/bin/env node
// src/convertVcfToEnsemblFormat.js
'use strict';

/**
 * @fileoverview Converts VCF notation into Ensembl region/allele format.
 * @module convertVcfToEnsemblFormat
 */

const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Converts VCF notation to the Ensembl region and allele format required by the VEP API.
 *
 * The expected VCF format is "chrom-pos-ref-alt" (e.g. "chr1-12345-A-T" or "1-12345-ATG-").
 * This function will remove any "chr" prefix (case–insensitive), split the fields,
 * and compute the region string. For SNVs, the region is simply a single position.
 * For indels, it calculates the proper start/end coordinates.
 *
 * @param {string} vcf - The VCF string (e.g. "chr1-12345-A-T").
 * @returns {{region: string, allele: string}} An object with the Ensembl region and alternate allele.
 * @throws {Error} If the VCF string does not have exactly four fields or the position is invalid.
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
    const start = pos;
    const end = start + ref.length - 1;
    const strand = '1'; // Assumed positive strand

    debugDetailed(
      `Parsing VCF: chrom=${chrom}, pos=${pos}, ref=${ref}, alt=${alt}`
    );

    let region;
    let allele;

    if (ref.length === 1 && alt.length === 1) {
      // Single nucleotide variant (SNV)
      region = `${chrom}:${start}-${start}:${strand}`;
      allele = alt;
    } else if (ref.length > 1 && alt === '-') {
      // Deletion: region from (start+1) to end.
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = '-';
    } else if (ref === '-' && alt.length > 1) {
      // Insertion: region is a zero-length region between start and start+1.
      region = `${chrom}:${start + 1}-${start}:${strand}`;
      allele = alt.slice(1); // Remove the first (reference) base
    } else {
      // Complex indel (e.g. substitution or indel with different ref/alt lengths)
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = alt.slice(1); // Assumes the first base is context
    }

    debugDetailed(
      `Converted to Ensembl format: region=${region}, allele=${allele}`
    );
    return { region, allele };
  } catch (error) {
    debugAll(`Error in convertVcfToEnsemblFormat: ${error.message}`);
    throw error;
  }
}

module.exports = convertVcfToEnsemblFormat;
