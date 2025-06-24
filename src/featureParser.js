/**
 * @fileoverview Feature parser module for loading genomic regions and gene lists.
 * This module handles parsing of BED files, gene lists, and JSON gene files for
 * overlap annotation with variants.
 * @module featureParser
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const IntervalTree = require('node-interval-tree');
const debug = require('debug')('variant-linker:feature-parser');

/**
 * Parses a BED file into an array of region objects.
 * Supports 3, 4, and 6+ column BED formats.
 * @param {string} filePath - Path to the BED file.
 * @returns {Promise<Array<Object>>} Parsed region objects.
 */
async function parseBedFile(filePath) {
  debug(`Parsing BED file: ${filePath}`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line && !line.startsWith('#') && !line.startsWith('track') && !line.startsWith('browser')
      );

    const regions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split('\t');

      if (columns.length < 3) {
        debug(`Skipping invalid BED line ${i + 1}: insufficient columns (${columns.length})`);
        continue;
      }

      const chrom = columns[0].replace(/^chr/i, ''); // Remove chr prefix for consistency
      const start = parseInt(columns[1], 10);
      const end = parseInt(columns[2], 10);

      if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
        debug(`Skipping invalid BED line ${i + 1}: invalid coordinates (${start}-${end})`);
        continue;
      }

      const region = {
        chrom,
        start,
        end,
        name: columns[3] || `region_${i + 1}`,
        score: columns[4] ? parseFloat(columns[4]) : null,
        strand: columns[5] || null,
      };

      regions.push(region);
    }

    debug(`Parsed ${regions.length} regions from ${filePath}`);
    return regions;
  } catch (error) {
    throw new Error(`Error parsing BED file ${filePath}: ${error.message}`);
  }
}

/**
 * Parses a simple text file containing a list of genes.
 * Each line should contain one gene symbol or Ensembl ID.
 * @param {string} filePath - Path to the gene list file.
 * @returns {Promise<Array<Object>>} Parsed gene objects.
 */
async function parseGeneListFile(filePath) {
  debug(`Parsing gene list file: ${filePath}`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').map((line) => line.trim());

    const genes = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.startsWith('#')) {
        genes.push({
          identifier: line,
          source: path.basename(filePath),
          line: i + 1, // Original line number
        });
      }
    }

    debug(`Parsed ${genes.length} genes from ${filePath}`);
    return genes;
  } catch (error) {
    throw new Error(`Error parsing gene list file ${filePath}: ${error.message}`);
  }
}

/**
 * Parses a JSON file containing gene information based on a mapping.
 * @param {string} filePath - Path to the JSON file.
 * @param {Object} mapping - Field mapping configuration with 'identifier' and optional 'dataFields'.
 * @returns {Promise<Array<Object>>} Parsed gene objects.
 */
async function parseJsonGeneFile(filePath, mapping) {
  debug(`Parsing JSON gene file: ${filePath} with mapping:`, mapping);

  if (!mapping || !mapping.identifier) {
    throw new Error('JSON gene mapping must include "identifier" field');
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    // Handle both array and object formats
    const items = Array.isArray(data) ? data : Object.values(data);

    const genes = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item || typeof item !== 'object') {
        debug(`Skipping invalid item ${i}: not an object`);
        continue;
      }

      const identifier = item[mapping.identifier];
      if (!identifier) {
        debug(`Skipping item ${i}: missing identifier field '${mapping.identifier}'`);
        continue;
      }

      const gene = {
        identifier: String(identifier),
        source: path.basename(filePath),
      };

      // Add additional data fields if specified
      if (mapping.dataFields && Array.isArray(mapping.dataFields)) {
        for (const field of mapping.dataFields) {
          if (item[field] !== undefined) {
            gene[field] = item[field];
          }
        }
      }

      genes.push(gene);
    }

    debug(`Parsed ${genes.length} genes from ${filePath}`);
    return genes;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Error parsing JSON file ${filePath}: Invalid JSON format - ${error.message}`
      );
    }
    throw new Error(`Error parsing JSON gene file ${filePath}: ${error.message}`);
  }
}

/**
 * Loads all features from file paths provided in params.
 * @param {Object} params - CLI/config parameters.
 * @returns {Promise<Object>} An object containing featuresByChrom and geneSets.
 */
async function loadFeatures(params) {
  debug('Loading features from provided parameters');

  const featuresByChrom = {};
  const geneSets = new Map();

  // Parse BED files
  if (params.bedFile && Array.isArray(params.bedFile)) {
    for (const file of params.bedFile) {
      try {
        const regions = await parseBedFile(file);

        for (const region of regions) {
          if (!featuresByChrom[region.chrom]) {
            featuresByChrom[region.chrom] = new IntervalTree();
          }

          // Store region data with source information
          const regionData = {
            name: region.name,
            source: file,
            score: region.score,
            strand: region.strand,
          };

          featuresByChrom[region.chrom].insert(region.start, region.end, regionData);
        }

        debug(`Loaded ${regions.length} regions from ${file}`);
      } catch (error) {
        debug(`Failed to load BED file ${file}: ${error.message}`);
        throw error;
      }
    }
  }

  // Parse simple gene list files
  if (params.geneList && Array.isArray(params.geneList)) {
    for (const file of params.geneList) {
      try {
        const genes = await parseGeneListFile(file);

        for (const gene of genes) {
          if (!geneSets.has(gene.identifier)) {
            geneSets.set(gene.identifier, []);
          }

          geneSets.get(gene.identifier).push({
            source: file,
            type: 'gene_list',
          });
        }

        debug(`Loaded ${genes.length} genes from ${file}`);
      } catch (error) {
        debug(`Failed to load gene list file ${file}: ${error.message}`);
        throw error;
      }
    }
  }

  // Parse JSON gene files
  if (params.jsonGenes && Array.isArray(params.jsonGenes)) {
    if (!params.jsonGeneMapping) {
      throw new Error('--json-gene-mapping is required when using --json-genes');
    }

    let mapping;
    try {
      mapping = JSON.parse(params.jsonGeneMapping);
    } catch (error) {
      throw new Error(`Invalid JSON gene mapping: ${error.message}`);
    }

    for (const file of params.jsonGenes) {
      try {
        const genes = await parseJsonGeneFile(file, mapping);

        for (const gene of genes) {
          if (!geneSets.has(gene.identifier)) {
            geneSets.set(gene.identifier, []);
          }

          const geneData = {
            source: file,
            type: 'json_genes',
          };

          // Add additional data fields
          Object.keys(gene).forEach((key) => {
            if (key !== 'identifier' && key !== 'source') {
              geneData[key] = gene[key];
            }
          });

          geneSets.get(gene.identifier).push(geneData);
        }

        debug(`Loaded ${genes.length} genes from ${file}`);
      } catch (error) {
        debug(`Failed to load JSON gene file ${file}: ${error.message}`);
        throw error;
      }
    }
  }

  const totalRegions = Object.values(featuresByChrom).reduce((sum, tree) => sum + tree.count, 0);
  debug(
    `Feature loading complete. Total regions: ${totalRegions}, Total unique genes: ${geneSets.size}`
  );

  return { featuresByChrom, geneSets };
}

module.exports = {
  parseBedFile,
  parseGeneListFile,
  parseJsonGeneFile,
  loadFeatures,
};
