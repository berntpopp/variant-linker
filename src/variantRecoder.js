'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
/** Retrieve recoded identifiers for one variant.
 * @param {string} variant
 * @param {import('./apiHelper').QueryOptions} [options]
 * @param {boolean} [cacheEnabled]
 * @param {import('./apiHelper').ProxyConfig} [proxyConfig]
 * @param {import('./apiHelper').RequestOptions} [requestOptions]
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function variantRecoder(
  variant,
  options = {},
  cacheEnabled = false,
  proxyConfig = null,
  requestOptions = {}
) {
  const response = await fetchApi(
    `${apiConfig.ensembl.endpoints.variantRecoder}/${encodeURIComponent(variant)}`,
    { vcf_string: '1', ...options },
    cacheEnabled,
    'GET',
    null,
    proxyConfig,
    requestOptions
  );
  if (
    !Array.isArray(response) ||
    response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
  )
    throw new Error('Variant Recoder response must be an array of objects');
  return response;
}
module.exports = variantRecoder;
