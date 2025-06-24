/**
 * @fileoverview Feature annotator module for variant overlap analysis.
 * This module provides functionality to annotate variants with overlapping
 * genomic regions and gene features from user-provided files.
 * @module featureAnnotator
 */

'use strict';

const path = require('path');
const debug = require('debug')('variant-linker:feature-annotator');

/**
 * Annotates variants with overlap information from user-provided features.
 * @param {Array<Object>} annotationData - Array of VEP annotations.
 * @param {Object} features - The loaded features from loadFeatures containing featuresByChrom and geneSets.
 * @returns {Array<Object>} The modified annotationData with a new `user_feature_overlap` field.
 */
function annotateOverlaps(annotationData, features) {
  if (!features || !annotationData || !Array.isArray(annotationData)) {
    debug('No features provided or invalid annotation data, skipping overlap annotation');
    return annotationData;
  }

  const { featuresByChrom, geneSets } = features;
  debug(`Starting overlap annotation for ${annotationData.length} variants`);
  debug(`Available chromosomes in features: ${Object.keys(featuresByChrom || {}).join(', ')}`);
  debug(`Total genes in gene sets: ${geneSets ? geneSets.size : 0}`);

  let totalRegionOverlaps = 0;
  let totalGeneOverlaps = 0;

  for (const annotation of annotationData) {
    annotation.user_feature_overlap = [];

    // 1. Region Overlap Check
    if (featuresByChrom && annotation.seq_region_name && annotation.start && annotation.end) {
      const chrom = String(annotation.seq_region_name).replace(/^chr/i, ''); // Normalize chromosome name
      const start = parseInt(annotation.start, 10);
      const end = parseInt(annotation.end, 10);

      if (featuresByChrom[chrom]) {
        try {
          const overlappingRegions = featuresByChrom[chrom].search(start, end);

          for (const region of overlappingRegions) {
            const overlapData = {
              type: 'region',
              name: region.name || 'unnamed',
              source: path.basename(region.source || 'unknown'),
              chrom: chrom,
              region_start: region.low,
              region_end: region.high,
            };

            // Add optional fields if they exist
            if (region.score !== null && region.score !== undefined) {
              overlapData.score = region.score;
            }
            if (region.strand) {
              overlapData.strand = region.strand;
            }

            annotation.user_feature_overlap.push(overlapData);
            totalRegionOverlaps++;
          }

          debug(
            `Found ${overlappingRegions.length} region overlaps for variant at ${chrom}:${start}-${end}`
          );
        } catch (error) {
          debug(`Error searching for region overlaps on ${chrom}: ${error.message}`);
        }
      }
    }

    // 2. Gene Overlap Check
    if (geneSets && geneSets.size > 0 && annotation.transcript_consequences) {
      // Extract gene symbols from transcript consequences
      const variantGenes = new Set();

      for (const consequence of annotation.transcript_consequences) {
        if (consequence.gene_symbol) {
          variantGenes.add(consequence.gene_symbol);
        }
        // Also check gene_id if available (for Ensembl IDs)
        if (consequence.gene_id) {
          variantGenes.add(consequence.gene_id);
        }
      }

      debug(
        `Checking ${variantGenes.size} genes for overlap: ${Array.from(variantGenes).join(', ')}`
      );

      for (const gene of variantGenes) {
        if (geneSets.has(gene)) {
          const geneInfoList = geneSets.get(gene);

          for (const geneInfo of geneInfoList) {
            const overlapData = {
              type: 'gene',
              identifier: gene,
              source: path.basename(geneInfo.source || 'unknown'),
              gene_source_type: geneInfo.type || 'unknown',
            };

            // Add additional fields from JSON genes
            Object.keys(geneInfo).forEach((key) => {
              if (!['source', 'type'].includes(key)) {
                overlapData[key] = geneInfo[key];
              }
            });

            annotation.user_feature_overlap.push(overlapData);
            totalGeneOverlaps++;
          }

          debug(`Found gene overlap for ${gene}`);
        }
      }
    }

    // Sort overlaps by type and name for consistent output
    annotation.user_feature_overlap.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      const aName = a.name || a.identifier || '';
      const bName = b.name || b.identifier || '';
      return aName.localeCompare(bName);
    });
  }

  debug(
    `Overlap annotation complete. Total region overlaps: ${totalRegionOverlaps}, ` +
      `Total gene overlaps: ${totalGeneOverlaps}`
  );

  return annotationData;
}

/**
 * Checks if any annotation in the dataset has user feature overlaps.
 * This can be used to determine if the UserFeatureOverlap column should be included in output.
 * @param {Array<Object>} annotationData - Array of VEP annotations.
 * @returns {boolean} True if any annotation has user feature overlaps.
 */
function hasUserFeatureOverlaps(annotationData) {
  if (!annotationData || !Array.isArray(annotationData)) {
    return false;
  }

  return annotationData.some(
    (annotation) =>
      annotation.user_feature_overlap &&
      Array.isArray(annotation.user_feature_overlap) &&
      annotation.user_feature_overlap.length > 0
  );
}

/**
 * Formats user feature overlap data for display in tabular output.
 * @param {Array<Object>} overlaps - Array of overlap objects.
 * @returns {string} Formatted string representation of overlaps.
 */
function formatUserFeatureOverlaps(overlaps) {
  if (!Array.isArray(overlaps) || overlaps.length === 0) {
    return '';
  }

  return overlaps
    .map((overlap) => {
      if (overlap.type === 'region') {
        return `region:${overlap.name || 'unknown'}(${overlap.source || 'unknown'})`;
      } else if (overlap.type === 'gene') {
        return `gene:${overlap.identifier || 'unknown'}(${overlap.source || 'unknown'})`;
      }
      return `${overlap.type}:${overlap.name || overlap.identifier || 'unknown'}(${overlap.source || 'unknown'})`;
    })
    .join(';');
}

module.exports = {
  annotateOverlaps,
  hasUserFeatureOverlaps,
  formatUserFeatureOverlaps,
};
