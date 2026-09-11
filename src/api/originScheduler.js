'use strict';
const { delay, parseRetryAfter } = require('./requestContext');
const apiConfig = require('../../config/apiConfig.json');

/** @typedef {{nextStart: number, cooldown: number, interval: number, remaining: number, resetAt: number}} OriginState */

/** Return a nonnegative numeric header, rejecting empty and malformed values.
 * @param {unknown} value @returns {number | null}
 */
function numericHeader(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Shared admission control for all endpoint requests/retries on one origin.
 * The default permits 10 starts/sec, below Ensembl's documented ~15/sec average.
 * Server headers adjust pacing above the floor and can extend cooldown. This is per process;
 * other applications sharing the same public IP still consume the server quota.
 * @param {{minIntervalMs?: number}} [options]
 */
function createOriginScheduler(options = {}) {
  const interval = options.minIntervalMs ?? apiConfig.requests.minIntervalMs;
  if (!Number.isFinite(interval) || interval <= 0)
    throw new Error('minIntervalMs must be positive and finite');
  /** @type {Map<string, OriginState>} */
  const origins = new Map();
  /** @param {string} url @returns {OriginState} */
  function stateFor(url) {
    const origin = new URL(url).origin;
    let state = origins.get(origin);
    if (!state) {
      state = { nextStart: 0, cooldown: 0, interval, remaining: Infinity, resetAt: 0 };
      origins.set(origin, state);
    }
    return state;
  }
  return {
    /** Admit one transport attempt. deadlineAt is an absolute epoch in ms.
     * Queued requests recheck state after waiting because another response may
     * extend the shared cooldown while they are asleep.
     * @param {string} url @param {AbortSignal} signal @param {number} deadlineAt
     */
    async acquire(url, signal, deadlineAt) {
      const state = stateFor(url);
      for (;;) {
        signal.throwIfAborted();
        const now = Date.now();
        if (state.resetAt <= now) state.remaining = Infinity;
        const readyAt = Math.max(
          state.nextStart,
          state.cooldown,
          state.remaining <= 0 ? state.resetAt : 0
        );
        if (now >= deadlineAt || readyAt >= deadlineAt)
          throw new Error('Request deadline cannot accommodate rate-limit wait');
        if (readyAt > now) {
          await delay(readyAt - now, signal);
          continue;
        }
        // Synchronous reservation prevents simultaneously awakened workers from
        // consuming the same slot or last known quota unit.
        state.nextStart = now + state.interval;
        state.remaining--;
        return;
      }
    },

    /** Apply headers from successful and failed responses before another retry.
     * Ensembl's Reset header is seconds from now, not an epoch timestamp.
     * @param {string} url @param {Record<string, unknown>} headers
     */
    observe(url, headers) {
      const state = stateFor(url);
      const now = Date.now();
      const retryAt = now + parseRetryAfter(headers['retry-after'], now);
      if (Number.isFinite(retryAt)) state.cooldown = Math.max(state.cooldown, retryAt);
      const limit = numericHeader(headers['x-ratelimit-limit']);
      const period = numericHeader(headers['x-ratelimit-period']);
      if (limit && period) {
        const nextInterval = Math.max(interval, Math.ceil((period * 1000) / limit));
        if (state.nextStart > 0) state.nextStart += nextInterval - state.interval;
        state.interval = nextInterval;
      }
      const remaining = numericHeader(headers['x-ratelimit-remaining']);
      const reset = numericHeader(headers['x-ratelimit-reset']);
      if (remaining !== null && reset !== null) {
        if (state.resetAt <= now) state.remaining = Infinity;
        // Older in-flight responses cannot replenish a stricter known quota.
        state.remaining = Math.min(state.remaining, remaining);
        state.resetAt = Math.max(state.resetAt, now + reset * 1000);
      }
    },
  };
}

module.exports = { createOriginScheduler };
