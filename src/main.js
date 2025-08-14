#!/usr/bin/env node
/**
 * @fileoverview Main entry point for the Variant-Linker CLI tool.
 * This file handles CLI parameter parsing, debugging, and then calls the core analysis function.
 * @module main
 */

'use strict';

const fs = require('fs');
const readline = require('readline');
const yargs = require('yargs');
const packageJson = require('../package.json');
const { analyzeVariant } = require('./variantLinkerCore');
const { filterAndFormatResults } = require('./variantLinkerProcessor');
const { getBaseUrl } = require('./configHelper');
const { readVariantsFromVcf } = require('./vcfReader');
const { readPedigree } = require('./pedReader');
const { loadFeatures } = require('./featureParser');
const { parseProxyConfig } = require('./apiHelper');

// Set up debug loggers.
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

/**
 * Outputs error information as JSON.
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

  // Streaming mode validation
  if (params.isStreaming && (params.save || params.outputFile)) {
    throw new Error(
      '--save and --output-file options cannot be used with stdin streaming. Please pipe the output to a file instead.'
    );
  }

  if (params.isStreaming && params.output.toUpperCase() === 'JSON') {
    console.warn(
      'Warning: JSON output is not ideal for streaming. Consider using TSV or CSV for better pipeline compatibility.'
    );
  }

  // Check if at least one variant source is provided (skip for streaming mode)
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

  if (inputMethodCount === 0 && !params.isStreaming) {
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

  if (!validOutputs.includes(params.output.toUpperCase())) {
    // Convert to uppercase for comparison
    throw new Error(
      `Invalid output format: ${params.output}. Valid formats are ${validOutputs.join(', ')}`
    );
  }

  // VCF output from non-VCF input is now supported
  // VCF header information and minimal structure will be generated automatically

  if (params.debug && (typeof params.debug !== 'number' || params.debug < 1 || params.debug > 3)) {
    throw new Error('Debug level must be a number between 1 and 3');
  }

  // Validate hg19tohg38 assembly mode requirements
  if (params.assembly === 'hg19tohg38') {
    const hasCoordinateInput = hasVcfInput;

    // Check if variants are in coordinate format (for non-VCF inputs)
    let hasCoordinateVariants = false;
    if (hasVariant && params.variant) {
      // Check if single variant is coordinate-based
      const vcfPattern = /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i;
      hasCoordinateVariants = vcfPattern.test(params.variant.replace(/^chr/i, ''));
    } else if (hasVariantsList && params.variants) {
      // Check if all variants in the list are coordinate-based
      const variantsList = params.variants.split(',').map((v) => v.trim());
      const vcfPattern = /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i;
      hasCoordinateVariants = variantsList.every((variant) =>
        vcfPattern.test(variant.replace(/^chr/i, ''))
      );
    } else if (hasVariantsFile) {
      // For file input, we'll need to check during runtime since we haven't read the file yet
      // This will be validated later in the main function
      hasCoordinateVariants = true; // Assume valid for now, check later
    }

    if (!hasCoordinateInput && !hasCoordinateVariants) {
      throw new Error(
        "Error: The 'hg19tohg38' assembly mode only supports coordinate-based input " +
          "(e.g., '1-12345-A-G' or VCF files). rsIDs and HGVS notations are not supported in this mode."
      );
    }
  }

  // Validate proxy configuration
  if (params.proxy) {
    try {
      // This will throw an error if the proxy URL is invalid
      parseProxyConfig(params.proxy, params.proxyAuth);
    } catch (error) {
      throw new Error(`Invalid proxy configuration: ${error.message}`);
    }
  } else if (params.proxyAuth) {
    throw new Error('--proxy-auth requires --proxy to be specified');
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
  // Ensure all short options used in yargs are removed
  const shortOptions = [
    'c',
    'v',
    'vf',
    'vs',
    'o',
    's',
    'd',
    'vp',
    'rp',
    'scp',
    'lf',
    'sv',
    'f',
    'p',
    'ci',
    'sm',
    'vi',
    'C',
    'of',
    'po',
    'bf',
    'gl',
    'jg',
    'cs',
    'h',
    'V',
  ];
  shortOptions.forEach((option) => {
    delete merged[option];
  });
  // Also remove placeholder args often added by yargs
  delete merged['_'];
  delete merged['$0'];
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
    try {
      const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
      const overrideLog = (msg) => {
        // Basic sanitization to remove ANSI color codes before writing
        logStream.write(`[${new Date().toISOString()}] ${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n`);
      };
      debug.log = overrideLog;
      debugDetailed.log = overrideLog;
      debugAll.log = overrideLog;
    } catch (err) {
      console.error(`Error creating log file '${logFilePath}': ${err.message}`);
      // Continue without file logging if stream creation fails
    }
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
  const options = { ...defaultParams }; // Start with defaults
  if (paramString) {
    const paramsArray = paramString.split(',');
    paramsArray.forEach((param) => {
      const [key, value] = param.split('=');
      const trimmedKey = key.trim(); // <<< FIX: Define trimmedKey here
      if (trimmedKey && value !== undefined) {
        // Check value is not undefined
        options[trimmedKey] = value.trim(); // Trim key/value
      } else if (trimmedKey) {
        // Handle flags (parameters without '=value') - Set to '1' as per VEP convention
        options[trimmedKey] = '1';
      }
    });
  }
  return options; // Return merged options
}

// Set up CLI options using yargs.
const argv = yargs(process.argv.slice(2)) // Use process.argv.slice(2) for better compatibility
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
    description: 'Output format (JSON, CSV, TSV, SCHEMA, VCF)',
    type: 'string',
    default: 'JSON',
  })
  .option('output-file', {
    alias: 'of',
    description: 'Output file path (alternative to --save)', // Clarified description
    type: 'string',
  })
  .option('save', { alias: 's', description: 'Filename to save the results', type: 'string' })
  .option('debug', {
    alias: 'd',
    description: 'Enable debug mode (level 1=basic, 2=detailed, 3=all)', // Clarified description
    type: 'count', // Keep as count
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
    // Keep snake_case for consistency with README example
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
    description: 'Genome assembly (hg38 [default], hg19, or hg19tohg38)',
    type: 'string',
    choices: ['hg38', 'hg19', 'hg19tohg38'],
    default: 'hg38',
  })
  .option('filter', {
    alias: 'f',
    description: 'Filtering criteria as a JSON string',
    type: 'string',
  })
  .option('pick-output', {
    alias: 'po',
    description: 'Filter output to include only the VEP-picked consequence per variant',
    type: 'boolean',
    default: false,
  })
  .option('bed-file', {
    description: 'Path to a BED file containing regions of interest. Can be used multiple times.',
    type: 'array',
    alias: 'bf',
  })
  .option('gene-list', {
    description:
      'Path to a text file with gene symbols or Ensembl IDs (one per line). Can be used multiple times.',
    type: 'array',
    alias: 'gl',
  })
  .option('json-genes', {
    description: 'Path to a JSON file containing gene information. Requires --json-gene-mapping.',
    type: 'array',
    alias: 'jg',
  })
  .option('json-gene-mapping', {
    description:
      'JSON string to map fields in the json-genes file. e.g., \'{"identifier":"gene_symbol","dataFields":["panel_name"]}\'',
    type: 'string',
  })
  .option('chunk-size', {
    alias: 'cs',
    description: 'Number of variants to process per API batch in streaming mode.',
    type: 'number',
    default: 100,
  })
  .option('proxy', {
    description:
      'HTTP/HTTPS proxy URL (e.g., http://proxy.company.com:8080 or http://user:pass@proxy:8080)',
    type: 'string',
  })
  .option('proxy-auth', {
    description:
      'Proxy authentication in user:password format (alternative to embedding in proxy URL)',
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
  .example(
    'variant-linker --vcf-input input.vcf --output VCF --save output.vcf',
    'Annotate a VCF file and save the output'
  )
  .example(
    'variant-linker --variant "rs123" --proxy http://proxy.company.com:8080 --output JSON',
    'Use HTTP proxy for API requests'
  )
  .example(
    'variant-linker --variant "rs123" --proxy http://proxy:8080 --proxy-auth user:pass --output JSON',
    'Use proxy with separate authentication'
  )
  .epilogue('For more information, see https://github.com/berntpopp/variant-linker')
  .help()
  .alias('help', 'h')
  .version(packageJson.version)
  .alias('version', 'V')
  .showHelpOnFail(true)
  .check((argv) => {
    // Show help if no parameters provided and not called with specific flags like --version or --help
    const helpOrVersionFlags = ['h', 'help', 'V', 'version', 'sv', 'semver'];
    const hasOtherFlags = Object.keys(argv).some(
      (key) => !helpOrVersionFlags.includes(key) && key !== '_' && key !== '$0'
    );

    if (process.argv.length <= 2 && !hasOtherFlags) {
      yargs.showHelp();
      return false;
    }
    return true;
  })
  .strict() // Add strict mode to catch unknown options
  .parse(); // Use parse() instead of accessing .argv directly

// --- Main execution logic ---

// Exit early if help or version was requested and handled by yargs
if (argv.help || argv.version || argv.semver) {
  // yargs handles showing help/version, semver is handled below
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
  }
  return; // Exit cleanly
}

let configParams = {}; // Initialize to empty object
try {
  if (argv.config) {
    // Only read if config path is provided
    configParams = readConfigFile(argv.config);
  }
} catch (error) {
  handleError(error);
  return; // Stop execution if config reading fails
}

// Merge CLI args over config file args
const mergedParams = mergeParams(configParams, argv);

// Note: Validation is now done in runAnalysis after streaming mode detection

// Enable debugging *after* validation and merging
if (mergedParams.debug > 0) {
  // Check if debug count is > 0
  enableDebugging(mergedParams.debug, mergedParams.log_file); // Use mergedParams.log_file
}

// Set assembly and base URL
mergedParams.assembly = mergedParams.assembly || 'hg38';
if (!process.env.ENSEMBL_BASE_URL) {
  process.env.ENSEMBL_BASE_URL = getBaseUrl(mergedParams.assembly);
  debug(
    `Set ENSEMBL_BASE_URL based on assembly '${mergedParams.assembly}': ${process.env.ENSEMBL_BASE_URL}`
  );
} else {
  debug(`Using existing ENSEMBL_BASE_URL from environment: ${process.env.ENSEMBL_BASE_URL}`);
}

// Parse proxy configuration if provided
let proxyConfig = null;
if (mergedParams.proxy || mergedParams.proxyAuth) {
  try {
    proxyConfig = parseProxyConfig(mergedParams.proxy, mergedParams.proxyAuth);
    if (proxyConfig) {
      debug(`Proxy configured: ${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Processes a chunk of variants and outputs the formatted result.
 * @param {Array<string>} chunk - Array of variant strings to process
 * @param {boolean} isFirstChunk - Whether this is the first chunk (for header output)
 * @param {Object} params - Processing parameters
 * @returns {Promise<void>} Resolves when chunk processing is complete
 */
