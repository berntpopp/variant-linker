'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
/** Request region annotations in sequential bounded chunks.
 * @param {string[]} variants
 * @param {import('./apiHelper').QueryOptions} [options]
 * @param {boolean} [cacheEnabled]
 * @param {import('./apiHelper').ProxyConfig} [proxyConfig]
 * @param {import('./apiHelper').RequestOptions} [requestOptions]
 * @returns {Promise<import('./dataTypes').Annotation[]>}
 */
async function vepRegionsAnnotation(
  variants,
  options = {},
  cacheEnabled = false,
  proxyConfig = null,
  requestOptions = {}
) {
  const results = [];
  const chunkSize = apiConfig.ensembl.vepPostChunkSize || 200;
  for (let offset = 0; offset < variants.length; offset += chunkSize) {
    const response = await fetchApi(
      apiConfig.ensembl.endpoints.vepRegions,
      options,
      cacheEnabled,
      'POST',
      { variants: variants.slice(offset, offset + chunkSize) },
      proxyConfig,
      requestOptions
    );
    if (
      !Array.isArray(response) ||
      response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
    )
      throw new Error('VEP response must be an array of annotation objects');
    results.push(.../** @type {import('./dataTypes').Annotation[]} */ (response));
  }
  return results;
}
module.exports = vepRegionsAnnotation;
