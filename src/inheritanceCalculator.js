/**
 * @fileoverview Inheritance pattern calculator for variant-linker.
 * This module provides functions to deduce likely inheritance patterns based on
 * genotype data and family relationships.
 * Supports detection of autosomal dominant/recessive, X-linked dominant/recessive,
 * compound heterozygous, and de novo inheritance patterns.
 * @module inheritanceCalculator
 */

'use strict';

const debug = require('debug')('variant-linker:inheritance');
const debugDetailed = require('debug')('variant-linker:detailed');

/**
 * Checks if a genotype represents a reference homozygous call (0/0)
 * @param {string} gt - Genotype string (e.g., '0/0', '0|0', etc.)
 * @returns {boolean} True if the genotype is reference homozygous
 */
function isRef(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Match 0/0, 0|0, or 0-0 patterns
  return /^0[\/\|\\-]0$/.test(gt);
}

/**
 * Checks if a genotype represents a heterozygous call (0/1, 1/0, etc.)
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is heterozygous
 */
function isHet(gt) {
  return (
    /^[01][\/\|\\-][01]$/.test(gt) &&
    gt !== '0/0' &&
    gt !== '0|0' &&
    gt !== '1/1' &&
    gt !== '1|1' &&
    gt !== '0-0' &&
    gt !== '1-1'
  );
}

/**
 * Checks if a genotype represents an alternate homozygous call (1/1)
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is alternate homozygous
 */
function isHomAlt(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Match 1/1, 1|1, or 1-1 patterns
  return /^1[\/\|\\-]1$/.test(gt);
}

/**
 * Checks if a genotype represents any variant call (0/1 or 1/1)
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype contains any variant allele
 */
function isVariant(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Match any genotype that has at least one alternate allele
  return /^[01][\/\|\\-][01]$/.test(gt) && gt !== '0/0' && gt !== '0|0' && gt !== '0-0';
}

/**
 * Checks if a genotype is missing or unknown (./, ./.)
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is missing or undefined
 */
function isMissing(gt) {
  if (!gt || typeof gt !== 'string') return true;
  return gt === './.' || gt === '.|.' || gt === '.-.' || gt.includes('.');
}

/**
 * Deduces possible inheritance patterns based on genotypes and family information
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {Map<string, Object>|null} pedigreeData - Family relationships from PED file
 * @param {Object|null} sampleMap - Manual mapping of sample roles if PED not available
 * @param {Object} variantInfo - Information about the variant
 * @param {string} variantInfo.chrom - Chromosome name
 * @returns {Array<string>} Array of possible inheritance patterns
 */
function deduceInheritancePatterns(genotypes, pedigreeData, sampleMap, variantInfo) {
  // At the VERY BEGINNING of deduceInheritancePatterns
  debugDetailed(`--- Entering deduceInheritancePatterns ---`);
  debugDetailed(
    `  Args: genotypes size=${genotypes?.size}, pedigreeData size=${pedigreeData?.size}, sampleMap=${JSON.stringify(sampleMap)}, variantInfo=${JSON.stringify(variantInfo)}`
  );

  if (!genotypes || genotypes.size === 0) {
    debug('No genotype data available, cannot deduce inheritance pattern');
    debugDetailed(`--- Exiting deduceInheritancePatterns. Result: ["unknown"] ---`); // Added exit log
    return ['unknown'];
  }

  // Track variant characteristics for pattern determination
  const { chrom } = variantInfo;
  const isXChromosome = chrom === 'X' || chrom === 'x' || chrom === 'chrX' || chrom === 'chrx';

  // Check which inheritance mode to use
  let patterns;
  if (pedigreeData && pedigreeData.size > 0) {
    debugDetailed('  Mode Selected: PED-based');
    patterns = deducePedBasedPatterns(genotypes, pedigreeData, isXChromosome);
  } else if (genotypes.size >= 3 && sampleMap) {
    debugDetailed('  Mode Selected: Trio (Sample Map)');
    patterns = deduceTrioPatterns(genotypes, sampleMap, isXChromosome);
  } else if (genotypes.size >= 3) {
    debugDetailed('  Mode Selected: Trio (Default)');
    patterns = deduceDefaultTrioPatterns(genotypes, isXChromosome);
  } else {
    debugDetailed('  Mode Selected: Single Sample');
    patterns = deduceSingleSamplePattern(genotypes, isXChromosome);
  }

  // At the VERY END, before return
  debugDetailed(`--- Exiting deduceInheritancePatterns. Result: ${JSON.stringify(patterns)} ---`);
  return patterns; // Ensure the function still returns the result
}