async function processAndOutputChunk(chunk, isFirstChunk, params) {
  try {
    debug(`Processing chunk of ${chunk.length} variants`);
    const analysisParams = { ...params, variants: chunk, isStreaming: true, proxyConfig };
    const result = await analyzeVariant(analysisParams);

    const formatted = filterAndFormatResults(result, null, params.output, params);

    if (params.output.toUpperCase() === 'CSV' || params.output.toUpperCase() === 'TSV') {
      // For tabular formats, write header once and data incrementally
      if (isFirstChunk && formatted.header) {
        process.stdout.write(formatted.header + '\n');
      }
      if (formatted.data) {
        process.stdout.write(formatted.data + '\n');
      }
    } else {
      // For JSON, just print the whole thing
      process.stdout.write(formatted + '\n');
    }
  } catch (error) {
    console.error(`Error processing chunk: ${error.message}`);
    // Continue to the next chunk
  }
}

/**
 * Processes input from stdin in streaming mode.
 * @param {Object} params - Processing parameters
 * @returns {Promise<void>} Resolves when streaming is complete
 */
async function processStream(params) {
  debug('Starting streaming mode processing');

  // Parse optional parameters for streaming mode
  const recoderOptions = parseOptionalParameters(params.recoder_params, {
    vcf_string: '1',
  });
  const vepOptions = parseOptionalParameters(params.vep_params, {
    CADD: '1',
    hgvs: '1',
    merged: '1',
    mane: '1',
  });

  // Add the pick flag if the CLI option is used
  if (params.pickOutput) {
    vepOptions.pick = '1';
    debug('Enabling VEP pick flag (--pick-output specified) for streaming mode.');
  }

  // Load user-provided features if any are specified
  let features = null;
  if (params.bedFile || params.geneList || params.jsonGenes) {
    try {
      debug('Loading user-provided features for overlap annotation in streaming mode');
      features = await loadFeatures(params);
      debug('Feature loading completed successfully for streaming mode');
    } catch (error) {
      debug(`Error loading features: ${error.message}`);
      console.error(`Warning: Could not load features: ${error.message}`);
      // Continue without features rather than failing completely
      features = null;
    }
  }

  // Prepare common parameters for all chunks
  const commonParams = {
    ...params,
    recoderOptions,
    vepOptions,
    features,
    isStreaming: true,
  };

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  let chunk = [];
  const chunkSize = params.chunkSize || 100;
  let isFirstChunk = true;

  try {
    for await (const line of rl) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        chunk.push(trimmedLine);
        if (chunk.length >= chunkSize) {
          await processAndOutputChunk(chunk, isFirstChunk, commonParams);
          isFirstChunk = false;
          chunk = [];
        }
      }
    }

    // Process any remaining variants in the last chunk
    if (chunk.length > 0) {
      await processAndOutputChunk(chunk, isFirstChunk, commonParams);
    } else if (
      isFirstChunk &&
      (params.output.toUpperCase() === 'CSV' || params.output.toUpperCase() === 'TSV')
    ) {
      // If no input was provided, still output the header for tabular formats
      debug('No input received, outputting header only');
      const { getDefaultColumnConfig } = require('./dataExtractor');
      const { formatToTabular } = require('./dataExtractor');
      const delimiter = params.output.toUpperCase() === 'CSV' ? ',' : '\t';
      const columnConfig = getDefaultColumnConfig({
        includeInheritance: false,
        includeUserFeatures: false,
      });
      const header = formatToTabular([], columnConfig, delimiter, true);
      process.stdout.write(header + '\n');
    }
  } finally {
    rl.close();
  }

  debug('Streaming mode processing completed');
}

