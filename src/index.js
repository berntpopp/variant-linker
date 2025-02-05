// index.js
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
