'use strict';

/**
 * Parse ploidy independently of inference. Null alleles retain partial missingness;
 * a haploid ALT is a variant but is not a diploid homozygote.
 * @param {string|null|undefined} gt
 * @returns {{alleles: (number|null)[], phased: boolean, missing: boolean}}
 */
function parseGenotype(gt) {
  if (typeof gt !== 'string' || !/^(\d+|\.)([/|-](\d+|\.))*$/.test(gt)) {
    return { alleles: [], phased: false, missing: true };
  }
  const alleles = gt.split(/[/|-]/).map((allele) => (allele === '.' ? null : Number(allele)));
  return { alleles, phased: gt.includes('|'), missing: alleles.includes(null) };
}

/** @param {string|null|undefined} gt @returns {boolean} */
function isRef(gt) {
  const call = parseGenotype(gt);
  return !call.missing && call.alleles.every((allele) => allele === 0);
}

/** @param {string|null|undefined} gt @returns {boolean} */
function isHet(gt) {
  const call = parseGenotype(gt);
  return !call.missing && call.alleles.length === 2 && new Set(call.alleles).size === 2;
}

/** @param {string|null|undefined} gt @returns {boolean} */
function isHomAlt(gt) {
  const call = parseGenotype(gt);
  return (
    !call.missing &&
    call.alleles.length >= 2 &&
    call.alleles.every((allele) => allele !== null && allele > 0 && allele === call.alleles[0])
  );
}

/** @param {string|null|undefined} gt @returns {boolean} */
function isVariant(gt) {
  const call = parseGenotype(gt);
  return !call.missing && call.alleles.some((allele) => allele !== null && allele > 0);
}

/** @param {string|null|undefined} gt @returns {boolean} */
function isMissing(gt) {
  return parseGenotype(gt).missing;
}

/**
 * Analysis-only projection: 0 means absence of the target ALT, including another
 * ALT. Original GT and FORMAT are retained separately for lossless VCF output.
 * @param {string} gt
 * @param {number} altIndex One-based original ALT index.
 * @returns {string}
 */
function projectGenotype(gt, altIndex) {
  if (!parseGenotype(gt).alleles.length) return './.';
  return gt.replace(/\d+/g, (allele) => (Number(allele) === altIndex ? '1' : '0'));
}

module.exports = { parseGenotype, projectGenotype, isRef, isHet, isHomAlt, isVariant, isMissing };
