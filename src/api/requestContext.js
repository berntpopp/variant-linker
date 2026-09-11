'use strict';
const { getBaseUrl } = require('../configHelper');
const apiConfig = require('../../config/apiConfig.json');

/** Transport budgets are durations in milliseconds: timeoutMs bounds each attempt and
 * deadlineMs bounds the entire fetch, including cache access, retries and backoff.
 * @typedef {{baseUrl?: string, assembly?: string, timeout?: number, timeoutMs?: number,
 * deadlineMs?: number, signal?: AbortSignal, maxRetries?: number, maxResponseBytes?: number,
 * maxRetryDelayMs?: number}} RequestOptions */

/** Snapshot environment fallbacks once; explicit assembly wins over global defaults.
 * @param {RequestOptions} [options]
 */
function resolveRequestOptions(options = {}) {
  const assembly = ['hg19', 'grch37'].includes((options.assembly || '').toLowerCase())
    ? 'GRCh37'
    : 'GRCh38';
  const environmentUrl = typeof process !== 'undefined' ? process.env.ENSEMBL_BASE_URL : undefined;
  const resolved = {
    ...options,
    assembly,
    baseUrl:
      options.baseUrl ||
      (options.assembly ? getBaseUrl(assembly) : environmentUrl || getBaseUrl(assembly)),
    timeoutMs: options.timeoutMs ?? options.timeout ?? 15000,
    deadlineMs: options.deadlineMs ?? 120000,
    maxRetries: options.maxRetries ?? apiConfig.requests.retry.maxRetries,
    maxResponseBytes: options.maxResponseBytes ?? 50 * 1024 * 1024,
    maxRetryDelayMs: options.maxRetryDelayMs ?? 10000,
  };
  for (const key of /** @type {const} */ ([
    'timeoutMs',
    'deadlineMs',
    'maxResponseBytes',
    'maxRetryDelayMs',
  ])) {
    if (!Number.isFinite(resolved[key]) || resolved[key] <= 0)
      throw new Error(`${key} must be a positive finite number`);
  }
  if (!Number.isInteger(resolved.maxRetries) || resolved.maxRetries < 0)
    throw new Error('maxRetries must be a nonnegative integer');
  return Object.freeze(resolved);
}

/** Stable JSON preserves array order and sorts object keys.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  return (
    JSON.stringify(value, (_key, entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]])
        );
      }
      return entry;
    }) ?? 'null'
  );
}

/** @template T @param {Promise<T>} promise @param {AbortSignal} signal @returns {Promise<T>} */
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new Error('Request cancelled'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** @param {number} milliseconds @param {AbortSignal} signal @returns {Promise<void>} */
function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('Request cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

module.exports = { resolveRequestOptions, canonicalJson, abortable, delay };
