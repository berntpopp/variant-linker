'use strict';
const debug = require('debug')('variant-linker:csq');

/**
 * Helper function for CSQ handlers that prioritizes current consequence but falls back
 * to most severe consequence logic when field is missing.
 * @param {import('../dataTypes').Annotation & {current_consequence?:import('../dataTypes').Transcript}} annotation - The annotation object with current_consequence
 * @param {string} fieldName - The field name to extract from the consequence
 * @returns {*} The field value from current consequence or fallback logic
 */
function getConsequenceFieldWithFallback(annotation, fieldName) {
  if (!annotation?.transcript_consequences?.length) {
    return '';
  }

  const currentConsequence = annotation.current_consequence;

  // First, try to get the field from the current consequence being processed
  if (
    currentConsequence &&
    currentConsequence[fieldName] !== undefined &&
    currentConsequence[fieldName] !== null &&
    currentConsequence[fieldName] !== ''
  ) {
    return currentConsequence[fieldName];
  }

  // If current consequence doesn't have the field, apply most-severe-consequence fallback
  const mostSevereConsequence = annotation.most_severe_consequence;

  if (mostSevereConsequence) {
    // Try to find the transcript consequence that matches the most severe consequence
    const matchingCons = annotation.transcript_consequences.find((c) =>
      c.consequence_terms?.includes(mostSevereConsequence)
    );

    if (
      matchingCons &&
      matchingCons[fieldName] !== undefined &&
      matchingCons[fieldName] !== null &&
      matchingCons[fieldName] !== ''
    ) {
      return matchingCons[fieldName];
    }
  }

  // Final fallback: find the first consequence that has this field with a non-empty value
  const fallbackCons = annotation.transcript_consequences.find(
    (c) => c[fieldName] !== undefined && c[fieldName] !== null && c[fieldName] !== ''
  );

  return fallbackCons?.[fieldName] || '';
}

/**
 * Maps VCF CSQ field names (VEP style) to paths within the annotation object
 * or provides special handling logic.
 * This mapping prioritizes extracting data from the transcript consequence that matches
 * the top-level most_severe_consequence field. Falls back to the first available data
 * if a match is not found.
 * Uses getDefaultColumnConfig() as a base where possible.
 */
/** @type {Record<string,(annotation: import('../dataTypes').Annotation & {current_consequence?:import('../dataTypes').Transcript}, alt: string) => unknown>} */
const csqFieldMapping = {
  Allele: (ann, alt) => alt || '', // Special case: Use provided ALT
  Consequence: (ann) => {
    // Get consequence terms from the current transcript being processed
    const currentConsequence = ann.current_consequence;
    if (currentConsequence?.consequence_terms?.length) {
      return currentConsequence.consequence_terms.join('&');
    }
    // Fallback to first transcript consequence if current is not available
    const cons = ann?.transcript_consequences?.[0];
    if (cons?.consequence_terms?.length) {
      return cons.consequence_terms.join('&');
    }
    // Final fallback to most_severe_consequence if no transcript consequences
    return ann?.most_severe_consequence || '';
  },
  IMPACT: (ann) => getConsequenceFieldWithFallback(ann, 'impact'),
  SYMBOL: (ann) => getConsequenceFieldWithFallback(ann, 'gene_symbol'),
  Gene: (ann) => getConsequenceFieldWithFallback(ann, 'gene_id'),
  Feature_type: (ann) => getConsequenceFieldWithFallback(ann, 'feature_type'),
  Feature: (ann) => getConsequenceFieldWithFallback(ann, 'transcript_id'),
  BIOTYPE: (ann) => getConsequenceFieldWithFallback(ann, 'biotype'),
  HGVSc: (ann) => getConsequenceFieldWithFallback(ann, 'hgvsc'),
  HGVSp: (ann) => getConsequenceFieldWithFallback(ann, 'hgvsp'),
  Protein_position: (ann) => {
    if (!ann?.transcript_consequences?.length) return '';

    const currentConsequence = ann.current_consequence;

    // First, try current consequence
    if (currentConsequence?.protein_start) {
      const end = currentConsequence.protein_end || currentConsequence.protein_start;
      return `${currentConsequence.protein_start}-${end}`;
    }

    // If current consequence doesn't have protein_start, apply most-severe-consequence fallback
    const mostSevereConsequence = ann.most_severe_consequence;
    let targetCons = null;

    if (mostSevereConsequence) {
      targetCons = ann.transcript_consequences.find(
        (c) => c.consequence_terms?.includes(mostSevereConsequence) && c.protein_start
      );
    }

    if (!targetCons) {
      targetCons = ann.transcript_consequences.find((c) => c.protein_start);
    }

    if (!targetCons?.protein_start) return '';
    const end = targetCons.protein_end || targetCons.protein_start;
    return `${targetCons.protein_start}-${end}`;
  },
  Amino_acids: (ann) => getConsequenceFieldWithFallback(ann, 'amino_acids'),
  Codons: (ann) => getConsequenceFieldWithFallback(ann, 'codons'),
  Existing_variation: (ann) =>
    Array.isArray(ann?.existing_variation)
      ? ann.existing_variation.join('&')
      : ann?.existing_variation || '',
  // SIFT/PolyPhen are now extracted from the most severe consequence when possible
  SIFT: (ann) => getConsequenceFieldWithFallback(ann, 'sift_prediction'),
  PolyPhen: (ann) => getConsequenceFieldWithFallback(ann, 'polyphen_prediction'),
  // Add mappings for other VEP fields if needed
};

