'use strict';
const fs = require('fs').promises;
const debug = require('debug')('variant-linker:feature-parser');
const {
  parseBedText,
  parseGeneListText,
  parseJsonGenesData,
  buildFeatures,
} = require('./features/data');

/** @param {string} filePath @returns {Promise<import('./dataTypes').BedRegion[]>} */
async function parseBedFile(filePath) {
  debug('Parsing BED file: %s', filePath);
  try {
    return parseBedText(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new Error(`Error parsing BED file ${filePath}: ${error.message}`, { cause: error });
  }
}
/** @param {string} filePath @returns {Promise<import('./dataTypes').GeneRecord[]>} */
async function parseGeneListFile(filePath) {
  debug('Parsing gene list file: %s', filePath);
  try {
    return parseGeneListText(await fs.readFile(filePath, 'utf8'), filePath);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new Error(`Error parsing gene list file ${filePath}: ${error.message}`, { cause: error });
  }
}
/** @param {string} filePath @param {import('./dataTypes').GeneMapping} mapping
 * @returns {Promise<import('./dataTypes').GeneRecord[]>} */
async function parseJsonGeneFile(filePath, mapping) {
  if (!mapping || !mapping.identifier)
    throw new Error('JSON gene mapping must include "identifier" field');
  try {
    return parseJsonGenesData(JSON.parse(await fs.readFile(filePath, 'utf8')), mapping, filePath);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error instanceof SyntaxError) {
      throw new Error(
        `Error parsing JSON file ${filePath}: Invalid JSON format - ${error.message}`,
        { cause: error }
      );
    }
    throw new Error(`Error parsing JSON gene file ${filePath}: ${error.message}`, { cause: error });
  }
}
/** Load file sources and use the same feature builder as in-memory callers.
 * @param {import('./dataTypes').FeatureParams} params @returns {Promise<import('./dataTypes').Features>}
 */
async function loadFeatures(params) {
  /** @type {NonNullable<import('./features/data').FeatureSources['beds']>} */
  const beds = [];
  /** @type {NonNullable<import('./features/data').FeatureSources['geneLists']>} */
  const geneLists = [];
  /** @type {NonNullable<import('./features/data').FeatureSources['jsonGenes']>} */
  const jsonGenes = [];
  if (Array.isArray(params.bedFile)) {
    for (const source of params.bedFile) beds.push({ source, regions: await parseBedFile(source) });
  }
  if (Array.isArray(params.geneList)) {
    for (const source of params.geneList)
      geneLists.push({ source, genes: await parseGeneListFile(source) });
  }
  if (Array.isArray(params.jsonGenes)) {
    if (!params.jsonGeneMapping)
      throw new Error('--json-gene-mapping is required when using --json-genes');
    let mapping;
    try {
      mapping = JSON.parse(params.jsonGeneMapping);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new Error(`Invalid JSON gene mapping: ${error.message}`, { cause: error });
    }
    for (const source of params.jsonGenes)
      jsonGenes.push({ source, genes: await parseJsonGeneFile(source, mapping) });
  }
  return buildFeatures({ beds, geneLists, jsonGenes });
}
module.exports = {
  parseBedFile,
  parseGeneListFile,
  parseJsonGeneFile,
  loadFeatures,
  parseBedText,
  parseGeneListText,
  parseJsonGenesData,
  buildFeatures,
};
