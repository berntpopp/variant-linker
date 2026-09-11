'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const axios = require('axios').default;

function canonical(value) {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]])
        )
      : entry
  );
}

function identify(config) {
  const url = new URL(axios.getUri(config));
  if (url.username || url.password || config.auth)
    throw new Error('Benchmark recording/replay does not accept URL credentials');
  for (const name of url.searchParams.keys())
    if (/token|password|secret|authorization|api.?key/i.test(name))
      throw new Error('Benchmark recording/replay does not accept credential query parameters');
  url.searchParams.sort();
  let body = config.data ?? null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new Error('Benchmark requests must contain JSON data');
    }
  }
  const request = { method: (config.method || 'GET').toUpperCase(), url: url.href, body };
  const fingerprint = crypto.createHash('sha256').update(canonical(request)).digest('hex');
  return { request, fingerprint };
}

function captureResponse(response) {
  const headers = {};
  for (const [name, value] of Object.entries(axios.AxiosHeaders.from(response.headers).toJSON())) {
    const key = name.toLowerCase();
    if (
      ['content-type', 'retry-after', 'date', 'etag', 'last-modified'].includes(key) ||
      /^x-ratelimit-/.test(key)
    )
      headers[key] = value;
  }
  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  return JSON.parse(
    JSON.stringify({
      status: response.status,
      statusText: response.statusText || '',
      headers,
      data,
    })
  );
}

/** Install on an isolated client in tests, or the default Axios client in a preload.
 * Recording intentionally retains only selected public annotation data and safe
 * response headers. Flush after acquisition; do not compare recording wall time
 * directly with replay wall time. Replay adds no simulated transport latency.
 */
function installTransport({ client = axios, recordPath, replayPath, live = false } = {}) {
  if (Boolean(recordPath) === Boolean(replayPath))
    throw new Error('Choose exactly one benchmark record or replay path');
  if (recordPath && !live) throw new Error('Benchmark recording requires explicit live permission');
  const original = client.defaults.adapter;
  const transport = recordPath ? axios.getAdapter(original) : null;
  const recording = recordPath
    ? {
        schemaVersion: 1,
        source: 'Explicit public Ensembl VEP/Variant Recoder benchmark capture',
        entries: {},
      }
    : JSON.parse(fs.readFileSync(replayPath, 'utf8'));
  if (recording.schemaVersion !== 1 || !recording.entries || typeof recording.entries !== 'object')
    throw new Error('Invalid benchmark recording schema');
  const cursors = new Map();
  let matched = 0;
  let captured = 0;
  client.defaults.adapter = async (config) => {
    const { request, fingerprint } = identify(config);
    if (recordPath) {
      const url = new URL(request.url);
      if (
        url.protocol !== 'https:' ||
        !['rest.ensembl.org', 'grch37.rest.ensembl.org'].includes(url.hostname) ||
        !/^(?:\/vep\/(?:human|homo_sapiens)\/(?:region|hgvs|id)|\/variant_recoder\/(?:human|homo_sapiens))(?:\/|$)/.test(
          url.pathname
        )
      )
        throw new Error(
          'Recording is restricted to official Ensembl VEP/Variant Recoder HTTPS endpoints'
        );
      const save = (response) => {
        const entry = (recording.entries[fingerprint] ??= { request, responses: [] });
        entry.responses.push(captureResponse(response));
        captured++;
      };
      try {
        const response = await transport(config);
        save(response);
        return response;
      } catch (error) {
        if (error.response) save(error.response);
        throw error;
      }
    }
    const entry = recording.entries[fingerprint];
    const index = cursors.get(fingerprint) || 0;
    if (!entry || canonical(entry.request) !== canonical(request) || !entry.responses?.[index])
      throw new Error(
        `No recorded response for benchmark request ${fingerprint} at attempt ${index + 1}`
      );
    cursors.set(fingerprint, index + 1);
    matched++;
    const response = { ...JSON.parse(JSON.stringify(entry.responses[index])), config };
    if (config.validateStatus && !config.validateStatus(response.status))
      throw new axios.AxiosError(
        `Recorded HTTP status ${response.status}`,
        response.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
        config,
        undefined,
        response
      );
    return response;
  };
  return {
    stats: () => ({ captured, matched, uniqueRequests: Object.keys(recording.entries).length }),
    flush() {
      if (!recordPath) return;
      fs.mkdirSync(path.dirname(path.resolve(recordPath)), { recursive: true });
      const temporary = `${recordPath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(recording) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, recordPath);
    },
    restore() {
      client.defaults.adapter = original;
    },
  };
}

if (process.env.VL_BENCHMARK_RECORD || process.env.VL_BENCHMARK_REPLAY) {
  if (process.env.VL_BENCHMARK_REPLAY) require('nock').disableNetConnect();
  const controller = installTransport({
    recordPath: process.env.VL_BENCHMARK_RECORD,
    replayPath: process.env.VL_BENCHMARK_REPLAY,
    live: process.env.VL_BENCHMARK_LIVE === '1',
  });
  process.once('exit', () => controller.flush());
}

module.exports = { installTransport, identify };
