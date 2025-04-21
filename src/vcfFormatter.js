// src/vcfFormatter.js
'use strict';

/**
 * @fileoverview Module for formatting annotation results into VCF format.
 * Handles both VCF and non-VCF original inputs, preparing header sections,
 * grouping variants by position, and formatting INFO fields with annotation data.
 * @module vcfFormatter
 */

const debugOutput = require('debug')('variant-linker:vcf-formatter');
const { formatVcfCsqString } = require('./dataExtractor');

/**
 * Prepares VCF header lines with necessary INFO definitions for VL_CSQ.
 *
 * @param {Array<string>} [originalHeaderLines] - Original VCF header lines, if available.
 * @param {Array<string>} vlCsqFormatFields - Array defining fields for the VL_CSQ format.
 * @returns {Array<string>} The prepared VCF header lines.
 * @private
 */
function _prepareVcfHeader(originalHeaderLines, vlCsqFormatFields) {
  // Use provided header or generate a default one if missing
  let finalVcfHeaderLines =
    originalHeaderLines && originalHeaderLines.length > 0
      ? [...originalHeaderLines] // Use a copy
      : _generateDefaultVcfHeader();

  // Ensure ##fileformat=VCFv4.2 is always the first line
  const fileformatRegex = /^##fileformat=/i;
  const hasFileformat =
    finalVcfHeaderLines.length > 0 && fileformatRegex.test(finalVcfHeaderLines[0]);
  if (!hasFileformat) {
    // Remove any fileformat lines elsewhere (shouldn't happen, but KISS/DRY)
    finalVcfHeaderLines = finalVcfHeaderLines.filter((line) => !fileformatRegex.test(line));
    // Insert at the top
    finalVcfHeaderLines.unshift('##fileformat=VCFv4.2');
  }

  // Check if INFO header already exists for VL_CSQ in the final header lines
  const hasVlCsqHeader = finalVcfHeaderLines.some((line) => line.includes('ID=VL_CSQ'));

  // Add VL_CSQ INFO header if not present
  if (!hasVlCsqHeader) {
    const infoFieldDescBase = '##INFO=<ID=VL_CSQ,Number=.,Type=String,Description=';
    const infoFieldDescDesc = '"VariantLinker Consequence Annotation using VEP/Custom. ';
    const infoFieldDescFormat = `Format: ${vlCsqFormatFields.join('|')}">`;
    const infoFieldDescription = infoFieldDescBase + infoFieldDescDesc + infoFieldDescFormat;

    const chromLineIdx = finalVcfHeaderLines.findIndex((line) => line.startsWith('#CHROM'));
    if (chromLineIdx >= 0) {
      finalVcfHeaderLines.splice(chromLineIdx, 0, infoFieldDescription);
    } else {
      // If #CHROM is missing (shouldn't happen with default header), add at the end before data
      finalVcfHeaderLines.push(infoFieldDescription);
      finalVcfHeaderLines.push('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO'); // Add #CHROM line if missing
    }
    debugOutput('Added missing VL_CSQ header line.');
  }

  // Add headers for inheritance pattern fields
  const dedInhHeader =
    '##INFO=<ID=VL_DED_INH,Number=1,Type=String,Description="Deduced inheritance pattern (VariantLinker)">';
  const compHetHeader =
    '##INFO=<ID=VL_COMPHET,Number=.,Type=String,Description="Compound Het details (partner variant keys and gene)">';

  // Check if headers already exist
  const hasDedInhHeader = finalVcfHeaderLines.some((line) => line.includes('ID=VL_DED_INH'));
  const hasCompHetHeader = finalVcfHeaderLines.some((line) => line.includes('ID=VL_COMPHET'));

  // Add headers if not present
  if (!hasDedInhHeader || !hasCompHetHeader) {
    const chromLineIdx = finalVcfHeaderLines.findIndex((line) => line.startsWith('#CHROM'));
    if (chromLineIdx >= 0) {
      if (!hasDedInhHeader) {
        finalVcfHeaderLines.splice(chromLineIdx, 0, dedInhHeader);
        debugOutput('Added missing VL_DED_INH header line.');
      }
      if (!hasCompHetHeader) {
        finalVcfHeaderLines.splice(chromLineIdx, 0, compHetHeader);
        debugOutput('Added missing VL_COMPHET header line.');
      }
    } else {
      // If #CHROM is missing (shouldn't happen with default header), add at the end before data
      if (!hasDedInhHeader) {
        finalVcfHeaderLines.push(dedInhHeader);
      }
      if (!hasCompHetHeader) {
        finalVcfHeaderLines.push(compHetHeader);
      }
    }
  }

  return finalVcfHeaderLines;
}

