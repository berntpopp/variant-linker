'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const experiments = [
  'vep-live-baseline',
  'vep-live-concurrent',
  'recoder-live-baseline',
  'recoder-live-concurrent',
  'vep-matched-1',
  'vep-matched-2',
  'recoder-matched-1',
  'recoder-matched-2',
];

function summarize() {
  const live = experiments.map((name) => {
    const source = `local_data/benchmarks/${name}.json`;
    const bytes = fs.readFileSync(path.join(root, source));
    const [run] = JSON.parse(bytes);
    const profile = run.profile;
    return {
      name,
      source,
      sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      status: run.status,
      error: run.error ?? null,
      wallSeconds: run.executionTime ?? null,
      startupSeconds: run.startupTime ?? null,
      annotations: run.variantsProcessed ?? null,
      annotationsPerSecond: run.variantsPerSecond ?? null,
      failures: run.failures ?? null,
      annotationSha256: run.annotationSha256 ?? null,
      annotationHashScope: name.endsWith('live-baseline')
        ? 'Initial JSON serialization order'
        : 'Canonical object keys, array order retained',
      http: profile
        ? {
            requests: profile.requestCount,
            retries: profile.retryCount ?? null,
            chunks: profile.chunkCount ?? null,
            failedAttempts: profile.failedRequestCount,
            maxInFlight: profile.maxInFlight,
            latencyMs: profile.requestLatencyMs,
            requestBodyBytes: profile.requestBodyBytes ?? null,
            responseBodyBytes: profile.responseBodyBytes ?? null,
            requestsDetail: profile.requests,
          }
        : null,
      peakRssBytes: profile?.peakRssBytes ?? null,
      eventLoopDelayMs: profile?.eventLoopDelayMs ?? null,
      measurement: run.measurement,
    };
  });
  const replay = JSON.parse(
    fs.readFileSync(path.join(root, 'local_data/benchmarks/services-replay-summary.json'), 'utf8')
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    datasetProvenance: [
      'docs/benchmarks/1000genomes-1000.json',
      'docs/benchmarks/recoder-1000.json',
    ],
    command: 'node scripts/benchmark/summarize.cjs',
    scope:
      'Measured live and offline runs; unknown or unavailable metrics remain null. Failures are retained.',
    live,
    replay,
    conclusions: {
      defaultConcurrency: 1,
      vep: 'Both observed live comparisons favored opt-in concurrency 2 with all 1000 annotations and no retries. Network/server variability prevents a universal speedup claim.',
      recoder:
        'Baseline completed 1000 inputs, but subsequent public runs were unstable. Keep concurrency 1 by default; do not infer reliable live acceleration from offline replay.',
      equivalence:
        'Both complete baseline recordings replay to identical canonical output hashes at concurrency 1 and 2 (three runs each). See response-validation.json for upstream coordinate/allele checks.',
      instrumentation:
        'The initial failed concurrent Recoder run predates failure-profile retention; its absent metrics are not inferred. Initial baseline timeout was 15000ms; matched runs explicitly use 60000ms.',
    },
  };
  const destination = path.join(root, 'docs/benchmarks/2026-09-11-measurements.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  return destination;
}

if (require.main === module) console.log(summarize());
module.exports = { summarize };
