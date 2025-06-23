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
  debugOutput(
    `_groupAnnotationsByPosition: Input annotation count=${annotationData?.length}, hasVcfInput=${hasVcfInput}`
  );

  // Logic depends on whether original input was VCF
  if (hasVcfInput) {
    debugOutput('Processing results using original VCF record map.');
    // Map results data to variant keys for faster lookup
    // *** Annotation Lookup FIX: Use annotation.variantKey ***
    const annotationsByKey = {};
    for (const annotation of annotationData) {
      if (annotation.variantKey) {
        // Use the pre-assigned key
        if (!annotationsByKey[annotation.variantKey]) {
          annotationsByKey[annotation.variantKey] = [];
        }
        annotationsByKey[annotation.variantKey].push(annotation);
      } else {
        // Fallback using originalInput (less reliable now)
        const lookupKey = annotation.originalInput || annotation.input;
        if (lookupKey) {
          if (!annotationsByKey[lookupKey]) {
            annotationsByKey[lookupKey] = [];
          }
          annotationsByKey[lookupKey].push(annotation);
          debugOutput(
            `_groupAnnotationsByPosition: Warning - Used fallback key '${lookupKey}' for annotation lookup.`
          );
        } else {
          debugOutput(
            `_groupAnnotationsByPosition: Warning - Could not determine key for annotation: ` +
              `${JSON.stringify(annotation)}`
          );
        }
      }
    }
    debugOutput(
      `_groupAnnotationsByPosition: Built annotationsByKey map with ${Object.keys(annotationsByKey).length} keys.`
    );

    // Process based on the original VCF structure preserved in vcfRecordMap
    for (const [key, entry] of vcfRecordMap.entries()) {
      // key is CHR-POS-REF-ALT
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

      // *** DEBUG POINT 15: Processing VCF Record Map Entry ***
      debugOutput(
        `_groupAnnotationsByPosition (VCF Path): Processing vcfRecordMap Key='${key}', PosKey='${posKey}', ALT='${alt}'`
      );

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
      // *** Use the key directly from vcfRecordMap for lookup ***
      const matchingAnnotations = annotationsByKey[key] || [];
      // *** DEBUG POINT 16: Annotations Found for VCF Key ***
      debugOutput(` -> Found ${matchingAnnotations.length} annotation(s) for Key='${key}'`);

      // Find the specific annotation that corresponds to this ALT allele
      // If multiple annotations match the key (rare), we might just take the first
      // (This assumes VEP results are appropriately associated upstream)
      const annotationForAlt = matchingAnnotations.length > 0 ? matchingAnnotations[0] : null;

      // *** DEBUG POINT 17: Annotation Matching ALT ***
      debugOutput(
        ` -> Annotation found for ALT='${alt}': ${!!annotationForAlt}. Content: ${JSON.stringify(annotationForAlt)}`
      );

      if (!group.alts.has(alt)) {
        group.alts.set(alt, {
          annotations: annotationForAlt ? [annotationForAlt] : [], // Start with the found annotation or empty
          originalInfo: originalRecord.INFO,
          originalQual: originalRecord.QUAL,
          originalFilter: originalRecord.FILTER,
        });
      } else {
        // Add annotation if ALT allele exists and we found one
        if (annotationForAlt) {
          group.alts.get(alt).annotations.push(annotationForAlt);
        }
      }
      debugOutput(
        ` -> Updated group for PosKey='${posKey}', ALT='${alt}'. ` +
          `Annotations count: ${group.alts.get(alt)?.annotations.length || 0}`
      );
    }
  } else {
    // Handle non-VCF input: Construct VCF fields primarily from annotationData.vcfString
    debugOutput('Processing results assuming non-VCF input. Using annotation.vcfString.');
    for (const annotation of annotationData) {
      if (!annotation || !annotation.vcfString) {
        debugOutput(
          `Warning: Skipping annotation due to missing 'vcfString'. ` +
            `Input: ${annotation?.originalInput || annotation?.input}`
        );
        continue;
      }

      // Parse vcfString: CHROM-POS-REF-ALT
      const parts = annotation.vcfString.split('-');
      if (parts.length !== 4) {
        debugOutput(
          `Warning: Skipping due to unexpected vcfString format: '${annotation.vcfString}'. ` +
            `Expected CHROM-POS-REF-ALT. Input: ${annotation?.originalInput}`
        );
        continue;
      }
      const [chrom, posStr, ref, alt] = parts;
      const pos = parseInt(posStr, 10);

      if (isNaN(pos)) {
        debugOutput(`Invalid POS in vcfString: '${posStr}'. Input: ${annotation?.originalInput}`);
        continue;
      }

      if (!chrom || !ref || !alt) {
        debugOutput(
          `Warning: Missing CHROM/REF/ALT in vcfString: '${annotation.vcfString}'. Input: ${annotation?.originalInput}`
        );
        continue;
      }

      // Determine ID: Use original input (rsID, HGVS) or fallback
      const id =
        annotation.originalInput && annotation.originalInput !== annotation.vcfString
          ? annotation.originalInput
          : '.';

      const posKey = `${chrom}:${pos}:${ref}`;
      // Use assigned key if available
      const key = annotation.variantKey || `${chrom}-${pos}-${ref}-${alt}`;

      // *** DEBUG POINT 18: Processing Non-VCF Annotation ***
      debugOutput(
        `_groupAnnotationsByPosition (Non-VCF Path): Processing annotation ` +
          `Key='${key}', PosKey='${posKey}', ALT='${alt}'`
      );

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
      debugOutput(
        ` -> Updated group for PosKey='${posKey}', ALT='${alt}'. ` +
          `Annotations count: ${group.alts.get(alt)?.annotations.length || 0}`
      );
    }
  }
  // *** DEBUG POINT 19: Final Position Groups ***
  debugOutput(
    `_groupAnnotationsByPosition: Final positionGroups size=${positionGroups.size}. ` +
      `Keys: ${JSON.stringify(Array.from(positionGroups.keys()))}`
  );
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

  // *** DEBUG POINT 20: Formatting INFO for Position ***
  debugOutput(
    `_formatVcfInfoField: Formatting INFO for ` +
      `PosKey='${positionGroupData.chrom}:${positionGroupData.pos}:${positionGroupData.ref}'`
  );

  // --- Collect CSQ and Inheritance Info ---
  for (const [altAllele, altData] of positionGroupData.alts.entries()) {
    // *** DEBUG POINT 21: Processing ALT within INFO ***
    debugOutput(
      ` -> Processing ALT='${altAllele}'. Has ${altData.annotations?.length} annotation(s).`
    );
    // Capture firstAltData reliably if not already set
    if (!firstAltData) firstAltData = altData;

    if (altData.annotations && altData.annotations.length > 0) {
      for (const annotation of altData.annotations) {
        // *** DEBUG POINT 22: Formatting CSQ String ***
        const csqString = formatVcfCsqString(annotation, vlCsqFormatFields, altAllele);
        debugOutput(
          `  -> CSQ for Annotation (Input='${annotation.originalInput || annotation.input}'): '${csqString}'`
        );
        if (csqString) {
          allCsqStringsForLine.push(csqString);
        }

        // *** DEBUG POINT 23: Extracting Inheritance Info ***
        // Extract Inheritance Info ONCE per VCF line
        if (!inheritanceInfoFound && annotation.deducedInheritancePattern) {
          debugOutput(
            `  -> Found Inheritance data in annotation for Input='${annotation.originalInput || annotation.input}'`
          );
          if (typeof annotation.deducedInheritancePattern === 'object') {
            dedInhPattern = annotation.deducedInheritancePattern.prioritizedPattern;
            if (annotation.deducedInheritancePattern.compHetDetails) {
              const details = annotation.deducedInheritancePattern.compHetDetails;
              // Only add comphet tag if it's a confirmed or possible candidate with partners
              if (
                (details.isCandidate || details.isPossible) &&
                details.partnerVariantKeys?.length > 0
              ) {
                compHetDetails = {
                  partners: details.partnerVariantKeys.join(','),
                  gene: details.geneSymbol || '', // Ensure gene symbol exists
                };
                debugOutput(
                  `   -> CompHet details found: Partners='${compHetDetails.partners}', Gene='${compHetDetails.gene}'`
                );
              } else {
                debugOutput(
                  `   -> CompHet details present but not a candidate/possible or no partners.`
                );
              }
            } else {
              debugOutput(`   -> No CompHet details found in inheritance object.`);
            }
          } else {
            // Backward compatibility or simple string pattern
            dedInhPattern = annotation.deducedInheritancePattern;
            debugOutput(`   -> Found simple inheritance pattern string: '${dedInhPattern}'`);
          }
          inheritanceInfoFound = true; // Mark as found so we don't repeat for other ALTs/annotations on the same line
        }
        // --- End Inheritance Info Extraction ---
      }
    }
  }

  // --- Prepare INFO parts ---
  const infoParts = [];

  // Add original INFO fields first (excluding managed tags)
  // *** DEBUG POINT 24: Original INFO Check ***
  debugOutput(` -> Original INFO from first ALT: ${JSON.stringify(firstAltData?.originalInfo)}`);
  if (firstAltData?.originalInfo) {
    const originalInfoString = Object.entries(firstAltData.originalInfo)
      .filter(([key]) => !['VL_CSQ', 'VL_DED_INH', 'VL_COMPHET'].includes(key))
      .map(([key, value]) =>
        value === true || value === 'true' || value === '' ? key : `${key}=${value}`
      ) // Handle flags correctly
      .join(';');
    if (originalInfoString) {
      infoParts.push(originalInfoString);
    }
  }

  // Add VL_CSQ tag if there were consequences
  // *** DEBUG POINT 25: Adding CSQ and Inheritance Tags ***
  debugOutput(
    ` -> Adding VL_CSQ: ${allCsqStringsForLine.length > 0 ? 'Yes' : 'No'}. Count: ${allCsqStringsForLine.length}`
  );
  if (allCsqStringsForLine.length > 0) {
    infoParts.push(`VL_CSQ=${allCsqStringsForLine.join(',')}`);
  }
  // *** NOTE: If no CSQ strings, the tag is omitted entirely ***

  // *** ADD INHERITANCE TAGS ***
  // Add VL_DED_INH if available and meaningful
  const ignorablePatterns = [
    'unknown',
    'reference',
    'unknown_not_processed',
    'error_analysis_failed',
    // Add other patterns that shouldn't be outputted if necessary
  ];
  debugOutput(
    ` -> Adding VL_DED_INH: ${dedInhPattern && !ignorablePatterns.includes(dedInhPattern) && !dedInhPattern?.startsWith('unknown_') && !dedInhPattern?.startsWith('error_') ? 'Yes (' + dedInhPattern + ')' : 'No'}`
  );
  if (
    dedInhPattern &&
    !ignorablePatterns.includes(dedInhPattern) &&
    !dedInhPattern.startsWith('unknown_') &&
    !dedInhPattern.startsWith('error_')
  ) {
    // Ensure pattern is safe for VCF INFO field (basic check)
    const safePattern = String(dedInhPattern).replace(/[;=,\s|]/g, '_'); // Replace problematic characters more broadly
    infoParts.push(`VL_DED_INH=${safePattern}`);
  }

  // Add VL_COMPHET if details were extracted
  debugOutput(` -> Adding VL_COMPHET: ${compHetDetails ? 'Yes' : 'No'}`);
  if (compHetDetails) {
    const safePartners = String(compHetDetails.partners).replace(/[;=,\s|]/g, '_');
    const safeGene = String(compHetDetails.gene).replace(/[;=,\s|]/g, '_');
    infoParts.push(`VL_COMPHET=${safePartners}|${safeGene}`); // Use pipe separator as per description
  }
  // *** END INHERITANCE TAGS ***

  const finalInfoString = infoParts.length > 0 ? infoParts.join(';') : '.';
  // *** DEBUG POINT 26: Final INFO String ***
  debugOutput(` -> Final INFO string: '${finalInfoString}'`);
  return finalInfoString;
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
    firstAltData && firstAltData.originalQual !== undefined && firstAltData.originalQual !== null
      ? firstAltData.originalQual
      : '.';

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
  // *** DEBUG POINT 27: Starting VCF Formatting ***
  debugOutput(
    `formatAnnotationsToVcf: Starting formatting. ` +
      `Annotation count=${annotationData?.length}, vcfRecordMap size=${vcfRecordMap?.size}`
  );
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

  // *** DEBUG POINT 28: Final VCF Output Lines ***
  debugOutput(`formatAnnotationsToVcf: Generated ${outputDataLines.length} data lines.`);
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
