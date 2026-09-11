'use strict';
const { liftOverVariant, parseVcfVariant, constructRegionString } = require('../assemblyConverter');
const { errorMessage } = require('./input');
/** Return validated target variants and the historical inverse lookup map used by VCF output.
 * @param {string[]} variants @param {boolean} [cacheEnabled]
 * @param {import('../apiHelper').RequestOptions} [requestOptions]
 */
async function performLiftover(variants, cacheEnabled = false, requestOptions = {}) {
  /** @type {string[]} */
  const liftedVariants = [];
  /** @type {Record<string, import('../analysisTypes').LiftoverMeta>} */
  const liftoverMeta = {};
  /** Despite its legacy name, this maps lifted keys to original keys. @type {Record<string, string>} */
  const originalToLiftedMap = {};
  for (const originalVariant of variants) {
    const parsed = parseVcfVariant(originalVariant);
    if (!parsed) {
      liftoverMeta[originalVariant] = {
        status: 'error',
        message: 'Input is not coordinate-based (VCF format)',
      };
      continue;
    }
    try {
      const lifted = await liftOverVariant(originalVariant, cacheEnabled, requestOptions);
      if (
        originalToLiftedMap[lifted.liftedKey] &&
        originalToLiftedMap[lifted.liftedKey] !== lifted.originalVariant
      ) {
        throw new Error('Multiple original variants map to the same target identity');
      }
      liftedVariants.push(lifted.variant);
      originalToLiftedMap[lifted.liftedKey] = lifted.originalVariant;
      const target = parseVcfVariant(lifted.variant);
      liftoverMeta[originalVariant] = {
        ...lifted,
        status: 'success',
        liftedVariant: lifted.variant,
        originalRegion: constructRegionString(parsed),
        mapped: target ? constructRegionString(target) : lifted.variant,
      };
    } catch (error) {
      const message = errorMessage(error);
      liftoverMeta[originalVariant] = {
        status: /mapping|reference|span/i.test(message) ? 'failed' : 'error',
        message,
      };
    }
  }
  return { liftedVariants, liftoverMeta, originalToLiftedMap };
}
module.exports = { performLiftover };
