#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yargs = require('yargs/yargs');
const defaults = require('../config/benchmarkConfig.json');
const { requests } = require('../config/apiConfig.json');
const { benchmarkScenarios } = require('./benchmark/scenarios.cjs');
const { runBenchmarkScenario } = require('./benchmark/runner.cjs');
const { formatResults, generateReadme } = require('./benchmark/report.cjs');

function parseOptions(args) {
  return yargs(args)
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      default: false,
      description: 'Print benchmark progress to stderr',
    })
    .option('assembly', {
      alias: 'a',
      type: 'string',
      default: defaults.assembly,
      choices: ['GRCh37', 'GRCh38', 'hg19', 'hg38'],
    })
    .option('repeat', { alias: 'r', type: 'number', default: defaults.repeat })
    .option('format', {
      alias: 'f',
      type: 'string',
      choices: ['table', 'csv', 'tsv', 'json'],
      default: defaults.format,
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Write benchmark results to this file',
    })
    .option('readme', { alias: 'md', type: 'boolean', default: false })
    .option('log', {
      alias: 'l',
      type: 'string',
      description: 'Write per-run JSON metrics and errors',
    })
    .option('input', { alias: 'i', type: 'string', description: 'Benchmark this input file' })
    .option('stage', {
      type: 'string',
      choices: ['annotation', 'recoder'],
      default: defaults.stage,
      description: 'Measure full annotation or Variant Recoder only',
    })
    .option('api-concurrency', {
      type: 'number',
      choices: [1, 2],
      default: requests.postConcurrency,
      description: 'Maximum concurrent POST batches',
    })
    .option('api-timeout', {
      type: 'number',
      default: requests.timeoutMs,
      description: 'Per HTTP attempt timeout in milliseconds',
    })
    .option('variant-type', {
      alias: 't',
      type: 'string',
      choices: ['vcf', 'hgvs', 'rsid', 'all'],
      default: defaults.variantType,
    })
    .option('variant-count', {
      alias: 'c',
      type: 'string',
      choices: ['1', '10', '50', '500', 'all'],
      default: defaults.variantCount,
    })
    .option('live', {
      type: 'boolean',
      default: false,
      description: 'Opt into real Ensembl requests; default uses synthetic offline fixtures',
    })
    .option('record', {
      type: 'string',
      description: 'Save public VEP responses for offline replay (requires --live)',
    })
    .option('replay', {
      type: 'string',
      description: 'Replay recorded VEP responses with all network disabled',
    })
    .option('timeout', {
      type: 'number',
      default: defaults.processTimeoutMs,
      description: 'Per-process timeout in milliseconds',
    })
    .check((options) => {
      if (!Number.isSafeInteger(options.repeat) || options.repeat < 1)
        throw new Error('repeat must be a positive integer');
      if (options.record && !options.live) throw new Error('--record requires --live');
      if (options.replay && (options.live || options.record))
        throw new Error('--replay cannot be combined with --live or --record');
      if (options.record && options.repeat !== 1)
        throw new Error('Record once, then use --replay for repeated measurements');
      if (!Number.isSafeInteger(options.timeout) || options.timeout < 1)
        throw new Error('timeout must be a positive integer');
      return true;
    })
    .strict()
    .help()
    .alias('help', 'h')
    .parse();
}

function getScenarios(options) {
  const assembly = ['GRCh37', 'hg19'].includes(options.assembly) ? 'hg19' : 'hg38';
  let scenarios;
  if (options.input) {
    const inputFile = path.resolve(options.input);
    scenarios = [
      {
        name: `Custom Input: ${path.basename(inputFile)}`,
        inputFile,
        variantType: path.extname(inputFile).toLowerCase() === '.vcf' ? 'vcf' : 'rsid',
        description: 'Custom input',
        expectedVariantCount: 0,
      },
    ];
  } else {
    scenarios = benchmarkScenarios.filter(
      (scenario) =>
        (options.variantType === 'all' ||
          scenario.variantType === options.variantType ||
          (options.variantType === 'hgvs' && scenario.variantType === 'rsid')) &&
        (options.variantCount === 'all' || scenario.variantCount === options.variantCount)
    );
  }
  return scenarios.map((scenario) => ({ ...scenario, assembly }));
}

async function runBenchmarks(options) {
  const scenarios = getScenarios(options);
  if (!scenarios.length) throw new Error('No scenarios match the requested filters');
  for (const scenario of scenarios) {
    if (options.stage === 'recoder' && scenario.variantType === 'vcf')
      throw new Error(
        'Recoder benchmarks require an identifier file; derive genomic HGVS from the VCF first'
      );
    if (!fs.existsSync(scenario.inputFile))
      throw new Error(`Missing benchmark input: ${scenario.inputFile}`);
  }
  if (options.log) fs.writeFileSync(options.log, '');
  console.error(
    `Benchmark transport: ${options.live ? 'live Ensembl' : options.replay ? 'recorded responses, offline' : 'synthetic offline fixtures'}.`
  );
  console.error(
    'Times include CLI startup, annotation and serialization; startup baseline is reported separately.'
  );
  const results = [];
  for (const scenario of scenarios) results.push(await runBenchmarkScenario(scenario, options));
  const formatted = formatResults(results, options.format);
  if (options.output) fs.writeFileSync(options.output, formatted + '\n');
  else console.log(formatted);
  if (options.readme) console.error(`Benchmark report: ${generateReadme(results, options)}`);
  if (results.some((result) => result.status !== 'success')) process.exitCode = 1;
  return results;
}

if (require.main === module) {
  runBenchmarks(parseOptions(process.argv.slice(2))).catch((error) => {
    console.error(`Benchmark error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseOptions, getScenarios, runBenchmarks };
