// src/inheritance/index.js
'use strict';

/**
 * @fileoverview Main export for the inheritance analysis module.
 * Provides the primary function `analyzeInheritanceForSample`.
 * @module inheritance
 */

const { analyzeInheritanceForSample } = require('./inheritanceAnalyzer');
const genotypeUtils = require('./genotypeUtils');
const pedigreeUtils = require('./pedigreeUtils');
const patternPrioritizer = require('./patternPrioritizer');

// Primarily export the main analysis function
const inheritance = {
  analyzeInheritanceForSample,
  utils: {
    ...genotypeUtils,
    ...pedigreeUtils,
    DEFAULT_PRIORITY_ORDER: patternPrioritizer.DEFAULT_PRIORITY_ORDER,
  },
};

module.exports = inheritance;
