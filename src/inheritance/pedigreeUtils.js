// src/inheritance/pedigreeUtils.js
'use strict';

/**
 * @fileoverview Utility functions related to pedigree data.
 * @module pedigreeUtils
 */

/**
 * Determines if a sample is male based on sex information in pedigree data.
 * Handles both string ('1') and number (1) representations.
 *
 * @param {string} sampleId - The sample ID to check.
 * @param {Map<string, Object>} pedigreeData - Map of sampleId to pedigree info objects.
 *                                             Each object should have a 'sex' property.
 * @returns {boolean} True if the sample is found and sex is 1, false otherwise.
 */
function isMale(sampleId, pedigreeData) {
  if (!pedigreeData || !sampleId || !pedigreeData.has(sampleId)) {
    return false;
  }
  const sample = pedigreeData.get(sampleId);
  // Check for both string '1' and number 1
  return sample && (sample.sex === '1' || sample.sex === 1);
}

/**
 * Determines if a sample is female based on sex information in pedigree data.
 * Handles both string ('2') and number (2) representations.
 *
 * @param {string} sampleId - The sample ID to check.
 * @param {Map<string, Object>} pedigreeData - Map of sampleId to pedigree info objects.
 *                                             Each object should have a 'sex' property.
 * @returns {boolean} True if the sample is found and sex is 2, false otherwise.
 */
function isFemale(sampleId, pedigreeData) {
  if (!pedigreeData || !sampleId || !pedigreeData.has(sampleId)) {
    return false;
  }
  const sample = pedigreeData.get(sampleId);
  // Check for both string '2' and number 2
  return sample && (sample.sex === '2' || sample.sex === 2);
}

module.exports = {
  isMale,
  isFemale,
};
