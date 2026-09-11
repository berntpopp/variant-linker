'use strict';
const { parseVcfVariant } = require('../assemblyConverter');
/** @typedef {{vcfString: string, standardKey: string, formattedVariant: string,
 * vcfInfo?: {END: number, SVTYPE: string}}} CoordinateVariant */
/** @typedef {CoordinateVariant & {allele: string}} RecodedVariant */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** @param {string} variant @returns {'VCF' | 'CNV' | 'HGVS'} */
function detectInputFormat(variant) {
  if (!variant) throw new Error('No variant provided.');
  const cleaned = variant.trim().replace(/^chr/i, '');
  if (/^[0-9XYM]+:\d+-\d+:(DEL|DUP|CNV|CUSTOM|INS|INV)$/i.test(cleaned)) return 'CNV';
  return parseVcfVariant(cleaned) ? 'VCF' : 'HGVS';
}
/** @param {string} variant */
function hasTranscriptVersion(variant) {
  return /^[A-Z]{2}_\d+\.\d+:/.test(variant);
}
/** @param {string} variant */
function stripTranscriptVersion(variant) {
  return variant.replace(/(\.[0-9]+)(:)/, '$2');
}
/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string} variant @returns {CoordinateVariant} */
function formatCoordinateVariant(variant) {
  const parsed = parseVcfVariant(variant.trim());
  if (parsed) {
    const { chr, pos, ref, alt } = parsed;
    return {
      formattedVariant: `${chr} ${pos} . ${ref} ${alt} . . .`,
      standardKey: `${chr}-${pos}-${ref}-${alt}`,
      vcfString: `${chr}-${pos}-${ref}-${alt}`,
    };
  }
  const cnv = /^(?:chr)?([0-9XYM]+):(\d+)-(\d+):(DEL|DUP|CNV|CUSTOM|INS|INV)$/i.exec(
    variant.trim()
  );
  if (
    !cnv ||
    Number(cnv[2]) < 1 ||
    Number(cnv[3]) < Number(cnv[2]) ||
    !Number.isSafeInteger(Number(cnv[3]))
  )
    throw new Error('Invalid coordinate variant format or span');
  /** @type {Record<string, string>} */
  const kinds = { DEL: 'deletion', DUP: 'duplication', CNV: 'CNV' };
  return {
    formattedVariant: `${cnv[1]} ${Number(cnv[2])} ${Number(cnv[3])} ${kinds[cnv[4].toUpperCase()] || 'CNV'} 1`,
    standardKey: `${cnv[1]}:${Number(cnv[2])}-${Number(cnv[3])}:${cnv[4].toUpperCase()}`,
    // The input has no reference sequence; N explicitly preserves that uncertainty.
    vcfString: `${cnv[1]}-${Number(cnv[2])}-N-<${cnv[4].toUpperCase()}>`,
    vcfInfo: { END: Number(cnv[3]), SVTYPE: cnv[4].toUpperCase() },
  };
}

/** Extract every explicit small variant allele from a verified recoder result.
 * @param {unknown} result @param {string} variant @returns {RecodedVariant[]}
 */
function recodedVariants(result, variant) {
  if (!isRecord(result))
    throw new Error(`Variant Recoder did not return valid data for variant "${variant}"`);
  if (typeof result.error === 'string') throw new Error(result.error);
  /** @type {RecodedVariant[]} */
  const variants = [];
  let hasVcfArray = false;
  const errors = [];
  const alleles = Array.isArray(result.vcf_string) ? [['', result]] : Object.entries(result);
  for (const [allele, entry] of alleles) {
    if (isRecord(entry) && typeof entry.error === 'string') errors.push(entry.error);
    if (!isRecord(entry) || !Array.isArray(entry.vcf_string)) continue;
    hasVcfArray = true;
    for (const vcf of entry.vcf_string) {
      if (typeof vcf !== 'string' || !parseVcfVariant(vcf)) continue;
      const coordinates = formatCoordinateVariant(vcf);
      if (
        !variants.some(
          (existing) =>
            existing.standardKey === coordinates.standardKey && existing.allele === allele
        )
      ) {
        variants.push({
          ...coordinates,
          vcfString: coordinates.standardKey,
          allele: String(allele),
        });
      }
    }
  }
  if (!hasVcfArray && errors.length) throw new Error(errors.join('; '));
  if (!hasVcfArray)
    throw new Error(
      `Variant Recoder response is missing a valid vcf_string array for variant "${variant}"`
    );
  if (!variants.length)
    throw new Error(
      `No valid VCF string found in Variant Recoder response for variant "${variant}"`
    );
  return variants;
}
/** @param {unknown} variantData @param {string} variant */
async function processVariantRecoderResponse(variantData, variant) {
  if (!Array.isArray(variantData) || variantData.length !== 1)
    throw new Error(`Variant Recoder did not return valid data for variant "${variant}"`);
  const first = recodedVariants(variantData[0], variant)[0];
  return { vcfString: first.vcfString };
}
module.exports = {
  detectInputFormat,
  hasTranscriptVersion,
  stripTranscriptVersion,
  processVariantRecoderResponse,
  formatCoordinateVariant,
  recodedVariants,
  isRecord,
  errorMessage,
};
