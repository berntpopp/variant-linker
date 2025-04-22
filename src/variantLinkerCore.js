// src/variantLinkerCore.js
/**
 * @fileoverview Core logic for variant analysis.
 * This module encapsulates the processing steps so that it can be used both in the CLI
 * and via the web bundle.
 * @module variantLinkerCore
 */
'use strict';

const variantRecoder = require('./variantRecoder');
const variantRecoderPost = require('./variantRecoderPost');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const { applyScoring } = require('./scoring');
const {
  mapOutputToSchemaOrg,
  validateSchemaOrgOutput,
  addCustomFormats,
} = require('./schemaMapper');
const { filterAndFormatResults } = require('./variantLinkerProcessor');

const debug = require('debug')('variant-linker:core');
const debugDetailed = require('debug')('variant-linker:detailed');

/**
 * Detects whether the input variant is in VCF or HGVS format.
 *
 * @param {string} variant - The input variant.
 * @return {string} 'VCF' if the input matches the VCF pattern; otherwise, 'HGVS'.
 * @throws {Error} If no variant is provided.
 */
function detectInputFormat(variant) {
  if (!variant) {
    throw new Error('No variant provided.');
  }
  const cleanedVariant = variant.replace(/^chr/i, '');
  const vcfPattern = /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i;
  return vcfPattern.test(cleanedVariant) ? 'VCF' : 'HGVS';
}

/**
 * Processes a single variant through the annotation pipeline.
 *
 * @param {string} variant - The single variant to process.
 * @param {Object} params - Processing parameters.
 * @param {Object} params.recoderOptions - Options for the Variant Recoder API.
 * @param {Object} params.vepOptions - Options for the VEP API.
 * @param {boolean} params.cache - Whether to enable caching.
 * @returns {Promise<Object>} Object containing annotation data and input information.
 */
async function processSingleVariant(variant, params) {
  const inputFormat = detectInputFormat(variant);
  let variantData = null;
  let annotationData;
  let inputInfo = '';
  let standardKey = variant; // Use original input as key initially

  if (inputFormat === 'VCF') {
    const parts = variant.trim().split('-');
    if (parts.length !== 4) {
      throw new Error(
        `Invalid VCF format for variant "${variant}": expected "chromosome-start-ref-alt"`
      );
    }
    const [chrom, pos, ref, alt] = parts;
    const formattedVariant = `${chrom} ${pos} . ${ref} ${alt} . . .`;
    inputInfo = formattedVariant;
    // The variant itself is the standard key for VCF input
    standardKey = variant;
    annotationData = await vepRegionsAnnotation(
      [formattedVariant],
      params.vepOptions,
      params.cache
    );
  } else {
    variantData = await variantRecoder(variant, params.recoderOptions, params.cache);
    // Ensure variantData is an array and has elements
    if (!Array.isArray(variantData) || variantData.length === 0) {
      throw new Error(`Variant Recoder did not return valid data for variant "${variant}"`);
    }
    const firstKey = Object.keys(variantData[0])[0];
    const recoderEntry = variantData[0][firstKey];
    if (!recoderEntry || !recoderEntry.vcf_string || !Array.isArray(recoderEntry.vcf_string)) {
      throw new Error(
        `Variant Recoder response is missing a valid vcf_string array for variant "${variant}"`
      );
    }
    const vcfString = recoderEntry.vcf_string.find((vcf) =>
      /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcf)
    );
    if (!vcfString) {
      throw new Error(
        `No valid VCF string found in Variant Recoder response for variant "${variant}"`
      );
    }
    const parts = vcfString.replace(/^chr/i, '').split('-');
    if (parts.length !== 4) {
      throw new Error(`Invalid VCF format from Variant Recoder for variant "${variant}"`);
    }
    const [chrom, pos, ref, alt] = parts;
    const formattedVariant = `${chrom} ${pos} . ${ref} ${alt} . . .`;
    inputInfo = formattedVariant;
    // For HGVS, the recoded vcfString becomes the standard key
    standardKey = vcfString;
    annotationData = await vepRegionsAnnotation(
      [formattedVariant],
      params.vepOptions,
      params.cache
    );
  }

  // Add input info and standardized key to each annotation
  if (Array.isArray(annotationData)) {
    annotationData = annotationData.map((ann) => {
      // *** DEBUG POINT 5: Single Variant Annotation Key Association ***
      debugDetailed(
        `processSingleVariant: Assigning variantKey='${standardKey}' to annotation for Input='${variant}'`
      );
      return {
        originalInput: variant,
        inputFormat,
        input: inputInfo,
        variantKey: standardKey, // Add the standardized key here
        ...ann,
      };
    });
  } else {
    // Handle case where annotationData is not an array (should not happen with VEP regions)
    annotationData = [
      {
        originalInput: variant,
        inputFormat,
        input: inputInfo,
        variantKey: standardKey,
        ...annotationData,
      },
    ];
    debugDetailed(
      `processSingleVariant: Assigning variantKey='${standardKey}' to non-array annotation for Input='${variant}'`
    );
  }

  return {
    inputFormat,
    variantData,
    annotationData,
  };
}