/**
 * Deduces inheritance pattern for a single sample
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deduceSingleSamplePattern(genotypes, isXChromosome) {
  debugDetailed(`--- Entering deduceSingleSamplePattern ---`); // Entry Log
  // For a single sample, we can only infer limited information
  const sampleId = Array.from(genotypes.keys())[0];
  const gt = genotypes.get(sampleId);
  let resultPatterns = ['unknown']; // Default

  if (isMissing(gt)) {
    debug(`Sample ${sampleId} has missing genotype, cannot determine pattern`);
    resultPatterns = ['unknown'];
  } else if (isHomAlt(gt)) {
    debug(`Sample ${sampleId} is homozygous for alternate allele`);
    resultPatterns = ['homozygous'];
  } else if (isHet(gt)) {
    debug(`Sample ${sampleId} is heterozygous`);
    if (isXChromosome) {
      // On X chromosome, heterozygosity suggests dominant for females
      resultPatterns = ['potential_x_linked', 'dominant'];
    } else {
      resultPatterns = ['dominant'];
    }
  } else if (isRef(gt)) {
    debug(`Sample ${sampleId} is homozygous for reference allele`);
    resultPatterns = ['reference'];
  }

  debugDetailed(
    `--- Exiting deduceSingleSamplePattern. Result: ${JSON.stringify(resultPatterns)} ---`
  ); // Exit Log
  return resultPatterns;
}

/**
 * Deduces inheritance pattern using default trio assumptions (first 3 samples)
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deduceDefaultTrioPatterns(genotypes, isXChromosome) {
  debugDetailed(`--- Entering deduceDefaultTrioPatterns ---`); // Entry Log
  // Assume first sample is index, second is mother, third is father in VCF
  const samples = Array.from(genotypes.keys());
  if (samples.length < 3) {
    debug('Not enough samples for trio analysis, falling back to single sample mode');
    const result = deduceSingleSamplePattern(genotypes, isXChromosome);
    debugDetailed(
      `--- Exiting deduceDefaultTrioPatterns via fallback. Result: ${JSON.stringify(result)} ---`
    ); // Exit Log
    return result;
  }

  const sampleMap = {
    index: samples[0],
    mother: samples[1],
    father: samples[2],
  };

  debug(
    `Using default trio: Index=${sampleMap.index},` +
      ` Mother=${sampleMap.mother}, Father=${sampleMap.father}`
  );
  const result = deduceTrioPatterns(genotypes, sampleMap, isXChromosome);
  debugDetailed(`--- Exiting deduceDefaultTrioPatterns. Result: ${JSON.stringify(result)} ---`); // Exit Log
  return result;
}

/**
 * Deduces inheritance pattern using specified trio samples
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {Object} sampleMap - Object mapping roles to sample IDs
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deduceTrioPatterns(genotypes, sampleMap, isXChromosome) {
  debugDetailed(`--- Entering deduceTrioPatterns ---`); // Entry Log
  debugDetailed(`  Args: sampleMap=${JSON.stringify(sampleMap)}, isX=${isXChromosome}`);

  const { index, mother, father } = sampleMap;

  // Verify all trio members have genotypes
  if (!genotypes.has(index) || !genotypes.has(mother) || !genotypes.has(father)) {
    debug('Missing genotype data for one or more trio members');
    debugDetailed(`--- Exiting deduceTrioPatterns. Result: ["unknown"] ---`); // Exit Log
    return ['unknown'];
  }

  const indexGT = genotypes.get(index);
  const motherGT = genotypes.get(mother);
  const fatherGT = genotypes.get(father);

  debug(`Trio genotypes - Index: ${indexGT}, Mother: ${motherGT}, Father: ${fatherGT}`);

  // Check for missing data
  const hasMissingData = isMissing(indexGT) || isMissing(motherGT) || isMissing(fatherGT);

  // Start with empty patterns list
  const patterns = [];

  // Check for de novo mutation
  debugDetailed(`De Novo Check: Index GT=${indexGT}, Mother GT=${motherGT}, Father GT=${fatherGT}`);
  const isIndexVariant = isVariant(indexGT);
  const isMotherRef = isRef(motherGT);
  const isFatherRef = isRef(fatherGT);
  debugDetailed(
    `De Novo Flags: isIndexVariant=${isIndexVariant}, isMotherRef=${isMotherRef}, isFatherRef=${isFatherRef}`
  );

  if (isVariant(indexGT) && isRef(motherGT) && isRef(fatherGT)) {
    debugDetailed('--> De Novo condition MET.'); // Log match
    debug('Potential de novo mutation detected');
    patterns.push('de_novo');
  } else if (
    isVariant(indexGT) &&
    (isMissing(motherGT) || isMissing(fatherGT)) &&
    (isRef(motherGT) || isRef(fatherGT))
  ) {
    debugDetailed('--> De Novo candidate condition MET (missing parent data).');
    debug('Potential de novo mutation with missing parent data');
    patterns.push('de_novo_candidate');
  } else {
    debugDetailed('--> De Novo condition NOT MET.');
  }

  // Check for autosomal recessive
  if (isHomAlt(indexGT) && isHet(motherGT) && isHet(fatherGT)) {
    debug('Pattern matches autosomal recessive inheritance');
    patterns.push('autosomal_recessive');
  } else if (
    isHomAlt(indexGT) &&
    ((isHet(motherGT) && isMissing(fatherGT)) || (isMissing(motherGT) && isHet(fatherGT)))
  ) {
    debug('Pattern possibly matches autosomal recessive with missing data');
    patterns.push('autosomal_recessive_possible');
  }

  // Check for autosomal dominant
  if (isHet(indexGT) && (isHet(motherGT) || isHet(fatherGT))) {
    debug('Pattern matches autosomal dominant inheritance');
    patterns.push('autosomal_dominant');
  } else if (isHet(indexGT) && (isMissing(motherGT) || isMissing(fatherGT))) {
    debug('Pattern possibly matches autosomal dominant with missing data');
    patterns.push('autosomal_dominant_possible');
  }

  // Check for X-linked patterns (only if on X chromosome)
  if (isXChromosome) {
    // X-linked recessive
    if (isVariant(indexGT) && (isHet(motherGT) || isHomAlt(motherGT)) && isRef(fatherGT)) {
      debug('Pattern matches X-linked recessive inheritance');
      patterns.push('x_linked_recessive');
    } else if (
      isVariant(indexGT) &&
      (isHet(motherGT) || isHomAlt(motherGT)) &&
      isMissing(fatherGT)
    ) {
      debug('Pattern possibly matches X-linked recessive with missing father data');
      patterns.push('x_linked_recessive_possible');
    }

    // X-linked dominant
    if (isHet(indexGT) && isHet(motherGT)) {
      debug('Pattern matches X-linked dominant inheritance (maternal transmission)');
      patterns.push('x_linked_dominant');
    }
  }

  // If no patterns were detected and we have variant data
  if (patterns.length === 0) {
    if (isVariant(indexGT)) {
      if (hasMissingData) {
        debug('Cannot determine inheritance pattern due to missing data');
        patterns.push('unknown_with_missing_data');
      } else {
        debug('No recognized inheritance pattern');
        patterns.push('non_mendelian');
      }
    } else if (isRef(indexGT)) {
      debug('Index is reference homozygous');
      patterns.push('reference');
    } else {
      debug('Unknown inheritance pattern');
      patterns.push('unknown');
    }
  }

  debugDetailed(`--- Exiting deduceTrioPatterns. Result: ${JSON.stringify(patterns)} ---`); // Exit Log
  return patterns;
}

/**
 * Deduces inheritance patterns using complete pedigree information
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {Map<string, Object>} pedigreeData - Family relationships from PED file
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deducePedBasedPatterns(genotypes, pedigreeData, isXChromosome) {
  // At the VERY BEGINNING of deducePedBasedPatterns
  debugDetailed(`--- Entering deducePedBasedPatterns ---`);
  debugDetailed(
    `  Args: genotypes size=${genotypes?.size}, pedigreeData size=${pedigreeData?.size}, isX=${isXChromosome}`
  );

  if (!pedigreeData || genotypes.size === 0) {
    debugDetailed(`Exiting deducePedBasedPatterns early: Missing PED or genotypes.`);
    return ['unknown_missing_data'];
  }

  // Create a map to track affected and unaffected individuals
  const affectedIndividuals = new Map();
  const unaffectedIndividuals = new Map();

  // Separate individuals by affected status
  pedigreeData.forEach((individual, sampleId) => {
    if (!genotypes.has(sampleId)) {
      debugDetailed(`  PED Mode: Sample ${sampleId} skipped (no genotype).`);
      return; // Skip samples without genotypes
    }
    // Check both string and number '2' for affected status
    if (individual.affectedStatus === '2' || individual.affectedStatus === 2) {
      affectedIndividuals.set(sampleId, individual); // Store PED info
    } else if (individual.affectedStatus === '1' || individual.affectedStatus === 1) {
      unaffectedIndividuals.set(sampleId, individual);
    }
  });

  debugDetailed(
    `  PED Mode: Found ${affectedIndividuals.size} affected, ${unaffectedIndividuals.size} unaffected with genotypes.`
  );
  if (affectedIndividuals.size === 0) {
    debug(
      'No affected individuals found with genotypes, cannot deduce inheritance pattern using PED'
    );
    debugDetailed(`--- Exiting deducePedBasedPatterns. Result: ["unknown_no_affected"] ---`);
    return ['unknown_no_affected']; // Return specific unknown reason
  }

  // Initialize pattern list and counters
  const patterns = [];
  let affectedWithVariant = 0;
  let affectedWithoutVariant = 0;
  let unaffectedWithVariant = 0;
  let potentialDeNovo = false; // Flag specifically for de novo

  // Count variant presence in affected/unaffected
  for (const sampleId of affectedIndividuals.keys()) {
    if (isVariant(genotypes.get(sampleId))) {
      affectedWithVariant++;
    } else if (isRef(genotypes.get(sampleId))) {
      affectedWithoutVariant++;
    }
  }
  for (const sampleId of unaffectedIndividuals.keys()) {
    if (isVariant(genotypes.get(sampleId))) {
      unaffectedWithVariant++;
    }
  }
  debugDetailed(
    `  PED Mode Counts: affectedWithVariant=${affectedWithVariant}, affectedWithoutVariant=${affectedWithoutVariant}, unaffectedWithVariant=${unaffectedWithVariant}`
  );

  // Basic segregation checks - proceed only if variant segregates minimally (all affected have it)
  if (affectedWithVariant > 0 && affectedWithoutVariant === 0) {
    debug('All affected individuals have the variant - checking patterns...');

    // Check for de novo patterns by examining parents of affected individuals
    debugDetailed(`  PED Mode: Checking for De Novo patterns...`);
    for (const [affectedId, affectedInfo] of affectedIndividuals.entries()) {
      // Only check affected individuals who actually have the variant
      if (!isVariant(genotypes.get(affectedId))) continue;

      debugDetailed(`  PED De Novo Check for Affected: ${affectedId}`);
      const indexGT = genotypes.get(affectedId); // Genotype of the affected child

      const motherId = affectedInfo?.motherId;
      const fatherId = affectedInfo?.fatherId;
      debugDetailed(
        `    Parent IDs from PED: Mother=${motherId || '0'}, Father=${fatherId || '0'}`
      );

      // Need both parents defined in PED and genotypes available for them
      if (
        motherId &&
        motherId !== '0' &&
        fatherId &&
        fatherId !== '0' &&
        genotypes.has(motherId) &&
        genotypes.has(fatherId)
      ) {
        const motherGT = genotypes.get(motherId);
        const fatherGT = genotypes.get(fatherId);
        debugDetailed(
          `    Retrieved Parent GTs: Mother=${motherGT}, Father=${fatherGT}, Index=${indexGT}`
        );

        const isIndexVariant = true; // We already checked affected has variant
        const isMotherTrulyRef = isRef(motherGT);
        const isFatherTrulyRef = isRef(fatherGT);
        debugDetailed(
          `    De Novo Check Flags: isIndexVariant=${isIndexVariant}, isMotherRef=${isMotherTrulyRef}, isFatherRef=${isFatherTrulyRef}`
        );

        if (isIndexVariant && isMotherTrulyRef && isFatherTrulyRef) {
          debugDetailed('    --> PED De Novo condition MET.');
          potentialDeNovo = true; // Set the flag
          // Do not add to patterns list immediately, let prioritization handle it later if it's the best fit
        } else {
          debugDetailed('    --> PED De Novo condition NOT MET.');
        }
      } else {
        debugDetailed(
          `    -> Skipping de novo check: Missing parent(s) in PED or missing parent genotype(s).`
        );
      }
    }
    // Add de_novo to potential patterns IF the flag was set
    if (potentialDeNovo) {
      patterns.push('de_novo');
      debugDetailed(`  PED Mode: Added 'de_novo' as a possible pattern.`);
    }

    // --- Add checks for other patterns (AD, AR, X-linked) here, similar structure ---
    // Example AD check:
    let adConsistent = true;
    for (const affectedId of affectedIndividuals.keys()) {
      const gt = genotypes.get(affectedId);
      // Autosomal Dominant: Affected individuals usually heterozygous (or homozygous rare)
      if (!isHet(gt) && !isHomAlt(gt)) {
        adConsistent = false;
        debugDetailed(`  PED AD Check: ${affectedId} GT ${gt} breaks AD consistency.`);
        break;
      }
      // Check if affected individual has an unaffected parent with the variant (would contradict AD unless incomplete penetrance)
      const affectedInfo = affectedIndividuals.get(affectedId);
      const motherId = affectedInfo.motherId;
      const fatherId = affectedInfo.fatherId;
      if (
        motherId &&
        motherId !== '0' &&
        unaffectedIndividuals.has(motherId) &&
        isVariant(genotypes.get(motherId))
      )
        adConsistent = false; // Consider incomplete penetrance?
      if (
        fatherId &&
        fatherId !== '0' &&
        unaffectedIndividuals.has(fatherId) &&
        isVariant(genotypes.get(fatherId))
      )
        adConsistent = false; // Consider incomplete penetrance?
    }
    if (adConsistent && unaffectedWithVariant === 0) {
      // Strict check: No unaffected carriers
      debugDetailed(`  PED Mode: Added 'autosomal_dominant' as a possible pattern.`);
      patterns.push('autosomal_dominant');
    } else {
      debugDetailed(
        `  PED Mode: AD conditions not met (adConsistent=${adConsistent}, unaffectedWithVariant=${unaffectedWithVariant}).`
      );
    }

    // Example AR check:
    let arConsistent = true;
    for (const affectedId of affectedIndividuals.keys()) {
      const gt = genotypes.get(affectedId);
      // Autosomal Recessive: Affected individuals must be homozygous alt
      if (!isHomAlt(gt)) {
        arConsistent = false;
        debugDetailed(`  PED AR Check: ${affectedId} GT ${gt} breaks AR consistency (not HomAlt).`);
        break;
      }
      // Check parents are carriers (heterozygous) if available
      const affectedInfo = affectedIndividuals.get(affectedId);
      const motherId = affectedInfo.motherId;
      const fatherId = affectedInfo.fatherId;
      if (
        motherId &&
        motherId !== '0' &&
        genotypes.has(motherId) &&
        !isHet(genotypes.get(motherId))
      ) {
        arConsistent = false;
        debugDetailed(
          `  PED AR Check: Mother ${motherId} GT ${genotypes.get(motherId)} breaks AR consistency (not Het).`
        );
      }
      if (
        fatherId &&
        fatherId !== '0' &&
        genotypes.has(fatherId) &&
        !isHet(genotypes.get(fatherId))
      ) {
        arConsistent = false;
        debugDetailed(
          `  PED AR Check: Father ${fatherId} GT ${genotypes.get(fatherId)} breaks AR consistency (not Het).`
        );
      }
    }
    if (arConsistent) {
      debugDetailed(`  PED Mode: Added 'autosomal_recessive' as a possible pattern.`);
      patterns.push('autosomal_recessive');
    } else {
      debugDetailed(`  PED Mode: AR conditions not met.`);
    }

    // Add X-linked checks here... (more complex, checking sex from PED)
  } else {
    // Handle cases where variant doesn't segregate perfectly with affected status
    if (affectedWithoutVariant > 0) {
      debug("Incomplete segregation (some affected don't have variant)");
      patterns.push('incomplete_segregation');
    } else if (unaffectedWithVariant > 0) {
      debug('Incomplete penetrance (some unaffected have variant)');
      patterns.push('incomplete_penetrance');
    } else {
      debug('No affected individuals have the variant');
      patterns.push('non_causative'); // Or 'unknown' if affected exists but none have variant
    }
  }

  // Final fallback if no specific pattern identified
  if (patterns.length === 0) {
    debugDetailed(`  PED Mode: No specific patterns identified after checks.`);
    patterns.push('unknown');
  }

  debugDetailed(`--- Exiting deducePedBasedPatterns. Result: ${JSON.stringify(patterns)} ---`);
  return patterns;
}

/**
 * Checks if a variant segregates according to the given inheritance pattern
 *
 * @param {string} pattern - The inheritance pattern to check
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {Map<string, Object>|null} pedigreeData - Family relationships from PED file
 * @returns {string} 'segregates', 'does_not_segregate', or 'unknown'
 */
