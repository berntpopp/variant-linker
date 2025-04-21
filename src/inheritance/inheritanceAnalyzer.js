// src/inheritance/inheritanceAnalyzer.js
'use strict';

/**
 * @fileoverview Orchestrates inheritance pattern analysis for variants.
 * Integrates pattern deduction, segregation checking, prioritization, and
 * compound heterozygous analysis.
 * Replaces the old inheritanceCalculator.js module.
 * @module inheritanceAnalyzer
 */

const debug = require('debug')('variant-linker:inheritance:analyzer');
const debugDetailed = require('debug')('variant-linker:detailed');

// Import specialized modules
const patternDeducer = require('./patternDeducer');
const segregationChecker = require('./segregationChecker');
const patternPrioritizer = require('./patternPrioritizer');
const compoundHetAnalyzer = require('./compoundHetAnalyzer');

/**
 * Determines the index/proband sample ID based on available information.
 * Priority:
 * 1. Explicit sampleMap with 'index' or 'proband'.
 * 2. First affected ('2') sample found in pedigreeData.
 * 3. Fallback to the first sample ID found in the first variant's genotype map.
 *
 * @param {Map<string, Map<string, string>>} genotypesMap - Map of variant keys to genotype maps.
 * @param {Map<string, Object>|null} pedigreeData - Optional pedigree data.
 * @param {Object|null} sampleMap - Optional sample role mapping.
 * @returns {string | null} The determined index sample ID or null if none could be found.
 * @private
 */
function _determineIndexSampleId(genotypesMap, pedigreeData, sampleMap) {
  debugDetailed(`--- Determining Index Sample ID ---`);
  let indexSampleId = null;

  // 1. Check sampleMap
  if (sampleMap) {
    if (sampleMap.index) {
      indexSampleId = sampleMap.index;
      debugDetailed(`  Index ID found in sampleMap.index: ${indexSampleId}`);
    } else if (sampleMap.proband) {
      // Allow 'proband' as well
      indexSampleId = sampleMap.proband;
      debugDetailed(`  Index ID found in sampleMap.proband: ${indexSampleId}`);
    }
  }

  // 2. Check pedigree for affected status '2' if index not found yet
  if (!indexSampleId && pedigreeData && pedigreeData.size > 0) {
    debugDetailed(`  Checking pedigree for affected status '2'...`);
    for (const [sampleId, sampleData] of pedigreeData.entries()) {
      if (sampleData.affectedStatus === '2' || sampleData.affectedStatus === 2) {
        indexSampleId = sampleId;
        debugDetailed(`  Index ID found from affected status in PED: ${indexSampleId}`);
        break; // Found the first affected
      }
    }
    if (!indexSampleId) debugDetailed(`  No affected ('2') sample found in PED.`);
  } else if (!indexSampleId) {
    debugDetailed(`  Skipping PED check (no PED data).`);
  }

  // 3. Fallback to first sample in genotype data if still not found
  if (!indexSampleId && genotypesMap && genotypesMap.size > 0) {
    const firstVariantKey = genotypesMap.keys().next().value;
    const firstGenotypes = genotypesMap.get(firstVariantKey);
    if (firstGenotypes && firstGenotypes.size > 0) {
      indexSampleId = firstGenotypes.keys().next().value;
      debugDetailed(`  Using fallback index (first sample from first variant): ${indexSampleId}`);
    }
  }

  if (!indexSampleId) {
    debug('Could not determine index sample ID for inheritance analysis.');
  }
  debugDetailed(`--- Final Index Sample ID: ${indexSampleId} ---`);
  return indexSampleId;
}

/**
 * Groups variant annotations by gene symbol.
 * Extracts the gene symbol from the first transcript consequence found.
 *
 * @param {Array<Object>} annotations - Variant annotation objects with `variantKey`.
 * @returns {Map<string, Array<Object>>} Map of gene symbols to their variant annotations.
 * @private
 */
