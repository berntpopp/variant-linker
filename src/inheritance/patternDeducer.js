// src/inheritance/patternDeducer.js
'use strict';

/**
 * @fileoverview Deduces potential inheritance patterns based on genotype data
 * and family structure (single sample, trio, or PED).
 * @module patternDeducer
 */

// Main debug namespace
const debug = require('debug')('variant-linker:inheritance:patternDeducer');
const debugDetailed = require('debug')('variant-linker:detailed');
const genotypeUtils = require('./genotypeUtils');
const pedigreeUtils = require('./pedigreeUtils'); // Needed for PED X-linked checks

// --- Core Deduction Logic ---

/**
 * Deduces inheritance pattern for a single sample.
 * @param {Map<string, string>} genotypes - Sample ID to genotype string map.
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome.
 * @returns {Array<string>} Array of possible patterns
 * (e.g., ['homozygous'], ['dominant'], ['unknown']).
 * @private
 */
function _deduceSingleSamplePattern(genotypes, isXChromosome) {
  debugDetailed(`--- Entering _deduceSingleSamplePattern ---`);
  if (!genotypes || genotypes.size !== 1) {
    debug('Invalid input for single sample deduction (expected 1 genotype)');
    debugDetailed(`--- Exiting _deduceSingleSamplePattern. Result: ["unknown"] ---`);
    return ['unknown'];
  }

  const sampleId = Array.from(genotypes.keys())[0];
  const gt = genotypes.get(sampleId);
  let resultPatterns = ['unknown']; // Default

  if (genotypeUtils.isMissing(gt)) {
    debug(`Sample ${sampleId} has missing genotype`);
    resultPatterns = ['unknown_missing_genotype'];
  } else if (genotypeUtils.isHomAlt(gt)) {
    debug(`Sample ${sampleId} is homozygous alt`);
    resultPatterns = ['homozygous']; // Could be recessive or dominant homozygous
  } else if (genotypeUtils.isHet(gt)) {
    debug(`Sample ${sampleId} is heterozygous`);
    // On X chr, het usually implies dominant (for females) or potential carrier status.
    // Simplification: report dominant, let prioritization handle X-linked specifics if sex known.
    resultPatterns = ['dominant'];
    if (isXChromosome) {
      // Could refine if sex is known, but usually isn't in single sample context
      resultPatterns.push('potential_x_linked');
    }
  } else if (genotypeUtils.isRef(gt)) {
    debug(`Sample ${sampleId} is homozygous ref`);
    resultPatterns = ['reference'];
  }

  debugDetailed(
    `--- Exiting _deduceSingleSamplePattern. Result: ${JSON.stringify(resultPatterns)} ---`
  );
  return resultPatterns;
}

/**
 * Deduces inheritance pattern using specified trio samples.
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string for trio members.
 * @param {Object} sampleMap - Object mapping roles ('index', 'mother', 'father') to sample IDs.
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome.
 * @param {Map<string, Object>|null} pedigreeData - Optional pedigree data for sex checks on X.
 * @returns {Array<string>} Array of possible patterns.
 * @private
 */
