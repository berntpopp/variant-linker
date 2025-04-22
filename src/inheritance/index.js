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
};

// Optionally, export utils and constants under a sub-namespace if they might be useful externally,
// but keep the main focus on the analysis function. Direct imports are often cleaner.
inheritance.utils = {
  ...genotypeUtils,
  ...pedigreeUtils,
  DEFAULT_PRIORITY_ORDER: patternPrioritizer.DEFAULT_PRIORITY_ORDER,
};

module.exports = inheritance;