/**
 * Groups annotation data by genomic position for VCF output.
 * Handles both VCF and non-VCF input sources appropriately.
 *
 * @param {Array<Object>} annotationData - Array of annotation results.
 * @param {Map<string, Object>} [vcfRecordMap] - Optional map of variant keys to original VCF data.
 * @returns {Map<string, Object>} Map keyed by position, containing grouped annotation data
 * and variant details.
 * @private
 */
function _groupAnnotationsByPosition(annotationData, vcfRecordMap) {
  const positionGroups = new Map();

  // Determine if the input was likely a VCF file based on presence of vcfRecordMap
  const hasVcfInput = vcfRecordMap && vcfRecordMap.size > 0;

  // Logic depends on whether original input was VCF
  if (hasVcfInput) {
    debugOutput('Processing results using original VCF record map.');
    // Map results data to variant keys for faster lookup
    const annotationsByKey = {};
    for (const annotation of annotationData) {
      // Use the input identifier that links back to the VCF record
      // Prioritize originalInput if available
      const key = annotation.originalInput || annotation.input;
      if (key) {
        // If multiple annotations map to the same key (e.g., split multi-allelic), store as array
        if (!annotationsByKey[key]) {
          annotationsByKey[key] = [];
        }
        annotationsByKey[key].push(annotation);
      }
    }
    debugOutput(`Mapped ${Object.keys(annotationsByKey).length} unique input keys to annotations.`);

    // Process based on the original VCF structure preserved in vcfRecordMap
    for (const [key, entry] of vcfRecordMap.entries()) {
      const { originalRecord, alt } = entry; // the specific ALT allele from the original VCF line
      if (!originalRecord) {
        debugOutput(`Warning: No original record found for VCF entry key: ${key}`);
        continue;
      }

      const chrom = originalRecord.CHROM || '';
      const pos = originalRecord.POS || '';
      const ref = originalRecord.REF || '';
      const id = originalRecord.ID && originalRecord.ID !== '.' ? originalRecord.ID : '.'; // Prefer original ID
      const posKey = `${chrom}:${pos}:${ref}`;

      if (!positionGroups.has(posKey)) {
        positionGroups.set(posKey, {
          chrom,
          pos,
          ref,
          id, // Use ID from the first VCF record for this position
          // Map<altAllele, { annotations[], info?, qual?, filter? }>
          alts: new Map(),
        });
      }

      const group = positionGroups.get(posKey);
      const matchingAnnotations = annotationsByKey[key] || [];

      // Find the specific annotation that corresponds to this ALT allele
      // VEP results might be split, so we look for the one matching the VCF ALT
      // Simple case: only one annotation for this input key
      let annotationForAlt = null;
      if (matchingAnnotations.length === 1) {
        annotationForAlt = matchingAnnotations[0];
      } else {
        // More complex: find annotation matching the ALT (might need vcfString comparison)
        annotationForAlt = matchingAnnotations.find((ann) => {
          if (ann.vcfString) {
            const [, , , annAlt] = ann.vcfString.split('-');
            return annAlt === alt;
          }
          // Fallback if vcfString isn't available (less reliable)
          return ann.input?.includes(alt); // Basic check
        });
      }

      if (!annotationForAlt) {
        debugOutput(
          `Warning: Could not find matching annotation for VCF key ${key} and ALT ${alt}`
        );
        // Still add the ALT, but with empty annotation list
        if (!group.alts.has(alt)) {
          group.alts.set(alt, {
            annotations: [],
            originalInfo: originalRecord.INFO,
            originalQual: originalRecord.QUAL,
            originalFilter: originalRecord.FILTER,
          });
        } else {
          // Merge if ALT already exists (should be rare for VCF input path)
          group.alts.get(alt).annotations.push(...[]); // No annotation found
        }
      } else {
        if (!group.alts.has(alt)) {
          group.alts.set(alt, {
            annotations: [annotationForAlt],
            originalInfo: originalRecord.INFO,
            originalQual: originalRecord.QUAL,
            originalFilter: originalRecord.FILTER,
          });
        } else {
          // Add annotation if ALT allele exists (e.g. duplicate line in VCF)
          group.alts.get(alt).annotations.push(annotationForAlt);
        }
      }
    }
  } else {
    // Handle non-VCF input: Construct VCF fields primarily from annotationData.vcfString
    debugOutput('Processing results assuming non-VCF input. Using annotation.vcfString.');
    for (const annotation of annotationData) {
      if (!annotation || !annotation.vcfString) {
        debugOutput(
          `Warning: Skipping annotation due to missing 'vcfString'.
           Input: ${annotation?.originalInput || annotation?.input}`
        );
        continue;
      }

      // Parse vcfString: CHROM-POS-REF-ALT
      const parts = annotation.vcfString.split('-');
      if (parts.length !== 4) {
        debugOutput(
          `Warning: Skipping due to unexpected vcfString format: '${annotation.vcfString}'.
           Expected CHROM-POS-REF-ALT. Input: ${annotation?.originalInput}`
        );
        continue;
      }
      const [chrom, posStr, ref, alt] = parts;
      const pos = parseInt(posStr, 10);

      if (isNaN(pos)) {
        debugOutput(
          `Invalid POS in vcfString: '${posStr}'.
           Input: ${annotation?.originalInput}`
        );
        continue;
      }

      if (!chrom || !ref || !alt) {
        debugOutput(
          `Warning: Missing CHROM/REF/ALT in vcfString: '${annotation.vcfString}'.
           Input: ${annotation?.originalInput}`
        );
        continue;
      }

      // Determine ID: Use original input (rsID, HGVS) or fallback
      const id =
        annotation.originalInput && annotation.originalInput !== annotation.vcfString
          ? annotation.originalInput
          : '.';

      const posKey = `${chrom}:${pos}:${ref}`;

      if (!positionGroups.has(posKey)) {
        positionGroups.set(posKey, {
          chrom,
          pos,
          ref,
          id, // Use ID from the first annotation encountered for this position
          alts: new Map(), // Map<altAllele, { annotations: [] }>
        });
      }

      const group = positionGroups.get(posKey);
      // Use the ID from the *first* annotation seen for this posKey, but allow others if '.'
      if (group.id === '.' && id !== '.') {
        group.id = id;
      }

      if (!group.alts.has(alt)) {
        group.alts.set(alt, { annotations: [annotation] });
      } else {
        // If this ALT allele already exists for the position, add the annotation
        // This could happen if the same variant was input multiple times (e.g., rsID and HGVS)
        group.alts.get(alt).annotations.push(annotation);
      }
    }
  }

  return positionGroups;
}

