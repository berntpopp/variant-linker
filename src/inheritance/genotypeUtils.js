// src/inheritance/genotypeUtils.js
'use strict';

/**
 * @fileoverview Utility functions for classifying VCF genotypes.
 * @module genotypeUtils
 */

// Note: Add debug logs here if needed (scope: 'variant-linker:inheritance:genotype')

/**
 * Checks if a genotype represents a reference homozygous call (0/0).
 * Handles different delimiters (/, |, -) and phased/unphased.
 * @param {string} gt - Genotype string (e.g., '0/0', '0|0', '0-0', './.')
 * @returns {boolean} True if the genotype is reference homozygous
 */
function isRef(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Match 0/0, 0|0, or 0-0 patterns exactly
  return /^0[\/\|]0$/.test(gt) || gt === '0-0';
}

/**
 * Checks if a genotype represents a heterozygous call (0/1, 1/0).
 * Handles different delimiters (/, |, -) and phased/unphased.
 * Excludes homozygous calls (0/0, 1/1).
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is heterozygous
 */
function isHet(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Basic check for 0/1 or 1/0 pattern with delimiters
  const isHetPattern = /^[01][\/\|][01]$/.test(gt) || /^[01]-[01]$/.test(gt);
  if (!isHetPattern) return false;
  // Explicitly exclude homozygous calls
  return (
    gt !== '0/0' && gt !== '0|0' && gt !== '0-0' && gt !== '1/1' && gt !== '1|1' && gt !== '1-1'
  );
}

/**
 * Checks if a genotype represents an alternate homozygous call (1/1).
 * Handles different delimiters (/, |, -) and phased/unphased.
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is alternate homozygous
 */
function isHomAlt(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Match 1/1, 1|1, or 1-1 patterns exactly
  return /^1[\/\|]1$/.test(gt) || gt === '1-1';
}

/**
 * Checks if a genotype represents *any* variant call (heterozygous or homozygous alternate).
 * Basically, checks if the genotype is not reference homozygous and not missing.
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype contains at least one variant allele
 */
function isVariant(gt) {
  if (!gt || typeof gt !== 'string' || gt === './.') return false;
  // Check if it's a valid pattern (0/0, 0/1, 1/0, 1/1 with delimiters)
  const isValidPattern = /^[01][\/\|][01]$/.test(gt) || /^[01]-[01]$/.test(gt);
  if (!isValidPattern) return false;
  // Return true if it's not reference homozygous
  return !isRef(gt);
}

/**
 * Checks if a genotype is missing or unknown (./., .|., .-. or contains '.').
 * @param {string} gt - Genotype string
 * @returns {boolean} True if the genotype is missing or unknown
 */
function isMissing(gt) {
  // Check for explicit missing patterns or if the string simply contains '.'
  if (!gt || typeof gt !== 'string') return true; // Treat null/undefined/non-string as missing
  return gt === './.' || gt === '.|.' || gt === '.-.' || gt.includes('.');
}

module.exports = {
  isRef,
  isHet,
  isHomAlt,
  isVariant,
  isMissing,
};
