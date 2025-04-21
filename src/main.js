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
const { readPedigree } = require('./pedReader');

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

  // VCF output from non-VCF input is now supported
  // VCF header information and minimal structure will be generated automatically

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
  .option('output-file', {
    alias: 'of',
    description: 'Output file path',
    type: 'string',
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
  .option('ped', {
    alias: 'p',
    description: 'Path to the PED file defining family structure and affected status',
    type: 'string',
  })
  .option('calculate-inheritance', {
    alias: 'ci',
    description: 'Enable automatic inheritance pattern deduction and segregation check',
    type: 'boolean',
  })
  .option('sample-map', {
    alias: 'sm',
    description:
      'Comma-separated sample IDs for Index, Mother, Father if PED file is not provided ' +
      '(used for default trio mode)',
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

    // Collect variants from all possible sources
    let variants = [];
    const vcfRecordMap = new Map();
    let vcfHeaderLines;

    // Process VCF input if provided
    let variantIds = [];
    let vcfData = null;

    if (mergedParams.vcfInput) {
      debug(`Processing VCF file: ${mergedParams.vcfInput}`);
      try {
        vcfData = await readVariantsFromVcf(mergedParams.vcfInput);
        variantIds = vcfData.variantsToProcess;
        vcfHeaderLines = vcfData.headerLines;
        debug(`Extracted ${variantIds.length} variant(s) from VCF file`);
        debug(`Captured VCF header with ${vcfHeaderLines.length} lines`);

        // Get the VCF record map with record data and genotypes
        if (vcfData.vcfRecordMap) {
          for (const [key, record] of vcfData.vcfRecordMap) {
            vcfRecordMap.set(key, record);
          }
          debug(`Created VCF record map with data for ${vcfRecordMap.size} variants`);
        }

        // Extract sample IDs for inheritance pattern calculation
        if (vcfData.samples && vcfData.samples.length > 0) {
          debug(
            `VCF file contains ${vcfData.samples.length} samples: ${vcfData.samples.join(', ')}`
          );
        }
      } catch (error) {
        debug(`Error processing VCF file: ${error.message}`);
        console.error(`Error processing VCF file: ${error.message}`);
        throw new Error(`Failed to process VCF file: ${error.message}`);
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

    // Read PED file if provided
    let pedigreeData = null;
    if (mergedParams.ped) {
      try {
        debug(`Reading pedigree data from PED file: ${mergedParams.ped}`);
        pedigreeData = await readPedigree(mergedParams.ped);
        debug(`Parsed pedigree data for ${pedigreeData.size} samples`);
      } catch (error) {
        debug(`Error reading PED file: ${error.message}`);
        console.error(`Warning: Could not read PED file: ${error.message}`);
        // Continue without pedigree data
      }
    }

    // Parse sample mapping for trio mode if provided
    let sampleMap = null;
    if (mergedParams.sampleMap) {
      try {
        const sampleIds = mergedParams.sampleMap.split(',').map((id) => id.trim());
        if (sampleIds.length === 3) {
          sampleMap = {
            index: sampleIds[0],
            mother: sampleIds[1],
            father: sampleIds[2],
          };
          debug(
            `Using provided sample map: Index=${sampleMap.index}, ` +
              `Mother=${sampleMap.mother}, Father=${sampleMap.father}`
          );
        } else {
          debug(
            `Warning: Invalid sample map format, expected 3 comma-separated IDs, ` +
              `got ${sampleIds.length}`
          );
          console.error('Warning: Invalid sample map format. Expected: Index,Mother,Father');
        }
      } catch (error) {
        debug(`Error parsing sample map: ${error.message}`);
        console.error(`Warning: Could not parse sample map: ${error.message}`);
      }
    }

    // Determine if we should calculate inheritance patterns
    let calculateInheritance = Boolean(mergedParams.calculateInheritance);

    // If --calculate-inheritance not explicitly set but we have PED or VCF with samples, enable it
    if (calculateInheritance === false && mergedParams.calculateInheritance === undefined) {
      if (pedigreeData || (vcfData && vcfData.samples && vcfData.samples.length > 1)) {
        calculateInheritance = true;
        debug('Automatically enabling inheritance pattern calculation based on available data');
      }
    }

    if (calculateInheritance) {
      debug('Inheritance pattern calculation is enabled');
    }

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

    // Prepare analysis parameters
    const analysisParams = {
      variants: mergedParams.vcfInput ? variantIds : variants,
      output: mergedParams.output,
      filter: mergedParams.filter,
      assembly: mergedParams.assembly,
      cache: mergedParams.cache,
      calculateInheritance: mergedParams.calculateInheritance,
      pedigreeData,
      sampleMap,
      vcfRecordMap: vcfRecordMap,
      vcfHeaderLines: vcfData ? vcfData.headerLines : undefined,
      scoringConfigPath: mergedParams.scoringConfigPath,
      vepParams: mergedParams.vepParams,
      recoderParams: mergedParams.recoderParams,
      skipRecoder: mergedParams.skipRecoder,
      vcfHeaderLines,
    };

    // Add pedigree data to analysis params if available
    if (pedigreeData) {
      analysisParams.pedigreeData = pedigreeData;
    }

    // Add inheritance pattern calculation parameters if enabled
    if (calculateInheritance) {
      analysisParams.calculateInheritance = true;

      // Add VCF records with genotype data if available
      if (vcfRecordMap && vcfRecordMap.size > 0) {
        analysisParams.vcfRecordMap = vcfRecordMap;
      }

      // Add sample IDs if available
      if (vcfData && vcfData.samples && vcfData.samples.length > 0) {
        analysisParams.samples = vcfData.samples;
      }

      // Add sample mapping for trio analysis if available
      if (sampleMap) {
        analysisParams.sampleMap = sampleMap;
      }

      debug('Added inheritance pattern calculation parameters to analysis');
    }

    // Add detailed debug logging before calling analyzeVariant
    debugDetailed(
      `Passing to analyzeVariant - analysisParams.variants (${analysisParams.variants ? analysisParams.variants.length : 0}): ${JSON.stringify(analysisParams.variants)}`
    );
    debugDetailed(
      `Passing to analyzeVariant - analysisParams.vcfRecordMap size: ${analysisParams.vcfRecordMap ? analysisParams.vcfRecordMap.size : 'N/A'}`
    );
    debugDetailed(
      `Passing to analyzeVariant - analysisParams.vcfHeaderLines count: ${analysisParams.vcfHeaderLines ? analysisParams.vcfHeaderLines.length : 'N/A'}`
    );
    debugDetailed(
      `Passing to analyzeVariant - analysisParams.pedigreeData keys: ${analysisParams.pedigreeData ? JSON.stringify(Array.from(analysisParams.pedigreeData.keys())) : 'N/A'}`
    );
    debugDetailed(
      `Passing to analyzeVariant - analysisParams.calculateInheritance: ${analysisParams.calculateInheritance}`
    );

    // Get the results by analyzing variants
    const result = await analyzeVariant(analysisParams);

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
