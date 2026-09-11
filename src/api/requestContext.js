'use strict';
const { getBaseUrl } = require('../configHelper');
const apiConfig = require('../../config/apiConfig.json');

/** Transport budgets are durations in milliseconds: timeoutMs bounds each attempt and
 * deadlineMs bounds the entire fetch, including cache access, retries and backoff.
 * maxRetryDelayMs caps client backoff only; server Retry-After is always respected.
 * @typedef {{baseUrl?: string, assembly?: string, timeout?: number, timeoutMs?: number,
 * deadlineMs?: number, signal?: AbortSignal, maxRetries?: number, maxResponseBytes?: number,
 * maxRetryDelayMs?: number, postConcurrency?: number}} RequestOptions */

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
    timeoutMs: options.timeoutMs ?? options.timeout ?? apiConfig.requests.timeoutMs,
    deadlineMs: options.deadlineMs ?? apiConfig.requests.deadlineMs,
    maxRetries: options.maxRetries ?? apiConfig.requests.retry.maxRetries,
    maxResponseBytes: options.maxResponseBytes ?? apiConfig.requests.maxResponseBytes,
    maxRetryDelayMs: options.maxRetryDelayMs ?? apiConfig.requests.maxRetryDelayMs,
    postConcurrency: options.postConcurrency ?? apiConfig.requests.postConcurrency,
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
  const maxConcurrency = apiConfig.requests.maxPostConcurrency;
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1)
    throw new Error('maxPostConcurrency must be a positive integer');
  if (
    !Number.isInteger(resolved.postConcurrency) ||
    resolved.postConcurrency < 1 ||
    resolved.postConcurrency > maxConcurrency
  )
    throw new Error(`postConcurrency must be an integer between 1 and ${maxConcurrency}`);
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

/** Parse the HTTP date form and Ensembl's decimal-second Retry-After extension.
 * Other numeric formats are malformed and cannot create a server cooldown.
 * @param {unknown} value @param {number} [now] @returns {number}
 */
function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * 1000;
  // HTTP-date forms begin with a weekday; Date.parse alone also accepts '-1'
  // as January 2001, which must not turn malformed numeric headers into waits.
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*(?:,?\s)/i.test(text)) return 0;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
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

module.exports = { resolveRequestOptions, canonicalJson, parseRetryAfter, abortable, delay };
