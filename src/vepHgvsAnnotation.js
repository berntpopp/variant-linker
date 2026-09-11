'use strict';
const { fetchApi } = require('./apiHelper');
const apiConfig = require('../config/apiConfig.json');
/** Retrieve HGVS annotations. Transcript is retained for signature compatibility.
 * @param {string} hgvs
 * @param {string} transcript
 * @param {import('./apiHelper').QueryOptions} [options]
 * @param {boolean} [cacheEnabled]
 * @param {import('./apiHelper').RequestOptions} [requestOptions]
 * @returns {Promise<import('./dataTypes').Annotation[]>}
 */
async function vepHgvsAnnotation(
  hgvs,
  transcript,
  options = {},
  cacheEnabled = false,
  requestOptions = {}
) {
  const response = await fetchApi(
    `${apiConfig.ensembl.endpoints.vepHgvs}/${encodeURIComponent(hgvs)}`,
    options,
    cacheEnabled,
    'GET',
    null,
    null,
    requestOptions
  );
  if (
    !Array.isArray(response) ||
    response.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
  )
    throw new Error('VEP response must be an array of annotation objects');
  return /** @type {import('./dataTypes').Annotation[]} */ (response);
}
module.exports = vepHgvsAnnotation;