/**
 * Formats a single annotation object into a VCF CSQ string field value.
 * Generates a comma-separated list of CSQ strings, one for each transcript consequence.
 *
 * @param {import('../dataTypes').Annotation & {current_consequence?:import('../dataTypes').Transcript}} annotation - The annotation object (usually from VEP results).
 * @param {Array<string>} csqFormatFields - An array of CSQ field names in the desired order
 *   (e.g., from vlCsqFormat in processor).
 * @param {string} altAllele - The specific ALT allele this consequence pertains to.
 * @returns {string} The formatted CSQ string (pipe-separated values, comma-separated for multiple consequences),
 *                   or empty string if no data.
 */
function formatVcfCsqString(annotation, csqFormatFields, altAllele) {
  if (!annotation || !Array.isArray(csqFormatFields) || csqFormatFields.length === 0) {
    return '';
  }

  // Check if there are any consequences before generating CSQ string
  if (!annotation.transcript_consequences || annotation.transcript_consequences.length === 0) {
    return '';
  }

  // Generate a CSQ string for each transcript consequence
  const csqStrings = annotation.transcript_consequences.map((consequence) => {
    const values = csqFormatFields.map((fieldName) => {
      const handler = csqFieldMapping[fieldName];
      /** @type {unknown} */
      let value;
      if (typeof handler === 'function') {
        // Call the handler with the original annotation context so it can make decisions
        // across all transcripts, but also provide the current consequence being processed
        const contextWithCurrentConsequence = {
          ...annotation,
          current_consequence: consequence,
        };
        value = handler(contextWithCurrentConsequence, altAllele);
      } else {
        // Basic fallback: Look for a direct property match (lowercase) in the consequence itself first
        value =
          consequence[fieldName.toLowerCase()] !== undefined
            ? consequence[fieldName.toLowerCase()]
            : annotation[fieldName.toLowerCase()] || ''; // Fallback to top-level annotation

        // Only log warning if data is expected but not found
        if (value === '') {
          debug(
            `Warning: No specific CSQ handler or direct property found for field '${fieldName}'. ` +
              'Using empty string.'
          );
        }
      }

      // Ensure value is a string and handle null/undefined
      const text = value === null || value === undefined ? '' : String(value);

      // VEP standard: URL-encode potentially problematic characters like pipe (|), comma (,), semicolon (;)
      // Use encodeURIComponent for broader safety, although VEP's exact encoding might differ slightly.
      // Avoid encoding empty strings.
      return text ? encodeURIComponent(text) : '';
    });

    return values.join('|'); // Pipe-separate fields within a single CSQ string
  });

  // Comma-separate the CSQ strings for different consequences
  return csqStrings.join(',');
}

module.exports = { formatVcfCsqString };