function checkSegregation(pattern, genotypes, pedigreeData) {
  debugDetailed(`--- Entering checkSegregation for pattern: ${pattern} ---`); // Entry Log
  if (!pedigreeData || pedigreeData.size === 0) {
    debug('No pedigree data available for segregation check');
    debugDetailed(`--- Exiting checkSegregation. Result: unknown ---`); // Exit Log
    return 'unknown';
  }

  // Identify affected individuals from the pedigree
  const affectedIndividuals = new Set();
  const unaffectedIndividuals = new Set();

  for (const [sampleId, info] of pedigreeData.entries()) {
    if (info.affectedStatus === '2' || info.affectedStatus === 2) {
      affectedIndividuals.add(sampleId);
    } else if (info.affectedStatus === '1' || info.affectedStatus === 1) {
      unaffectedIndividuals.add(sampleId);
    }
  }

  // Count how many affected have variant and how many don't
  let affectedWithVariant = 0;
  let affectedWithoutVariant = 0;
  let affectedMissing = 0;

  for (const sampleId of affectedIndividuals) {
    if (genotypes.has(sampleId)) {
      if (isVariant(genotypes.get(sampleId))) {
        affectedWithVariant++;
      } else if (isRef(genotypes.get(sampleId))) {
        affectedWithoutVariant++;
      } else {
        affectedMissing++;
      }
    } else {
      affectedMissing++;
    }
  }

  // Count unaffected with variant
  let unaffectedWithVariant = 0;
  let unaffectedMissing = 0;

  for (const sampleId of unaffectedIndividuals) {
    if (genotypes.has(sampleId)) {
      if (isVariant(genotypes.get(sampleId))) {
        unaffectedWithVariant++;
      }
    } else {
      unaffectedMissing++;
    }
  }

  // Check for missing data that prevents definitive segregation determination
  const hasCriticalMissingData =
    (affectedMissing > 0 && affectedIndividuals.size > 1) ||
    (unaffectedMissing > 0 &&
      unaffectedIndividuals.size > 0 &&
      ['autosomal_dominant', 'x_linked_dominant'].includes(pattern));

  if (hasCriticalMissingData) {
    debug(`Cannot fully determine segregation for ${pattern} due to missing genotypes`);
    debugDetailed(`--- Exiting checkSegregation. Result: unknown ---`); // Exit Log
    return 'unknown';
  }

  // Basic segregation check
  if (affectedWithoutVariant > 0) {
    debug(
      `${pattern} does not segregate: ` +
        `${affectedWithoutVariant} affected individuals lack the variant`
    );
    debugDetailed(`--- Exiting checkSegregation. Result: does_not_segregate ---`); // Exit Log
    return 'does_not_segregate';
  }

  // Additional pattern-specific checks
  if (['autosomal_dominant', 'x_linked_dominant'].includes(pattern) && unaffectedWithVariant > 0) {
    debug(
      `${pattern} shows incomplete penetrance: ` +
        `${unaffectedWithVariant} unaffected individuals have the variant`
    );
    // This could be incomplete penetrance, but still report as not segregating
    debugDetailed(`--- Exiting checkSegregation. Result: does_not_segregate ---`); // Exit Log
    return 'does_not_segregate';
  }

  // If all affected have the variant AND checks passed for specific patterns:
  if (affectedWithVariant > 0) {
    // Add more specific checks here if needed based on the pattern (e.g., parents for recessive)
    debug(`${pattern} segregates with disease status`);
    debugDetailed(`--- Exiting checkSegregation. Result: segregates ---`); // Exit Log
    return 'segregates';
  }

  // Default fallback
  debugDetailed(`--- Exiting checkSegregation. Result: unknown ---`); // Exit Log
  return 'unknown';
}

