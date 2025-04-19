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
 * @param {string} [params.variant] - Single variant input (VCF/HGVS) - for backwards compatibility.
 * @param {Array<string>} [params.variants] - An array of variant inputs
 * (VCF or HGVS formats).
 * @param {Object} params.recoderOptions - Options for the Variant Recoder API.
 * @param {Object} params.vepOptions - Options for the VEP API.
 * @param {boolean} params.cache - Whether to enable caching.
 * @param {string} [params.scoringConfigPath] - Path to the scoring configuration (Node only).
 * @param {Object} [params.scoringConfig] - Parsed scoring config JSON (browser usage).
 * @param {string} params.output - Output format
 * ('JSON', 'CSV', or 'SCHEMA' are supported formats).
 * @param {string} [params.filter] - Optional JSON string specifying filtering criteria.
 * @return {Promise<Object>} Result object with meta, variantData, and
 * annotationData properties.
 */
async function analyzeVariant(params) {
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
  if (['CSV', 'TSV'].includes(outputFormat)) {
    // For CSV/TSV, return the formatted string directly
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
