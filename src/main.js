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
const { readVariantsFromVcf } = require('./vcfReader');

// Set up debug loggers.
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Outputs error information as JSON and throws an enhanced error.
 * @param {Error} error - The original error that occurred
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
  // Instead of exiting, throw an enhanced error with status code for the caller to handle
  const enhancedError = new Error(`Fatal error: ${error.message}`);
  enhancedError.originalError = error;
  enhancedError.statusCode = 1;
  throw enhancedError;
}

/**
 * Reads and parses a JSON configuration file.
 * @param {string} configFilePath - Path to the configuration file to read
 * @return {Object} The parsed configuration object
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
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    throw new Error(`Error reading variants file: ${error.message}`);
  }
}

/**
 * Validates required parameters.
 * @param {Object} params - The parameters to validate
 * @throws {Error} If required parameters are missing or invalid
 */
function validateParams(params) {
  const validOutputs = ['JSON', 'CSV', 'TSV', 'SCHEMA', 'VCF'];

  // Check if at least one variant source is provided
  const hasVariant = Boolean(params.variant);
  const hasVariantsFile = Boolean(params.variantsFile); // Using camelCase
  const hasVcfInput = Boolean(params.vcfInput);
  // Check variants parameter format
  const hasVariantsParam = Boolean(params.variants);
  const isStringType = hasVariantsParam && typeof params.variants === 'string';
  const hasVariantsList = Boolean(isStringType);

  // Check for multiple input methods
  const inputMethods = [hasVariant, hasVariantsFile, hasVariantsList, hasVcfInput];
  const inputMethodCount = inputMethods.filter(Boolean).length;

  if (inputMethodCount === 0) {
    throw new Error(
      'At least one variant source is required: --variant, --variants-file, --variants, or --vcf-input'
    );
  }

  if (inputMethodCount > 1) {
    throw new Error(
      'Only one variant source can be provided at a time: --variant, --variants-file, --variants, or --vcf-input'
    );
  }

  if (!params.output) {
    throw new Error('Missing required parameter: output');
  }

  if (!validOutputs.includes(params.output)) {
    throw new Error(
      `Invalid output format: ${params.output}. Valid formats are ${validOutputs.join(', ')}`
    );
  }

  // VCF output requires VCF input
  if (params.output === 'VCF' && !hasVcfInput) {
    throw new Error('VCF output format requires --vcf-input to be provided');
  }

  if (params.debug && (typeof params.debug !== 'number' || params.debug < 1 || params.debug > 3)) {
    throw new Error('Debug level must be a number between 1 and 3');
  }
}

/**
 * Merges configuration file parameters with CLI parameters.
 * CLI parameters override configuration file parameters.
 * @param {Object} configParams - Parameters from the configuration file
 * @param {Object} cliParams - Parameters from the command line
 * @return {Object} The merged parameters with CLI parameters taking precedence
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
 * @param {number} debugLevel - Level of debugging (1-3): 1=main, 2=detailed, 3=all
 * @param {string} [logFilePath] - Optional path to write debug logs to a file
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
 * @param {string} paramString - Comma-delimited string of parameters in key=value format
 * @param {Object} defaultParams - Default parameters to use if not specified in paramString
 * @return {Object} The parsed parameters object with defaults applied
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
  .option('variant', {
    alias: 'v',
    description: 'Single variant to analyze (VCF or HGVS)',
    type: 'string',
  })
  .option('variants-file', {
    alias: 'vf',
    description: 'Path to file containing variants (one per line)',
    type: 'string',
  })
  .option('variants', {
    alias: 'vs',
    description: 'Comma-separated list of variants to analyze',
    type: 'string',
  })
  .option('output', {
    alias: 'o',
    description: 'Output format (JSON, CSV, SCHEMA)',
    type: 'string',
    default: 'JSON',
  })
  .option('save', { alias: 's', description: 'Filename to save the results', type: 'string' })
  .option('debug', {
    alias: 'd',
    description: 'Enable debug mode (multiple -d increase level)',
    count: true,
    type: 'number',
  })
  .option('vep_params', {
    alias: 'vp',
    description: 'Optional VEP parameters (key=value, comma-delimited)',
    type: 'string',
  })
  .option('recoder_params', {
    alias: 'rp',
    description: 'Optional Variant Recoder parameters (key=value, comma-delimited)',
    type: 'string',
  })
  .option('scoring_config_path', {
    alias: 'scp',
    description: 'Path to scoring configuration directory',
    type: 'string',
  })
  .option('log_file', {
    alias: 'lf',
    description: 'Path to log file for debug info',
    type: 'string',
  })
  .option('vcf-input', {
    alias: 'vi',
    description: 'Path to VCF file to analyze',
    type: 'string',
  })
  .option('cache', {
    alias: 'C',
    description: 'Enable caching of API responses',
    type: 'boolean',
    default: false,
  })
  .option('semver', {
    alias: 'sv',
    description: 'Show semantic version details and exit',
    type: 'boolean',
  })
  .option('assembly', {
    description: 'Genome assembly (hg38 [default] or hg19)',
    type: 'string',
    default: 'hg38',
  })
  .option('filter', {
    alias: 'f',
    description: 'Filtering criteria as a JSON string',
    type: 'string',
  })
  .usage(
    'Usage: variant-linker [options]\n\nExample: variant-linker --variant "rs123" --output JSON'
  )
  .example('variant-linker --variant "rs123" --output JSON', 'Process a single variant')
  .example(
    'variant-linker --variants-file examples/sample_variants.txt --output JSON',
    'Process multiple variants from a file'
  )
  .example(
    'variant-linker --variants "rs123,ENST00000366667:c.803C>T" --output JSON',
    'Process multiple variants from a comma-separated list'
  )
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
      // Instead of exit, return false to indicate no further processing needed
      return false;
    }
    return true;
  }).argv;

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
  // Return instead of exit to allow proper cleanup
  return true;
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

/**
 * Main function that processes variant analysis based on merged parameters.
 * It handles the entire workflow from parsing options to returning results.
 * @returns {Promise<void>} Resolves when processing is complete
 */