/**
 * Prioritizes inheritance patterns based on predefined rules and segregation results
 *
 * @param {Array<string>} possiblePatterns - List of possible inheritance patterns
 * @param {Map<string, string>} segregationResults - Map of pattern to segregation status
 * @returns {string} The prioritized pattern
 */
function prioritizePattern(possiblePatterns, segregationResults) {
  debugDetailed(`--- Entering prioritizePattern ---`); // Entry Log
  debugDetailed(
    `  Args: possiblePatterns=${JSON.stringify(possiblePatterns)}, segregationResults=${JSON.stringify(Object.fromEntries(segregationResults))}`
  );

  if (!possiblePatterns || possiblePatterns.length === 0) {
    debugDetailed(`--- Exiting prioritizePattern. Result: unknown (no possible patterns) ---`); // Exit Log
    return 'unknown';
  }

  // Define the priority order for patterns
  const priorityOrder = [
    'de_novo',
    'de_novo_possible',
    'compound_heterozygous',
    'compound_heterozygous_possible',
    'autosomal_recessive',
    'autosomal_recessive_possible',
    'x_linked_recessive',
    'x_linked_recessive_possible',
    'x_linked_dominant',
    'x_linked_dominant_possible',
    'autosomal_dominant',
    'autosomal_dominant_possible',
    'homozygous',
    'potential_x_linked',
    'incomplete_segregation',
    'incomplete_penetrance',
    'non_mendelian',
    'reference',
    'non_causative',
    'unknown_with_missing_data',
    'unknown',
  ];

  // Filter patterns by segregation status if available
  let filteredPatterns = possiblePatterns;

  if (segregationResults && segregationResults.size > 0) {
    // First try patterns that segregate
    const segregatingPatterns = possiblePatterns.filter(
      (p) => segregationResults.get(p) === 'segregates'
    );
    debugDetailed(`  Prioritize: Segregating patterns: ${JSON.stringify(segregatingPatterns)}`);

    if (segregatingPatterns.length > 0) {
      filteredPatterns = segregatingPatterns;
    } else {
      // Then try patterns with unknown segregation
      const unknownSegregationPatterns = possiblePatterns.filter(
        (p) => segregationResults.get(p) === 'unknown' || !segregationResults.has(p)
      );
      debugDetailed(
        `  Prioritize: Unknown segregation patterns: ${JSON.stringify(unknownSegregationPatterns)}`
      );

      if (unknownSegregationPatterns.length > 0) {
        filteredPatterns = unknownSegregationPatterns;
      } else {
        // If all patterns explicitly do_not_segregate, keep them all for sorting by priority
        debugDetailed(
          `  Prioritize: No segregating or unknown patterns. Keeping all original for sorting.`
        );
        filteredPatterns = possiblePatterns; // Keep original list
      }
    }
  } else {
    debugDetailed(`  Prioritize: No segregation results available.`);
  }
  debugDetailed(
    `  Prioritize: Patterns after segregation filter: ${JSON.stringify(filteredPatterns)}`
  );

  // Sort filtered patterns by priority
  filteredPatterns.sort((a, b) => {
    const indexA = priorityOrder.indexOf(a);
    const indexB = priorityOrder.indexOf(b);

    // Handle patterns not in the priority list (shouldn't happen ideally)
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1; // Put unknown patterns last
    if (indexB === -1) return -1; // Put unknown patterns last

    // Sort by priority index (lower index = higher priority)
    return indexA - indexB;
  });
  debugDetailed(
    `  Prioritize: Patterns after sorting by priority: ${JSON.stringify(filteredPatterns)}`
  );

  // If we have a prioritized pattern, return it
  let finalPattern = 'unknown'; // Default fallback
  if (filteredPatterns.length > 0) {
    finalPattern = filteredPatterns[0];
  } else {
    debugDetailed(`  Prioritize: No patterns left after filtering and sorting.`);
  }

  debugDetailed(`--- Exiting prioritizePattern. Result: ${finalPattern} ---`); // Exit Log
  return finalPattern;
}