/**
 * Main async function for analysis.
 * @returns {Promise<void>} Resolves when processing is complete
 */
async function runAnalysis() {
  // Renamed to avoid conflict with module name
  try {
    debug('Starting variant analysis process');

    // Detect streaming mode
    // In spawned processes, process.stdin.isTTY might be undefined
    // When stdin is piped, isTTY is typically undefined or false (not true)
    const isStreaming =
      !mergedParams.variant &&
      !mergedParams.variants &&
      !mergedParams.variantsFile &&
      !mergedParams.vcfInput &&
      !process.stdin.isTTY;
    mergedParams.isStreaming = isStreaming; // Add to params for reuse in validation

    // Debug logging for streaming detection
    debug(
      `Streaming mode detection: variant=${!!mergedParams.variant}, ` +
        `variants=${!!mergedParams.variants}, variantsFile=${!!mergedParams.variantsFile}, ` +
        `vcfInput=${!!mergedParams.vcfInput}, isTTY=${process.stdin.isTTY}, isStreaming=${isStreaming}`
    );

    // Re-validate with streaming context
    validateParams(mergedParams);

    if (isStreaming) {
      debug('Streaming mode detected, processing stdin');
      await processStream(mergedParams);
      return;
    } else {
      debug('File-based mode detected, processing traditional inputs');
      await processFileBased(mergedParams);
    }
  } catch (error) {
    // Use handleError which includes console.error
    handleError(error);
    // <<< FIX: Explicitly exit on error to terminate the process for tests
    throw error;
  }
}

