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
const { deducePedBasedPatterns: _deducePedBasedPatterns } = require('./pedigreePatterns');
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
  } else if (genotypeUtils.isVariant(gt)) {
    resultPatterns = isXChromosome ? ['potential_x_linked'] : ['unknown_ploidy'];
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
 * @param {import('../dataTypes').SampleMap} sampleMap - Object mapping roles ('index', 'mother', 'father') to sample IDs.
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome.
 * @param {import('../dataTypes').Pedigree|null} pedigreeData - Optional pedigree data for sex checks on X.
 * @returns {Array<string>} Array of possible patterns.
 * @private
 */
function _deduceTrioPatterns(genotypes, sampleMap, isXChromosome, pedigreeData) {
  debugDetailed(`--- Entering _deduceTrioPatterns ---`);
  debugDetailed(`  Args: sampleMap=${JSON.stringify(sampleMap)}, isX=${isXChromosome}`);

  const { index, mother, father } = sampleMap;

  if (
    !index ||
    !mother ||
    !father ||
    !genotypes ||
    !genotypes.has(index) ||
    !genotypes.has(mother) ||
    !genotypes.has(father)
  ) {
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
 * Main function to deduce possible inheritance patterns based on available data.
 * Acts as a router to specific deduction functions based on input context.
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string for the variant.
 * @param {import('../dataTypes').Pedigree|null} pedigreeData - Parsed pedigree data (optional).
 * @param {import('../dataTypes').SampleMap|null} sampleMap - Manual mapping of sample roles
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