async function main() {
  try {
    debug('Starting variant analysis process');
    const recoderOptions = parseOptionalParameters(mergedParams.recoder_params, {
      vcf_string: '1',
    });
    const vepOptions = parseOptionalParameters(mergedParams.vep_params, {
      CADD: '1',
      hgvs: '1',
      merged: '1',
      mane: '1',
    });
    // Log detailed options for debugging
    debugDetailed(
      `Parsed options: recoderOptions=${JSON.stringify(recoderOptions)},` +
        ` vepOptions=${JSON.stringify(vepOptions)}`
    );

    // Collect variants from all possible sources
    let variants = [];
    let vcfRecordMap;
    let vcfHeaderText;
    let vcfHeaderLines;

    // Process VCF input if provided
    if (mergedParams.vcfInput) {
      debug(`Reading variants from VCF file: ${mergedParams.vcfInput}`);
      try {
        const vcfData = await readVariantsFromVcf(mergedParams.vcfInput);
        variants = vcfData.variantsToProcess;
        vcfRecordMap = vcfData.vcfRecordMap;
        vcfHeaderText = vcfData.headerText;
        vcfHeaderLines = vcfData.headerLines;
        debug(`Read ${variants.length} variants from VCF file`);
      } catch (error) {
        throw new Error(`Error reading VCF file: ${error.message}`);
      }
    } else {
      // Add single variant if provided
      if (mergedParams.variant) {
        variants.push(mergedParams.variant);
      }

      // Add variants from comma-separated list if provided
      if (mergedParams.variants) {
        const variantsList = mergedParams.variants
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        variants = [...variants, ...variantsList];
      }

      // Add variants from file if provided
      if (mergedParams.variantsFile) {
        const fileVariants = readVariantsFromFile(mergedParams.variantsFile);
        variants = [...variants, ...fileVariants];
      }
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
      // Pass VCF data if available
      vcfRecordMap,
      vcfHeaderText,
      vcfHeaderLines,
    });

    // Output the results
    if (mergedParams.save) {
      // For CSV/TSV/VCF formats, result is already a formatted string
      const output = ['CSV', 'TSV', 'VCF'].includes(mergedParams.output.toUpperCase())
        ? result
        : JSON.stringify(result, null, 2);
      fs.writeFileSync(mergedParams.save, output);
      console.log(`Results saved to ${mergedParams.save}`);
    } else {
      // For CSV/TSV/VCF formats, result is already a formatted string
      if (['CSV', 'TSV', 'VCF'].includes(mergedParams.output.toUpperCase())) {
        console.log(result);
      } else {
        // For JSON format, stringify the object
        console.log(JSON.stringify(result, null, 2));
      }
    }

    debug('Variant analysis process completed successfully');
  } catch (error) {
    handleError(error);
  }
}

main();