function _deduceTrioPatterns(genotypes, sampleMap, isXChromosome, pedigreeData) {
  debugDetailed(`--- Entering _deduceTrioPatterns ---`);
  debugDetailed(`  Args: sampleMap=${JSON.stringify(sampleMap)}, isX=${isXChromosome}`);

  const { index, mother, father } = sampleMap;

  if (!genotypes || !genotypes.has(index) || !genotypes.has(mother) || !genotypes.has(father)) {
    debug('Missing genotype data for one or more trio members');
    debugDetailed(`--- Exiting _deduceTrioPatterns. Result: ["unknown_missing_trio_genotype"] ---`);
    return ['unknown_missing_trio_genotype'];
  }

  const indexGT = genotypes.get(index);
  const motherGT = genotypes.get(mother);
  const fatherGT = genotypes.get(father);

  debug(`Trio genotypes - Index: ${indexGT}, Mother: ${motherGT}, Father: ${fatherGT}`);

  const hasMissingData =
    genotypeUtils.isMissing(indexGT) ||
    genotypeUtils.isMissing(motherGT) ||
    genotypeUtils.isMissing(fatherGT);
  if (hasMissingData) {
    debug('Cannot determine pattern reliably due to missing genotype(s) in trio');
    // Determine specific missing pattern later based on index GT if possible
  }

  const patterns = [];

  // 1. De Novo Check
  debugDetailed(`De Novo Check: Index GT=${indexGT}, Mother GT=${motherGT}, Father GT=${fatherGT}`);
  const isIndexVariant = genotypeUtils.isVariant(indexGT);
  const isMotherRef = genotypeUtils.isRef(motherGT);
  const isFatherRef = genotypeUtils.isRef(fatherGT);
  const isMotherMissing = genotypeUtils.isMissing(motherGT);
  const isFatherMissing = genotypeUtils.isMissing(fatherGT);
  debugDetailed(
    `De Novo: index=${isIndexVariant}, mother=${isMotherRef}, father=${isFatherRef}, ` +
      `miss_m=${isMotherMissing}, miss_f=${isFatherMissing}`
  );

  if (isIndexVariant && isMotherRef && isFatherRef) {
    debugDetailed('--> De Novo condition MET.');
    patterns.push('de_novo');
  } else if (
    isIndexVariant &&
    ((isMotherRef && isFatherMissing) || (isMotherMissing && isFatherRef))
  ) {
    debugDetailed('--> De Novo candidate condition MET (one parent ref, one missing).');
    patterns.push('de_novo_candidate'); // Changed from candidate_missing_parent for consistency
  } else {
    debugDetailed('--> De Novo condition NOT MET.');
  }

  // 2. Autosomal Recessive Check
  if (
    genotypeUtils.isHomAlt(indexGT) &&
    genotypeUtils.isHet(motherGT) &&
    genotypeUtils.isHet(fatherGT)
  ) {
    debug('Pattern matches autosomal recessive inheritance');
    patterns.push('autosomal_recessive');
  } else if (
    genotypeUtils.isHomAlt(indexGT) &&
    ((genotypeUtils.isHet(motherGT) && isFatherMissing) ||
      (isMotherMissing && genotypeUtils.isHet(fatherGT)))
  ) {
    debug('Pattern possibly matches autosomal recessive with missing parent data');
    patterns.push('autosomal_recessive_possible'); // Changed name
  }

  // 3. Autosomal Dominant Check
  // Requires index het/homAlt and at least one parent het/homAlt
  if (
    (genotypeUtils.isHet(indexGT) || genotypeUtils.isHomAlt(indexGT)) &&
    (genotypeUtils.isVariant(motherGT) || genotypeUtils.isVariant(fatherGT))
  ) {
    // Check if the variant parent actually transmitted (not Ref)
    const parentTransmitted =
      (genotypeUtils.isVariant(motherGT) && !isMotherRef) ||
      (genotypeUtils.isVariant(fatherGT) && !isFatherRef);
    if (parentTransmitted) {
      debug('Pattern matches autosomal dominant inheritance');
      patterns.push('autosomal_dominant');
    }
  } else if (
    (genotypeUtils.isHet(indexGT) || genotypeUtils.isHomAlt(indexGT)) &&
    (isMotherMissing || isFatherMissing)
  ) {
    // Check if the non-missing parent has the variant
    const knownParentHasVariant =
      (!isMotherMissing && genotypeUtils.isVariant(motherGT)) ||
      (!isFatherMissing && genotypeUtils.isVariant(fatherGT));
    if (knownParentHasVariant) {
      debug('Pattern possibly matches autosomal dominant with missing parent data');
      patterns.push('autosomal_dominant_possible'); // Changed name
    }
  }

  // 4. X-Linked Checks (only if on X chromosome)
  if (isXChromosome) {
    // Determine index sex if possible (pedigreeData needed for this)
    const indexIsMale = pedigreeData ? pedigreeUtils.isMale(index, pedigreeData) : undefined;

    // X-linked Recessive: Affected male (homAlt/het) from carrier mother (het/homAlt) & ref father
    // Affected female (homAlt) from carrier mother (het/homAlt) & affected father (homAlt/het)
    if (genotypeUtils.isVariant(indexGT)) {
      // Check if index has variant first
      // Case 1: Male index (assuming hemizygous variant call maps to isVariant)
      if (indexIsMale === true) {
        if (genotypeUtils.isVariant(motherGT) && isFatherRef) {
          debug('Pattern matches X-linked recessive (male index, mother carrier, father ref)');
          patterns.push('x_linked_recessive');
        } else if (genotypeUtils.isVariant(motherGT) && isFatherMissing) {
          debug(
            'Pattern possibly matches X-linked recessive (male index, mother carrier, father missing)'
          );
          patterns.push('x_linked_recessive_possible'); // Changed name
        }
      }
      // Case 2: Female index (must be HomAlt)
      else if (indexIsMale === false && genotypeUtils.isHomAlt(indexGT)) {
        if (genotypeUtils.isVariant(motherGT) && genotypeUtils.isVariant(fatherGT)) {
          debug(
            'Pattern matches X-linked recessive (female index, mother carrier, father affected)'
          );
          patterns.push('x_linked_recessive');
        }
      }
      // Case 3: Sex unknown, but pattern fits male case (most common scenario)
      else if (indexIsMale === undefined) {
        if (genotypeUtils.isVariant(motherGT) && isFatherRef) {
          debug('Pattern potentially matches X-linked recessive (sex unknown, fits male pattern)');
          patterns.push('x_linked_recessive_possible'); // Changed name
        }
      }
    }

    // X-linked Dominant: Affected index (het/homAlt) from affected parent
    if (genotypeUtils.isVariant(indexGT)) {
      // Transmission from mother (het/homAlt)
      if (genotypeUtils.isVariant(motherGT)) {
        debug('Pattern matches X-linked dominant (maternal transmission)');
        patterns.push('x_linked_dominant'); // Add specific pattern
      }
      // Transmission from father (het/homAlt) - only to daughters
      if (genotypeUtils.isVariant(fatherGT) && indexIsMale === false) {
        debug('Pattern matches X-linked dominant (paternal transmission to daughter)');
        patterns.push('x_linked_dominant'); // Add specific pattern
      } else if (genotypeUtils.isVariant(fatherGT) && indexIsMale === true) {
        // This contradicts X-linked dominant (father->son)
        debug('Pattern contradicts X-linked dominant (father cannot transmit to son)');
        // This might indicate non-mendelian or other issues, don't add XLD pattern here
      }
    }
  }

  // 5. Final check and fallback patterns
  if (patterns.length === 0) {
    if (isIndexVariant) {
      if (hasMissingData) {
        debug('Cannot determine specific inheritance pattern due to missing data in trio');
        patterns.push('unknown_with_missing_data'); // Changed name
      } else {
        // Check for specific non-mendelian scenarios if desired, e.g., maternal het -> index ref
        debug('No recognized Mendelian inheritance pattern identified');
        patterns.push('non_mendelian'); // Changed name
      }
    } else if (genotypeUtils.isRef(indexGT)) {
      debug('Index is reference homozygous');
      patterns.push('reference');
    } else {
      // Index GT must be missing if not Variant or Ref
      debug('Index has missing genotype, cannot determine pattern');
      patterns.push('unknown_missing_genotype'); // Changed name
    }
  } else if (hasMissingData) {
    // If patterns were found but data was missing, add a general 'possible' flag maybe?
    // Let individual pattern names like '..._possible' handle this.
  }

  // Remove potential duplicates before returning
  const uniquePatterns = [...new Set(patterns)];
  debugDetailed(`--- Exiting _deduceTrioPatterns. Result: ${JSON.stringify(uniquePatterns)} ---`);
  return uniquePatterns;
}