function _groupAnnotationsByGene(annotations) {
  debugDetailed(`--- Grouping ${annotations?.length || 0} annotations by gene ---`);
  const geneVariantsMap = new Map();

  if (!annotations || !Array.isArray(annotations)) {
    debugDetailed('  No annotations provided for gene grouping.');
    return geneVariantsMap;
  }

  for (const annotation of annotations) {
    if (!annotation?.variantKey) {
      debugDetailed('  Skipping annotation - missing variantKey');
      continue;
    }

    let geneSymbol = null;
    // Find the first gene symbol in the transcript consequences
    if (Array.isArray(annotation.transcript_consequences)) {
      for (const cons of annotation.transcript_consequences) {
        if (cons?.gene_symbol) {
          geneSymbol = cons.gene_symbol;
          break; // Use the first one found
        }
      }
    }

    if (!geneSymbol) {
      debugDetailed(
        `  Skipping variant ${annotation.variantKey} - no gene symbol found in consequences.`
      );
      continue; // Skip if no gene symbol found
    }

    // Add to the map
    if (!geneVariantsMap.has(geneSymbol)) {
      geneVariantsMap.set(geneSymbol, []);
    }
    geneVariantsMap.get(geneSymbol).push(annotation); // Push the full annotation object
    debugDetailed(`  Added variant ${annotation.variantKey} to gene group ${geneSymbol}`);
  }

  debugDetailed(`--- Finished grouping. Found ${geneVariantsMap.size} gene groups. ---`);
  return geneVariantsMap;
}

/**
 * Merges compound heterozygous results back into the main inheritance results map.
 * Updates the prioritized pattern and adds compHet details.
 *
 * @param {Map<string, Object>} inheritanceResults - Main results map (variantKey -> result).
 * @param {string} geneSymbol - The gene being processed.
 * @param {Object} compHetResult - The result from analyzeCompoundHeterozygous.
 * @private
 */
function _mergeCompHetResults(inheritanceResults, geneSymbol, compHetResult) {
  if (!compHetResult || !(compHetResult.isCompHet || compHetResult.isPossible)) {
    return; // Nothing to merge
  }

  debugDetailed(`  CompHet: ${geneSymbol} (Confirmed=${compHetResult.isCompHet})`);

  for (const variantKey of compHetResult.variantKeys) {
    if (inheritanceResults.has(variantKey)) {
      const currentResult = inheritanceResults.get(variantKey);

      // Determine if CompHet pattern should override the current pattern
      let newPrioritizedPattern = currentResult.prioritizedPattern;
      // Generally, confirmed CompHet is strong evidence. Possible CompHet is weaker.
      // Don't let 'possible' override strong patterns like 'de_novo'.
      const strongPatterns = [
        'de_novo',
        'autosomal_recessive',
        'x_linked_recessive',
        'compound_heterozygous',
      ]; // Define 'strong' patterns
      const weakPatterns = [
        'unknown',
        'reference',
        'dominant',
        'homozygous',
        'potential_x_linked',
        'non_mendelian',
      ]; // Patterns easily overridden

      if (compHetResult.isCompHet && !strongPatterns.includes(currentResult.prioritizedPattern)) {
        // Confirmed CompHet overrides unless current pattern is also strong evidence
        newPrioritizedPattern = 'compound_heterozygous';
      } else if (
        compHetResult.isPossible &&
        !compHetResult.isCompHet &&
        (weakPatterns.includes(currentResult.prioritizedPattern) ||
          currentResult.prioritizedPattern.startsWith('unknown_'))
      ) {
        // Possible CompHet overrides only weak or unknown patterns
        newPrioritizedPattern = compHetResult.pattern; // e.g., 'compound_heterozygous_possible'
      }

      // Add CompHet details
      const compHetDetails = {
        isCandidate: compHetResult.isCompHet, // isCandidate true only if confirmed
        isPossible: compHetResult.isPossible,
        geneSymbol,
        // List partners involved in this specific CompHet finding
        partnerVariantKeys: compHetResult.variantKeys.filter((k) => k !== variantKey),
        // Include PoO info if available from compHetResult
        likelyPaternalKeys: compHetResult.paternalVariantKeys, // Keep original keys here
        likelyMaternalKeys: compHetResult.maternalVariantKeys,
        ambiguousKeys: compHetResult.ambiguousVariantKeys,
      };

      // Update the result object
      const enhancedResult = {
        ...currentResult,
        prioritizedPattern: newPrioritizedPattern,
        possiblePatterns: [
          ...new Set([...(currentResult.possiblePatterns || []), compHetResult.pattern]),
        ],
        // Add/overwrite segregation status for comphet patterns
        segregationStatus: {
          ...currentResult.segregationStatus,
          ...(compHetResult.isCompHet && { compound_heterozygous: 'segregates' }), // Assume segregates if confirmed
          ...(compHetResult.isPossible &&
            !compHetResult.isCompHet && { [compHetResult.pattern]: 'unknown' }), // Status for possible is unknown
        },
        compHetDetails: compHetDetails,
      };

      inheritanceResults.set(variantKey, enhancedResult);
      debugDetailed(`    Updated inheritance result for variant ${variantKey} with CompHet info.`);
    } else {
      debugDetailed(
        `    Warning: Variant key ${variantKey} from CompHet analysis not found in main results.`
      );
    }
  }
}

