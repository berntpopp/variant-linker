'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { aliases } = require('./fixture-api.cjs');

// Unknown identifiers deliberately map to synthetic coordinates for throughput,
// never to biological reference data. The input hash is retained in each report.
for (const value of fs.readFileSync(process.env.VL_BENCHMARK_INPUT, 'utf8').split(/\r?\n/)) {
  const input = value.trim();
  if (!input || input.startsWith('#') || aliases[input]) continue;
  const coordinate =
    1 + (crypto.createHash('sha256').update(input).digest().readUInt32BE(0) % 100000000);
  aliases[input] = `1-${coordinate}-A-G`;
}
require('./offline-guard.cjs');