/**
 * Processes a batch of variants using the Variant Recoder POST API and VEP annotation.
 *
 * @param {Array<string>} variants - Array of variants to process.
 * @param {Object} params - Processing parameters.
 * @param {Object} params.recoderOptions - Options for the Variant Recoder API.
 * @param {Object} params.vepOptions - Options for the VEP API.
 * @param {boolean} params.cache - Whether to enable caching.
 * @returns {Promise<Object>} Object containing annotation data and mapping info.
 */
async function processBatchVariants(variants, params) {
  // Detect input formats for all variants
  const inputFormats = variants.map((variant) => ({
    variant,
    format: detectInputFormat(variant),
  }));

  // Process variants by format (separate VCF and HGVS)
  const vcfVariants = inputFormats.filter((v) => v.format === 'VCF').map((v) => v.variant);
  const hgvsVariants = inputFormats.filter((v) => v.format === 'HGVS').map((v) => v.variant);

  // Store mapping from original input to results
  const variantMapping = {};
  const annotationData = [];

  // Process VCF variants directly (they don't need recoding)
  if (vcfVariants.length > 0) {
    const formattedVcfVariants = vcfVariants.map((variant) => {
      const parts = variant.trim().split('-');
      if (parts.length !== 4) {
        throw new Error(
          `Invalid VCF format for variant "${variant}": expected "chromosome-start-ref-alt"`
        );
      }
      const [chrom, pos, ref, alt] = parts;
      return `${chrom} ${pos} . ${ref} ${alt} . . .`;
    });

    // Store the mapping for VCF variants
    formattedVcfVariants.forEach((formatted, index) => {
      variantMapping[vcfVariants[index]] = {
        originalInput: vcfVariants[index],
        inputFormat: 'VCF',
        formattedVariant: formatted,
      };
    });

    // Call VEP with all formatted VCF variants at once
    const vcfAnnotations = await vepRegionsAnnotation(
      formattedVcfVariants,
      params.vepOptions,
      params.cache
    );

    // Associate VEP results with original variants
    if (Array.isArray(vcfAnnotations)) {
      vcfAnnotations.forEach((annotation, index) => {
        const originalVariant = vcfVariants[index]; // This IS the CHR-POS-REF-ALT key
        const mappingInfo = variantMapping[originalVariant];
        const key = originalVariant; // Use the consistent input key
        // *** DEBUG POINT 6: VCF Batch Annotation Key Association ***
        debugDetailed(
          `processBatchVariants (VCF): Assigning variantKey='${key}' to annotation for OrigInput='${originalVariant}', VEPInput='${mappingInfo.formattedVariant}'`
        );
        annotationData.push({
          originalInput: originalVariant,
          inputFormat: 'VCF',
          input: mappingInfo.formattedVariant, // VEP input format
          variantKey: key, // Use the standardized key
          ...annotation,
        });
      });
    }
  }

  // Process HGVS variants through the recoder POST API
  if (hgvsVariants.length > 0) {
    // Call the recoder POST API with all HGVS variants
    const recoderResults = await variantRecoderPost(
      hgvsVariants,
      params.recoderOptions,
      params.cache
    );

    // Extract VCF strings from recoder results
    const uniqueVcfStrings = [];
    const vcfToOriginalMapping = {};

    // Process recoder results and build mappings
    for (let i = 0; i < recoderResults.length; i++) {
      const result = recoderResults[i];
      const originalVariant = hgvsVariants[i];

      // Get all allele keys from the recoder result
      const alleleKeys = Object.keys(result).filter(
        (key) => key !== 'id' && key !== 'seq_region_name' && key !== 'input'
      );

      let foundValidVcf = false;

      // Extract VCF strings from each allele
      for (const alleleKey of alleleKeys) {
        const allele = result[alleleKey];
        if (allele.vcf_string && Array.isArray(allele.vcf_string)) {
          for (const vcfString of allele.vcf_string) {
            if (/^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcfString)) {
              // Format the VCF string for VEP
              const parts = vcfString.replace(/^chr/i, '').split('-');
              if (parts.length === 4) {
                const [chrom, pos, ref, alt] = parts;
                const formattedVariant = `${chrom} ${pos} . ${ref} ${alt} . . .`;
                const standardKey = `${chrom}-${pos}-${ref}-${alt}`; // Create the standard key

                debugDetailed(
                  `processBatchVariants (HGVS Recode): Mapping formatted VEP input '${formattedVariant}' (Key='${standardKey}') back to OrigInput='${originalVariant}'`
                );
                // Store mapping information
                uniqueVcfStrings.push(formattedVariant);
                if (!vcfToOriginalMapping[formattedVariant]) {
                  vcfToOriginalMapping[formattedVariant] = [];
                }
                vcfToOriginalMapping[formattedVariant].push({
                  originalInput: originalVariant,
                  inputFormat: 'HGVS',
                  recoderData: result,
                  alleleKey: alleleKey,
                  vcfString: vcfString,
                  standardKey: standardKey, // Store the key derived from vcfString
                });

                foundValidVcf = true;
              }
            }
          }
        }
      }

      // ** FIX: Handle variants where recoder doesn't return a VCF string **
      if (!foundValidVcf) {
        // Log warning instead of throwing error to allow processing other variants
        console.warn(
          `Warning: No valid VCF string found in Variant Recoder response for variant "${originalVariant}". Skipping.`
        );
        debug(
          `Warning: No valid VCF string found in Variant Recoder response for variant "${originalVariant}". Skipping.`
        );
        // Add a placeholder to annotationData
        annotationData.push({
          originalInput: originalVariant,
          inputFormat: 'HGVS',
          error: 'No valid VCF string from recoder',
          annotationData: [], // Or null/undefined
        });
      }
    }

    // Remove duplicates from uniqueVcfStrings while preserving order
    const uniqueVcfSet = [...new Set(uniqueVcfStrings)];

    // Check if there are any VCF strings left to annotate
    if (uniqueVcfSet.length > 0) {
      // Call VEP with unique formatted VCF strings
      const hgvsAnnotations = await vepRegionsAnnotation(
        uniqueVcfSet,
        params.vepOptions,
        params.cache
      );

      // Associate VEP results with original variants through the mapping
      if (Array.isArray(hgvsAnnotations)) {
        hgvsAnnotations.forEach((annotation, index) => {
          const formattedVariant = uniqueVcfSet[index]; // The VEP input string
          const mappings = vcfToOriginalMapping[formattedVariant]; // Get original variant(s) info

          // For each original variant mapped to this VCF string
          if (mappings) {
            // Ensure mappings exist for this VEP result
            for (const mapping of mappings) {
              // *** DEBUG POINT 7: HGVS Batch Annotation Key Association ***
              // The key should be the one derived from the vcfString
              const key = mapping.standardKey;
              debugDetailed(
                `processBatchVariants (HGVS Annotate): Assigning variantKey='${key}' to annotation for OrigInput='${mapping.originalInput}', VEPInput='${formattedVariant}'`
              );
              annotationData.push({
                originalInput: mapping.originalInput,
                inputFormat: mapping.inputFormat,
                input: formattedVariant, // VEP input format
                variantKey: key, // Use the standardized key from vcfString
                recoderData: mapping.recoderData,
                allele: mapping.alleleKey,
                vcfString: mapping.vcfString,
                ...annotation,
              });
            }
          } else {
            debug(`Warning: No original mapping found for VEP result of '${formattedVariant}'`);
          }
        });
      }
    } else {
      debug('No unique VCF strings derived from HGVS inputs to send to VEP.');
    }
  }
  // *** DEBUG POINT 8: Final Combined Annotation Data (Before Inheritance) ***
  debugDetailed(
    `processBatchVariants: Final combined annotationData before inheritance (count=${annotationData.length}): ${JSON.stringify(annotationData.slice(0, 2))}...`
  );

  return { annotationData };
}