/**
 * Deduces inheritance pattern using default trio assumptions (first 3 samples from VCF).
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string (at least 3 entries).
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome.
 * @returns {Array<string>} Array of possible patterns.
 * @private
 */
function _deduceDefaultTrioPatterns(genotypes, isXChromosome) {
  debugDetailed(`--- Entering _deduceDefaultTrioPatterns ---`);
  const samples = Array.from(genotypes.keys());
  if (!samples || samples.length < 3) {
    debug('Not enough samples for default trio analysis, falling back to single sample mode');
    // Prepare a map with just the first sample for fallback
    const singleSampleGenotypes = new Map();
    if (samples.length > 0) {
      singleSampleGenotypes.set(samples[0], genotypes.get(samples[0]));
    }
    const result = _deduceSingleSamplePattern(singleSampleGenotypes, isXChromosome);
    debugDetailed(
      `--- Exiting _deduceDefaultTrioPatterns via fallback. Result: ${JSON.stringify(result)} ---`
    );
    return result;
  }

  // Assume first sample is index, second is mother, third is father
  const sampleMap = {
    index: samples[0],
    mother: samples[1],
    father: samples[2],
  };

  debugDetailed(
    `Default trio: Index=${sampleMap.index}, M=${sampleMap.mother}, F=${sampleMap.father}`
  );
  // Call the specific trio deduction logic, passing null for pedigreeData
  const result = _deduceTrioPatterns(genotypes, sampleMap, isXChromosome, null);
  debugDetailed(`--- Exiting _deduceDefaultTrioPatterns. Result: ${JSON.stringify(result)} ---`);
  return result;
}