/**
 * Formats the INFO field for a VCF line using the grouped annotations.
 *
 * @param {Object} positionGroupData - Object containing data for a position and its ALTs.
 * @param {Array<string>} vlCsqFormatFields - Array defining fields for the VL_CSQ format.
 * @returns {string} The formatted INFO field string.
 * @private
 */
function _formatVcfInfoField(positionGroupData, vlCsqFormatFields) {
  const allCsqStringsForLine = [];
  let firstAltData = positionGroupData.alts?.values().next().value; // For original INFO
  let inheritanceInfoFound = false; // Flag to take inheritance only once per line
  let dedInhPattern = null;
  let compHetDetails = null;

  // --- Collect CSQ strings for all ALTs/annotations ---
  for (const [altAllele, altData] of positionGroupData.alts.entries()) {
    // Capture firstAltData reliably
    if (!firstAltData) firstAltData = altData;

    if (altData.annotations && altData.annotations.length > 0) {
      for (const annotation of altData.annotations) {
        // Generate CSQ for this annotation/ALT pair
        const csqString = formatVcfCsqString(annotation, vlCsqFormatFields, altAllele);
        if (csqString) {
          allCsqStringsForLine.push(csqString);
        }

        // --- Extract Inheritance Info ONCE per VCF line---
        if (!inheritanceInfoFound && annotation.deducedInheritancePattern) {
          if (typeof annotation.deducedInheritancePattern === 'object') {
            dedInhPattern = annotation.deducedInheritancePattern.prioritizedPattern;
            if (annotation.deducedInheritancePattern.compHetDetails) {
              const details = annotation.deducedInheritancePattern.compHetDetails;
              if (
                (details.isCandidate || details.isPossible) &&
                details.partnerVariantKeys?.length > 0
              ) {
                compHetDetails = {
                  partners: details.partnerVariantKeys.join(','),
                  gene: details.geneSymbol || '',
                };
              }
            }
          } else {
            // Backward compatibility
            dedInhPattern = annotation.deducedInheritancePattern;
          }
          inheritanceInfoFound = true; // Mark as found
        }
        // --- End Inheritance Info Extraction ---
      }
    }
  }

  // --- Prepare INFO parts ---
  const infoParts = [];

  // Add original INFO fields first (excluding managed tags)
  if (firstAltData?.originalInfo) {
    const originalInfoString = Object.entries(firstAltData.originalInfo)
      .filter(([key]) => !['VL_CSQ', 'VL_DED_INH', 'VL_COMPHET'].includes(key))
      .map(([key, value]) => (value === true ? key : `${key}=${value}`))
      .join(';');
    if (originalInfoString) {
      infoParts.push(originalInfoString);
    }
  }

  // Add VL_CSQ tag if there were consequences
  if (allCsqStringsForLine.length > 0) {
    infoParts.push(`VL_CSQ=${allCsqStringsForLine.join(',')}`);
  }
  // *** NOTE: If no CSQ strings, the tag is omitted entirely ***

  // Add inheritance pattern if available and not 'unknown'
  if (dedInhPattern && dedInhPattern !== 'unknown') {
    infoParts.push(`VL_DED_INH=${encodeURIComponent(dedInhPattern)}`);
  }

  // Add compound heterozygous details if available
  if (compHetDetails) {
    infoParts.push(
      `VL_COMPHET=${encodeURIComponent(compHetDetails.partners)}|\
${encodeURIComponent(compHetDetails.gene)}`
    );
  }

  // --- Join and Return ---
  return infoParts.length > 0 ? infoParts.join(';') : '.';
}

