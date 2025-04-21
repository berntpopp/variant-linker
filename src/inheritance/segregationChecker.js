// src/inheritance/segregationChecker.js
'use strict';

/**
 * @fileoverview Checks if a variant segregates with affected status in a pedigree.
 * @module segregationChecker
 */

const debug = require('debug')('variant-linker:inheritance:segregation');
const debugDetailed = require('debug')('variant-linker:detailed');
const { isVariant, isRef, isMissing } = require('./genotypeUtils');

/**
 * Checks if a variant segregates according to a given pattern within a pedigree.
 * Focuses on basic segregation: do all affected individuals have the variant?
 * Can be extended for pattern-specific checks (e.g., unaffected carriers for AD).
 *
 * @param {string} pattern - The inheritance pattern being checked (e.g., 'autosomal_dominant').
 *                            Currently used mainly for logging context.
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string for the variant.
 * @param {Map<string, Object>} pedigreeData - Parsed pedigree data containing affected status.
 * @returns {string} Segregation status: 'segregates', 'does_not_segregate', or 'unknown_*'.
 */
function checkSegregation(pattern, genotypes, pedigreeData) {
  debugDetailed(`--- Entering checkSegregation for pattern: ${pattern} ---`);

  if (!pedigreeData || pedigreeData.size === 0) {
    debug('No pedigree data available for segregation check');
    debugDetailed(`--- Exiting checkSegregation. Result: unknown_missing_data ---`);
    return 'unknown_missing_data';
  }
  if (!genotypes || genotypes.size === 0) {
    debug('No genotype data available for segregation check');
    debugDetailed(`--- Exiting checkSegregation. Result: unknown_missing_data ---`);
    return 'unknown_missing_data';
  }

  // --- Identify Affected and Unaffected with Genotypes ---
  const affectedWithGenotype = [];
  const unaffectedWithGenotype = [];
  let affectedCount = 0;
  let hasAnyAffectedGenotype = false;

  for (const [sampleId, pedInfo] of pedigreeData.entries()) {
    const isAffected = pedInfo.affectedStatus === '2' || pedInfo.affectedStatus === 2;
    if (isAffected) affectedCount++;

    if (genotypes.has(sampleId)) {
      const gt = genotypes.get(sampleId);
      const data = { sampleId, gt };
      if (isAffected) {
        affectedWithGenotype.push(data);
        if (!isMissing(gt)) hasAnyAffectedGenotype = true;
      } else if (pedInfo.affectedStatus === '1' || pedInfo.affectedStatus === 1) {
        unaffectedWithGenotype.push(data);
      }
    }
  }

  // Check if there are any affected individuals in the pedigree at all
  if (affectedCount === 0) {
    debug('No affected individuals found in the pedigree.');
    debugDetailed(`--- Exiting checkSegregation. Result: unknown_no_affected ---`);
    return 'unknown_no_affected';
  }

  // Check if we have genotype data for *any* affected individual
  if (!hasAnyAffectedGenotype) {
    debug('No non-missing genotype data available for any affected individuals.');
    debugDetailed(`--- Exiting checkSegregation. Result: unknown_missing_data ---`);
    return 'unknown_missing_data'; // Cannot determine segregation without affected genotypes
  }

  // --- Perform Segregation Checks ---
  let affectedHaveVariantCount = 0;
  let affectedLackVariantCount = 0;
  let affectedMissingGtCount = 0;
  let unaffectedHaveVariantCount = 0;

  for (const { gt } of affectedWithGenotype) {
    if (isVariant(gt)) {
      affectedHaveVariantCount++;
    } else if (isRef(gt)) {
      affectedLackVariantCount++;
    } else if (isMissing(gt)) {
      affectedMissingGtCount++;
    }
  }

  for (const { gt } of unaffectedWithGenotype) {
    if (isVariant(gt)) {
      unaffectedHaveVariantCount++;
    }
  }

  debugDetailed(
    `Segregation Counts: Affected w/ Variant=${affectedHaveVariantCount}, ` +
      `Affected w/o Variant=${affectedLackVariantCount}, ` +
      `Affected w/ Missing GT=${affectedMissingGtCount}, ` +
      `Unaffected w/ Variant=${unaffectedHaveVariantCount}`
  );

  // --- Determine Segregation Status ---

  // Condition 1: Does any affected individual definitively *lack* the variant?
  if (affectedLackVariantCount > 0) {
    debug(
      `${pattern} does not segregate: ${affectedLackVariantCount} affected individual(s) ` +
        `are reference homozygous.`
    );
    debugDetailed(`--- Exiting checkSegregation. Result: does_not_segregate ---`);
    return 'does_not_segregate';
  }

  // Condition 2: Check for incomplete penetrance (unaffected with variant)
  // For stricter segregation (esp. dominant), this could be 'does_not_segregate'.
  // Report 'segregates' if Condition 1 is false, but note penetrance.
  if (unaffectedHaveVariantCount > 0) {
    debug(
      `Potential incomplete penetrance for ${pattern}: ` +
        `${unaffectedHaveVariantCount} unaffected individual(s) have the variant.`
    );
    // Decide if this breaks segregation based on strictness required.
    // For now, allow segregation if affected individuals have the variant.
    // Consider adding a different status like 'segregates_with_incomplete_penetrance'?
  }

  // Condition 3: Do all genotyped affected individuals have the variant?
  // (Requires at least one affected to have variant and none to lack it)
  // We already checked affectedLackVariantCount == 0
  if (affectedHaveVariantCount > 0) {
    // Missing genotypes in affected: less certain but possible.
    if (affectedMissingGtCount > 0) {
      debug(
        `${pattern} likely segregates, but ${affectedMissingGtCount} affected individual(s) ` +
          `have missing genotypes.`
      );
    } else {
      debug(`${pattern} segregates consistently with disease status.`);
    }
    debugDetailed(`--- Exiting checkSegregation. Result: segregates ---`);
    return 'segregates';
  }

  // Fallback: No affected had variant (implies all missing GT)
  // or other conditions weren't met. This was covered by hasAnyAffectedGenotype check earlier.
  // Unreachable if hasAnyAffectedGenotype=true and affectedLackVariantCount=0
  // Add a safeguard log.
  debug(
    `Segregation unclear for ${pattern}. Have=${affectedHaveVariantCount}, ` +
      `Lack=${affectedLackVariantCount}, HasGT=${hasAnyAffectedGenotype}`
  );
  return 'unknown_missing_data'; // Default to unknown if logic fails
}

module.exports = {
  checkSegregation,
};
