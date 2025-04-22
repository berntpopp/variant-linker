// src/inheritance/compoundHetAnalyzer.js
'use strict';

/**
 * @fileoverview Analyzes variants within a gene for potential compound heterozygous inheritance.
 * @module compoundHetAnalyzer
 */

const debugDetailed = require('debug')('variant-linker:detailed');
const { isHet, isVariant, isRef, isMissing } = require('./genotypeUtils'); // isRef added

/**
 * Analyzes a set of variants within the same gene (for a specific index sample)
 * to detect potential compound heterozygous inheritance patterns.
 * Requires pedigree data with parental genotypes for confirmation.
 *
 * @param {Array<Object>} geneVariants - Array of variant annotation objects for a gene.
 *   Each object must have a `variantKey`.
 * @param {Map<string, Map<string, string>>} genotypesMap - Maps variants to genotypes
 * @param {Map<string, Object>} pedigreeData - Parsed pedigree data. Required for CompHet.
 * @param {string} indexSampleId - The ID of the index/proband sample.
 * @returns {Object|null} Result of compound heterozygous analysis,
 *   or null if not applicable.
 *   Result object structure:
 *   {
 *     isCompHet: boolean, // True if confirmed with parental data
 *     isPossible: boolean, // True if het variants found but parents inconclusive
 *     pattern: string, // 'compound_heterozygous' or 'possible'
 *     variantKeys: Array<string>, // Het variants in index
 *     paternalVariantKeys?: Array<string>, // Variants likely inherited from father
 *     maternalVariantKeys?: Array<string>, // Variants likely inherited from mother
 *     ambiguousVariantKeys?: Array<string> // Variants with unclear parent of origin
 *   }
 */