/**
 * Constructs a VCF data line from the position group data and INFO string.
 *
 * @param {Object} positionGroupData - Object containing data for a position and its ALTs.
 * @param {string} infoString - The formatted INFO field string.
 * @returns {string} The formatted VCF data line.
 * @private
 */
function _constructVcfLine(positionGroupData, infoString) {
  const alts = Array.from(positionGroupData.alts.keys());
  const altAllelesString = alts.join(',');

  // Determine QUAL and FILTER values
  let firstAltData = null;
  for (const altData of positionGroupData.alts.values()) {
    if (!firstAltData) {
      firstAltData = altData;
      break;
    }
  }

  // Get QUAL and FILTER from the first ALT data, if available
  const qual =
    firstAltData && firstAltData.originalQual !== undefined ? firstAltData.originalQual : '.';

  // Handle FILTER field according to VCF spec
  let filter = 'PASS'; // Default to PASS for non-VCF input or undefined filter
  if (firstAltData && Array.isArray(firstAltData.originalFilter)) {
    const validFilters = firstAltData.originalFilter.filter((f) => f && f !== 'PASS' && f !== '.'); // Filter out empty, PASS, or '.'
    if (validFilters.length > 0) {
      filter = validFilters.join(';'); // Join only actual filter values
    }
    // else: keep default 'PASS' for empty array or array with only 'PASS'
  }

  // Construct the VCF data line
  return [
    positionGroupData.chrom,
    positionGroupData.pos,
    positionGroupData.id, // Use the determined ID for the position
    positionGroupData.ref,
    altAllelesString,
    qual,
    filter,
    infoString,
  ].join('\t');
}

