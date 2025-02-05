'use strict';

// Export modules that you want available to library users.
const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const vepHgvsAnnotation = require('./vepHgvsAnnotation');
const { convertVcfToEnsemblFormat } = require('./convertVcfToEnsemblFormat');
const scoring = require('./scoring');
const variantLinkerProcessor = require('./variantLinkerProcessor');
const apiHelper = require('./apiHelper');
const cache = require('./cache');
const configHelper = require('./configHelper');
const schemaMapper = require('./schemaMapper');

// Flatten the exports from variantLinkerProcessor so that its functions are available at the top level.
module.exports = {
  variantRecoder,
  vepRegionsAnnotation,
  vepHgvsAnnotation,
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
