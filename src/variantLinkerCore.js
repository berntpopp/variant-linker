// src/variantLinkerCore.js
/**
 * @fileoverview Core logic for variant analysis.
 * This module encapsulates the processing steps so that it can be used both in the CLI and via the web bundle.
 * @module variantLinkerCore
 */
'use strict';

const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const { readScoringConfigFromFiles, applyScoring } = require('./scoring');
const { mapOutputToSchemaOrg, validateSchemaOrgOutput, addCustomFormats } = require('./schemaMapper');
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
 * Analyzes the given variant by determining its format, converting if needed,
 * calling the appropriate APIs, and optionally applying scoring and filtering.
 *
 * @param {Object} params - The analysis parameters.
 * @param {string} params.variant - The variant input (VCF or HGVS).
 * @param {Object} params.recoderOptions - Options for the Variant Recoder API.
 * @param {Object} params.vepOptions - Options for the VEP API.
 * @param {boolean} params.cache - Whether to enable caching.
 * @param {string} [params.scoringConfigPath] - Path to the scoring configuration (Node only).
 * @param {Object} [params.scoringConfig] - Already parsed scoring configuration JSON (for browser usage).
 * @param {string} params.output - Output format ('JSON', 'CSV', or 'SCHEMA').
 * @param {string} [params.filter] - Optional JSON string specifying filtering criteria.
 * @return {Promise<Object>} The result object containing meta, variantData, and annotationData.
 */
async function analyzeVariant(params) {
  const processStartTime = new Date();
  const stepsPerformed = [];

  const inputFormat = detectInputFormat(params.variant);
  stepsPerformed.push(`Input format detected: ${inputFormat}`);

  let variantData = null;
  let annotationData;
  let inputInfo = '';

  if (inputFormat === 'VCF') {
    const parts = params.variant.trim().split('-');
    if (parts.length !== 4) {
      throw new Error('Invalid VCF format: expected "chromosome-start-ref-alt"');
    }
    const [chrom, pos, ref, alt] = parts;
    const formattedVariant = `${chrom} ${pos} . ${ref} ${alt} . . .`;
    stepsPerformed.push(`Converted VCF input to POST format: ${formattedVariant}`);
    inputInfo = formattedVariant;
    annotationData = await vepRegionsAnnotation([formattedVariant], params.vepOptions, params.cache);
    stepsPerformed.push('Retrieved VEP annotations via POST');
  } else {
    variantData = await variantRecoder(params.variant, params.recoderOptions, params.cache);
    stepsPerformed.push('Called Variant Recoder');
    const firstKey = Object.keys(variantData[0])[0];
    const recoderEntry = variantData[0][firstKey];
    if (!recoderEntry || !recoderEntry.vcf_string || !Array.isArray(recoderEntry.vcf_string)) {
      throw new Error('Variant Recoder response is missing a valid vcf_string array');
    }
    const vcfString = recoderEntry.vcf_string.find((vcf) =>
      /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcf)
    );
    if (!vcfString) {
      throw new Error('No valid VCF string found in Variant Recoder response');
    }
    stepsPerformed.push('Extracted VCF string from Variant Recoder response');
    const parts = vcfString.replace(/^chr/i, '').split('-');
    if (parts.length !== 4) {
      throw new Error('Invalid VCF format from Variant Recoder');
    }
    const [chrom, pos, ref, alt] = parts;
    const formattedVariant = `${chrom} ${pos} . ${ref} ${alt} . . .`;
    stepsPerformed.push(`Converted extracted VCF to POST format: ${formattedVariant}`);
    inputInfo = formattedVariant;
    annotationData = await vepRegionsAnnotation([formattedVariant], params.vepOptions, params.cache);
    stepsPerformed.push('Retrieved VEP annotations via POST');
  }

  // Optionally apply scoring.
  if (params.scoringConfig) {
    // Use the provided JSON configuration.
    annotationData = applyScoring(annotationData, params.scoringConfig);
    stepsPerformed.push('Applied scoring to annotation data (using provided scoringConfig).');
  } else if (params.scoringConfigPath) {
    const { readScoringConfigFromFiles } = require('./scoring');
    const scoringConfig = readScoringConfigFromFiles(params.scoringConfigPath);
    annotationData = applyScoring(annotationData, scoringConfig);
    stepsPerformed.push('Applied scoring to annotation data (using scoringConfigPath).');
  }

  // Add input info to each annotation.
  if (Array.isArray(annotationData)) {
    annotationData = annotationData.map((ann) => ({ input: inputInfo, ...ann }));
  } else {
    annotationData = [{ input: inputInfo, ...annotationData }];
  }

  const processEndTime = new Date();
  const metaInfo = {
    input: params.variant,
    inputFormat,
    stepsPerformed,
    startTime: processStartTime.toISOString(),
    endTime: processEndTime.toISOString(),
    durationMs: processEndTime - processStartTime,
    recoderCalled: inputFormat === 'HGVS'
  };

  let finalOutput = {
    meta: metaInfo,
    variantData,
    annotationData
  };

  if (params.output && params.output.toUpperCase() === 'SCHEMA') {
    finalOutput = mapOutputToSchemaOrg(finalOutput);
    addCustomFormats();
    validateSchemaOrgOutput(finalOutput, '../schema/variant_annotation.schema.json');
    stepsPerformed.push('Schema.org output validated successfully.');
  }

  if (params.filter) {
    let filterParam;
    try {
      filterParam = JSON.parse(params.filter);
    } catch (err) {
      throw new Error(`Invalid filter JSON string: ${err.message}`);
    }
    finalOutput = JSON.parse(filterAndFormatResults(finalOutput, filterParam, 'JSON'));
    stepsPerformed.push('Applied filtering to results.');
  }

  return finalOutput;
}

module.exports = {
  analyzeVariant,
  detectInputFormat,
};
