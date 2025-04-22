/**
 * @fileoverview PED file parser for family structure and affected status.
 * This module reads and parses standard 6-column PED (pedigree) files.
 * @module pedReader
 */

'use strict';

const fs = require('fs').promises;
const debug = require('debug')('variant-linker:ped-reader');

/**
 * Reads and parses a standard 6-column PED file.
 *
 * @param {string} filePath - Path to the PED file
 * @returns {Promise<Map<string, Object>>} A Map with SampleID as key and parsed PED data as value
 * @throws {Error} If the file doesn't exist, is not readable, or has parsing errors
 *
 * @example
 * // PED file format (tab or space delimited):
 * // FamilyID  SampleID  FatherID  MotherID  Sex  AffectedStatus
 *
 * // Returns a Map with structure:
 * // Map<SampleID, {
 * //   familyId: string,
 * //   fatherId: string, // '0' for founder
 * //   motherId: string, // '0' for founder
 * //   sex: number,      // 1=male, 2=female, 0=unknown
 * //   affectedStatus: number // 0=unknown, 1=unaffected, 2=affected
 * // }>
 */
async function readPedigree(filePath) {
  try {
    // Verify file exists and is readable
    await fs.access(filePath);

    // Read file content
    const fileContent = await fs.readFile(filePath, 'utf8');

    // Split into lines and filter out empty lines and comments
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // Initialize Map to store parsed data
    const pedigreeData = new Map();

    // Parse each line
    for (let i = 0; i < lines.length; i++) {
      // Allow both tab and space delimiters by splitting on whitespace
      const columns = lines[i].split(/\s+/);

      // Standard PED has 6 required columns
      if (columns.length < 6) {
        debug(`Line ${i + 1}: Skipping invalid line with fewer than 6 columns: "${lines[i]}"`);
        continue;
      }

      const [familyId, sampleId, fatherId, motherId, sexCode, affectedStatusCode] = columns;

      // Parse sex and affected status to integers
      const sex = parseInt(sexCode, 10);
      const affectedStatus = parseInt(affectedStatusCode, 10);

      // Validate sex code (0=unknown, 1=male, 2=female)
      if (![0, 1, 2].includes(sex)) {
        const msg = `Line ${i + 1}: Invalid sex code "${sexCode}" for "${sampleId}". Using 0.`;
        debug(msg);
      }

      // Validate affected status (0=unknown, 1=unaffected, 2=affected)
      if (![0, 1, 2].includes(affectedStatus)) {
        const msg = `Line ${i + 1}: Bad status "${affectedStatusCode}" (${sampleId}). Set to 0.`;
        debug(msg);
      }

      // Store parsed data
      pedigreeData.set(sampleId, {
        familyId,
        fatherId,
        motherId,
        sex: [0, 1, 2].includes(sex) ? sex : 0,
        affectedStatus: [0, 1, 2].includes(affectedStatus) ? affectedStatus : 0,
      });
    }

    debug(`Successfully parsed ${pedigreeData.size} samples from PED file`);
    return pedigreeData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`PED file not found: ${filePath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Cannot read PED file (permission denied): ${filePath}`);
    } else {
      throw new Error(`Error reading PED file: ${error.message}`);
    }
  }
}

module.exports = {
  readPedigree,
};
