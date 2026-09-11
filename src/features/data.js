'use strict';
const path = require('path');
const IntervalTree = require('node-interval-tree').default;
/** @typedef {{beds?:Array<{source:string,regions:import('../dataTypes').BedRegion[]}>,geneLists?:Array<{source:string,genes:import('../dataTypes').GeneRecord[]}>,jsonGenes?:Array<{source:string,genes:import('../dataTypes').GeneRecord[]}>}} FeatureSources */

/** Parse BED text; coordinates remain zero-based half-open until tree construction.
 * @param {string} text @returns {import('../dataTypes').BedRegion[]}
 */
function parseBedText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !line.startsWith('#') && !line.startsWith('track') && !line.startsWith('browser')
    );
  const regions = [];
  for (const [index, line] of lines.entries()) {
    const columns = line.split('\t');
    if (columns.length < 3) continue;
    const chrom = columns[0].replace(/^chr/i, '');
    const start = parseInt(columns[1], 10),
      end = parseInt(columns[2], 10);
    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) continue;
    regions.push({
      chrom,
      start,
      end,
      name: columns[3] || `region_${index + 1}`,
      score: columns[4] ? parseFloat(columns[4]) : null,
      strand: columns[5] || null,
    });
  }
  return regions;
}

/** @param {string} text @param {string} [source] @returns {import('../dataTypes').GeneRecord[]} */
function parseGeneListText(text, source = 'genes') {
  return text.split('\n').flatMap((line, index) => {
    const identifier = line.trim();
    return identifier && !identifier.startsWith('#')
      ? [{ identifier, source: path.basename(source), line: index + 1 }]
      : [];
  });
}

/** @param {unknown} data @param {import('../dataTypes').GeneMapping} mapping @param {string} [source]
 * @returns {import('../dataTypes').GeneRecord[]} */
function parseJsonGenesData(data, mapping, source = 'genes.json') {
  if (!mapping || !mapping.identifier)
    throw new Error('JSON gene mapping must include "identifier" field');
  if (!data || typeof data !== 'object')
    throw new Error('JSON gene data must be an array or object');
  const items = Array.isArray(data) ? data : Object.values(data);
  /** @type {import('../dataTypes').GeneRecord[]} */
  const genes = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = /** @type {Record<string,unknown>} */ (item);
    const identifier = record[mapping.identifier];
    if (!identifier) continue;
    /** @type {import('../dataTypes').GeneRecord} */
    const gene = { identifier: String(identifier), source: path.basename(source) };
    if (Array.isArray(mapping.dataFields)) {
      for (const field of mapping.dataFields) {
        if (record[field] !== undefined)
          Object.defineProperty(gene, field, {
            value: record[field],
            enumerable: true,
            writable: true,
            configurable: true,
          });
      }
    }
    genes.push(gene);
  }
  return genes;
}

/** Build interval trees and gene provenance for file or browser data.
 * @param {FeatureSources} [sources] @returns {import('../dataTypes').Features}
 */
function buildFeatures(sources = {}) {
  /** @type {import('../dataTypes').Features['featuresByChrom']} */
  const featuresByChrom = Object.create(null);
  /** @type {import('../dataTypes').Features['geneSets']} */
  const geneSets = new Map();
  for (const { source, regions } of sources.beds || []) {
    for (const region of regions) {
      featuresByChrom[region.chrom] ||= new IntervalTree();
      const data = {
        low: region.start + 1,
        high: region.end,
        name: region.name,
        source,
        score: region.score,
        strand: region.strand,
      };
      featuresByChrom[region.chrom].insert(data.low, data.high, data);
    }
  }
  for (const [type, files] of /** @type {const} */ ([
    ['gene_list', sources.geneLists || []],
    ['json_genes', sources.jsonGenes || []],
  ])) {
    for (const { source, genes } of files) {
      for (const gene of genes) {
        if (!geneSets.has(gene.identifier)) geneSets.set(gene.identifier, []);
        const extra =
          type === 'json_genes'
            ? Object.fromEntries(
                Object.entries(gene).filter(([key]) => key !== 'identifier' && key !== 'source')
              )
            : {};
        geneSets.get(gene.identifier)?.push({ source, type, ...extra });
      }
    }
  }
  return { featuresByChrom, geneSets };
}
module.exports = { parseBedText, parseGeneListText, parseJsonGenesData, buildFeatures };
