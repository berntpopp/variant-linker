// index.js
'use strict';

// Export modules that you want available to library users.
const variantRecoder = require('./src/variantRecoder');
const vepRegionsAnnotation = require('./src/vepRegionsAnnotation');
const vepHgvsAnnotation = require('./src/vepHgvsAnnotation');
const { convertVcfToEnsemblFormat } = require('./src/convertVcfToEnsemblFormat');
const scoring = require('./src/scoring');
const variantLinkerProcessor = require('./src/variantLinkerProcessor');
const apiHelper = require('./src/apiHelper');
const cache = require('./src/cache');
const configHelper = require('./src/configHelper');
const schemaMapper = require('./src/schemaMapper');

module.exports = {
  variantRecoder,
  vepRegionsAnnotation,
  vepHgvsAnnotation,
  convertVcfToEnsemblFormat,
  scoring,
  variantLinkerProcessor,
  apiHelper,
  cache,
  configHelper,
  schemaMapper,
};
