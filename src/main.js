#!/usr/bin/env node
/**
 * @fileoverview Main entry point for the Variant-Linker CLI tool.
 * This file handles CLI parameter parsing, debugging, and then calls the core analysis function.
 * @module main
 */

'use strict';

const fs = require('fs');
const yargs = require('yargs');
const packageJson = require('../package.json');
const { analyzeVariant } = require('./variantLinkerCore');
const { getBaseUrl } = require('./configHelper');

// Set up debug loggers.
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Outputs error information as JSON and exits.
 * @param {Error} error
 */
function handleError(error) {
  const errorResponse = {
    status: 'error',
    message: error.message,
  };
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = error.stack;
  }
  console.error(JSON.stringify(errorResponse, null, 2));
  process.exit(1);
}

/**
 * Reads and parses a JSON configuration file.
 * @param {string} configFilePath
 * @return {Object}
 */
function readConfigFile(configFilePath) {
  if (!configFilePath) return {};
  try {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Error reading configuration file: ${error.message}`);
  }
}

/**
 * Validates required parameters.
 * @param {Object} params
 */
function validateParams(params) {
  const requiredParams = ['variant', 'output'];
  const validOutputs = ['JSON', 'CSV', 'SCHEMA'];
  requiredParams.forEach((param) => {
    if (!params[param]) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  });
  if (!validOutputs.includes(params.output)) {
    throw new Error(`Invalid output format: ${params.output}. Valid formats are ${validOutputs.join(', ')}`);
  }
  if (params.debug && (typeof params.debug !== 'number' || params.debug < 1 || params.debug > 3)) {
    throw new Error('Debug level must be a number between 1 and 3');
  }
}

/**
 * Merges configuration file parameters with CLI parameters.
 * CLI parameters override configuration file parameters.
 * @param {Object} configParams
 * @param {Object} cliParams
 * @return {Object}
 */
function mergeParams(configParams, cliParams) {
  const merged = { ...configParams, ...cliParams };
  const shortOptions = ['c', 'v', 'o', 's', 'd', 'vp', 'rp', 'scp', 'lf', 'sv', 'f'];
  shortOptions.forEach((option) => {
    delete merged[option];
  });
  return merged;
}

/**
 * Enables debug logging according to the specified debug level.
 * @param {number} debugLevel
 * @param {string} [logFilePath]
 */
function enableDebugging(debugLevel, logFilePath) {
  let namespaces = 'variant-linker:main';
  if (debugLevel >= 2) namespaces += ',variant-linker:detailed';
  if (debugLevel >= 3) namespaces += ',variant-linker:all';
  require('debug').enable(namespaces);
  if (logFilePath) {
    const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
    const overrideLog = (msg) => {
      logStream.write(`[${new Date().toISOString()}] ${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n`);
    };
    debug.log = overrideLog;
    debugDetailed.log = overrideLog;
    debugAll.log = overrideLog;
  }
  debug('Debug mode enabled');
}

/**
 * Parses optional parameters from a comma-delimited string.
 * @param {string} paramString
 * @param {Object} defaultParams
 * @return {Object}
 */
function parseOptionalParameters(paramString, defaultParams) {
  const options = { ...defaultParams };
  if (paramString) {
    const paramsArray = paramString.split(',');
    paramsArray.forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) options[key] = value;
    });
  }
  return options;
}

// Set up CLI options using yargs.
const argv = yargs
  .option('config', { alias: 'c', description: 'Path to configuration file', type: 'string' })
  .option('variant', { alias: 'v', description: 'Variant to analyze (VCF or HGVS)', type: 'string' })
  .option('output', { alias: 'o', description: 'Output format (JSON, CSV, SCHEMA)', type: 'string', default: 'JSON' })
  .option('save', { alias: 's', description: 'Filename to save the results', type: 'string' })
  .option('debug', { alias: 'd', description: 'Enable debug mode (multiple -d increase level)', count: true, type: 'number' })
  .option('vep_params', { alias: 'vp', description: 'Optional VEP parameters (key=value, comma-delimited)', type: 'string' })
  .option('recoder_params', { alias: 'rp', description: 'Optional Variant Recoder parameters (key=value, comma-delimited)', type: 'string' })
  .option('scoring_config_path', { alias: 'scp', description: 'Path to scoring configuration directory', type: 'string' })
  .option('log_file', { alias: 'lf', description: 'Path to log file for debug info', type: 'string' })
  .option('cache', { alias: 'C', description: 'Enable caching of API responses', type: 'boolean', default: false })
  .option('semver', { alias: 'sv', description: 'Show semantic version details and exit', type: 'boolean' })
  .option('assembly', { description: 'Genome assembly (hg38 [default] or hg19)', type: 'string', default: 'hg38' })
  .option('filter', { alias: 'f', description: 'Filtering criteria as a JSON string', type: 'string' })
  .help()
  .alias('help', 'h')
  .version(packageJson.version)
  .alias('version', 'V')
  .argv;

if (argv.semver) {
  const { getVersionDetails } = require('./version');
  const details = getVersionDetails();
  console.log('Semantic Version Details:');
  console.log(`Version: ${details.version}`);
  console.log(`Major: ${details.major}`);
  console.log(`Minor: ${details.minor}`);
  console.log(`Patch: ${details.patch}`);
  if (details.prerelease.length > 0) console.log(`Prerelease: ${details.prerelease.join('.')}`);
  if (details.build.length > 0) console.log(`Build Metadata: ${details.build.join('.')}`);
  process.exit(0);
}

let configParams;
try {
  configParams = readConfigFile(argv.config);
} catch (error) {
  handleError(error);
}
const mergedParams = mergeParams(configParams, argv);

try {
  validateParams(mergedParams);
} catch (error) {
  handleError(error);
}

if (mergedParams.debug) {
  enableDebugging(mergedParams.debug, mergedParams.log_file);
}

mergedParams.assembly = mergedParams.assembly || 'hg38';
if (!process.env.ENSEMBL_BASE_URL) {
  process.env.ENSEMBL_BASE_URL = getBaseUrl(mergedParams.assembly);
}

async function main() {
  try {
    debug('Starting variant analysis process');
    const recoderOptions = parseOptionalParameters(mergedParams.recoder_params, { vcf_string: '1' });
    const vepOptions = parseOptionalParameters(mergedParams.vep_params, {
      CADD: '1',
      hgvs: '1',
      merged: '1',
      mane: '1'
    });
    debugDetailed(`Parsed options: recoderOptions=${JSON.stringify(recoderOptions)}, vepOptions=${JSON.stringify(vepOptions)}`);

    // Call the core analysis function.
    const result = await analyzeVariant({
      variant: mergedParams.variant,
      recoderOptions,
      vepOptions,
      cache: mergedParams.cache,
      scoringConfigPath: mergedParams.scoring_config_path,
      output: mergedParams.output,
      filter: mergedParams.filter,
    });

    // Always output valid JSON.
    console.log(JSON.stringify(result, null, 2));
    debug('Variant analysis process completed successfully');
  } catch (error) {
    handleError(error);
  }
}

main();
