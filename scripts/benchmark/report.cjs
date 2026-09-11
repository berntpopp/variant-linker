'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { table } = require('table');

const headers = [
  'Scenario',
  'Status',
  'CLI wall (s)',
  'Startup baseline (s)',
  'Annotations',
  'Wall s/annotation',
  'Annotations/s',
  'Retries',
  'Chunks',
  'Successful runs',
];

function cells(result) {
  const data = result.averages || result;
  const number = (value) => (typeof value === 'number' ? value.toFixed(4) : 'N/A');
  return [
    result.name,
    result.status,
    number(data.executionTime),
    number(data.startupTime),
    data.variantsProcessed ?? 'N/A',
    number(data.avgTimePerVariant),
    number(data.variantsPerSecond),
    data.retryCount ?? 'N/A',
    data.chunkCount ?? 'N/A',
    `${data.runsCompleted ?? Number(result.status === 'success')}/${data.totalRuns ?? 1}`,
  ];
}

function formatResults(results, format = 'table') {
  if (format === 'json') return JSON.stringify(results, null, 2);
  const rows = [headers, ...results.map(cells)];
  if (format === 'table') return table(rows);
  const delimiter = format === 'csv' ? ',' : '\t';
  const escape = (value) => {
    const text = String(value);
    return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(escape).join(delimiter)).join('\n');
}

function renderReadme(results, options) {
  const rows = [headers, ...results.map(cells)];
  const rendered = rows.map((row) => `| ${row.join(' | ')} |`);
  rendered.splice(1, 0, `| ${headers.map(() => '---').join(' | ')} |`);
  return [
    '# Variant-Linker benchmark results',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Transport: ${options.live ? 'live Ensembl (network variability applies)' : options.replay ? 'recorded response replay (offline, no simulated network latency)' : 'synthetic offline fixtures'}.`,
    'CLI wall time includes process startup, annotation and output serialization.',
    'The separate --semver startup baseline is not subtracted; it is not a pure analysis timer.',
    'Retries and attempted POST chunks come from adapter profiling; N/A means instrumentation was unavailable.',
    'Body byte counts describe UTF-8 adapter data, not compressed wire traffic; replay JSON is reencoded.',
    'Annotation counts come from parsed output; they may differ from submitted input counts.',
    '',
    ...rendered,
    '',
    '## Reproduction metadata',
    '',
    '```json',
    JSON.stringify(
      results.map((result) => result.measurement),
      null,
      2
    ),
    '```',
    '',
  ].join('\n');
}

function generateReadme(results, options) {
  const destination = path.resolve(__dirname, '../BENCHMARK_RESULTS.md');
  fs.writeFileSync(destination, renderReadme(results, options));
  return destination;
}

module.exports = { formatResults, generateReadme, renderReadme };
