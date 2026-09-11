'use strict';
const axios = require('axios').default;
const debug = require('debug')('variant-linker:detailed');
const { getCacheAsync, setCache } = require('./cache');
const apiConfig = require('../config/apiConfig.json');
const {
  resolveRequestOptions,
  canonicalJson,
  parseRetryAfter,
  abortable,
  delay,
} = require('./api/requestContext');
const { createOriginScheduler } = require('./api/originScheduler');
const scheduler = createOriginScheduler();
/** Once concurrency is requested, all subsequent calls on that origin share its quota.
 * Fresh serial processes retain the existing timing until concurrency is opted in.
 * @type {Set<string>} */
const pacedOrigins = new Set();
/** @typedef {import('./api/requestContext').RequestOptions} RequestOptions */
/** @typedef {Record<string, string | number | boolean | null | undefined>} QueryOptions */
/** @typedef {import('axios').AxiosProxyConfig | false | null} ProxyConfig */

/** Parse proxy credentials without including them in diagnostics.
 * @param {string | null | undefined} proxyUrl
 * @param {string | null} [proxyAuth]
 * @returns {import('axios').AxiosProxyConfig | false}
 */
function parseProxyConfig(proxyUrl, proxyAuth = null) {
  if (!proxyUrl) return false;
  try {
    const url = new URL(proxyUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    /** @type {import('axios').AxiosProxyConfig} */
    const config = {
      protocol: url.protocol.slice(0, -1),
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    };
    if (url.username && url.password) {
      config.auth = {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    } else if (proxyAuth) {
      const colon = proxyAuth.indexOf(':');
      if (colon > 0 && colon < proxyAuth.length - 1) {
        config.auth = { username: proxyAuth.slice(0, colon), password: proxyAuth.slice(colon + 1) };
      }
    }
    return config;
  } catch {
    throw new Error('Invalid proxy URL format. Expected format: http://[user:pass@]host:port');
  }
}

/** Fetch JSON with immutable identity, finite overall budget and cancellation.
 * The generic describes the external API payload; wrappers validate their boundary.
 * @template [T=unknown]
 * @param {string} endpointPath
 * @param {QueryOptions} [queryOptions]
 * @param {boolean} [cacheEnabled]
 * @param {string} [method]
 * @param {unknown} [requestBody]
 * @param {ProxyConfig} [proxyConfig]
 * @param {RequestOptions} [requestOptions]
 * @returns {Promise<T>}
 */
async function fetchApi(
  endpointPath,
  queryOptions = {},
  cacheEnabled = false,
  method = 'GET',
  requestBody = null,
  proxyConfig = null,
  requestOptions = {}
) {
  const context = resolveRequestOptions(requestOptions);
  const started = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort(context.signal?.reason || new Error('Request cancelled'));
  if (context.signal?.aborted) cancel();
  context.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('Request deadline exceeded')),
    context.deadlineMs
  );
  const signal = controller.signal;
  try {
    signal.throwIfAborted();
    const url = new URL(`${context.baseUrl.replace(/\/$/, '')}/${endpointPath.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(queryOptions)) {
      if (key.toLowerCase() !== 'content-type' && value !== null && value !== undefined)
        url.searchParams.set(key, String(value));
    }
    url.searchParams.sort();
    if (context.postConcurrency > 1) pacedOrigins.add(url.origin);
    const verb = method.toUpperCase();
    if (!['GET', 'POST'].includes(verb)) throw new Error(`Unsupported HTTP method: ${verb}`);
    const body = JSON.parse(canonicalJson(requestBody));
    const key = canonicalJson({
      method: verb,
      url: url.href,
      assembly: context.assembly,
      body: verb === 'POST' ? body : null,
    });
    if (cacheEnabled) {
      const cached = await abortable(getCacheAsync(key), signal);
      if (cached !== null && cached !== undefined) return /** @type {T} */ (cached);
    }
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        if (pacedOrigins.has(url.origin))
          await scheduler.acquire(url.href, signal, started + context.deadlineMs);
        /** @type {import('axios').AxiosRequestConfig} */
        const config = {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: Math.min(
            context.timeoutMs,
            Math.max(1, context.deadlineMs - (Date.now() - started))
          ),
          signal,
          maxContentLength: context.maxResponseBytes,
          maxBodyLength: context.maxResponseBytes,
        };
        if (proxyConfig !== null) config.proxy = proxyConfig;
        if (debug.enabled) debug('HTTP %s attempt %d (%s)', verb, attempt + 1, context.assembly);
        const response = await abortable(
          verb === 'POST' ? axios.post(url.href, body, config) : axios.get(url.href, config),
          signal
        );
        if (pacedOrigins.has(url.origin)) scheduler.observe(url.href, response.headers || {});
        if (cacheEnabled) await abortable(Promise.resolve(setCache(key, response.data)), signal);
        return /** @type {T} */ (response.data);
      } catch (error) {
        signal.throwIfAborted();
        const failure = /** @type {import('axios').AxiosError} */ (error);
        if (pacedOrigins.has(url.origin))
          scheduler.observe(url.href, failure.response?.headers || {});
        const status = failure.response?.status;
        const retryable = status
          ? apiConfig.requests.retry.retryableStatusCodes.includes(status)
          : ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ERR_NETWORK'].includes(
              failure.code || ''
            );
        if (!retryable || attempt >= context.maxRetries || axios.isCancel(error)) throw error;
        const retryAfter = parseRetryAfter(failure.response?.headers?.['retry-after']);
        const backoff = apiConfig.requests.retry.baseDelayMs * 2 ** attempt;
        // The client cap applies only to exponential backoff. A server cooldown
        // is a minimum wait, including fractional seconds returned by Ensembl.
        const waitMs = Math.max(Math.min(context.maxRetryDelayMs, backoff), retryAfter || 0);
        if (waitMs >= context.deadlineMs - (Date.now() - started)) {
          throw new Error('Request deadline cannot accommodate retry delay', { cause: error });
        }
        await delay(waitMs, signal);
      }
    }
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', cancel);
  }
}
module.exports = { fetchApi, parseProxyConfig, resolveRequestOptions };