/**
 * Processes file-based inputs (non-streaming mode).
 * @param {Object} mergedParams - Merged CLI and config parameters
 * @returns {Promise<void>} Resolves when processing is complete
 */
async function processFileBased(mergedParams) {
  try {
    debug('Processing file-based input');

    // Parse optional parameters *after* merging CLI and config
    const recoderOptions = parseOptionalParameters(mergedParams.recoder_params, {
      vcf_string: '1',
    });
    const vepOptions = parseOptionalParameters(mergedParams.vep_params, {
      CADD: '1',
      hgvs: '1',
      merged: '1',
      mane: '1',
    });

    // Add the pick flag if the CLI option is used
    if (mergedParams.pickOutput) {
      vepOptions.pick = '1';
      debug('Enabling VEP pick flag (--pick-output specified).');
    }

    // Log detailed options for debugging *after* parsing
    debugDetailed(
      `Parsed options -> recoderOptions: ${JSON.stringify(recoderOptions)},` +
        ` vepOptions: ${JSON.stringify(vepOptions)}`
    );

    // Collect variants from all possible sources
    let variants = [];
    let vcfRecordMap = new Map(); // Initialize here
    let vcfHeaderLines = undefined; // Initialize here
    let vcfData = null; // Initialize vcfData to null

    if (mergedParams.vcfInput) {
      debug(`Processing VCF file: ${mergedParams.vcfInput}`);
      try {
        vcfData = await readVariantsFromVcf(mergedParams.vcfInput);
        variants = vcfData.variantsToProcess; // Assign variants from VCF reader
        vcfHeaderLines = vcfData.headerLines;
        debug(`Extracted ${variants.length} variant(s) from VCF file`);
        // debug(`Captured VCF header with ${vcfHeaderLines.length} lines`); // Already logged in reader

        if (vcfData.vcfRecordMap) {
          vcfRecordMap = vcfData.vcfRecordMap; // Assign the map directly
          debug(`Using VCF record map with data for ${vcfRecordMap.size} variants`);
        }

        // if (vcfData.samples && vcfData.samples.length > 0) { // Already logged in reader
        //   debug(
        //     `VCF file contains ${vcfData.samples.length} samples: ${vcfData.samples.join(', ')}`
        //   );
        // }
      } catch (error) {
        debug(`Error processing VCF file: ${error.message}`);
        console.error(`Error processing VCF file: ${error.message}`);
        throw new Error(`Failed to process VCF file: ${error.message}`);
      }
    } else {
      // Handle non-VCF inputs
      if (mergedParams.variant) {
        variants.push(mergedParams.variant);
      }
      if (mergedParams.variants) {
        const variantsList = mergedParams.variants
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        variants = [...variants, ...variantsList];
      }
      if (mergedParams.variantsFile) {
        const fileVariants = readVariantsFromFile(mergedParams.variantsFile);
        variants = [...variants, ...fileVariants];
      }
    }

    debug(`Final count of variants to process: ${variants.length}`);
    debugDetailed(`Variants list: ${JSON.stringify(variants.slice(0, 10))}...`);

    // Additional validation for hg19tohg38 mode with file input
    if (mergedParams.assembly === 'hg19tohg38' && mergedParams.variantsFile) {
      const vcfPattern = /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i;
      const invalidVariants = variants.filter(
        (variant) => !vcfPattern.test(variant.replace(/^chr/i, ''))
      );

      if (invalidVariants.length > 0) {
        throw new Error(
          `Error: The 'hg19tohg38' assembly mode only supports coordinate-based input. ` +
            `Found ${invalidVariants.length} non-coordinate variant(s) in file: ${invalidVariants.slice(0, 3).join(', ')}${invalidVariants.length > 3 ? '...' : ''}`
        );
      }
    }

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
              `got ${sampleIds.length}. Ignoring --sample-map.`
          );
          console.error(
            'Warning: Invalid sample map format. Expected: Index,Mother,Father. Ignoring.'
          );
          sampleMap = null; // Reset to null if invalid
        }
      } catch (error) {
        debug(`Error parsing sample map: ${error.message}`);
        console.error(`Warning: Could not parse sample map: ${error.message}`);
        sampleMap = null; // Reset on error
      }
    }

    // Determine if we should calculate inheritance patterns
    let calculateInheritance = Boolean(mergedParams.calculateInheritance);
    if (calculateInheritance === false && mergedParams.calculateInheritance === undefined) {
      if (pedigreeData || (vcfData && vcfData.samples && vcfData.samples.length > 1)) {
        calculateInheritance = true;
        debug('Automatically enabling inheritance pattern calculation based on available data.');
      }
    }
    if (calculateInheritance) {
      debug('Inheritance pattern calculation is enabled.');
    }

    // Load user-provided features if any are specified
    let features = null;
    if (mergedParams.bedFile || mergedParams.geneList || mergedParams.jsonGenes) {
      try {
        debug('Loading user-provided features for overlap annotation');
        features = await loadFeatures(mergedParams);
        debug('Feature loading completed successfully');
      } catch (error) {
        debug(`Error loading features: ${error.message}`);
        console.error(`Warning: Could not load features: ${error.message}`);
        // Continue without features rather than failing completely
        features = null;
      }
    }

    // Prepare analysis parameters - *** THE FIX IS HERE ***
    const analysisParams = {
      // Source of variants determined above
      variants: variants, // Use the final list of variants
      // Input source flags for core logic
      vcfInput: mergedParams.vcfInput, // Pass the path or flag
      // Output and filter params
      output: mergedParams.output,
      filter: mergedParams.filter,
      pickOutput: mergedParams.pickOutput, // Pass the pick output flag
      // API options (use the parsed objects)
      recoderOptions: recoderOptions, // <-- CORRECTED: Use the parsed object
      vepOptions: vepOptions, // <-- CORRECTED: Use the parsed object
      cache: mergedParams.cache,
      // Assembly
      assembly: mergedParams.assembly,
      // Inheritance params
      calculateInheritance: calculateInheritance, // Use the calculated boolean
      pedigreeData: pedigreeData, // Pass the parsed Map or null
      sampleMap: sampleMap, // Pass the parsed map or null
      // VCF context data (passed from vcfReader)
      vcfRecordMap: vcfRecordMap, // Pass the Map or empty Map
      vcfHeaderLines: vcfHeaderLines, // Pass the array or undefined
      samples: vcfData ? vcfData.samples : undefined, // Pass sample list from VCF
      // Scoring
      scoringConfigPath: mergedParams.scoring_config_path,
      // User-provided features for overlap annotation
      features: features,
      // Proxy configuration
      proxyConfig: proxyConfig,
      // Note: Removed redundant vepParams/recoderParams and skipRecoder
    };

    // Add detailed debug logging before calling analyzeVariant
    debugDetailed(
      `Calling analyzeVariant with -> variants (${analysisParams.variants?.length || 0}): ` +
        `${JSON.stringify(analysisParams.variants?.slice(0, 5))}...`
    );
    debugDetailed(` -> vcfInput: ${analysisParams.vcfInput}`);
    debugDetailed(` -> vcfRecordMap size: ${analysisParams.vcfRecordMap?.size}`);
    debugDetailed(` -> vcfHeaderLines count: ${analysisParams.vcfHeaderLines?.length}`);
    debugDetailed(
      ` -> pedigreeData keys: ` +
        `${JSON.stringify(Array.from(analysisParams.pedigreeData?.keys() || []))}`
    );
    debugDetailed(` -> sampleMap: ${JSON.stringify(analysisParams.sampleMap)}`);
    debugDetailed(` -> samples: ${JSON.stringify(analysisParams.samples)}`);
    debugDetailed(` -> calculateInheritance: ${analysisParams.calculateInheritance}`);
    debugDetailed(` -> vepOptions: ${JSON.stringify(analysisParams.vepOptions)}`); // Log the passed options
    debugDetailed(` -> recoderOptions: ${JSON.stringify(analysisParams.recoderOptions)}`); // Log the passed options

    // Get the results by analyzing variants
    const result = await analyzeVariant(analysisParams);

    // Output the results
    const savePath = mergedParams.save || mergedParams.outputFile; // Support both --save and --output-file
    if (savePath) {
      // For CSV/TSV/VCF formats, result is already a formatted string
      const outputContent = ['CSV', 'TSV', 'VCF'].includes(mergedParams.output.toUpperCase())
        ? result
        : JSON.stringify(result, null, 2);
      try {
        fs.writeFileSync(savePath, outputContent);
        console.log(`Results saved to ${savePath}`);
      } catch (writeError) {
        console.error(`Error saving results to ${savePath}: ${writeError.message}`);
        // Optionally, print to console as fallback?
        // console.log(outputContent);
      }
    } else {
      // For CSV/TSV/VCF formats, result is already a formatted string
      if (['CSV', 'TSV', 'VCF'].includes(mergedParams.output.toUpperCase())) {
        console.log(result);
      } else {
        // For JSON format, stringify the object
        console.log(JSON.stringify(result, null, 2));
      }
    }

    debug('File-based variant analysis process completed successfully');
  } catch (error) {
    throw error; // Re-throw to be handled by runAnalysis
  }
}

// Execute the main analysis function
runAnalysis().catch((err) => {
  handleError(err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