/**
 * Determines if a sample is male based on sex information in pedigree data
 *
 * @param {string} sampleId - The sample ID to check
 * @param {Map<string, Object>} pedigreeData - Family relationships from PED file
 * @returns {boolean} True if the sample is male (sex=1), false otherwise
 */
function isMale(sampleId, pedigreeData) {
  if (!pedigreeData || !sampleId) return false;
  const sample = pedigreeData.get(sampleId);
  return sample && (sample.sex === '1' || sample.sex === 1); // Check both string and number
}

/**
 * Determines if a sample is female based on sex information in pedigree data
 *
 * @param {string} sampleId - The sample ID to check
 * @param {Map<string, Object>} pedigreeData - Family relationships from PED file
 * @returns {boolean} True if the sample is female (sex=2), false otherwise
 */
function isFemale(sampleId, pedigreeData) {
  if (!pedigreeData || !sampleId) return false;
  const sample = pedigreeData.get(sampleId);
  return sample && (sample.sex === '2' || sample.sex === 2); // Check both string and number
}

/**
 * Analyzes a set of variants grouped by gene to detect compound heterozygous inheritance
 *
 * @param {Array<Object>} geneVariants - Array of variants with the same gene symbol
 * @param {Map<string, Map<string, string>>} genotypesMap - Map of variant keys to genotype maps
 * @param {Map<string, Object>} pedigreeData - Family relationships from PED file
 * @param {string} indexSampleId - The ID of the index/proband sample
 * @returns {Object|null} Compound heterozygous analysis result or null if not applicable
 */
