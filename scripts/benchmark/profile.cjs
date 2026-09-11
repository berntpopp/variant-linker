'use strict';

const fs = require('node:fs');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const axios = require('axios').default;

/** Adapter instrumentation measures actual transport attempts, including retries.
 * No request payloads, query strings, credentials or response data are retained.
 * Quantiles use nearest rank; transport latency includes receiving the response
 * body but excludes Axios JSON transformation and application processing.
 */
function createProfiler({
  client = axios,
  now = () => performance.now(),
  fixtures = false,
  replay = false,
  live = false,
} = {}) {
  const originalAdapter = client.defaults.adapter;
  const transport = axios.getAdapter(originalAdapter);
  const started = now();
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  let peakRssBytes = process.memoryUsage().rss;
  const sampleRss = () => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  };
  const sampler = setInterval(sampleRss, 20);
  sampler.unref();
  const requests = [];
  const operations = new WeakMap();
  let operationCount = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let completed;
  client.defaults.adapter = async (config) => {
    if (!fixtures && !replay && !live)
      throw new Error('Benchmark transport requires explicit live opt-in');
    const start = now();
    const url = new URL(config.url, config.baseURL);
    // fetchApi creates one private signal per logical fetch and reuses it for
    // retries. Distinct chunks have distinct signals even for identical bodies.
    const identity = config.signal || config;
    let operation = operations.get(identity);
    if (!operation) {
      operation = { id: operationCount++, attempts: 0 };
      operations.set(identity, operation);
    }
    let body;
    try {
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    } catch {
      // Non-JSON bodies have no countable variant collection.
    }
    const entry = {
      index: requests.length,
      requestId: operation.id,
      attempt: ++operation.attempts,
      method: (config.method || 'GET').toUpperCase(),
      host: url.hostname,
      endpoint: url.pathname,
      inputCount: Array.isArray(body?.variants)
        ? body.variants.length
        : Array.isArray(body?.ids)
          ? body.ids.length
          : null,
      startMs: start - started,
      durationMs: null,
      status: null,
      errorCode: null,
      requestBodyBytes:
        typeof config.data === 'string' || Buffer.isBuffer(config.data)
          ? Buffer.byteLength(config.data)
          : null,
      responseBodyBytes: null,
      responseByteSource: null,
      rateLimit: {},
    };
    requests.push(entry);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const recordResponse = (response) => {
      entry.status = response?.status ?? null;
      if (typeof response?.data === 'string' || Buffer.isBuffer(response?.data)) {
        entry.responseBodyBytes = Buffer.byteLength(response.data);
        entry.responseByteSource = 'adapter-body';
      } else if (response?.data !== undefined) {
        entry.responseBodyBytes = Buffer.byteLength(JSON.stringify(response.data));
        entry.responseByteSource = 'reencoded-json';
      }
      const headers = response?.headers || {};
      for (const [name, header] of Object.entries({
        limit: 'x-ratelimit-limit',
        remaining: 'x-ratelimit-remaining',
        resetSeconds: 'x-ratelimit-reset',
        periodSeconds: 'x-ratelimit-period',
        retryAfter: 'retry-after',
      }))
        if (headers[header] !== undefined) entry.rateLimit[name] = String(headers[header]);
    };
    try {
      const response = await transport(config);
      recordResponse(response);
      return response;
    } catch (error) {
      recordResponse(error.response);
      entry.errorCode = error.code || 'TRANSPORT_ERROR';
      throw error;
    } finally {
      entry.durationMs = now() - start;
      inFlight--;
      sampleRss();
    }
  };
  return {
    stop() {
      if (completed) return completed;
      client.defaults.adapter = originalAdapter;
      clearInterval(sampler);
      lag.disable();
      sampleRss();
      const durations = requests
        .map((entry) => entry.durationMs)
        .filter((value) => value !== null)
        .sort((a, b) => a - b);
      const percentile = (fraction) =>
        durations.length ? durations[Math.ceil(durations.length * fraction) - 1] : null;
      completed = {
        scope: 'CLI process after profiler preload; request latency is per Axios adapter attempt',
        transport: replay ? 'replay' : fixtures ? 'fixture' : 'live',
        runtimeMs: now() - started,
        requestCount: requests.length,
        retryCount: requests.filter((entry) => entry.attempt > 1).length,
        chunkCount: requests.filter(
          (entry) => entry.attempt === 1 && entry.method === 'POST' && entry.inputCount !== null
        ).length,
        requestBodyBytes: requests.reduce((sum, entry) => sum + (entry.requestBodyBytes || 0), 0),
        responseBodyBytes: requests.reduce((sum, entry) => sum + (entry.responseBodyBytes || 0), 0),
        byteScope: 'UTF-8 adapter body bytes, not compressed wire bytes; replay JSON is reencoded',
        failedRequestCount: requests.filter((entry) => entry.errorCode !== null).length,
        maxInFlight,
        requestLatencyMs: {
          p50: percentile(0.5),
          p95: percentile(0.95),
          total: durations.reduce((sum, value) => sum + value, 0),
        },
        peakRssBytes: Math.max(peakRssBytes, process.resourceUsage().maxRSS * 1024),
        eventLoopDelayMs: {
          mean: Number.isFinite(lag.mean) ? lag.mean / 1e6 : null,
          p95: lag.count ? lag.percentile(95) / 1e6 : null,
          max: lag.count ? lag.max / 1e6 : null,
        },
        requests,
      };
      return completed;
    },
  };
}

// Opt-in preload for both fixture and public benchmark runs. The caller owns a
// unique output file per child invocation; benchmark output stays on stdout.
if (process.env.VL_BENCHMARK_PROFILE) {
  const profiler = createProfiler({
    fixtures: process.env.VL_TEST_FIXTURES === '1',
    replay: Boolean(process.env.VL_BENCHMARK_REPLAY),
    live: process.env.VL_BENCHMARK_LIVE === '1',
  });
  process.once('exit', () => {
    fs.writeFileSync(
      process.env.VL_BENCHMARK_PROFILE,
      JSON.stringify(profiler.stop(), null, 2) + '\n'
    );
  });
}

module.exports = { createProfiler };
