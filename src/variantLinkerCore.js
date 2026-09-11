// src/variantLinkerCore.js
/**
 * @fileoverview Core logic for variant analysis.
 * This module encapsulates the processing steps so that it can be used both in the CLI
 * and via the web bundle.
 * @module variantLinkerCore
 */
'use strict';

const { detectInputFormat, hasTranscriptVersion, stripTranscriptVersion } = require('./core/input');
const { processSingleVariant } = require('./core/singleVariant');
const { processBatchVariants } = require('./core/batchVariants');
const { performLiftover } = require('./core/liftover');
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
const { annotateOverlaps } = require('./featureAnnotator');

const { alignResponses } = require('./core/responseMatching');
const debug = require('debug')('variant-linker:core');
const debugDetailed = require('debug')('variant-linker:detailed');

/** @param {import('./analysisTypes').AnalysisParams} params
 * @returns {Promise<import('./analysisTypes').AnalysisResult|string>} */
async function analyzeVariant(params) {
  params = {
    ...params,
    requestOptions: {
      ...params.requestOptions,
      assembly:
        params.assembly === 'hg19tohg38'
          ? 'hg38'
          : params.assembly || params.requestOptions?.assembly || 'hg38',
    },
  };
  debug('Starting variant analysis process');

  if (debugDetailed.enabled)
    debugDetailed(
      `Received variants (${params.variants?.length || 0}): ${JSON.stringify(params.variants)}`
    );
  debugDetailed(
    `analyzeVariant received params.vcfRecordMap size: ${params.vcfRecordMap ? params.vcfRecordMap.size : 'N/A'}`
  );
  if (debugDetailed.enabled)
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
  /** @type {string[]} */
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

  // Handle liftover mode for hg19tohg38
  if (params.assembly === 'hg19tohg38') {
    stepsPerformed.push('Starting liftover from hg19 to hg38');
    const { liftedVariants, liftoverMeta, originalToLiftedMap } = await performLiftover(
      variants,
      params.cache,
      params.requestOptions
    );

    // Overwrite the variants list with the successfully lifted ones
    variants = liftedVariants;
    if (variants.length === 0)
      throw new Error('No variants could be lifted to the target assembly');

    // Attach liftover metadata to be included in the final output
    params.liftoverMeta = liftoverMeta;
    params.originalToLiftedMap = originalToLiftedMap;

    debug(`Liftover completed: ${liftedVariants.length} variants successfully lifted to GRCh38`);
    stepsPerformed.push(`Successfully lifted ${liftedVariants.length} variants to GRCh38`);
  }

  /** @type {import('./analysisTypes').ProcessingResult} */
  let result;
  let inheritanceCalculated = false; // Flag to track if inheritance was run

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
      params.cache,
      params.proxyConfig,
      params.requestOptions
    );
    // Need to associate annotations back to the original CHR-POS-REF-ALT key
    result = { annotationData: [] };
    if (Array.isArray(vepAnnotations)) {
      alignResponses(vepAnnotations, formattedVepInput).forEach((annotation, index) => {
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
    result = await processBatchVariants(variants, params, {
      variantRecoderPost,
      vepRegionsAnnotation,
    });
  } else {
    // Single variant processing (for backwards compatibility via --variant)
    stepsPerformed.push('Processing single variant');
    result = await processSingleVariant(variants[0], params, {
      variantRecoder,
      vepRegionsAnnotation,
    });
  }

  // *** DEBUG POINT 9: Annotation Data Before Scoring/Inheritance ***
  if (debugDetailed.enabled)
    debugDetailed(
      `analyzeVariant: Annotation data BEFORE scoring/inheritance ` +
        `(count=${result.annotationData?.length}): ${JSON.stringify(result.annotationData?.slice(0, 2))}...`
    );

  // Preserve original record/genotype identity across assembly conversion.
  if (params.originalToLiftedMap) {
    result.annotationData = result.annotationData.map((annotation) => ({
      ...annotation,
      originalVariantKey:
        params.originalToLiftedMap?.[annotation.variantKey || ''] || annotation.variantKey,
    }));
  }
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

  // Calculate inheritance patterns if enabled
  if (params.calculateInheritance) {
    debug('Calculating inheritance patterns for variant annotations');
    inheritanceCalculated = true; // Mark that we attempted calculation

    // Create a map of variant keys to genotype data
    const genotypesMap = new Map();

    // Build genotypesMap from vcfRecordMap (passed in params for VCF input)
    if (params.vcfRecordMap && params.vcfRecordMap.size > 0) {
      debugDetailed(`Building genotypesMap from provided vcfRecordMap...`);
      for (const [key, recordData] of params.vcfRecordMap.entries()) {
        if (recordData.genotypes && recordData.genotypes.size > 0) {
          genotypesMap.set(key, recordData.genotypes);
          for (const [lifted, original] of Object.entries(params.originalToLiftedMap || {})) {
            if (original === key) genotypesMap.set(lifted, recordData.genotypes);
          }
          // Debug log added inside loop below for clarity
        } else {
          debugDetailed(` -> No genotype data found in VCF record map entry for variant ${key}`);
        }
      }
    } else {
      // Fallback attempt (might be less reliable if keys aren't standardized yet)
      debugDetailed(`Attempting to build genotypesMap from annotationData (fallback)...`);
      if (!result || !Array.isArray(result.annotationData)) {
        // Use result here
        debugDetailed(
          'Error: result.annotationData is not available or not an array before building genotypesMap (fallback).'
        );
      } else {
        for (const annotation of result.annotationData) {
          const key = annotation.variantKey; // Use the key assigned earlier
          if (key && annotation.genotypes instanceof Map && annotation.genotypes.size > 0) {
            // Assuming genotypes might be attached directly (less likely now)
            genotypesMap.set(key, annotation.genotypes);
          }
        }
      }
    }

    // *** DEBUG POINT 10: Genotypes Map for Inheritance ***
    if (debugDetailed.enabled)
      debugDetailed(
        `analyzeVariant: Built genotypesMap for inheritance (size=${genotypesMap.size}). ` +
          `Keys: ${JSON.stringify(Array.from(genotypesMap.keys()).slice(0, 5))}...`
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
        console.error(requireError);
        debugDetailed(`!!! REQUIRE ERROR for inheritance module: ${String(requireError)}`);
        stepsPerformed.push('CRITICAL ERROR: Failed to load inheritance module.');
        // Skip further inheritance processing if require failed
        inheritance = null; // Ensure it's null
        inheritanceCalculated = false; // Mark calculation as failed/skipped
      }

      if (inheritance && inheritance.analyzeInheritanceForSample) {
        // Index sample ID is now determined internally by the inheritance module
        debugDetailed('Inheritance Core: Index sample ID will be determined by the module');

        debugDetailed('Inheritance Core: Preparing to call analyzeInheritanceForSample...');
        try {
          const inheritanceResults = inheritance.analyzeInheritanceForSample(
            result.annotationData, // Pass annotations which now should have variantKey
            genotypesMap, // Pass the map built from vcfRecordMap
            params.pedigreeData || null,
            params.sampleMap || null
          );
          // *** DEBUG POINT 11: Inheritance Results ***
          if (debugDetailed.enabled)
            debugDetailed(
              `analyzeVariant: Received inheritanceResults (size=${inheritanceResults?.size}). ` +
                `Keys: ${JSON.stringify(Array.from(inheritanceResults?.keys() || []).slice(0, 5))}...`
            );

          // Update annotations with inheritance results
          let calculatedPatternsCount = 0;
          if (inheritanceResults instanceof Map) {
            // *** DEBUG POINT 12: Merging Inheritance Results ***
            debugDetailed(
              `analyzeVariant: Merging inheritance results into ${result.annotationData?.length} annotations...`
            );
            for (const annotation of result.annotationData) {
              const keyToLookup = annotation.variantKey; // Use the key assigned earlier
              if (keyToLookup && inheritanceResults.has(keyToLookup)) {
                const inheritanceData = inheritanceResults.get(keyToLookup);
                annotation.deducedInheritancePattern = inheritanceData;
                if (debugDetailed.enabled)
                  debugDetailed(
                    ` -> Merged inheritance for Key='${keyToLookup}': ${JSON.stringify(inheritanceData)}`
                  );
                calculatedPatternsCount++;
              } else {
                debugDetailed(
                  ` -> No inheritance result found for Key='${keyToLookup}' ` +
                    `(Annotation Input: ${annotation.originalInput || annotation.input})`
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
                `Analyzed inheritance for ${calculatedPatternsCount} variants (including compound heterozygous).`
              );
            } else if (result.annotationData.length > 0) {
              stepsPerformed.push(
                'Inheritance patterns calculated, but no results matched annotations.'
              );
            }
          } else {
            debugDetailed('Inheritance Core: analyzeInheritanceForSample did not return a Map.');
            stepsPerformed.push(
              'Error: Inheritance analysis function returned unexpected data type.'
            );
            inheritanceCalculated = false; // Mark as failed
            for (const annotation of result.annotationData) {
              annotation.deducedInheritancePattern = {
                prioritizedPattern: 'error_unexpected_result_type',
                possiblePatterns: [],
                segregationStatus: {},
              };
            }
          }
        } catch (analysisError) {
          console.error('Error during inheritance analysis:', analysisError);
          debugDetailed(`Inheritance analysis error: ${String(analysisError)}`);
          stepsPerformed.push('Error during inheritance pattern analysis.');
          inheritanceCalculated = false; // Mark as failed
          for (const annotation of result.annotationData) {
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
        inheritanceCalculated = false; // Mark as failed
      }
    } else {
      stepsPerformed.push('No inheritance patterns could be calculated (missing genotype data).');
      inheritanceCalculated = false; // Mark calculation as skipped/failed
    }
  }

  // Annotate variants with user-provided features if available
  if (params.features) {
    debug('Annotating overlaps with user-provided features');
    stepsPerformed.push('Annotating overlaps with user-provided features.');
    result.annotationData = annotateOverlaps(result.annotationData, params.features);
    debug('Feature overlap annotation completed');
  }

  const processEndTime = new Date();
  /** @type {import('./analysisTypes').Metadata} */
  const metaInfo = {
    inputFormat: result.inputFormat || (params.vcfInput ? 'VCF' : 'mixed'),
    recoderCalled: variants.some((variant) => detectInputFormat(variant) === 'HGVS'),
    input: batchProcessing ? variants : variants[0],
    batchSize: variants.length,
    stepsPerformed,
    startTime: processStartTime.toISOString(),
    endTime: processEndTime.toISOString(),
    durationMs: processEndTime.getTime() - processStartTime.getTime(),
    batchProcessing, // Use the calculated flag
    inheritanceCalculated, // Add the flag here
  };

  // Destructure result to exclude transcriptVersionFallback from top-level spreading
  const { transcriptVersionFallback, ...resultWithoutFallback } = result;

  /** @type {import('./analysisTypes').AnalysisResult} */
  let finalOutput = {
    ...resultWithoutFallback, // Spread the result from processing (contains annotationData, potentially variantData)
    meta: metaInfo, // Explicitly set the correct meta object
  };

  // Ensure annotationData exists if result didn't provide it
  finalOutput.annotationData = finalOutput.annotationData || [];

  // Add liftover metadata if present
  if (params.liftoverMeta) {
    finalOutput.meta.liftoverMeta = params.liftoverMeta;
    debug('Added liftover metadata to final output');
  }

  // Add transcript version fallback metadata if present
  if (transcriptVersionFallback) {
    finalOutput.meta.transcriptVersionFallback = transcriptVersionFallback;
    debug('Added transcript version fallback metadata to final output');
  }

  // Replace originalInput with user's original hg19 variant strings if liftover was performed
  if (params.originalToLiftedMap && finalOutput.annotationData) {
    finalOutput.annotationData = finalOutput.annotationData.map((annotation) => {
      // Check if this annotation corresponds to a lifted variant
      const liftedVariant = annotation.variantKey || annotation.input;
      if (params.originalToLiftedMap?.[liftedVariant || '']) {
        // Replace the originalInput with the user's original hg19 input
        return {
          ...annotation,
          originalInput: params.originalToLiftedMap?.[liftedVariant || ''],
          liftedFrom: liftedVariant, // Keep track of what it was lifted from
        };
      }
      return annotation;
    });
    debug("Updated originalInput fields with user's original hg19 variants");
  }

  // Add VCF data to finalOutput if present in params
  if (params.vcfRecordMap && params.vcfHeaderLines) {
    finalOutput.vcfRecordMap = params.vcfRecordMap;
    finalOutput.vcfHeaderLines = params.vcfHeaderLines;
  }

  // Add pedigree data to finalOutput if present in params
  if (params.pedigreeData) {
    // Convert Map to a serializable object for the output
    /** @type {Record<string, import('./dataTypes').PedigreeMember>} */
    const pedigreeObject = {};
    params.pedigreeData.forEach((value, key) => {
      pedigreeObject[key] = value;
    });
    finalOutput.pedigreeData = pedigreeObject;
    // stepsPerformed already includes PED message from main.js
  }

  // *** DEBUG POINT 13: Final Annotation Data Before Formatting ***
  if (debugDetailed.enabled)
    debugDetailed(
      `analyzeVariant: Final annotationData BEFORE formatting ` +
        `(count=${finalOutput.annotationData?.length}). ` +
        `Check for deducedInheritancePattern: ${JSON.stringify(finalOutput.annotationData?.slice(0, 2))}...`
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
      throw new Error(`Invalid filter JSON string: ${String(err)}`, { cause: err });
    }
    stepsPerformed.push('Applied filtering to results.');
  }

  // Apply formatting based on output format
  const outputFormat = params.output ? params.output.toUpperCase() : 'JSON';
  if (['CSV', 'TSV', 'VCF'].includes(outputFormat) && !params.isStreaming) {
    // *** DEBUG POINT 14: Data Passed to VCF Formatter ***
    if (outputFormat === 'VCF') {
      debugDetailed(`analyzeVariant: Passing data to filterAndFormatResults for VCF output.`);
      debugDetailed(` -> annotationData count: ${finalOutput.annotationData?.length}`);
      debugDetailed(` -> vcfRecordMap size: ${finalOutput.vcfRecordMap?.size}`);
      debugDetailed(` -> vcfHeaderLines count: ${finalOutput.vcfHeaderLines?.length}`);
    }
    // For CSV/TSV/VCF, return the formatted string directly (only in non-streaming mode)
    const formatted = filterAndFormatResults(finalOutput, filterParam, outputFormat, params);
    if (typeof formatted !== 'string') throw new Error('Expected complete formatted output');
    return formatted;
  } else if (['JSON', 'SCHEMA'].includes(outputFormat) && (filterParam || params.pickOutput)) {
    // For JSON with filtering or pick output, parse the formatted JSON string back to an object
    const formatted = filterAndFormatResults(finalOutput, filterParam, 'JSON', params);
    if (typeof formatted !== 'string') throw new Error('Expected JSON output');
    finalOutput = JSON.parse(formatted);
  }

  // *** Add Debugging right before returning finalOutput ***
  debugDetailed(
    `analyzeVariant: Returning finalOutput. ` +
      `meta.inheritanceCalculated = ${finalOutput?.meta?.inheritanceCalculated}, ` +
      `meta.batchProcessing = ${finalOutput?.meta?.batchProcessing}`
  );
  return finalOutput;
}

module.exports = {
  analyzeVariant,
  detectInputFormat,
  hasTranscriptVersion,
  stripTranscriptVersion,
};
