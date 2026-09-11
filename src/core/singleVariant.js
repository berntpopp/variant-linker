'use strict';
const {
  detectInputFormat,
  hasTranscriptVersion,
  stripTranscriptVersion,
  recodedVariants,
  formatCoordinateVariant,
  errorMessage,
} = require('./input');
const { alignResponses } = require('./responseMatching');
/** @param {string} variant
 * @param {import('../analysisTypes').AnalysisParams} params
 * @param {{variantRecoder: typeof import('../variantRecoder'), vepRegionsAnnotation: typeof import('../vepRegionsAnnotation')}} dependencies
 * @returns {Promise<import('../analysisTypes').ProcessingResult>}
 */
async function processSingleVariant(variant, params, dependencies) {
  const inputFormat = detectInputFormat(variant);
  /** @type {unknown} */
  let variantData = null;
  /** @type {import('../analysisTypes').TranscriptFallback | undefined} */
  let transcriptVersionFallback;
  let coordinate;
  if (inputFormat !== 'HGVS') coordinate = formatCoordinateVariant(variant);
  else {
    /** @param {string} input */
    const recode = async (input) => {
      variantData = await dependencies.variantRecoder(
        input,
        params.recoderOptions,
        params.cache,
        params.proxyConfig,
        params.requestOptions
      );
      return recodedVariants(alignResponses(variantData, [input], true)[0], input)[0];
    };
    try {
      coordinate = await recode(variant);
    } catch (originalError) {
      if (
        !hasTranscriptVersion(variant) ||
        !errorMessage(originalError).includes('No valid VCF string found')
      )
        throw originalError;
      const fallbackVariant = stripTranscriptVersion(variant);
      try {
        coordinate = await recode(fallbackVariant);
      } catch (fallbackError) {
        throw new Error(
          `Variant Recoder failed for both original variant "${variant}" and fallback variant "${fallbackVariant}". Original error: ${errorMessage(originalError)}. Fallback error: ${errorMessage(fallbackError)}`,
          { cause: fallbackError }
        );
      }
      transcriptVersionFallback = {
        originalVariant: variant,
        fallbackVariant,
        reason: 'Transcript version caused Variant Recoder failure',
      };
    }
  }
  const response = await dependencies.vepRegionsAnnotation(
    [coordinate.formattedVariant],
    params.vepOptions,
    params.cache,
    params.proxyConfig,
    params.requestOptions
  );
  const annotationData = alignResponses(response, [coordinate.formattedVariant]).map(
    (annotation) => ({
      ...annotation,
      originalInput: variant,
      inputFormat,
      input: coordinate.formattedVariant,
      variantKey: coordinate.standardKey,
      vcfString: coordinate.vcfString,
      vcfInfo: coordinate.vcfInfo,
    })
  );
  return {
    inputFormat,
    variantData,
    annotationData,
    ...(transcriptVersionFallback ? { transcriptVersionFallback } : {}),
  };
}
module.exports = { processSingleVariant };