function analyzeCompoundHeterozygous(geneVariants, genotypesMap, pedigreeData, indexSampleId) {
  debugDetailed(
    `--- Entering analyzeCompoundHeterozygous for gene ${geneVariants[0]?.transcript_consequences?.[0]?.gene_symbol || 'Unknown'} ---`
  );
  debugDetailed(`  Args: variant count=${geneVariants?.length}, index=${indexSampleId}`);
  if (!geneVariants || geneVariants.length < 2 || !indexSampleId || !genotypesMap) {
    debugDetailed(
      `--- Exiting analyzeCompoundHeterozygous: Not applicable (preconditions not met) ---`
    );
    return null;
  }

  // Get heterozygous variants for the index sample
  const hetVariants = [];
  for (const variant of geneVariants) {
    const variantKey = variant.variantKey;
    if (!genotypesMap.has(variantKey)) {
      debugDetailed(`  CompHet: No genotypes for variant ${variantKey}`);
      continue;
    }
    const genotypes = genotypesMap.get(variantKey);
    if (!genotypes || !genotypes.has(indexSampleId)) {
      debugDetailed(`  CompHet: No genotype for index ${indexSampleId} in variant ${variantKey}`);
      continue;
    }
    const indexGt = genotypes.get(indexSampleId);
    if (isHet(indexGt)) {
      debugDetailed(`  CompHet: Index ${indexSampleId} is Het for variant ${variantKey}`);
      hetVariants.push(variant);
    }
  }

  // Need at least 2 heterozygous variants for CompHet
  if (hetVariants.length < 2) {
    debugDetailed(
      `--- Exiting analyzeCompoundHeterozygous: Not enough heterozygous variants (${hetVariants.length}) ---`
    );
    return null;
  }
  debugDetailed(
    `  CompHet: Found ${hetVariants.length} heterozygous variants in index for this gene.`
  );

  const result = {
    isCompHet: false,
    isPossible: false,
    variantKeys: hetVariants.map((v) => v.variantKey),
    pattern: 'unknown',
  };

  // Check for parent data if available
  if (pedigreeData && pedigreeData.size > 0) {
    // Find parents of the index
    const indexData = pedigreeData.get(indexSampleId);
    if (!indexData || indexData.fatherId === '0' || indexData.motherId === '0') {
      // Check for valid parent IDs
      debugDetailed(
        `  CompHet: No valid parent info in pedigree for index ${indexSampleId}. Marking as 'possible'.`
      );
      result.isPossible = true;
      result.pattern = 'compound_heterozygous_possible';
      debugDetailed(
        `--- Exiting analyzeCompoundHeterozygous. Result: ${JSON.stringify(result)} ---`
      );
      return result;
    }

    const fatherId = indexData.fatherId;
    const motherId = indexData.motherId;
    debugDetailed(
      `  CompHet: Found parents for index ${indexSampleId}: Father=${fatherId}, Mother=${motherId}`
    );

    // Check genotypes for each parent/variant combination
    const paternalVariants = [];
    const maternalVariants = [];
    const ambiguousVariants = []; // Variants where inheritance isn't clear

    for (const variant of hetVariants) {
      const variantKey = variant.variantKey;
      const genotypes = genotypesMap.get(variantKey);
      if (!genotypes) continue; // Should not happen based on earlier check, but safe

      const fatherGt = genotypes.get(fatherId);
      const motherGt = genotypes.get(motherId);
      debugDetailed(
        `  CompHet: Variant ${variantKey}: Father GT=${fatherGt}, Mother GT=${motherGt}`
      );

      const fatherHasVar = fatherGt && isVariant(fatherGt);
      const motherHasVar = motherGt && isVariant(motherGt);

      // Paternal: Father has it, Mother doesn't (or is missing)
      if (fatherHasVar && (!motherHasVar || isMissing(motherGt))) {
        debugDetailed(`    -> Variant ${variantKey} likely Paternal`);
        paternalVariants.push(variant);
      }
      // Maternal: Mother has it, Father doesn't (or is missing)
      else if (motherHasVar && (!fatherHasVar || isMissing(fatherGt))) {
        debugDetailed(`    -> Variant ${variantKey} likely Maternal`);
        maternalVariants.push(variant);
      }
      // Ambiguous: Both parents have it, or neither has it (could be de novo het?), or missing data makes it unclear
      else {
        debugDetailed(`    -> Variant ${variantKey} inheritance ambiguous/unclear`);
        ambiguousVariants.push(variant);
      }
    }
    debugDetailed(
      `  CompHet: Paternal count=${paternalVariants.length}, Maternal count=${maternalVariants.length}, Ambiguous count=${ambiguousVariants.length}`
    );

    // True CompHet requires at least one variant clearly from each parent
    if (paternalVariants.length > 0 && maternalVariants.length > 0) {
      debugDetailed(`  CompHet: Conditions met for confirmed Compound Heterozygous.`);
      result.isCompHet = true;
      result.pattern = 'compound_heterozygous';
      // Keep track of properly segregating variant pairs
      result.paternalVariantKeys = paternalVariants.map((v) => v.variantKey);
      result.maternalVariantKeys = maternalVariants.map((v) => v.variantKey);
    } else {
      debugDetailed(`  CompHet: Conditions for confirmed CompHet NOT met. Marking as 'possible'.`);
      result.isPossible = true;
      result.pattern = 'compound_heterozygous_possible';
    }
  } else {
    // No pedigree data available, mark as possible CompHet if index is het for multiple variants
    debugDetailed(`  CompHet: No pedigree data. Marking as 'possible'.`);
    result.isPossible = true;
    result.pattern = 'compound_heterozygous_possible';
  }

  debugDetailed(`--- Exiting analyzeCompoundHeterozygous. Result: ${JSON.stringify(result)} ---`);
  return result;
}

