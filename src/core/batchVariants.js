'use strict';
const {
  detectInputFormat,
  formatCoordinateVariant,
  recodedVariants,
  errorMessage,
} = require('./input');
const { alignResponses } = require('./responseMatching');
/** @typedef {{index: number, originalInput: string, inputFormat: string, formattedVariant: string,
 * standardKey: string, recoderData?: import('../dataTypes').Annotation, vcfString: string,
 * vcfInfo?: {END: number, SVTYPE: string}, allele?: string}} PendingVariant */
/** Acquire batches by echoed identity, with ordered outcomes for every original input.
 * @param {string[]} variants
 * @param {import('../analysisTypes').AnalysisParams} params
 * @param {{variantRecoderPost: typeof import('../variantRecoderPost'), vepRegionsAnnotation: typeof import('../vepRegionsAnnotation')}} dependencies
 * @returns {Promise<import('../analysisTypes').ProcessingResult>}
 */
async function processBatchVariants(variants, params, dependencies) {
  /** @type {import('../dataTypes').Annotation[][]} */
  const outcomes = variants.map(() => []);
  /** @type {PendingVariant[]} */
  const pending = [];
  /** @type {{variant: string, index: number}[]} */
  const hgvs = [];
  /** @param {number} index @param {string} inputFormat @param {unknown} error */
  const failed = (index, inputFormat, error) => {
    outcomes[index].push({
      originalInput: variants[index],
      input: variants[index],
      variantKey: variants[index],
      inputFormat,
      error: errorMessage(error),
      transcript_consequences: [],
    });
  };
  variants.forEach((variant, index) => {
    let inputFormat = 'HGVS';
    try {
      inputFormat = detectInputFormat(variant);
      if (inputFormat === 'HGVS') hgvs.push({ variant, index });
      else
        pending.push({
          ...formatCoordinateVariant(variant),
          index,
          originalInput: variant,
          inputFormat,
        });
    } catch (error) {
      failed(index, inputFormat, error);
    }
  });
  if (hgvs.length) {
    const unique = [...new Set(hgvs.map((entry) => entry.variant))];
    const responses = await dependencies.variantRecoderPost(
      unique,
      params.recoderOptions,
      params.cache,
      params.proxyConfig,
      params.requestOptions
    );
    const recoderByInput = new Map(
      alignResponses(responses, unique, true).map((entry, index) => [unique[index], entry])
    );
    for (const { variant, index } of hgvs) {
      const result = recoderByInput.get(variant);
      try {
        for (const coordinate of recodedVariants(result, variant)) {
          pending.push({
            ...coordinate,
            originalInput: variant,
            index,
            inputFormat: 'HGVS',
            recoderData: result,
          });
        }
      } catch (error) {
        failed(index, 'HGVS', error);
      }
    }
  }
  for (const inputFormat of ['VCF', 'CNV', 'HGVS']) {
    const group = pending.filter((entry) => entry.inputFormat === inputFormat);
    if (!group.length) continue;
    const unique = [...new Set(group.map((entry) => entry.formattedVariant))];
    const response = await dependencies.vepRegionsAnnotation(
      unique,
      params.vepOptions,
      params.cache,
      params.proxyConfig,
      params.requestOptions
    );
    const annotations = new Map(
      alignResponses(response, unique).map((entry, index) => [unique[index], entry])
    );
    for (const entry of group) {
      outcomes[entry.index].push({
        ...annotations.get(entry.formattedVariant),
        originalInput: entry.originalInput,
        inputFormat,
        input: entry.formattedVariant,
        variantKey: entry.standardKey,
        vcfString: entry.vcfString,
        vcfInfo: entry.vcfInfo,
        ...(entry.recoderData ? { recoderData: entry.recoderData, allele: entry.allele } : {}),
      });
    }
  }
  return { annotationData: outcomes.flat() };
}
module.exports = { processBatchVariants };
