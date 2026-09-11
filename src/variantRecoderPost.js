'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
const { orderedChunks } = require('./api/orderedChunks');
/** Request recoder results without writing diagnostics to stdout.
 * @param {string[]} variants
 * @param {import('./apiHelper').QueryOptions} [options]
 * @param {boolean} [cacheEnabled]
 * @param {import('./apiHelper').ProxyConfig} [proxyConfig]
 * @param {import('./apiHelper').RequestOptions} [requestOptions]
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function variantRecoderPost(
  variants,
  options = {},
  cacheEnabled = false,
  proxyConfig = null,
  requestOptions = {}
) {
  if (!Array.isArray(variants) || variants.length === 0)
    throw new Error('Variants must be provided as a non-empty array');
  /** @type {import('./apiHelper').QueryOptions} */
  const query = { vcf_string: '1', ...options };
  const species = query.species || 'homo_sapiens';
  if (!/^[a-z0-9_]+$/i.test(String(species)))
    throw new Error(
      'Recoder species must be a name or alias containing letters, numbers or underscores'
    );
  delete query.species;
  const size = apiConfig.ensembl.recoderPostChunkSize;
  return orderedChunks(
    variants,
    async (chunk, _index, signal) => {
      const response = await fetchApi(
        `${apiConfig.ensembl.endpoints.variantRecoderBase}/${species}`,
        query,
        cacheEnabled,
        'POST',
        { ids: chunk },
        proxyConfig,
        { ...requestOptions, signal }
      );
      if (
        !Array.isArray(response) ||
        response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
      )
        throw new Error('Variant Recoder response must be an array of objects');
      return response;
    },
    { chunkSize: size, concurrency: requestOptions.postConcurrency, signal: requestOptions.signal }
  );
}
module.exports = variantRecoderPost;
