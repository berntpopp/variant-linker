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
    annotationData = await vepRegionsAnnotation(
      [formattedVariant],
      params.vepOptions,
      params.cache
    );
  } else {
    variantData = await variantRecoder(variant, params.recoderOptions, params.cache);
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
    annotationData = await vepRegionsAnnotation(
      [formattedVariant],
      params.vepOptions,
      params.cache
    );
  }

  // Add input info to each annotation
  if (Array.isArray(annotationData)) {
    annotationData = annotationData.map((ann) => ({
      originalInput: variant,
      inputFormat,
      input: inputInfo,
      ...ann,
    }));
  } else {
    annotationData = [
      {
        originalInput: variant,
        inputFormat,
        input: inputInfo,
        ...annotationData,
      },
    ];
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
        const originalVariant = vcfVariants[index];
        const mappingInfo = variantMapping[originalVariant];

        annotationData.push({
          originalInput: originalVariant,
          inputFormat: 'VCF',
          input: mappingInfo.formattedVariant,
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
                });

                foundValidVcf = true;
              }
            }
          }
        }
      }

      if (!foundValidVcf) {
        throw new Error(
          `No valid VCF string found in Variant Recoder response for variant "${originalVariant}"`
        );
      }
    }

    // Remove duplicates from uniqueVcfStrings while preserving order
    const uniqueVcfSet = [...new Set(uniqueVcfStrings)];

    // Call VEP with unique formatted VCF strings
    const hgvsAnnotations = await vepRegionsAnnotation(
      uniqueVcfSet,
      params.vepOptions,
      params.cache
    );

    // Associate VEP results with original variants through the mapping
    if (Array.isArray(hgvsAnnotations)) {
      hgvsAnnotations.forEach((annotation, index) => {
        const formattedVariant = uniqueVcfSet[index];
        const mappings = vcfToOriginalMapping[formattedVariant];

        // For each original variant mapped to this VCF string
        for (const mapping of mappings) {
          annotationData.push({
            originalInput: mapping.originalInput,
            inputFormat: mapping.inputFormat,
            input: formattedVariant,
            recoderData: mapping.recoderData,
            allele: mapping.alleleKey,
            vcfString: mapping.vcfString,
            ...annotation,
          });
        }
      });
    }
  }

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
  const variants = params.variants || (params.variant ? [params.variant] : []);

  if (variants.length === 0) {
    throw new Error('No variants provided. Use either params.variant or params.variants.');
  }

  let result;
  const batchProcessing = variants.length > 1;

  if (batchProcessing) {
    stepsPerformed.push(`Processing ${variants.length} variants in batch mode`);
    result = await processBatchVariants(variants, params);
  } else {
    // Single variant processing (for backwards compatibility)
    stepsPerformed.push('Processing single variant');
    result = await processSingleVariant(variants[0], params);
  }

  // Optionally apply scoring to annotation data.
  if (params.scoringConfig) {
    // Use the provided JSON configuration.
    result.annotationData = applyScoring(result.annotationData, params.scoringConfig);
    stepsPerformed.push('Applied scoring to annotation data (using provided scoringConfig).');
  } else if (params.scoringConfigPath) {
    const { readScoringConfigFromFiles } = require('./scoring');
    const scoringConfig = readScoringConfigFromFiles(params.scoringConfigPath);
    result.annotationData = applyScoring(result.annotationData, scoringConfig);
    stepsPerformed.push('Applied scoring to annotation data (using scoringConfigPath).');
  }

  const processEndTime = new Date();
  const metaInfo = {
    input: batchProcessing ? variants : variants[0],
    batchSize: variants.length,
    stepsPerformed,
    startTime: processStartTime.toISOString(),
    endTime: processEndTime.toISOString(),
    durationMs: processEndTime - processStartTime,
    batchProcessing,
  };

  let finalOutput = {
    meta: metaInfo,
    variantData: result.variantData,
    annotationData: result.annotationData,
  };

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

    // Ensure finalOutput.annotationData is populated before this loop
    if (!finalOutput || !Array.isArray(finalOutput.annotationData)) {
      debugDetailed(
        'Error: finalOutput.annotationData is not available or not an array before building genotypesMap.'
      );
    } else {
      debugDetailed(`Starting to build genotypesMap for inheritance...`);
      debugDetailed(
        `Iterating through ${finalOutput.annotationData.length} annotations to build genotypesMap.`
      );
      for (const annotation of finalOutput.annotationData) {
        try {
          // Regenerate key based on annotation details from VEP response
          const chrom = annotation.seq_region_name || annotation.chr || '';
          const pos = annotation.start || '';
          // REF/ALT from allele_string might be more reliable post-VEP
          const alleleParts = annotation.allele_string ? annotation.allele_string.split('/') : [];
          const ref = alleleParts[0] || '';
          const alt = alleleParts[1] || '';

          if (!chrom || !pos || !ref || !alt) {
            debugDetailed(
              `Missing components: chr=${chrom}, pos=${pos}, ref=${ref}, alt=${alt}. ` +
                `Input: ${annotation?.input}`
            );
            continue;
          }

          const key = `${chrom}:${pos}:${ref}:${alt}`;
          // Make sure variantKey is consistently set
          annotation.variantKey = key;
          debugDetailed(
            `Key: ${key}. Input: ${annotation?.input}. ` + `Original: ${annotation?.originalInput}`
          );

          if (params.vcfRecordMap && params.vcfRecordMap.has(key)) {
            const vcfRecord = params.vcfRecordMap.get(key);
            debugDetailed(
              `VCF record ${key}: Has genotypes = ${Boolean(vcfRecord.genotypes?.size)}`
            );

            if (vcfRecord.genotypes && vcfRecord.genotypes.size > 0) {
              genotypesMap.set(key, vcfRecord.genotypes);
              debugDetailed(
                `-> Genotypes ${key}: ${JSON.stringify(Array.from(vcfRecord.genotypes.entries()))}`
              );
            } else {
              debugDetailed(`-> No genotype data found in VCF record map entry for variant ${key}`);
            }
          } else {
            // Log details about why the key might be missing
            const mapKeys = params.vcfRecordMap ? Array.from(params.vcfRecordMap.keys()) : [];
            debugDetailed(
              `-> VCF record NOT found for key ${key}. vcfRecordMap size: ${params.vcfRecordMap ? params.vcfRecordMap.size : 'N/A'}. Map keys sample: ${mapKeys.slice(0, 5).join(', ')}...`
            );
          }
        } catch (error) {
          debugDetailed(
            `Error preparing variant key or getting genotypes for an annotation: ${error.message}`
          );
        }
      }
      debugDetailed(`Finished building genotypesMap. Final Size: ${genotypesMap.size}`);
    }

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
            finalOutput.annotationData,
            genotypesMap,
            params.pedigreeData,
            params.sampleMap
          );
          debugDetailed(`Inheritance analysis complete. Results: ${inheritanceResults?.size}`);

          // Update annotations with inheritance results
          let calculatedPatternsCount = 0;
          if (inheritanceResults instanceof Map) {
            for (const annotation of finalOutput.annotationData) {
              if (annotation.variantKey && inheritanceResults.has(annotation.variantKey)) {
                annotation.deducedInheritancePattern = inheritanceResults.get(
                  annotation.variantKey
                );
                calculatedPatternsCount++;
              } else {
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
    // For CSV/TSV/VCF, return the formatted string directly
    return filterAndFormatResults(finalOutput, filterParam, outputFormat);
  } else if (outputFormat === 'JSON' && filterParam) {
    // For JSON with filtering, parse the formatted JSON string back to an object
    finalOutput = JSON.parse(filterAndFormatResults(finalOutput, filterParam, 'JSON'));
  }

  return finalOutput;
}

module.exports = {
  analyzeVariant,
  detectInputFormat,
};
