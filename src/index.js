/**
 * @fileoverview Main export for Variant-Linker.
 * Exports the core functionality along with various helper modules.
 *
 * The scoring module now exports:
 *   - readScoringConfigFromFiles(configPath): Reads and parses scoring configuration files
 *     from disk (Node only)
 *   - parseScoringConfig(variableAssignmentJson, formulaJson): Parses scoring
 *     configuration JSON objects
 *   - applyScoring(annotationData, scoringConfig): Applies scoring formulas to annotation data
 */

'use strict';

const { analyzeVariant, detectInputFormat } = require('./variantLinkerCore');
const variantRecoder = require('./variantRecoder');
const variantRecoderPost = require('./variantRecoderPost');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const { convertVcfToEnsemblFormat } = require('./convertVcfToEnsemblFormat');
// Scoring exports readScoringConfigFromFiles, parseScoringConfig, and applyScoring
const scoring = require('./scoring');
const variantLinkerProcessor = require('./variantLinkerProcessor');
const apiHelper = require('./apiHelper');
const cache = require('./cache');
const configHelper = require('./configHelper');
const schemaMapper = require('./schemaMapper');

const exportsObj = {
  // Core analysis functions
  analyzeVariant,
  detectInputFormat,

  // API calls and format conversion
  variantRecoder,
  variantRecoderPost,
  vepRegionsAnnotation,
  convertVcfToEnsemblFormat,

  // Scoring functionality:
  // The scoring module now provides two functions for configuration:
  //   - readScoringConfigFromFiles: (Node only) to load config from files
  //   - parseScoringConfig: to parse provided JSON objects
  // along with applyScoring().
  scoring,

  // Variant linker processing functions
  processVariantLinking: variantLinkerProcessor.processVariantLinking,
  filterAndFormatResults: variantLinkerProcessor.filterAndFormatResults,
  outputResults: variantLinkerProcessor.outputResults,
  jsonApiFilter: variantLinkerProcessor.jsonApiFilter,

  // Other helper modules
  apiHelper,
  cache,
  configHelper,
  schemaMapper,
};

module.exports = exportsObj;
module.exports.default = exportsObj;