/**
 * Analyzes inheritance patterns for a list of variant annotations.
 * This is the main entry point for the inheritance analysis workflow.
 *
 * @param {Array<Object>} annotations - Variant objects with required properties.
 * @param {Map<string, Map<string, string>>} genotypesMap - Variant genotype maps.
 * @param {Map<string, Object>|null} pedigreeData - Optional parsed pedigree data.
 * @param {Object|null} sampleMap - Optional role to sample ID mapping.
 * @returns {Map<string, Object>} Map of variantKeys to inheritance results.
 */
function analyzeInheritanceForSample(annotations, genotypesMap, pedigreeData, sampleMap) {
  debugDetailed(`--- Entering analyzeInheritanceForSample ---`);
  debugDetailed(
    `  Input: ann=${annotations?.length}, gen=${genotypesMap?.size}, ped=${pedigreeData?.size}`
  );

  // Map: variantKey -> { prioritizedPattern, possiblePatterns, segregationStatus, compHetDetails }
  const results = new Map();

  if (!Array.isArray(annotations) || !annotations.length) {
    debug('No valid annotations for analysis.');
    debugDetailed('--- Exiting: No annotations ---');
    return results;
  }
  if (!genotypesMap?.size) {
    debug('No genotype data provided for inheritance analysis.');
    // Populate results with error state for each annotation key if possible
    for (const ann of annotations) {
      if (ann.variantKey) {
        results.set(ann.variantKey, {
          prioritizedPattern: 'unknown_missing_genotypes',
          possiblePatterns: ['unknown_missing_genotypes'],
          segregationStatus: {},
          error: 'Genotype map was empty or not provided.',
        });
      }
    }
    debugDetailed(`--- Exiting analyzeInheritanceForSample: No genotypes ---`);
    return results;
  }

  // Determine the index sample ID (crucial for CompHet analysis)
  const indexSampleId = _determineIndexSampleId(genotypesMap, pedigreeData, sampleMap);
  // Note: Trio/PED deduction doesn't strictly *need* the index ID identified beforehand,
  // but CompHet does.

  // --- Pass 1: Initial Pattern Deduction, Segregation, and Prioritization per Variant ---
  debugDetailed(`--- Pass 1: Initial Analysis (${annotations.length} variants) ---`);
  for (const annotation of annotations) {
    const variantKey = annotation.variantKey;
    debugDetailed(`\nProcessing Annotation: Key=${variantKey}, Input=${annotation.originalInput}`);

    if (!variantKey) {
      debugDetailed(`  SKIPPING - Annotation missing variantKey.`);
      // Optionally add an error entry to results if needed
      continue;
    }

    const genotypes = genotypesMap.get(variantKey);
    if (!genotypes) {
      debugDetailed(`  SKIPPING - No genotypes found for key ${variantKey} in genotypesMap.`);
      results.set(variantKey, {
        prioritizedPattern: 'unknown_missing_genotypes',
        possiblePatterns: ['unknown_missing_genotypes'],
        segregationStatus: {},
        error: 'Genotype data not found in map for this variant key.',
      });
      continue;
    }

    try {
      // 1. Deduce Patterns
      const variantInfo = { chrom: annotation.seq_region_name || annotation.chr || '' };
      debugDetailed(`  --> Calling patternDeducer.deduceInheritancePatterns for ${variantKey}...`);
      const possiblePatterns = patternDeducer.deduceInheritancePatterns(
        genotypes,
        pedigreeData,
        sampleMap,
        variantInfo
      );
      debugDetailed(`  <-- deduceInheritancePatterns result: ${JSON.stringify(possiblePatterns)}`);

      // 2. Check Segregation (if pedigree data available)
      let segregationResults = null;
      if (pedigreeData && pedigreeData.size > 0 && possiblePatterns.length > 0) {
        debugDetailed(`  --> Checking segregation for ${possiblePatterns.length} patterns...`);
        segregationResults = new Map();
        for (const pattern of possiblePatterns) {
          // Avoid checking segregation for non-specific or observational patterns
          if (
            [
              'unknown',
              'reference',
              'dominant',
              'homozygous',
              'potential_x_linked',
              'non_mendelian',
            ].some((p) => pattern.includes(p)) ||
            pattern.startsWith('error_')
          ) {
            continue;
          }
          try {
            debugDetailed(
              `    ---> Calling segregationChecker.checkSegregation for pattern: ${pattern}...`
            );
            const status = segregationChecker.checkSegregation(pattern, genotypes, pedigreeData);
            segregationResults.set(pattern, status);
            debugDetailed(`    <--- checkSegregation result: ${status}`);
          } catch (segError) {
            debugDetailed(`    !!! ERROR checking segregation for ${pattern}: ${segError.message}`);
            segregationResults.set(pattern, 'error_checking_segregation');
          }
        }
        debugDetailed(
          `  <-- Segregation checks complete. Results map size: ${segregationResults.size}`
        );
      } else {
        debugDetailed(`  Skipping segregation check (No PED data or no patterns).`);
      }

      // 3. Prioritize Pattern
      debugDetailed(`  --> Calling patternPrioritizer.prioritizePattern...`);
      const prioritizedPattern = patternPrioritizer.prioritizePattern(
        possiblePatterns,
        segregationResults
      );
      debugDetailed(`  <-- prioritizePattern result: ${prioritizedPattern}`);

      // Store initial result
      results.set(variantKey, {
        prioritizedPattern,
        possiblePatterns,
        segregationStatus: segregationResults ? Object.fromEntries(segregationResults) : {},
        // compHetDetails will be added in Pass 2 if applicable
      });
      debugDetailed(`  Stored initial inheritance result for key ${variantKey}.`);
    } catch (error) {
      debug(`!!! ERROR analyzing inheritance for variant ${variantKey}: ${error.message} !!!`);
      debugDetailed(`Stack trace: ${error.stack}`);
      results.set(variantKey, {
        prioritizedPattern: 'error_analysis_failed',
        possiblePatterns: ['error_analysis_failed'],
        segregationStatus: {},
        error: `Analysis failed: ${error.message}`,
      });
    }
  } // End Pass 1 loop

  // --- Pass 2: Compound Heterozygous Analysis ---
  debugDetailed(`--- Starting Pass 2: Compound Heterozygous Analysis ---`);
  if (!indexSampleId) {
    debug(
      'Skipping Compound Heterozygous analysis because Index Sample ID could not be determined.'
    );
    debugDetailed(`--- Exiting analyzeInheritanceForSample (Skipped CompHet) ---`);
    return results; // Return results from Pass 1
  }

  const geneVariantsMap = _groupAnnotationsByGene(annotations);

  if (geneVariantsMap.size === 0) {
    debugDetailed('No gene groups found for compound heterozygous analysis.');
  } else {
    debugDetailed(`Analyzing ${geneVariantsMap.size} gene groups for compound heterozygosity...`);
    for (const [geneSymbol, geneVariants] of geneVariantsMap.entries()) {
      if (geneVariants.length < 2) {
        debugDetailed(`  Skipping gene ${geneSymbol} - only ${geneVariants.length} variant(s).`);
        continue;
      }

      // Only attempt CompHet analysis if pedigree data is available (needed for confirmation)
      if (!pedigreeData || pedigreeData.size === 0) {
        debugDetailed(`  Skipping CompHet analysis for ${geneSymbol} - pedigree data missing.`);
        // Mark variants as possible if index is het for >=2?
        // We can call the analyzer anyway, it will return 'possible_no_pedigree' status.
      }

      debugDetailed(`  Analyzing gene ${geneSymbol} (${geneVariants.length} variants)...`);
      try {
        const compHetResult = compoundHetAnalyzer.analyzeCompoundHeterozygous(
          geneVariants,
          genotypesMap,
          pedigreeData, // Pass PED data, analyzer handles null/missing case
          indexSampleId // Crucial parameter
        );

        if (compHetResult) {
          debugDetailed(`  --> Merging CompHet results for ${geneSymbol}...`);
          _mergeCompHetResults(results, geneSymbol, compHetResult);
          debugDetailed(`  <-- Finished merging CompHet results for ${geneSymbol}.`);
        } else {
          debugDetailed(`  No applicable CompHet pattern found for ${geneSymbol}.`);
        }
      } catch (compHetError) {
        debug(`!!! CompHet error for ${geneSymbol}: ${compHetError.message} !!!`);
        debugDetailed(`Stack trace: ${compHetError.stack}`);
        // Optionally mark involved variants with an error status
        for (const variant of geneVariants) {
          if (results.has(variant.variantKey)) {
            const currentResult = results.get(variant.variantKey);
            results.set(variant.variantKey, {
              ...currentResult,
              compHetDetails: { error: `CompHet analysis failed: ${compHetError.message}` },
            });
          }
        }
      }
    }
  } // End Pass 2

  debugDetailed(`--- Completed inheritance analysis. Final results map size: ${results.size} ---`);
  return results;
}

// --- Exports ---

module.exports = {
  // Core function
  analyzeInheritanceForSample,
  // Do not export internal helper functions (_determineIndexSampleId, etc.)
};
