#!/usr/bin/env node
// src/main.js

const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

// Load the package.json file for the version number
const packageJson = require('../package.json'); // Adjust the path to your package.json if needed

// Enable different levels of debug logs
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

// Import the required functions from the modules
const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const convertVcfToEnsemblFormat = require('./convertVcfToEnsemblFormat');
const {
  processVariantLinking,
  filterAndFormatResults,
  outputResults
} = require('./variantLinkerProcessor');
const { readScoringConfig, applyScoring } = require('./scoring');

/**
 * Reads and parses the configuration file if specified.
 * @param {string} configFilePath - Path to the configuration file.
 * @returns {Object} The parsed configuration object.
 */
function readConfigFile(configFilePath) {
  if (!configFilePath) return {};
  try {
    const configFile = fs.readFileSync(configFilePath, 'utf8');
    return JSON.parse(configFile);
  } catch (error) {
    console.error(`Error reading configuration file: ${error.message}`);
    return {};
  }
}

/**
 * Validates configuration parameters.
 * @param {Object} params - Configuration parameters to validate.
 */
function validateParams(params) {
  const requiredParams = ['variant', 'output'];
  const validOutputs = ['JSON', 'CSV'];

  for (const param of requiredParams) {
    if (!params[param]) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  }

  if (!validOutputs.includes(params.output)) {
    throw new Error(`Invalid output format: ${params.output}. Valid formats are ${validOutputs.join(', ')}`);
  }

  if (params.debug && (typeof params.debug !== 'number' || params.debug < 1 || params.debug > 3)) {
    throw new Error('Debug level must be a number between 1 and 3');
  }
}

/**
 * Sets up the command-line arguments for the Variant-Linker tool.
 */
const argv = yargs
  .option('config', {
    alias: 'c',
    description: 'Path to the configuration file',
    type: 'string'
  })
  .option('variant', {
    alias: 'v',
    description: 'The variant to be analyzed',
    type: 'string'
  })
  .option('output', {
    alias: 'o',
    description: 'Output format (JSON, CSV, etc.)',
    type: 'string',
    default: 'JSON'
  })
  .option('save', {
    alias: 's',
    description: 'Filename to save the results',
    type: 'string'
  })
  .option('debug', {
    alias: 'd',
    description: 'Enable debug mode with levels (1: basic, 2: detailed, 3: all)',
    count: true,
    type: 'number'
  })
  .option('vep_params', {
    alias: 'vp',
    description: 'Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1,hgvs=1,merged=1")',
    type: 'string'
  })
  .option('recoder_params', {
    alias: 'rp',
    description: 'Optional parameters for Variant Recoder in key=value format, separated by commas (default: "vcf_string=1")',
    type: 'string'
  })
  .option('scoring_config_path', {
    alias: 'scp',
    description: 'Path to the scoring configuration directory',
    type: 'string'
  })
  .option('log_file', {
    alias: 'lf',
    description: 'Path to the log file for saving debug information',
    type: 'string'
  })  
  .help()
  .alias('help', 'h')
  .version(packageJson.version)
  .alias('version', 'V')
  .argv;

/**
 * Merges parameters from the configuration file with command-line arguments.
 * Command-line arguments take precedence over configuration file parameters.
 * @param {Object} configParams - Parameters from the configuration file.
 * @param {Object} cliParams - Parameters from the command line.
 * @returns {Object} The merged parameters.
 */
function mergeParams(configParams, cliParams) {
  const merged = { ...configParams };
  for (const key in cliParams) {
    if (cliParams[key] !== undefined && cliParams[key] !== 0) {
      merged[key] = cliParams[key];
    }
  }

  // Remove short options that duplicate long options
  const shortOptions = ['c', 'v', 'o', 's', 'd', 'vp', 'rp', 'scp', 'lf'];
  shortOptions.forEach(option => delete merged[option]);

  return merged;
};

// Usage example:
const configParams = readConfigFile(argv.config);
const mergedParams = mergeParams(configParams, argv);

try {
  validateParams(mergedParams);
} catch (error) {
  console.error(`Configuration validation error: ${error.message}`);
  process.exit(1);
}

/**
 * Enable debugging based on the debug level.
 * 
 * @param {number} debugLevel - The debug level (1, 2, or 3).
 * @param {string} logFilePath - Path to the log file.
 */