/**
 * Analyzes inheritance patterns for a sample, including compound heterozygous detection
 *
 * @param {Array<Object>} annotations - Array of variant annotations
                                    (grouped by gene if needed for CompHet detection)
 * @param {Map<string, Map<string, string>>} genotypesMap - Map of variant keys to genotype maps
 * @param {Map<string, Object>} pedigreeData - Family relationships from PED file
 * @param {Object} sampleMap - Mapping of roles to sample IDs
 * @param {string} indexSampleId - The ID of the index/proband sample
                                (optional, derived from pedigree if not provided)
 * @returns {Map<string, Object>} Map of variant keys to inheritance
                                analysis results
 */
function analyzeInheritanceForSample(
  annotations,
  genotypesMap,
  pedigreeData,
  sampleMap,
  indexSampleId
) {
  // AT THE VERY BEGINNING of analyzeInheritanceForSample
  debugDetailed(`--- Entering analyzeInheritanceForSample ---`);
  debugDetailed(
    `  Initial Input: annotations count=${annotations?.length}, genotypesMap size=${genotypesMap?.size}, pedigreeData size=${pedigreeData?.size}, sampleMap=${JSON.stringify(sampleMap)}, indexSampleId=${indexSampleId}`
  );

  if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
    debug('No annotations provided for inheritance analysis');
    return new Map();
  }

  // AROUND indexSampleId determination logic (modify existing logic to include these logs)
  let determinedIndexSampleId = indexSampleId;
  debugDetailed(`  Index ID Check: Initial indexSampleId received: ${determinedIndexSampleId}`);
  if (!determinedIndexSampleId) {
    debugDetailed(`  Index ID Check: Attempting to determine from PED/Map...`);
    if (pedigreeData && pedigreeData.size > 0) {
      for (const [sampleId, sampleData] of pedigreeData.entries()) {
        // Check both string and number '2' for affected status
        if (sampleData.affectedStatus === '2' || sampleData.affectedStatus === 2) {
          determinedIndexSampleId = sampleId;
          debugDetailed(
            `  Index ID Check: Found affected index from PED: ${determinedIndexSampleId}`
          );
          break;
        }
      }
      if (!determinedIndexSampleId)
        debugDetailed(`  Index ID Check: No affected ('2') sample found in PED.`);
    } else {
      debugDetailed(`  Index ID Check: No PED data to check for affected status.`);
    }
    // Add similar logging for sampleMap check if implemented
    // ... SampleMap check logic would go here ...

    // Fallback if still not found
    if (!determinedIndexSampleId && genotypesMap.size > 0) {
      const firstGenotypes = genotypesMap.values().next().value;
      if (firstGenotypes && firstGenotypes.size > 0) {
        determinedIndexSampleId = firstGenotypes.keys().next().value;
        debugDetailed(
          `  Index ID Check: Using fallback index (first sample from first variant): ${determinedIndexSampleId}`
        );
      }
    }
  }
  indexSampleId = determinedIndexSampleId; // Use the determined ID

  if (!indexSampleId) {
    debug('Could not determine index sample for inheritance analysis');
    debugDetailed(
      `--- Exiting analyzeInheritanceForSample: Could not determine Index Sample ID ---`
    );
    return new Map();
  }

  debugDetailed(`  Index ID Check: FINAL indexSampleId used for analysis: ${indexSampleId}`);

  // Prepare result map
  const results = new Map();

  // BEFORE the main loop starts
  debugDetailed(`--- Starting loop over ${annotations?.length} annotations ---`);

  // First pass: Calculate standard inheritance patterns for each variant
  for (const annotation of annotations) {
    debugDetailed(
      `\nLoop Iteration: Processing annotation with key: ${annotation?.variantKey || 'MISSING_KEY'}, OriginalInput: ${annotation?.originalInput}`
    );

    // Skip variants without key
    const variantKey = annotation.variantKey;
    if (!variantKey || !genotypesMap.has(variantKey)) {
      debugDetailed(`  Loop: SKIPPING - Key missing or not in genotypesMap.`);
      // Store an appropriate result for skipped variants
      results.set(variantKey || `unknown_key_${annotation.input || 'no_input'}`, {
        prioritizedPattern: 'unknown_missing_genotypes',
        possiblePatterns: ['unknown_missing_genotypes'],
        segregationStatus: {},
        error: 'Genotype data not found for this variant key.',
      });
      continue;
    }

    const genotypes = genotypesMap.get(variantKey);
    if (!genotypes) {
      // Redundant check, but safe
      debugDetailed(`  Loop: No genotype data for variant ${variantKey}`);
      results.set(variantKey, {
        prioritizedPattern: 'unknown_missing_genotypes',
        possiblePatterns: ['unknown_missing_genotypes'],
        segregationStatus: {},
        error: 'Genotype data map entry was invalid.',
      });
      continue;
    }
    debugDetailed(
      `  Loop: Retrieved genotypes for key ${variantKey}: ${JSON.stringify(Array.from(genotypes.entries()))}`
    );

    // --- Start of Restored Logic Block ---
    // This is the original core logic before the inner try/catch was added,
    // but keeping the detailed debug logs around the function calls.

    const variantInfo = {
      chrom: annotation.seq_region_name || annotation.chr || '',
    };
    debugDetailed(`  Loop: Variant info for deduction: ${JSON.stringify(variantInfo)}`);

    // Call deduceInheritancePatterns
    debugDetailed(`  Loop: --> Calling deduceInheritancePatterns...`);
    const possiblePatterns = deduceInheritancePatterns(
      genotypes,
      pedigreeData,
      sampleMap,
      variantInfo
    );
    debugDetailed(
      `  Loop: <-- deduceInheritancePatterns returned: ${JSON.stringify(possiblePatterns)}`
    );

    // Check segregation
    const segregationResults = new Map();
    if (pedigreeData && pedigreeData.size > 0 && possiblePatterns && possiblePatterns.length > 0) {
      debugDetailed(
        `  Loop: --> Checking segregation for patterns: ${JSON.stringify(possiblePatterns)}...`
      );
      for (const pattern of possiblePatterns) {
        if (pattern.includes('unknown') || pattern.includes('reference')) continue;
        try {
          // Keep try/catch around segregation check itself
          debugDetailed(`    Seg Check: ---> Calling checkSegregation for pattern: ${pattern}...`);
          const segregationStatus = checkSegregation(pattern, genotypes, pedigreeData);
          segregationResults.set(pattern, segregationStatus);
          debugDetailed(`    Seg Check: <--- checkSegregation returned: ${segregationStatus}`);
        } catch (segError) {
          debugDetailed(
            `    Seg Check: !!! ERROR checking segregation for ${pattern}: ${segError.message}`
          );
          segregationResults.set(pattern, 'error_checking_segregation');
        }
      }
      debugDetailed(
        `  Loop: <-- Segregation checks complete. Results: ${JSON.stringify(Object.fromEntries(segregationResults))}`
      );
    } else {
      debugDetailed(`  Loop: Skipping segregation check (No PED data or no possible patterns).`);
    }

    // Prioritize
    debugDetailed(`  Loop: --> Calling prioritizePattern...`);
    const prioritizedPattern = prioritizePattern(possiblePatterns, segregationResults);
    debugDetailed(`  Loop: <-- prioritizePattern returned: ${prioritizedPattern}`);

    // Store result
    results.set(variantKey, {
      prioritizedPattern,
      possiblePatterns,
      segregationStatus: Object.fromEntries(segregationResults),
    });
    debugDetailed(`  Loop: Stored inheritance result for key ${variantKey}.`);
    // --- End of Restored Logic Block ---
  } // End of loop over annotations

  // Second pass: Group variants by gene for CompHet analysis
  // Group annotations by gene for compound heterozygous analysis
  const geneVariantsMap = new Map();

  for (const annotation of annotations) {
    debugDetailed(
      `  CompHet: Processing annotation for gene grouping: ${annotation?.variantKey || 'MISSING_KEY'}`
    );
    // Skip variants without gene info or already processed
    if (!annotation.variantKey) {
      debugDetailed('  CompHet: Skipping - no variant key');
      continue;
    }

    // Extract gene symbol from consequences
    let geneSymbol = null;
    if (annotation.transcript_consequences && annotation.transcript_consequences.length > 0) {
      for (const cons of annotation.transcript_consequences) {
        if (cons.gene_symbol) {
          geneSymbol = cons.gene_symbol;
          debugDetailed(`  CompHet: Found gene symbol: ${geneSymbol}`);
          break;
        }
      }
    }

    // Skip if no gene symbol found
    if (!geneSymbol) {
      debugDetailed('  CompHet: Skipping - no gene symbol found');
      continue;
    }

    // Add to gene group
    if (!geneVariantsMap.has(geneSymbol)) {
      debugDetailed(`  CompHet: Creating new gene group for ${geneSymbol}`);
      geneVariantsMap.set(geneSymbol, []);
    }

    geneVariantsMap.get(geneSymbol).push({
      ...annotation, // Include the full annotation object
      variantKey: annotation.variantKey,
    });
    debugDetailed(`  CompHet: Added variant ${annotation.variantKey} to gene ${geneSymbol}`);
  }

  // Analyze compounds by gene
  debugDetailed(
    `CompHet: Starting compound heterozygous analysis for ${geneVariantsMap.size} genes...`
  );
  for (const [geneSymbol, geneVariants] of geneVariantsMap.entries()) {
    // Skip genes with only one variant
    if (geneVariants.length < 2) {
      debugDetailed(`  CompHet: Skipping ${geneSymbol} - only ${geneVariants.length} variant(s)`);
      continue;
    }

    debugDetailed(`  CompHet: Analyzing ${geneSymbol} with ${geneVariants.length} variants...`);
    // Analyze for compound heterozygous
    const compHetResult = analyzeCompoundHeterozygous(
      geneVariants,
      genotypesMap,
      pedigreeData,
      indexSampleId // Use the determined indexSampleId
    );

    if (compHetResult && (compHetResult.isCompHet || compHetResult.isPossible)) {
      debugDetailed(
        `  CompHet: Found ${compHetResult.isCompHet ? 'confirmed' : 'possible'} compound het in ${geneSymbol}`
      );
      // Update result for each variant in the compound
      for (const variantKey of compHetResult.variantKeys) {
        if (results.has(variantKey)) {
          const currentResult = results.get(variantKey);

          // Enhance the result with compound heterozygous information
          const enhancedResult = {
            ...currentResult,
            // Only override the pattern if CompHet is confirmed or no strong pattern exists
            prioritizedPattern: compHetResult.isCompHet
              ? 'compound_heterozygous'
              : currentResult.prioritizedPattern.includes('de_novo')
                ? currentResult.prioritizedPattern // Don't override strong patterns like de_novo easily
                : compHetResult.pattern,
            // Add to possible patterns
            possiblePatterns: [
              ...new Set([...(currentResult.possiblePatterns || []), compHetResult.pattern]),
            ],
            // Add CompHet details
            compHetDetails: {
              isCandidate: compHetResult.isCompHet,
              isPossible: compHetResult.isPossible,
              geneSymbol,
              partnerVariantKeys: compHetResult.variantKeys.filter((k) => k !== variantKey),
            },
          };

          // Update segregation status if needed
          if (compHetResult.isCompHet) {
            enhancedResult.segregationStatus = {
              ...enhancedResult.segregationStatus,
              compound_heterozygous: 'segregates',
            };
          } else if (compHetResult.isPossible) {
            enhancedResult.segregationStatus = {
              ...enhancedResult.segregationStatus,
              compound_heterozygous_possible: 'unknown', // or 'possible' ?
            };
          }

          debugDetailed(`    CompHet: Updated result for variant ${variantKey} in ${geneSymbol}`);
          results.set(variantKey, enhancedResult);
        }
      }
    } else {
      debugDetailed(`  CompHet: No compound het found in ${geneSymbol}`);
    }
  }

  debugDetailed(`--- Completed inheritance analysis. Results size: ${results.size} ---`);
  return results;
}

module.exports = {
  // calculateDeducedPattern, // Intentionally commented out - deprecated
  deduceInheritancePatterns,
  checkSegregation,
  prioritizePattern,
  analyzeInheritanceForSample,
  analyzeCompoundHeterozygous,
  isRef,
  isHet,
  isHomAlt,
  isVariant,
  isMissing,
  isMale,
  isFemale,
};