/**
 * Analyzes the given variant(s) by determining format, converting if needed,
 * calling the appropriate APIs, and optionally applying scoring and filtering.
 *
 * @param {Object} params - The analysis parameters.
 * @param {string} [params.variant] - Single variant to analyze. Deprecated, use params.variants.
 * @param {Array<string>} [params.variants] - Array of variants to analyze
 * (VCF or HGVS formats).
 * @param {Object} params.recoderOptions - Options for the Variant Recoder API.
 * @param {Object} params.vepOptions - Options for the VEP API.
 * @param {boolean} params.cache - Whether to enable caching.
 * @param {string} [params.scoringConfigPath] - Path to the scoring configuration (Node only).
 * @param {Object} [params.scoringConfig] - Parsed scoring config JSON (browser usage).
 * @param {string} params.output - Output format
 * ('JSON', 'CSV', or 'SCHEMA' are supported formats).
 * @param {string} [params.filter] - Optional JSON string specifying filtering criteria.
 * @param {Map<string, Object>} [params.pedigreeData] - Pedigree data parsed from PED file
 * containing family relationships and affected status.
 * @param {boolean} [params.calculateInheritance] - Whether to calculate inheritance patterns.
 * @param {Object} [params.sampleMap] - Manual mapping of sample roles if PED not available.
 * @param {Map<string, Object>} [params.vcfRecordMap] - Map from vcfReader containing VCF record data.
 * @param {Array<string>} [params.vcfHeaderLines] - Array of header lines from VCF file.
 * @param {Array<string>} [params.samples] - List of sample IDs from VCF file.
 * @return {Promise<Object>} Result object with meta, variantData, and
 * annotationData properties.
 */
