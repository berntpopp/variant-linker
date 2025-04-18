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
 * Reads variants from a file (one per line).
 * @param {string} filePath - Path to the file containing variants
 * @return {Array<string>} - Array of variant strings
 */
function readVariantsFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Split by newlines and filter out empty lines
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    throw new Error(`Error reading variants file: ${error.message}`);
  }
}

/**
 * Validates required parameters.
 * @param {Object} params
 */
function validateParams(params) {
  const validOutputs = ['JSON', 'CSV', 'SCHEMA'];
  
  // Check if at least one variant source is provided
  const hasVariant = Boolean(params.variant);
  const hasVariantsFile = Boolean(params.variantsFile); // Changed from variants_file to variantsFile (camelCase)
  const hasVariantsList = Boolean(params.variants && typeof params.variants === 'string');
  
  if (!hasVariant && !hasVariantsFile && !hasVariantsList) {
    throw new Error('At least one variant source is required: --variant, --variants-file, or --variants');
  }

  if (!params.output) {
    throw new Error('Missing required parameter: output');
  }
  
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
  const shortOptions = ['c', 'v', 'vf', 'vs', 'o', 's', 'd', 'vp', 'rp', 'scp', 'lf', 'sv', 'f'];
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
  .option('variant', { alias: 'v', description: 'Single variant to analyze (VCF or HGVS)', type: 'string' })
  .option('variants-file', { alias: 'vf', description: 'Path to file containing variants (one per line)', type: 'string' })
  .option('variants', { alias: 'vs', description: 'Comma-separated list of variants to analyze', type: 'string' })
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
  .usage('Usage: variant-linker [options]\n\nExample: variant-linker --variant "rs123" --output JSON')
  .example('variant-linker --variant "rs123" --output JSON', 'Process a single variant')
  .example('variant-linker --variants-file examples/sample_variants.txt --output JSON', 'Process multiple variants from a file')
  .example('variant-linker --variants "rs123,ENST00000366667:c.803C>T" --output JSON', 'Process multiple variants from a comma-separated list')
  .epilogue('For more information, see https://github.com/berntpopp/variant-linker')
  .help()
  .alias('help', 'h')
  .version(packageJson.version)
  .alias('version', 'V')
  .showHelpOnFail(true)
  .check((argv) => {
    // Show help if no parameters provided
    if (process.argv.length <= 2) {
      yargs.showHelp();
      process.exit(0);
    }
    return true;
  })
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

    // Collect variants from all possible sources
    let variants = [];
    
    // Add single variant if provided
    if (mergedParams.variant) {
      variants.push(mergedParams.variant);
    }
    
    // Add variants from comma-separated list if provided
    if (mergedParams.variants) {
      const variantsList = mergedParams.variants.split(',').map(v => v.trim()).filter(Boolean);
      variants = [...variants, ...variantsList];
    }
    
    // Add variants from file if provided
    if (mergedParams.variantsFile) {
      const fileVariants = readVariantsFromFile(mergedParams.variantsFile);
      variants = [...variants, ...fileVariants];
    }
    
    debug(`Processing ${variants.length} variants`);
    debugDetailed(`Variants: ${JSON.stringify(variants)}`);

    // Call the core analysis function with the variants array
    const result = await analyzeVariant({
      variants, // Use the collected variants array instead of a single variant
      recoderOptions,
      vepOptions,
      cache: mergedParams.cache,
      scoringConfigPath: mergedParams.scoring_config_path,
      output: mergedParams.output,
      filter: mergedParams.filter,
    });

    // Output the results
    if (mergedParams.save) {
      fs.writeFileSync(mergedParams.save, JSON.stringify(result, null, 2));
      console.log(`Results saved to ${mergedParams.save}`);
    } else {
      // Always output valid JSON to stdout.
      console.log(JSON.stringify(result, null, 2));
    }
    
    debug('Variant analysis process completed successfully');
  } catch (error) {
    handleError(error);
  }
}

main();