function analyzeCompoundHeterozygous(geneVariants, genotypesMap, pedigreeData, indexSampleId) {
  const geneSymbol = geneVariants?.[0]?.transcript_consequences?.[0]?.gene_symbol || 'Unknown Gene';
  debugDetailed(`--- Entering analyzeCompoundHeterozygous for gene ${geneSymbol} ---`);
  debugDetailed(`  Args: variant count=${geneVariants?.length}, index=${indexSampleId}`);

  // --- Preconditions ---
  if (!geneVariants || geneVariants.length < 2 || !indexSampleId || !genotypesMap) {
    debugDetailed(
      `  CompHet: Invalid args - Variants=${geneVariants?.length}, ` +
        `Index=${indexSampleId}, GenotypesMap=${!!genotypesMap}`
    );
    debugDetailed(`--- Exiting: Not enough het variants in index ---`);
    return null;
  }

  // --- Find Heterozygous Variants in Index ---
  const hetVariantsInIndex = [];
  for (const variant of geneVariants) {
    const variantKey = variant.variantKey; // Assuming variantKey is added during processing
    if (!variantKey) {
      debugDetailed(
        `  CompHet: Skipping variant - missing variantKey. ` +
          `OriginalInput: ${variant.originalInput}`
      );
      continue;
    }

    const variantGenotypes = genotypesMap.get(variantKey);
    if (!variantGenotypes) {
      debugDetailed(`  CompHet: No genotypes found in map for variant ${variantKey}`);
      continue;
    }

    if (!variantGenotypes.has(indexSampleId)) {
      debugDetailed(`  CompHet: No genotype for index ${indexSampleId} in variant ${variantKey}`);
      continue;
    }

    const indexGt = variantGenotypes.get(indexSampleId);
    if (isHet(indexGt)) {
      debugDetailed(
        `  CompHet: Index ${indexSampleId} is Het ('${indexGt}') for variant ${variantKey}`
      );
      hetVariantsInIndex.push({ ...variant }); // Store a copy
    } else {
      debugDetailed(
        `  CompHet: Index ${indexSampleId} not het ('${indexGt}') for variant ${variantKey}`
      );
    }
  }

  // Need at least two heterozygous variants in index for CompHet
  if (hetVariantsInIndex.length < 2) {
    debugDetailed(`--- Exiting: Not enough het variants (${hetVariantsInIndex.length})`);
    return null;
  }
  debugDetailed(`  CompHet: Found ${hetVariantsInIndex.length} het variants.`);

  // --- Initialize Result Object ---
  const result = {
    isCompHet: false,
    isPossible: true, // It's possible if we have >= 2 het variants in index
    pattern: 'compound_heterozygous_possible', // Default to possible
    variantKeys: hetVariantsInIndex.map((v) => v.variantKey),
    paternalVariantKeys: [],
    maternalVariantKeys: [],
    ambiguousVariantKeys: [],
  };

  // --- Check Parental Inheritance (Requires Pedigree) ---
  if (!pedigreeData || pedigreeData.size === 0) {
    debugDetailed(`  CompHet: No pedigree data. Cannot confirm. Marking as 'possible'.`);
    result.pattern = 'compound_heterozygous_possible_no_pedigree';
    debugDetailed(`--- Exiting: ${geneSymbol}, Result: ${JSON.stringify(result)} ---`);
    return result;
  }

  const indexData = pedigreeData.get(indexSampleId);
  const fatherId = indexData?.fatherId;
  const motherId = indexData?.motherId;

  // Check for valid parent IDs in PED and existence in genotypesMap
  const hasValidParents =
    fatherId &&
    fatherId !== '0' &&
    pedigreeData.has(fatherId) &&
    motherId &&
    motherId !== '0' &&
    pedigreeData.has(motherId);

  if (!hasValidParents) {
    debugDetailed(`  CompHet: No valid parent info for index ${indexSampleId}.`);
    result.pattern = 'compound_heterozygous_possible_missing_parents';
    debugDetailed(`--- Exiting: ${geneSymbol}, Result: ${JSON.stringify(result)} ---`);
    return result;
  }

  // Check if parents have genotypes available (check first variant for presence)
  const firstVariantKey = hetVariantsInIndex[0].variantKey;
  const firstVariantGenotypes = genotypesMap.get(firstVariantKey);
  const fatherHasGenotype = firstVariantGenotypes?.has(fatherId);
  const motherHasGenotype = firstVariantGenotypes?.has(motherId);

  if (!fatherHasGenotype || !motherHasGenotype) {
    debugDetailed(`  CompHet: Missing parent genotype data.`);
    result.pattern = 'compound_heterozygous_possible_missing_parent_genotypes';
    debugDetailed(`--- Exiting: ${geneSymbol}, Result: ${JSON.stringify(result)} ---`);
    return result;
  }

  // --- Determine Parent of Origin for Each Het Variant ---
  debugDetailed(
    `  CompHet: Parents found - Father=${fatherId}, Mother=${motherId}. Checking inheritance...`
  );
  for (const variant of hetVariantsInIndex) {
    const variantKey = variant.variantKey;
    const variantGenotypes = genotypesMap.get(variantKey); // Should exist

    // Get parent genotypes (should exist based on check above)
    const fatherGt = variantGenotypes.get(fatherId);
    const motherGt = variantGenotypes.get(motherId);
    debugDetailed(
      `    CompHet Check: Variant ${variantKey}: Father GT='${fatherGt}', Mother GT='${motherGt}'`
    );

    const fatherIsVariant = isVariant(fatherGt);
    const motherIsVariant = isVariant(motherGt);
    const fatherIsRef = isRef(fatherGt);
    const motherIsRef = isRef(motherGt);
    const fatherIsMissing = isMissing(fatherGt);
    const motherIsMissing = isMissing(motherGt);

    // Determine Parent of Origin (PoO)
    if (fatherIsVariant && motherIsRef) {
      // Clearly Paternal
      debugDetailed(`      -> Variant ${variantKey} from father (pat variant, mat ref).`);
      result.paternalVariantKeys.push(variantKey);
    } else if (motherIsVariant && fatherIsRef) {
      // Clearly Maternal
      debugDetailed(`      -> Variant ${variantKey} from mother (mat variant, pat ref).`);
      result.maternalVariantKeys.push(variantKey);
    } else if (fatherIsVariant && motherIsMissing) {
      // Possibly Paternal
      debugDetailed(`      -> Variant ${variantKey} likely from father (mat GT missing).`);
      result.paternalVariantKeys.push(variantKey); // Tentatively assign
      result.ambiguousVariantKeys.push(variantKey); // Mark as ambiguous
    } else if (motherIsVariant && fatherIsMissing) {
      // Possibly Maternal
      debugDetailed(`      -> Variant ${variantKey} likely from mother (pat GT missing).`);
      result.maternalVariantKeys.push(variantKey); // Tentatively assign
      result.ambiguousVariantKeys.push(variantKey); // Mark as ambiguous
    } else {
      // Ambiguous cases: Both variant, Both ref (de novo het?), Both missing, One ref/one missing
      debugDetailed(`      -> ${variantKey} unclear.`);
      result.ambiguousVariantKeys.push(variantKey);
      if (fatherIsVariant && motherIsVariant) {
        debugDetailed('         Both parents have variant.');
      } else if (fatherIsRef && motherIsRef) {
        debugDetailed('         No variants in parents.');
      } else if (fatherIsMissing && motherIsMissing) {
        debugDetailed('         Both parents missing GT.');
      } else if ((fatherIsRef && motherIsMissing) || (fatherIsMissing && motherIsRef)) {
        debugDetailed('         One ref, one missing.');
      }
    }
  }

  // Ensure ambiguous list is unique and doesn't contain clearly assigned keys
  result.ambiguousVariantKeys = [...new Set(result.ambiguousVariantKeys)].filter(
    (k) => !result.paternalVariantKeys.includes(k) || !result.maternalVariantKeys.includes(k)
  );
  result.paternalVariantKeys = [...new Set(result.paternalVariantKeys)];
  result.maternalVariantKeys = [...new Set(result.maternalVariantKeys)];

  debugDetailed(
    `  PoO: Pat=${result.paternalVariantKeys.length}, ` +
      `Mat=${result.maternalVariantKeys.length}, Amb=${result.ambiguousVariantKeys.length}`
  );

  // --- Determine Final CompHet Status ---
  // Confirmed CompHet requires at least one variant likely from each parent.
  if (result.paternalVariantKeys.length > 0 && result.maternalVariantKeys.length > 0) {
    debugDetailed(`  CompHet: Confirmed compound heterozygous in ${geneSymbol}.`);
    result.isCompHet = true;
    result.isPossible = true; // Confirmed is also possible
    result.pattern = 'compound_heterozygous';
  } else {
    // Possible CompHet if index is het for >=2 variants but
    // parental origin is not clearly biparental.
    debugDetailed(`  CompHet: Unconfirmed in ${geneSymbol}.`);
    result.isPossible = true; // Already true by default
    // Keep default or refine based on ambiguity/cis?
    result.pattern = 'compound_heterozygous_possible';
    // Example refinement:
    // if (result.ambiguousVariantKeys.length > 0) {
    //   result.pattern = 'compound_heterozygous_possible_ambiguous';
    // } else if (!result.paternalVariantKeys.length || !result.maternalVariantKeys.length) {
    //   result.pattern = 'compound_heterozygous_possible_cis';
    // }
  }

  debugDetailed(`--- Exiting: ${geneSymbol}, Result: ${JSON.stringify(result)} ---`);
  return result;
}

module.exports = {
  analyzeCompoundHeterozygous,
};
