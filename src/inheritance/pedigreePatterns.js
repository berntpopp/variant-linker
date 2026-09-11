'use strict';
const debug = require('debug')('variant-linker:inheritance:pedigree');
const debugDetailed = require('debug')('variant-linker:detailed');
const genotypeUtils = require('./genotypeUtils');
const pedigreeUtils = require('./pedigreeUtils');

/**
 * Deduces inheritance patterns using complete pedigree information.
 * This version focuses on checking consistency with major patterns and
 * identifying potential de novo variants.
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string.
 * @param {import('../dataTypes').Pedigree} pedigreeData - Parsed pedigree data.
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome.
 * @returns {Array<string>} Array of possible patterns.
 * @private
 */
function _deducePedBasedPatterns(genotypes, pedigreeData, isXChromosome) {
  debugDetailed(`--- Entering _deducePedBasedPatterns ---`);
  debugDetailed(
    `  Args:
      genotypes size=${genotypes?.size}
      pedigreeData size=${pedigreeData?.size}
      isX=${isXChromosome}`
  );

  if (!pedigreeData || pedigreeData.size === 0 || !genotypes || genotypes.size === 0) {
    debugDetailed(`Exiting _deducePedBasedPatterns early: Missing PED data or genotypes.`);
    return ['unknown_missing_ped_or_genotypes'];
  }

  // --- Identify Affected and Unaffected Individuals with Genotypes ---
  const affectedIndividuals = new Map(); // sampleId -> { pedData, genotype }
  const unaffectedIndividuals = new Map(); // sampleId -> { pedData, genotype }
  let hasAffected = false;
  let allAreReference = true; // Flag to check if everyone is 0/0
  let nonMissingCount = 0; // Count individuals with actual genotype data

  for (const [sampleId, pedInfo] of pedigreeData.entries()) {
    if (genotypes.has(sampleId)) {
      const gt = genotypes.get(sampleId);
      // Only consider individuals with non-missing genotypes for pattern consistency checks
      if (!genotypeUtils.isMissing(gt)) {
        nonMissingCount++; // Increment count of samples with genotype data
        const data = { pedData: pedInfo, genotype: gt };
        // Check affected status (string '2' or number 2)
        if (pedInfo.affectedStatus === '2' || pedInfo.affectedStatus === 2) {
          affectedIndividuals.set(sampleId, data);
          hasAffected = true;
        } else if (pedInfo.affectedStatus === '1' || pedInfo.affectedStatus === 1) {
          unaffectedIndividuals.set(sampleId, data);
        }
        // Check if this individual is NOT reference homozygous
        if (!genotypeUtils.isRef(gt)) {
          allAreReference = false;
        }
      } else {
        debugDetailed(
          `  PED Mode: Sample ${sampleId} has missing genotype, excluded from consistency checks.`
        );
      }
    } else {
      debugDetailed(`  PED Mode: Sample ${sampleId} skipped (no genotype).`);
    }
  }

  debugDetailed(
    `  PED Mode: ${affectedIndividuals.size} affected, ${unaffectedIndividuals.size} unaffected`
  );

  // ** FIX: Add early return for 'reference' if applicable **
  // Only return 'reference' if we actually checked samples and they were all ref
  if (nonMissingCount > 0 && allAreReference) {
    debugDetailed(`  PED Mode: All non-missing samples are reference homozygous.`);
    debugDetailed(`--- Exiting _deducePedBasedPatterns. Result: ["reference"] ---`);
    return ['reference'];
  }

  if (!hasAffected) {
    debug(
      'No affected individuals found with non-missing genotypes, cannot deduce pattern using PED.'
    );
    debugDetailed(
      `--- Exiting _deducePedBasedPatterns. Result: ["unknown_no_affected_with_genotype"] ---`
    );
    return ['unknown_no_affected_with_genotype'];
  }

  // --- Check Patterns for Consistency ---
  const consistentPatterns = [];

  // Initialize flags/variables used later *before* the isXChromosome check
  let affectedWithoutVariant = false;
  let unaffectedWithVariant = false;
  let xlrConsistent; // Assume not consistent unless X-linked checks run and pass
  let xldConsistent;
  let addedXLinkedPattern = false; // Flag to track if X-linked was added

  // 1. Check De Novo consistency
  let potentialDeNovo = false;
  for (const [affectedId, affectedData] of affectedIndividuals.entries()) {
    const indexGT = affectedData.genotype;
    if (!genotypeUtils.isVariant(indexGT)) {
      affectedWithoutVariant = true; // Flag if affected is reference
      continue; // Skip if affected is ref for de novo check
    }

    const { motherId, fatherId } = affectedData.pedData;

    // Check if parents exist in PED and have non-missing genotypes
    const motherGT =
      motherId && motherId !== '0' && pedigreeData.has(motherId) && genotypes.has(motherId)
        ? genotypes.get(motherId)
        : undefined;
    const fatherGT =
      fatherId && fatherId !== '0' && pedigreeData.has(fatherId) && genotypes.has(fatherId)
        ? genotypes.get(fatherId)
        : undefined;

    if (motherGT !== undefined && fatherGT !== undefined) {
      // Both parents have genotypes
      if (!genotypeUtils.isMissing(motherGT) && !genotypeUtils.isMissing(fatherGT)) {
        if (genotypeUtils.isRef(motherGT) && genotypeUtils.isRef(fatherGT)) {
          potentialDeNovo = true; // Found at least one affected with ref parents
          debugDetailed(`  PED De Novo Check: Found potential de novo for ${affectedId}`);
          break; // One instance is enough to suggest de novo
        }
      } else {
        // If parent GT is missing, cannot confirm/deny de novo from this parent pair
        debugDetailed(
          `  PED De Novo Check: Cannot confirm parents for ${affectedId} due to missing parent GT.`
        );
      }
    } else {
      debugDetailed(
        `  PED De Novo Check: Cannot check parents for ${affectedId} (missing from PED/genotypes).`
      );
    }
  }
  // Add de novo only if NO affected individual inherited the variant from a parent
  if (potentialDeNovo) {
    let inherited = false;
    for (const [, affectedData] of affectedIndividuals.entries()) {
      const indexGT = affectedData.genotype;
      if (!genotypeUtils.isVariant(indexGT)) continue;
      const { motherId, fatherId } = affectedData.pedData;
      const motherGT =
        motherId && motherId !== '0' && genotypes.has(motherId)
          ? genotypes.get(motherId)
          : undefined;
      const fatherGT =
        fatherId && fatherId !== '0' && genotypes.has(fatherId)
          ? genotypes.get(fatherId)
          : undefined;

      if (motherGT && !genotypeUtils.isMissing(motherGT) && genotypeUtils.isVariant(motherGT)) {
        inherited = true;
        break;
      }
      if (fatherGT && !genotypeUtils.isMissing(fatherGT) && genotypeUtils.isVariant(fatherGT)) {
        inherited = true;
        break;
      }
    }
    if (!inherited) {
      consistentPatterns.push('de_novo');
      debugDetailed("  PED Mode: 'de_novo' is consistent.");
    } else {
      debugDetailed(
        "  PED Mode: Potential de novo found, but also evidence of inheritance, not adding 'de_novo'."
      );
    }
  }

  // 4. Check X-linked consistency FIRST if applicable
  if (isXChromosome) {
    xlrConsistent = true; // Start assuming consistent
    xldConsistent = true; // Start assuming consistent

    // Perform detailed X-linked checks...
    for (const [affectedId, affectedData] of affectedIndividuals.entries()) {
      const isMaleAffected = pedigreeUtils.isMale(affectedId, pedigreeData);
      const affectedGT = affectedData.genotype;
      const { fatherId, motherId } = affectedData.pedData;
      const fatherGT =
        fatherId && fatherId !== '0' && genotypes.has(fatherId)
          ? genotypes.get(fatherId)
          : undefined;
      const motherGT =
        motherId && motherId !== '0' && genotypes.has(motherId)
          ? genotypes.get(motherId)
          : undefined;

      // Rule out XLR if affected male has unaffected mother or affected father
      if (isMaleAffected) {
        if (!genotypeUtils.isMissing(motherGT) && genotypeUtils.isRef(motherGT)) {
          xlrConsistent = false;
          debugDetailed(`XLR Fail: Affected Male ${affectedId} has ref mother.`);
        }
        if (!genotypeUtils.isMissing(fatherGT) && genotypeUtils.isVariant(fatherGT)) {
          xlrConsistent = false;
          debugDetailed(`XLR Fail: Affected Male ${affectedId} has variant father.`);
        }
        // Rule out XLD if affected male has unaffected mother
        if (!genotypeUtils.isMissing(motherGT) && genotypeUtils.isRef(motherGT)) {
          xldConsistent = false;
          debugDetailed(`XLD Fail: Affected Male ${affectedId} has ref mother.`);
        }
      } else {
        // Female affected
        // Rule out XLR if affected female (needs HomAlt) has unaffected father
        if (
          genotypeUtils.isHomAlt(affectedGT) &&
          !genotypeUtils.isMissing(fatherGT) &&
          genotypeUtils.isRef(fatherGT)
        ) {
          xlrConsistent = false;
          debugDetailed(`XLR Fail: Affected Female (HomAlt) ${affectedId} has ref father.`);
        }
        // Rule out XLD if affected female has unaffected father
        if (!genotypeUtils.isMissing(fatherGT) && genotypeUtils.isRef(fatherGT)) {
          xldConsistent = false;
          debugDetailed(`XLD Fail: Affected Female ${affectedId} has ref father.`);
        }
        // Rule out XLR if affected female is Het and mother is Ref (requires affected father)
        if (
          genotypeUtils.isHet(affectedGT) &&
          !genotypeUtils.isMissing(motherGT) &&
          genotypeUtils.isRef(motherGT)
        ) {
          xlrConsistent = false; // Cannot be carrier if mother is Ref
          debugDetailed(`XLR Fail: Affected Female (Het) ${affectedId} has ref mother.`);
        }
      }
      // General check: affected must have variant
      if (!genotypeUtils.isVariant(affectedGT)) {
        xlrConsistent = false;
        xldConsistent = false;
        debugDetailed(
          `XLR/XLD Fail: Affected ${affectedId} (${isMaleAffected ? 'M' : 'F'}) is Ref.`
        );
      }
    }

    for (const [unaffectedId, unaffectedData] of unaffectedIndividuals.entries()) {
      const indexGT = unaffectedData.genotype;
      const isMaleUnaffected = pedigreeUtils.isMale(unaffectedId, pedigreeData);

      if (xlrConsistent && isMaleUnaffected && genotypeUtils.isVariant(indexGT)) {
        xlrConsistent = false;
        debugDetailed(`XLR Fail: Unaffected Male ${unaffectedId} has variant.`);
      }
      if (xlrConsistent && !isMaleUnaffected && genotypeUtils.isHomAlt(indexGT)) {
        xlrConsistent = false;
        debugDetailed(`XLR Fail: Unaffected Female ${unaffectedId} is HomAlt.`);
      }
      if (xldConsistent && genotypeUtils.isVariant(indexGT)) {
        xldConsistent = false; // Basic XLD inconsistent if unaffected carries variant
        unaffectedWithVariant = true;
        debugDetailed(`XLD Inconsistency: Unaffected ${unaffectedId} has variant.`);
        if (!consistentPatterns.includes('incomplete_penetrance')) {
          consistentPatterns.push('incomplete_penetrance');
        }
      }
      // Early exit if both ruled out for this individual
      if (!xlrConsistent && !xldConsistent) break;
    }

    // Add consistent X-linked patterns
    if (xlrConsistent) {
      consistentPatterns.push('x_linked_recessive');
      addedXLinkedPattern = true; // Set flag
      debugDetailed("  PED Mode: 'x_linked_recessive' is consistent.");
    }
    if (xldConsistent) {
      consistentPatterns.push('x_linked_dominant');
      addedXLinkedPattern = true; // Set flag
      debugDetailed("  PED Mode: 'x_linked_dominant' is consistent.");
    }
  } // End if(isXChromosome)

  // --- Autosomal Checks ---
  // Only run these if no X-linked pattern was added
  if (!addedXLinkedPattern) {
    // 2. Check Autosomal Dominant consistency
    let adConsistent = true;
    let adIncompletePenetrance = false;
    for (const [affectedId, affectedData] of affectedIndividuals.entries()) {
      if (!genotypeUtils.isVariant(affectedData.genotype)) {
        adConsistent = false;
        debugDetailed(`  PED AD Check: Affected ${affectedId} is Ref. AD inconsistent.`);
        break;
      }
    }
    if (adConsistent) {
      for (const [unaffectedId, unaffectedData] of unaffectedIndividuals.entries()) {
        if (genotypeUtils.isVariant(unaffectedData.genotype)) {
          adIncompletePenetrance = true;
          unaffectedWithVariant = true;
          debugDetailed(
            `  PED AD Check: Unaffected ${unaffectedId} has variant (Incomplete Penetrance?).`
          );
        }
      }
      consistentPatterns.push('autosomal_dominant');
      debugDetailed("  PED Mode: 'autosomal_dominant' is consistent.");
      if (adIncompletePenetrance && !consistentPatterns.includes('incomplete_penetrance')) {
        consistentPatterns.push('incomplete_penetrance');
        debugDetailed("  PED Mode: Also added 'incomplete_penetrance' for AD.");
      }
    }

    // 3. Check Autosomal Recessive consistency
    let arConsistent = true;
    for (const [affectedId, affectedData] of affectedIndividuals.entries()) {
      if (!genotypeUtils.isHomAlt(affectedData.genotype)) {
        arConsistent = false;
        debugDetailed(`  PED AR Check: Affected ${affectedId} is not HomAlt.`);
        break;
      }
    }
    if (arConsistent) {
      for (const [, affectedData] of affectedIndividuals.entries()) {
        const { motherId, fatherId } = affectedData.pedData;
        const motherGT =
          motherId && motherId !== '0' && genotypes.has(motherId)
            ? genotypes.get(motherId)
            : undefined;
        const fatherGT =
          fatherId && fatherId !== '0' && genotypes.has(fatherId)
            ? genotypes.get(fatherId)
            : undefined;

        if (motherGT !== undefined && !genotypeUtils.isMissing(motherGT)) {
          const motherIsAffected = affectedIndividuals.has(motherId);
          if (
            !genotypeUtils.isHet(motherGT) &&
            !(motherIsAffected && genotypeUtils.isHomAlt(motherGT))
          ) {
            arConsistent = false;
            debugDetailed(
              `  PED AR Check: Parent ${motherId} GT ${motherGT} incompatible. AR inconsistent.`
            );
            break;
          }
        }
        if (fatherGT !== undefined && !genotypeUtils.isMissing(fatherGT)) {
          const fatherIsAffected = affectedIndividuals.has(fatherId);
          if (
            !genotypeUtils.isHet(fatherGT) &&
            !(fatherIsAffected && genotypeUtils.isHomAlt(fatherGT))
          ) {
            arConsistent = false;
            debugDetailed(
              `  PED AR Check: Parent ${fatherId} GT ${fatherGT} incompatible. AR inconsistent.`
            );
            break;
          }
        }
        if (!arConsistent) break;
      }
    }
    if (arConsistent) {
      consistentPatterns.push('autosomal_recessive');
      debugDetailed("  PED Mode: 'autosomal_recessive' is consistent.");
    }
  } // End of conditional autosomal checks

  // Check for overall segregation issues AFTER all pattern checks
  if (affectedWithoutVariant) {
    // Don't add if we only found 'reference' initially
    if (!allAreReference) {
      // Check if the 'reference' pattern was the reason we skipped other checks
      consistentPatterns.push('incomplete_segregation');
      debugDetailed(
        `  Status check - Affected without variant: ${affectedWithoutVariant}, ` +
          `Unaffected with variant: ${unaffectedWithVariant}`
      );
    }
  } else if (unaffectedWithVariant && !consistentPatterns.includes('incomplete_penetrance')) {
    // Add general incomplete penetrance if not added by AD/XLD checks
    consistentPatterns.push('incomplete_penetrance');
    debugDetailed("  PED Mode: Added 'incomplete_penetrance' (unaffected have variant).");
  }

  // Final fallback
  if (consistentPatterns.length === 0) {
    debugDetailed(`  PED Mode: No specific patterns identified as consistent after checks.`);
    let anyAffectedHasVariant = false;
    for (const [, affectedData] of affectedIndividuals.entries()) {
      if (genotypeUtils.isVariant(affectedData.genotype)) {
        anyAffectedHasVariant = true;
        break;
      }
    }
    if (!anyAffectedHasVariant && affectedIndividuals.size > 0) {
      // If allAreReference was true, the 'reference' pattern was already returned.
      // If not, then this means affected exist but have no non-missing variant GTs.
      if (!allAreReference) {
        consistentPatterns.push('non_causative_or_no_affected');
      }
    } else if (anyAffectedHasVariant) {
      // If affected individuals have the variant, but no standard pattern fit
      consistentPatterns.push('non_mendelian'); // Suggests complex or non-mendelian
    } else {
      // Fallback if no affected individuals have genotypes or other edge cases
      consistentPatterns.push('unknown');
    }
  }

  // Remove duplicates and return
  const uniquePatterns = [...new Set(consistentPatterns)];

  debugDetailed(
    `--- Exiting _deducePedBasedPatterns. Result: ${JSON.stringify(uniquePatterns)} ---`
  );
  return uniquePatterns;
}

module.exports = { deducePedBasedPatterns: _deducePedBasedPatterns };