/**
 * Generates default VCF header lines when original VCF data is not available.
 *
 * @returns {Array<string>} Array of default VCF header lines
 * @private
 */
function _generateDefaultVcfHeader() {
  // Create a minimal VCF header with variant linker specific fields
  const headerLines = [
    '##fileformat=VCFv4.2',
    `##fileDate=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    '##source=variant-linker',
    '##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Consequence annotations from variant-linker. Format: Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen">',
    '##INFO=<ID=VL_DED_INH,Number=1,Type=String,Description="Deduced inheritance pattern (VariantLinker)">',
    '##INFO=<ID=VL_COMPHET,Number=.,Type=String,Description="Compound Het details (partner variant keys and gene)">',
    '##INFO=<ID=VARIANT_LINKER,Number=0,Type=Flag,Description="Variant processed by variant-linker">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  ];

  return headerLines;
}

/**
 * Formats annotation results into a complete VCF string.
 *
 * @param {Array<Object>} annotationData - Array of annotation results.
 * @param {Map<string, Object>} [vcfRecordMap] - Optional map from VCF input.
 * @param {Array<string>} [vcfHeaderLines] - Optional original VCF header lines.
 * @param {Array<string>} vlCsqFormatFields - Fields for the VL_CSQ tag format.
 * @returns {string} The complete VCF formatted content.
 */
function formatAnnotationsToVcf(annotationData, vcfRecordMap, vcfHeaderLines, vlCsqFormatFields) {
  const finalHeaderLines = _prepareVcfHeader(vcfHeaderLines, vlCsqFormatFields);

  if (!annotationData || !Array.isArray(annotationData) || annotationData.length === 0) {
    debugOutput('No annotation data provided for VCF output. Returning header only.');
    return finalHeaderLines.length > 0 ? finalHeaderLines.join('\n') + '\n' : '';
  }

  const positionGroups = _groupAnnotationsByPosition(annotationData, vcfRecordMap);
  debugOutput(`Grouped annotations into ${positionGroups.size} positions.`);

  const outputDataLines = [];
  for (const [, groupData] of positionGroups.entries()) {
    if (!groupData.alts || groupData.alts.size === 0) continue;
    const infoString = _formatVcfInfoField(groupData, vlCsqFormatFields);
    const vcfLine = _constructVcfLine(groupData, infoString);
    outputDataLines.push(vcfLine);
  }

  const finalOutput = [...finalHeaderLines, ...outputDataLines];

  // Final check: if only header lines are present, maybe something went wrong
  if (finalOutput.length === finalHeaderLines.length && annotationData.length > 0) {
    debugOutput(
      'Warning: VCF output contains only header lines, but there were annotations to process. Check grouping or formatting logic.'
    );
  }

  // Join lines and add a trailing newline for valid VCF format
  return finalOutput.join('\n') + (finalOutput.length > 0 ? '\n' : '');
}

module.exports = {
  formatAnnotationsToVcf,
  // Do NOT export internal helpers
};
