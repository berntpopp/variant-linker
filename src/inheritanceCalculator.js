/**
 * @fileoverview Inheritance pattern calculator for variant-linker.
 * This module provides functions to deduce likely inheritance patterns based on
 * genotype data and family relationships.
 * @module inheritanceCalculator
 */

'use strict';

const debug = require('debug')('variant-linker:inheritance');

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
  if (!genotypes || genotypes.size === 0) {
    debug('No genotype data available, cannot deduce inheritance pattern');
    return ['unknown'];
  }

  // Track variant characteristics for pattern determination
  const { chrom } = variantInfo;
  const isXChromosome = chrom === 'X' || chrom === 'x' || chrom === 'chrX' || chrom === 'chrx';

  // Check which inheritance mode to use
  if (pedigreeData && pedigreeData.size > 0) {
    debug('Using PED-based inheritance deduction mode');
    return deducePedBasedPatterns(genotypes, pedigreeData, isXChromosome);
  } else if (genotypes.size >= 3 && sampleMap) {
    debug('Using defined trio inheritance deduction mode with sample map');
    return deduceTrioPatterns(genotypes, sampleMap, isXChromosome);
  } else if (genotypes.size >= 3) {
    debug('Using default trio inheritance deduction mode');
    return deduceDefaultTrioPatterns(genotypes, isXChromosome);
  } else {
    debug('Using single sample inheritance deduction mode');
    return deduceSingleSamplePattern(genotypes, isXChromosome);
  }
}

/**
 * Deduces inheritance pattern for a single sample
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deduceSingleSamplePattern(genotypes, isXChromosome) {
  // For a single sample, we can only infer limited information
  const sampleId = Array.from(genotypes.keys())[0];
  const gt = genotypes.get(sampleId);

  if (isMissing(gt)) {
    debug(`Sample ${sampleId} has missing genotype, cannot determine pattern`);
    return ['unknown'];
  }

  if (isHomAlt(gt)) {
    debug(`Sample ${sampleId} is homozygous for alternate allele`);
    return ['homozygous'];
  }

  if (isHet(gt)) {
    debug(`Sample ${sampleId} is heterozygous`);
    if (isXChromosome) {
      // On X chromosome, heterozygosity suggests dominant for females
      return ['potential_x_linked', 'dominant'];
    } else {
      return ['dominant'];
    }
  }

  if (isRef(gt)) {
    debug(`Sample ${sampleId} is homozygous for reference allele`);
    return ['reference'];
  }

  return ['unknown'];
}

/**
 * Deduces inheritance pattern using default trio assumptions (first 3 samples)
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {boolean} isXChromosome - Whether the variant is on the X chromosome
 * @returns {Array<string>} Array of possible patterns
 */