/**
 * Deduces inheritance patterns using complete pedigree information.
 * This version focuses on checking consistency with major patterns and
 * identifying potential de novo variants.
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string.
 * @param {Map<string, Object>} pedigreeData - Parsed pedigree data.
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
  let xlrConsistent = false; // Assume not consistent unless X-linked checks run and pass
  let xldConsistent = false;
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

/**
 * Main function to deduce possible inheritance patterns based on available data.
 * Acts as a router to specific deduction functions based on input context.
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string for the variant.
 * @param {Map<string, Object>|null} pedigreeData - Parsed pedigree data (optional).
 * @param {Object|null} sampleMap - Manual mapping of sample roles
 * ('index', 'mother', 'father') (optional).
 * @param {Object} variantInfo - Information about the variant (e.g., { chrom: 'X' }).
 * @param {string} variantInfo.chrom - Chromosome name (e.g., 'X', '1', 'chrX').
 * @returns {Array<string>} Array of possible inheritance patterns
 * (e.g., ['autosomal_dominant', 'de_novo']).
 */
function deduceInheritancePatterns(genotypes, pedigreeData, sampleMap, variantInfo) {
  debugDetailed(`--- Entering deduceInheritancePatterns ---`);
  debugDetailed(
    `  Args: genotypes=${genotypes?.size}, ` +
      `pedigreeData=${pedigreeData?.size}, ` +
      `sampleMap=${JSON.stringify(sampleMap)}, ` +
      `variantInfo=${JSON.stringify(variantInfo)}`
  );

  if (!genotypes || genotypes.size === 0) {
    debug('No genotype data available, cannot deduce inheritance pattern');
    debugDetailed(
      `--- Exiting deduceInheritancePatterns. Result: ["unknown_missing_genotypes"] ---`
    );
    return ['unknown_missing_genotypes'];
  }

  // Determine chromosome type
  const { chrom } = variantInfo || {};
  // Ensure chrom is treated case-insensitively and handles 'chr' prefix
  const normalizedChrom = typeof chrom === 'string' ? chrom.toUpperCase().replace(/^CHR/, '') : '';
  const isXChromosome = normalizedChrom === 'X';

  // --- Mode Selection ---
  const hasPedigree = pedigreeData && pedigreeData.size > 0;
  const hasTrioMap = sampleMap && sampleMap.index && sampleMap.mother && sampleMap.father;
  const sampleCount = genotypes.size;

  let patterns;

  if (hasPedigree) {
    // Use PED mode if pedigree data is provided (most informative)
    debugDetailed('  Mode Selected: PED-based');
    patterns = _deducePedBasedPatterns(genotypes, pedigreeData, isXChromosome);
  } else if (hasTrioMap && sampleCount >= 3) {
    // Use explicit Trio mode if sampleMap is valid and enough genotypes exist
    debugDetailed('  Mode Selected: Trio (Explicit Sample Map)');
    // Pass pedigreeData=null as we rely on the map, not full PED structure here
    patterns = _deduceTrioPatterns(genotypes, sampleMap, isXChromosome, null);
  } else if (sampleCount >= 3) {
    // Use default Trio mode if >= 3 genotypes and no PED or explicit map
    debugDetailed('  Mode Selected: Trio (Default Assumption)');
    patterns = _deduceDefaultTrioPatterns(genotypes, isXChromosome);
  } else if (sampleCount > 0) {
    // Use Single Sample mode if only 1 or 2 genotypes
    debugDetailed('  Mode Selected: Single Sample');
    // Ensure we pass only the first sample's genotype if size > 1
    const singleSampleGenotypes = new Map();
    const firstSampleId = Array.from(genotypes.keys())[0];
    singleSampleGenotypes.set(firstSampleId, genotypes.get(firstSampleId));
    patterns = _deduceSingleSamplePattern(singleSampleGenotypes, isXChromosome);
  } else {
    // Should have been caught earlier, but safe fallback
    debugDetailed('  Mode Selected: Unknown (No samples)');
    patterns = ['unknown'];
  }

  debugDetailed(`--- Exiting deduceInheritancePatterns. Result: ${JSON.stringify(patterns)} ---`);
  return patterns;
}

module.exports = {
  deduceInheritancePatterns,
  // Note: Internal functions (_deduce*) are not exported
};