function enableDebugging(debugLevel, logFilePath) {
  if (logFilePath) {
    const logStream = fs.createWriteStream(logFilePath, { flags: 'w' }); // Overwrite the log file
    const originalWrite = logStream.write;
    logStream.write = (msg) => {
      const timestamp = new Date().toISOString();
      originalWrite.call(logStream, `[${timestamp}] ${msg.replace(/\x1b\[[0-9;]*m/g, '')}`);
    };
    debug.log = (msg) => logStream.write(msg + '\n');
    debugDetailed.log = (msg) => logStream.write(msg + '\n');
    debugAll.log = (msg) => logStream.write(msg + '\n');
  }

  if (debugLevel >= 1) {
    require('debug').enable('variant-linker:main');
    if (debugLevel >= 2) {
      require('debug').enable('variant-linker:main,variant-linker:detailed');
      if (debugLevel >= 3) {
        require('debug').enable('variant-linker:main,variant-linker:detailed,variant-linker:all');
      }
    }
    debug('Debug mode enabled');
  }
}

if (mergedParams.debug) {
  enableDebugging(mergedParams.debug, mergedParams.log_file);
}

/**
 * Parses optional parameters from command line.
 * 
 * @returns {Object} The parsed optional parameters.
 */
function parseOptionalParameters(paramString, defaultParams) {
  let options = { ...defaultParams };

  if (paramString) {
    const paramsArray = paramString.split(',');
    paramsArray.forEach(param => {
      const [key, value] = param.split('=');
      if (key && value) {
        options[key] = value;
      }
    });
  }

  return options;
}

/**
 * Detects the input format (VCF or HGVS).
 * 
 * @param {string} variant - The variant input.
 * @returns {string} The detected format ("VCF" or "HGVS").
 */
function detectInputFormat(variant) {
  if (!variant) {
    throw new Error('Variant not specified. Please provide a variant using --variant or in the configuration file.');
  }

  // Remove "chr" prefix if present
  variant = variant.replace(/^chr/i, '');
  
  const vcfPattern = /^[0-9XYM]+\-[0-9]+\-[ACGT]+\-[ACGT]+$/i;
  return vcfPattern.test(variant) ? 'VCF' : 'HGVS';
}

/**
 * The main function that orchestrates the variant analysis process.
 * It links the variant recoding and VEP annotation, applies optional filtering,
 * formats the results, and handles the output.
 */
async function main() {
  try {
    debug('Starting main variant analysis process');
    const recoderOptions = parseOptionalParameters(mergedParams.recoder_params, { vcf_string: '1' });
    const vepOptions = parseOptionalParameters(mergedParams.vep_params, { CADD: '1', hgvs: '1', merged: '1', mane: '1' });
    debug(`Parsed options: recoderOptions = ${JSON.stringify(recoderOptions)}, vepOptions = ${JSON.stringify(vepOptions)}`);
    const inputFormat = detectInputFormat(mergedParams.variant);
    debug(`Detected input format: ${inputFormat}`);
    let variantData, annotationData;

    if (inputFormat === 'VCF') {
      debug('Processing variant as VCF format');
      debug('Skipping Variant Recoder step as the input is already in VCF format');
      const { region, allele } = convertVcfToEnsemblFormat(mergedParams.variant);
      debug(`Converted VCF to Ensembl format: region = ${region}, allele = ${allele}`);
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions);
      debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
    } else {
      debug('Processing variant as HGVS format');
      variantData = await variantRecoder(mergedParams.variant, recoderOptions);
      debug(`Variant Recoder data received: ${JSON.stringify(variantData)}`);
      const firstVariant = variantData[0]; // Assuming the first object in the array

      // Find the first valid VCF string that matches the expected pattern
      const vcfString = firstVariant[Object.keys(firstVariant)[0]].vcf_string.find(vcf => /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcf));

      if (!vcfString) {
        // Log all available VCF strings for better debugging
        debug(`Available VCF strings: ${JSON.stringify(firstVariant[Object.keys(firstVariant)[0]].vcf_string)}`);
        throw new Error('No valid VCF string found in Variant Recoder response');
      }

      const { region, allele } = convertVcfToEnsemblFormat(vcfString);
      debug(`Converted VCF to Ensembl format from Recoder: region = ${region}, allele = ${allele}`);
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions);
      debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
    }

    // Apply scoring if scoring configuration is provided
    if (mergedParams.scoring_config_path) {
      const scoringConfig = readScoringConfig(mergedParams.scoring_config_path);
      annotationData = applyScoring(annotationData, scoringConfig);
      debug(`Applied scoring to annotation data: ${JSON.stringify(annotationData)}`);
    }

    // Define a filter function as needed
    const filterFunction = null; // Example: (results) => { /* filtering logic */ }

    const formattedResults = filterAndFormatResults({ variantData, annotationData }, filterFunction, mergedParams.output);

    outputResults(formattedResults, mergedParams.save);
    debug('Variant analysis process completed successfully');
  } catch (error) {
    debug(`Error in main variant analysis process: ${error.message}`);
    console.error('Error:', error.message);
  }
}

main();