async function analyzeVariant(params) {
  debug('Starting variant analysis process');

  debugDetailed(
    `Received variants (${params.variants?.length || 0}): ${JSON.stringify(params.variants)}`
  );
  debugDetailed(
    `analyzeVariant received params.vcfRecordMap size: ${params.vcfRecordMap ? params.vcfRecordMap.size : 'N/A'}`
  );
  debugDetailed(
    `analyzeVariant received params.pedigreeData keys: ${params.pedigreeData ? JSON.stringify(Array.from(params.pedigreeData.keys())) : 'N/A'}`
  );
  debugDetailed(
    `analyzeVariant received params.calculateInheritance: ${params.calculateInheritance}`
  );

  const processStartTime = new Date();
  const stepsPerformed = [];

  // Handle both single variant and batch variants for backwards compatibility
  // Use variants from VCF input if available, otherwise use other inputs
  // ** FIX: Correctly get variants regardless of input source **
  let variants = [];
  if (params.vcfInput && Array.isArray(params.variants)) {
    // If vcfInput was used, params.variants should contain the CHR-POS-REF-ALT strings from vcfReader
    variants = params.variants;
  } else if (Array.isArray(params.variants)) {
    // If --variants or --variants-file was used
    variants = params.variants;
  } else if (params.variant) {
    // If --variant was used
    variants = [params.variant];
  }

  if (variants.length === 0) {
    throw new Error(
      'No variants provided. Use --variant, --variants, --variants-file, or --vcf-input.'
    );
  }

  // ** FIX: Calculate batchProcessing AFTER variants array is finalized **
  const batchProcessing = variants.length > 1 || Boolean(params.vcfInput); // vcfInput flag makes it batch

  let result;

  // If input is VCF, VEP is called directly, no need for separate recoding step
  if (params.vcfInput) {
    stepsPerformed.push(`Processing ${variants.length} variants from VCF file`);
    // VEP is called directly using the pre-formatted variants
    const formattedVepInput = variants.map((vcfStr) => {
      const [chrom, pos, ref, alt] = vcfStr.split('-');
      return `${chrom} ${pos} . ${ref} ${alt} . . .`;
    });
    const vepAnnotations = await vepRegionsAnnotation(
      formattedVepInput,
      params.vepOptions,
      params.cache
    );
    // Need to associate annotations back to the original CHR-POS-REF-ALT key
    result = { annotationData: [] };
    if (Array.isArray(vepAnnotations)) {
      vepAnnotations.forEach((annotation, index) => {
        const originalKey = variants[index]; // variants contains the CHR-POS-REF-ALT keys
        // *** Explicitly assign variantKey for VCF input path ***
        debugDetailed(
          `analyzeVariant (VCF Input Path): Assigning variantKey='${originalKey}' to annotation.`
        );
        result.annotationData.push({
          originalInput: originalKey,
          inputFormat: 'VCF',
          input: formattedVepInput[index], // VEP input format
          variantKey: originalKey, // Use the standardized key
          ...annotation,
        });
      });
    } else {
      debug('VEP did not return an array for VCF input.');
    }
  } else if (batchProcessing) {
    // Handle batch input from --variants or --variants-file
    stepsPerformed.push(`Processing ${variants.length} variants in batch mode`);
    result = await processBatchVariants(variants, params);
  } else {
    // Single variant processing (for backwards compatibility via --variant)
    stepsPerformed.push('Processing single variant');
    result = await processSingleVariant(variants[0], params);
  }

  // *** DEBUG POINT 9: Annotation Data Before Scoring/Inheritance ***
  debugDetailed(
    `analyzeVariant: Annotation data BEFORE scoring/inheritance (count=${result.annotationData?.length}): ${JSON.stringify(result.annotationData?.slice(0, 2))}...`
  );

  // Optionally apply scoring to annotation data.
  if (params.scoringConfig) {
    // Use the provided JSON configuration.
    result.annotationData = applyScoring(result.annotationData, params.scoringConfig);
    stepsPerformed.push('Applied scoring to annotation data (using provided scoringConfig).');
  } else if (params.scoringConfigPath) {
    // This path requires Node's fs module
    if (typeof require === 'function') {
      // Check if require exists (Node env)
      const { readScoringConfigFromFiles } = require('./scoring');
      const scoringConfig = readScoringConfigFromFiles(params.scoringConfigPath);
      result.annotationData = applyScoring(result.annotationData, scoringConfig);
      stepsPerformed.push('Applied scoring to annotation data (using scoringConfigPath).');
    } else {
      console.warn(
        'Scoring from file path is not supported in this environment (requires Node.js).'
      );
      stepsPerformed.push('Skipped scoring from file path (not supported in this environment).');
    }
  }

  const processEndTime = new Date();
  // ** FIX: Use the correctly calculated batchProcessing variable **

  // *** Add Debugging right before metaInfo creation ***
  debugDetailed(`analyzeVariant: Before metaInfo creation - batchProcessing = ${batchProcessing}`);

  const metaInfo = {
    input: batchProcessing ? variants : variants[0],
    batchSize: variants.length,
    stepsPerformed,
    startTime: processStartTime.toISOString(),
    endTime: processEndTime.toISOString(),
    durationMs: processEndTime - processStartTime,
    batchProcessing, // Use the calculated flag
  };

  // *** Add Debugging right after metaInfo creation ***
  debugDetailed(`analyzeVariant: metaInfo object created: ${JSON.stringify(metaInfo)}`);

  // ** FIX: Construct finalOutput ensuring metaInfo overwrites any previous meta **
  let finalOutput = {
    ...result, // Spread the result from processing (contains annotationData, potentially variantData)
    meta: metaInfo, // Explicitly set the correct meta object
  };

  // Ensure annotationData exists if result didn't provide it (shouldn't happen, but defensive)
  finalOutput.annotationData = finalOutput.annotationData || [];

  // Add VCF data to finalOutput if present in params
  if (params.vcfRecordMap && params.vcfHeaderLines) {
    finalOutput.vcfRecordMap = params.vcfRecordMap;
    finalOutput.vcfHeaderLines = params.vcfHeaderLines;
  }

  // Add pedigree data to finalOutput if present in params
  if (params.pedigreeData) {
    // Convert Map to a serializable object for the output
    const pedigreeObject = {};
    params.pedigreeData.forEach((value, key) => {
      pedigreeObject[key] = value;
    });
    finalOutput.pedigreeData = pedigreeObject;
    stepsPerformed.push('Added pedigree data from PED file.');
  }

  // Calculate inheritance patterns if enabled
  if (params.calculateInheritance) {
    debug('Calculating inheritance patterns for variant annotations');

    // Create a map of variant keys to genotype data
    const genotypesMap = new Map();

    // Build genotypesMap from vcfRecordMap (passed in params for VCF input)
    if (params.vcfRecordMap && params.vcfRecordMap.size > 0) {
      debugDetailed(`Building genotypesMap from provided vcfRecordMap...`);
      for (const [key, recordData] of params.vcfRecordMap.entries()) {
        if (recordData.genotypes && recordData.genotypes.size > 0) {
          genotypesMap.set(key, recordData.genotypes);
          // Debug log added inside loop below for clarity
        } else {
          debugDetailed(` -> No genotype data found in VCF record map entry for variant ${key}`);
        }
      }
    } else {
      // Fallback attempt (might be less reliable if keys aren't standardized yet)
      debugDetailed(`Attempting to build genotypesMap from annotationData (fallback)...`);
      if (!finalOutput || !Array.isArray(finalOutput.annotationData)) {
        debugDetailed(
          'Error: finalOutput.annotationData is not available or not an array before building genotypesMap (fallback).'
        );
      } else {
        for (const annotation of finalOutput.annotationData) {
          const key = annotation.variantKey; // Use the key assigned earlier
          if (key && annotation.genotypes && annotation.genotypes.size > 0) {
            // Assuming genotypes might be attached directly (less likely now)
            genotypesMap.set(key, annotation.genotypes);
          }
        }
      }
    }

    // *** DEBUG POINT 10: Genotypes Map for Inheritance ***
    debugDetailed(
      `analyzeVariant: Built genotypesMap for inheritance (size=${genotypesMap.size}). Keys: ${JSON.stringify(Array.from(genotypesMap.keys()).slice(0, 5))}...`
    );

    // Only proceed if we have genotype data for at least one variant
    if (genotypesMap.size > 0) {
      debug(`Found genotype data for ${genotypesMap.size} variants`);

      // --- Start of new instrumented block ---
      debugDetailed('Inheritance Core: Attempting to require inheritance module...');
      let inheritance;
      try {
        inheritance = require('./inheritance');
        debugDetailed('Inheritance Core: Successfully required inheritance module.');
      } catch (requireError) {
        console.error('!!! FAILED TO REQUIRE inheritance module !!!');
        console.error(requireError.stack);
        debugDetailed(
          `!!! REQUIRE ERROR for inheritance module: ${requireError.message}\n${requireError.stack}`
        );
        stepsPerformed.push('CRITICAL ERROR: Failed to load inheritance module.');
        // Skip further inheritance processing if require failed
        inheritance = null; // Ensure it's null
      }

      if (inheritance && inheritance.analyzeInheritanceForSample) {
        // Index sample ID is now determined internally by the inheritance module
        debugDetailed('Inheritance Core: Index sample ID will be determined by the module');

        debugDetailed('Inheritance Core: Preparing to call analyzeInheritanceForSample...');
        try {
          const inheritanceResults = inheritance.analyzeInheritanceForSample(
            finalOutput.annotationData, // Pass annotations which now should have variantKey
            genotypesMap, // Pass the map built from vcfRecordMap
            params.pedigreeData,
            params.sampleMap
          );
          // *** DEBUG POINT 11: Inheritance Results ***
          debugDetailed(
            `analyzeVariant: Received inheritanceResults (size=${inheritanceResults?.size}). Keys: ${JSON.stringify(Array.from(inheritanceResults?.keys() || []).slice(0, 5))}...`
          );

          // Update annotations with inheritance results
          let calculatedPatternsCount = 0;
          if (inheritanceResults instanceof Map) {
            // *** DEBUG POINT 12: Merging Inheritance Results ***
            debugDetailed(
              `analyzeVariant: Merging inheritance results into ${finalOutput.annotationData?.length} annotations...`
            );
            for (const annotation of finalOutput.annotationData) {
              const keyToLookup = annotation.variantKey; // Use the key assigned earlier
              if (keyToLookup && inheritanceResults.has(keyToLookup)) {
                const inheritanceData = inheritanceResults.get(keyToLookup);
                annotation.deducedInheritancePattern = inheritanceData;
                debugDetailed(
                  ` -> Merged inheritance for Key='${keyToLookup}': ${JSON.stringify(inheritanceData)}`
                );
                calculatedPatternsCount++;
              } else {
                debugDetailed(
                  ` -> No inheritance result found for Key='${keyToLookup}' (Annotation Input: ${annotation.originalInput || annotation.input})`
                );
                annotation.deducedInheritancePattern = {
                  prioritizedPattern: 'unknown_not_processed',
                  possiblePatterns: [],
                  segregationStatus: {},
                };
              }
            }
            if (calculatedPatternsCount > 0) {
              stepsPerformed.push(
                `Analyzed ${calculatedPatternsCount} variants (including compound heterozygous).`
              );
            } else if (finalOutput.annotationData.length > 0) {
              stepsPerformed.push(
                'Inheritance patterns calculated, but no results matched annotations.'
              );
            }
          } else {
            debugDetailed('Inheritance Core: analyzeInheritanceForSample did not return a Map.');
            stepsPerformed.push(
              'Error: Inheritance analysis function returned unexpected data type.'
            );
            for (const annotation of finalOutput.annotationData) {
              annotation.deducedInheritancePattern = {
                prioritizedPattern: 'error_unexpected_result_type',
                possiblePatterns: [],
                segregationStatus: {},
              };
            }
          }
        } catch (analysisError) {
          console.error('Error during inheritance analysis:', analysisError);
          debugDetailed(`Inheritance analysis error: ${analysisError.message}`);
          stepsPerformed.push('Error during inheritance pattern analysis.');
          for (const annotation of finalOutput.annotationData) {
            annotation.deducedInheritancePattern = {
              prioritizedPattern: 'error_analysis_failed',
              possiblePatterns: [],
              segregationStatus: {},
            };
          }
        }
      } else if (inheritance) {
        // Handle case where module loaded but function is missing
        debugDetailed(
          '!!! ERROR: inheritance module loaded, but analyzeInheritanceForSample function not found!'
        );
        stepsPerformed.push('CRITICAL ERROR: Inheritance analysis function missing.');
      }
    } else {
      stepsPerformed.push('No inheritance patterns could be calculated (missing genotype data).');
    }
  }

  // *** DEBUG POINT 13: Final Annotation Data Before Formatting ***
  debugDetailed(
    `analyzeVariant: Final annotationData BEFORE formatting (count=${finalOutput.annotationData?.length}). Check for deducedInheritancePattern: ${JSON.stringify(finalOutput.annotationData?.slice(0, 2))}...`
  );

  if (params.output && params.output.toUpperCase() === 'SCHEMA') {
    finalOutput = mapOutputToSchemaOrg(finalOutput);
    addCustomFormats();
    validateSchemaOrgOutput(finalOutput, '../schema/variant_annotation.schema.json');
    stepsPerformed.push('Schema.org output validated successfully.');
  }

  let filterParam;
  if (params.filter) {
    try {
      filterParam = JSON.parse(params.filter);
    } catch (err) {
      throw new Error(`Invalid filter JSON string: ${err.message}`);
    }
    stepsPerformed.push('Applied filtering to results.');
  }

  // Apply formatting based on output format
  const outputFormat = params.output ? params.output.toUpperCase() : 'JSON';
  if (['CSV', 'TSV', 'VCF'].includes(outputFormat)) {
    // *** DEBUG POINT 14: Data Passed to VCF Formatter ***
    if (outputFormat === 'VCF') {
      debugDetailed(`analyzeVariant: Passing data to filterAndFormatResults for VCF output.`);
      debugDetailed(` -> annotationData count: ${finalOutput.annotationData?.length}`);
      debugDetailed(` -> vcfRecordMap size: ${finalOutput.vcfRecordMap?.size}`);
      debugDetailed(` -> vcfHeaderLines count: ${finalOutput.vcfHeaderLines?.length}`);
    }
    // For CSV/TSV/VCF, return the formatted string directly
    return filterAndFormatResults(finalOutput, filterParam, outputFormat);
  } else if (outputFormat === 'JSON' && filterParam) {
    // For JSON with filtering, parse the formatted JSON string back to an object
    finalOutput = JSON.parse(filterAndFormatResults(finalOutput, filterParam, 'JSON'));
  }

  // *** Add Debugging right before returning finalOutput ***
  debugDetailed(
    `analyzeVariant: Returning finalOutput. meta.batchProcessing = ${finalOutput?.meta?.batchProcessing}`
  );
  return finalOutput;
}

module.exports = {
  analyzeVariant,
  detectInputFormat,
};
