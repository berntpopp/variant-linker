'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
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
  delete query.species;
  const results = [];
  const size = apiConfig.ensembl.recoderPostChunkSize || 200;
  for (let offset = 0; offset < variants.length; offset += size) {
    const response = await fetchApi(
      `${apiConfig.ensembl.endpoints.variantRecoderBase}/${species}`,
      query,
      cacheEnabled,
      'POST',
      { ids: variants.slice(offset, offset + size) },
      proxyConfig,
      requestOptions
    );
    if (
      !Array.isArray(response) ||
      response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
    )
      throw new Error('Variant Recoder response must be an array of objects');
    results.push(...response);
  }
  return results;
}
module.exports = variantRecoderPost;
