/**
 * @fileoverview Main export for Variant-Linker.
 * Exports the core functionality along with various helper modules.
 */

'use strict';

const { analyzeVariant, detectInputFormat } = require('./variantLinkerCore');
const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const { convertVcfToEnsemblFormat } = require('./convertVcfToEnsemblFormat');
const scoring = require('./scoring');
const variantLinkerProcessor = require('./variantLinkerProcessor');
const apiHelper = require('./apiHelper');
const cache = require('./cache');
const configHelper = require('./configHelper');
const schemaMapper = require('./schemaMapper');

const exportsObj = {
  analyzeVariant,
  detectInputFormat,
  variantRecoder,
  vepRegionsAnnotation,
  convertVcfToEnsemblFormat,
  scoring,
  processVariantLinking: variantLinkerProcessor.processVariantLinking,
  filterAndFormatResults: variantLinkerProcessor.filterAndFormatResults,
  outputResults: variantLinkerProcessor.outputResults,
  jsonApiFilter: variantLinkerProcessor.jsonApiFilter,
  apiHelper,
  cache,
  configHelper,
  schemaMapper,
};

module.exports = exportsObj;
module.exports.default = exportsObj;