function deduceDefaultTrioPatterns(genotypes, isXChromosome) {
  // Assume first sample is index, second is mother, third is father in VCF
  const samples = Array.from(genotypes.keys());
  if (samples.length < 3) {
    debug('Not enough samples for trio analysis, falling back to single sample mode');
    return deduceSingleSamplePattern(genotypes, isXChromosome);
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
  return deduceTrioPatterns(genotypes, sampleMap, isXChromosome);
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
  const { index, mother, father } = sampleMap;

  // Verify all trio members have genotypes
  if (!genotypes.has(index) || !genotypes.has(mother) || !genotypes.has(father)) {
    debug('Missing genotype data for one or more trio members');
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
  if (isVariant(indexGT) && isRef(motherGT) && isRef(fatherGT)) {
    debug('Potential de novo mutation detected');
    patterns.push('de_novo');
  } else if (
    isVariant(indexGT) &&
    (isMissing(motherGT) || isMissing(fatherGT)) &&
    (isRef(motherGT) || isRef(fatherGT))
  ) {
    debug('Potential de novo mutation with missing parent data');
    patterns.push('de_novo_candidate');
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
  // Create a map to track affected and unaffected individuals
  const affectedIndividuals = new Map();
  const unaffectedIndividuals = new Map();

  // Separate individuals by affected status
  pedigreeData.forEach((individual, sampleId) => {
    if (genotypes.has(sampleId)) {
      if (individual.affectedStatus === '2') {
        affectedIndividuals.set(sampleId, {
          ...individual,
          genotype: genotypes.get(sampleId),
        });
      } else if (individual.affectedStatus === '1') {
        unaffectedIndividuals.set(sampleId, {
          ...individual,
          genotype: genotypes.get(sampleId),
        });
      }
    }
  });

  debug(
    `Found ${affectedIndividuals.size} affected and ` +
      `${unaffectedIndividuals.size} unaffected individuals`
  );
  if (affectedIndividuals.size === 0) {
    debug('No affected individuals found, cannot deduce inheritance pattern');
    return ['unknown'];
  }

  // Identify families in the pedigree
  const families = new Map();
  for (const [sampleId, info] of pedigreeData.entries()) {
    if (!families.has(info.familyId)) {
      families.set(info.familyId, new Set());
    }
    families.get(info.familyId).add(sampleId);
  }

  debug(`Identified ${families.size} families in the pedigree`);

  // Start with empty patterns list
  const patterns = [];

  // Check if any affected individuals have the variant
  let affectedWithVariant = 0;
  let affectedWithoutVariant = 0;
  let unaffectedWithVariant = 0;

  for (const sampleId of affectedIndividuals) {
    if (genotypes.has(sampleId)) {
      if (isVariant(genotypes.get(sampleId))) {
        affectedWithVariant++;
      } else if (isRef(genotypes.get(sampleId))) {
        affectedWithoutVariant++;
      }
    }
  }

  for (const sampleId of unaffectedIndividuals) {
    if (genotypes.has(sampleId) && isVariant(genotypes.get(sampleId))) {
      unaffectedWithVariant++;
    }
  }

  // Basic segregation checks
  if (affectedWithVariant > 0 && affectedWithoutVariant === 0) {
    debug('All affected individuals have the variant');

    // Check for de novo mutations by examining parents of affected individuals
    let potentialDeNovo = false;

    for (const sampleId of affectedIndividuals) {
      if (!genotypes.has(sampleId) || !isVariant(genotypes.get(sampleId))) continue;

      const info = pedigreeData.get(sampleId);
      if (!info) continue;

      // Look at the parents
      const hasMotherGT = info.motherId !== '0' && genotypes.has(info.motherId);
      const hasFatherGT = info.fatherId !== '0' && genotypes.has(info.fatherId);

      // Check for de novo pattern
      if (hasMotherGT && hasFatherGT) {
        const motherGT = genotypes.get(info.motherId);
        const fatherGT = genotypes.get(info.fatherId);

        if (isRef(motherGT) && isRef(fatherGT) && isVariant(genotypes.get(sampleId))) {
          debug(`Potential de novo mutation detected in ${sampleId}`);
          potentialDeNovo = true;
        }
      }
    }

    if (potentialDeNovo) {
      patterns.push('de_novo');
    }

    // Check for autosomal dominant pattern
    let adConsistent = true;
    for (const sampleId of affectedIndividuals) {
      if (!genotypes.has(sampleId)) continue;

      // For autosomal dominant, affected should be heterozygous
      if (!isHet(genotypes.get(sampleId)) && !isHomAlt(genotypes.get(sampleId))) {
        adConsistent = false;
      }
    }

    if (adConsistent && unaffectedWithVariant === 0) {
      debug('Pattern is consistent with autosomal dominant inheritance');
      patterns.push('autosomal_dominant');
    }

    // Check for autosomal recessive pattern
    let arConsistent = true;
    for (const sampleId of affectedIndividuals) {
      if (!genotypes.has(sampleId)) continue;

      // For autosomal recessive, affected should be homozygous alt
      if (!isHomAlt(genotypes.get(sampleId))) {
        arConsistent = false;
      }
    }

    if (arConsistent) {
      debug('Pattern is consistent with autosomal recessive inheritance');
      patterns.push('autosomal_recessive');
    }

    // Check for X-linked patterns if on X chromosome
    if (isXChromosome) {
      let xlrConsistent = true;
      let xldConsistent = true;

      for (const sampleId of affectedIndividuals) {
        if (!genotypes.has(sampleId)) continue;

        if (maleIndividuals.has(sampleId)) {
          // Affected males should be hemizygous (appears as "homozygous" in VCF)
          if (!isHomAlt(genotypes.get(sampleId)) && !isHet(genotypes.get(sampleId))) {
            xlrConsistent = false;
            xldConsistent = false;
          }
        } else if (femaleIndividuals.has(sampleId)) {
          // For X-linked recessive, affected females should be homozygous
          if (!isHomAlt(genotypes.get(sampleId))) {
            xlrConsistent = false;
          }

          // For X-linked dominant, affected females can be heterozygous
          if (!isHet(genotypes.get(sampleId)) && !isHomAlt(genotypes.get(sampleId))) {
            xldConsistent = false;
          }
        }
      }

      // Look at carrier females (mothers of affected males)
      for (const sampleId of affectedIndividuals) {
        if (!maleIndividuals.has(sampleId)) continue;

        const info = pedigreeData.get(sampleId);
        if (!info || info.motherId === '0' || !genotypes.has(info.motherId)) continue;

        // For X-linked recessive, mothers of affected males should be carriers (het)
        if (!isHet(genotypes.get(info.motherId))) {
          xlrConsistent = false;
        }
      }

      if (xlrConsistent) {
        debug('Pattern is consistent with X-linked recessive inheritance');
        patterns.push('x_linked_recessive');
      }

      if (xldConsistent) {
        debug('Pattern is consistent with X-linked dominant inheritance');
        patterns.push('x_linked_dominant');
      }
    }
  }

  // If no patterns could be determined
  if (patterns.length === 0) {
    if (affectedWithVariant > 0) {
      if (affectedWithoutVariant > 0) {
        debug("Incomplete segregation (some affected don't have variant)");
        patterns.push('incomplete_segregation');
      } else if (unaffectedWithVariant > 0) {
        debug('Incomplete penetrance (some unaffected have variant)');
        patterns.push('incomplete_penetrance');
      } else {
        debug('No clear inheritance pattern could be determined');
        patterns.push('unknown');
      }
    } else {
      debug('No affected individuals have the variant');
      patterns.push('non_causative');
    }
  }

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
  if (!pedigreeData || pedigreeData.size === 0) {
    debug('No pedigree data available for segregation check');
    return 'unknown';
  }

  // Identify affected individuals from the pedigree
  const affectedIndividuals = new Set();
  const unaffectedIndividuals = new Set();

  for (const [sampleId, info] of pedigreeData.entries()) {
    if (info.affectedStatus === 2) {
      affectedIndividuals.add(sampleId);
    } else if (info.affectedStatus === 1) {
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
    return 'unknown';
  }

  // Basic segregation check
  if (affectedWithoutVariant > 0) {
    debug(
      `${pattern} does not segregate: ` +
        `${affectedWithoutVariant} affected individuals lack the variant`
    );
    return 'does_not_segregate';
  }

  // Additional pattern-specific checks
  if (['autosomal_dominant', 'x_linked_dominant'].includes(pattern) && unaffectedWithVariant > 0) {
    debug(
      `${pattern} shows incomplete penetrance: ` +
        `${unaffectedWithVariant} unaffected individuals have the variant`
    );
    // This could be incomplete penetrance, but still report as not segregating
    return 'does_not_segregate';
  }

  if (affectedWithVariant > 0) {
    debug(`${pattern} segregates with disease status`);
    return 'segregates';
  }

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
  if (!possiblePatterns || possiblePatterns.length === 0) {
    return 'unknown';
  }

  // Define the priority order for patterns
  const priorityOrder = [
    'de_novo',
    'de_novo_possible',
    'autosomal_recessive',
    'autosomal_recessive_possible',
    'x_linked_recessive',
    'x_linked_recessive_possible',
    'x_linked_dominant',
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

    if (segregatingPatterns.length > 0) {
      filteredPatterns = segregatingPatterns;
    } else {
      // Then try patterns with unknown segregation
      const unknownSegregationPatterns = possiblePatterns.filter(
        (p) => segregationResults.get(p) === 'unknown' || !segregationResults.has(p)
      );

      if (unknownSegregationPatterns.length > 0) {
        filteredPatterns = unknownSegregationPatterns;
      }
      // If none segregate or have unknown status, keep all patterns
    }
  }

  // Sort filtered patterns by priority
  filteredPatterns.sort((a, b) => {
    const indexA = priorityOrder.indexOf(a);
    const indexB = priorityOrder.indexOf(b);

    // Handle patterns not in the priority list
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    // Sort by priority
    return indexA - indexB;
  });

  // If we have a prioritized pattern, return it
  if (filteredPatterns.length > 0) {
    debug(`Selected pattern: ${filteredPatterns[0]} from ${possiblePatterns.join(', ')}`);
    return filteredPatterns[0];
  }

  // Fallback
  return 'unknown';
}

/**
 * Main function to calculate the deduced inheritance pattern
 *
 * @param {Map<string, string>} genotypes - Map of sampleId to genotype string
 * @param {Map<string, Object>|null} pedigreeData - Family relationships from PED file
 * @param {Object|null} sampleMap - Manual mapping of sample roles
 * @param {Object} variantInfo - Information about the variant
 * @param {string} variantInfo.chrom - Chromosome name
 * @returns {string} The deduced inheritance pattern
 */
function calculateDeducedPattern(genotypes, pedigreeData, sampleMap, variantInfo) {
  debug('Calculating inheritance pattern');

  if (!genotypes || genotypes.size === 0) {
    debug('No genotype data available');
    return 'unknown';
  }

  // Step 1: Deduce all possible patterns
  const possiblePatterns = deduceInheritancePatterns(
    genotypes,
    pedigreeData,
    sampleMap,
    variantInfo
  );

  debug(`Possible inheritance patterns: ${possiblePatterns.join(', ')}`);

  // Step 2: Check segregation for each pattern if pedigree data available
  const segregationResults = new Map();

  if (pedigreeData && pedigreeData.size > 0) {
    for (const pattern of possiblePatterns) {
      if (pattern.includes('unknown') || pattern.includes('reference')) continue;

      const segregationStatus = checkSegregation(pattern, genotypes, pedigreeData);
      segregationResults.set(pattern, segregationStatus);

      debug(`Segregation check for ${pattern}: ${segregationStatus}`);
    }
  }

  // Step 3: Prioritize patterns
  const finalPattern = prioritizePattern(possiblePatterns, segregationResults);

  debug(`Final deduced pattern: ${finalPattern}`);
  return finalPattern;
}

module.exports = {
  calculateDeducedPattern,
  deduceInheritancePatterns,
  checkSegregation,
  prioritizePattern,
  isRef,
  isHet,
  isHomAlt,
  isVariant,
  isMissing,
};
