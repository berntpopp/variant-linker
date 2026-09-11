'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
const { orderedChunks } = require('./api/orderedChunks');
/** Request region annotations in bounded chunks, optionally using two workers.
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
  const chunkSize = apiConfig.ensembl.vepPostChunkSize;
  return orderedChunks(
    variants,
    async (chunk, _index, signal) => {
      const response = await fetchApi(
        apiConfig.ensembl.endpoints.vepRegions,
        options,
        cacheEnabled,
        'POST',
        { variants: chunk },
        proxyConfig,
        { ...requestOptions, signal }
      );
      if (
        !Array.isArray(response) ||
        response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
      )
        throw new Error('VEP response must be an array of annotation objects');
      return /** @type {import('./dataTypes').Annotation[]} */ (response);
    },
    { chunkSize, concurrency: requestOptions.postConcurrency, signal: requestOptions.signal }
  );
}
module.exports = vepRegionsAnnotation;
