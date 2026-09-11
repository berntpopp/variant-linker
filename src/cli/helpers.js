'use strict';
const fs = require('fs');
const defaults = require('../../config/cliDefaults.json');
const { parseProxyConfig } = require('../apiHelper');
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');
/** @param {unknown} error */
function handleError(error) {
  const errorResponse = {
    status: 'error',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && process.env.NODE_ENV !== 'production'
      ? { stack: error.stack }
      : {}),
  };
  console.error(JSON.stringify(errorResponse, null, 2));
}

/** @param {string|undefined} configFilePath @returns {Partial<import('../analysisTypes').CliParams>} */
function readConfigFile(configFilePath) {
  if (!configFilePath) return {};
  try {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const value = JSON.parse(configContent);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Configuration must be an object');
    return value;
  } catch (error) {
    throw new Error(
      `Error reading configuration file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/** @param {string} filePath */
function readVariantsFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Split by newlines and filter out empty lines
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    throw new Error(
      `Error reading variants file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/** @param {import('../analysisTypes').CliParams} params */
function validateParams(params) {
  if (
    params.chunkSize !== undefined &&
    (!Number.isInteger(params.chunkSize) || params.chunkSize <= 0)
  ) {
    throw new Error('chunk-size must be a positive integer');
  }
  const validOutputs = ['JSON', 'CSV', 'TSV', 'SCHEMA', 'VCF'];

  // Streaming mode validation
  if (params.isStreaming && (params.save || params.outputFile)) {
    throw new Error(
      '--save and --output-file options cannot be used with stdin streaming. Please pipe the output to a file instead.'
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
      throw new Error(
        `Invalid proxy configuration: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  } else if (params.proxyAuth) {
    throw new Error('--proxy-auth requires --proxy to be specified');
  }
}

/** @param {Partial<import('../analysisTypes').CliParams>} configParams
 * @param {import('../analysisTypes').CliParams} cliParams
 * @returns {import('../analysisTypes').CliParams} */
function mergeParams(configParams, cliParams) {
  return Object.assign({ ...defaults }, configParams, cliParams);
}

/** @param {number} debugLevel @param {string|undefined} logFilePath */
function enableDebugging(debugLevel, logFilePath) {
  let namespaces = 'variant-linker:main';
  if (debugLevel >= 2) namespaces += ',variant-linker:detailed';
  if (debugLevel >= 3) namespaces += ',variant-linker:all';
  require('debug').enable(namespaces);
  if (logFilePath) {
    try {
      const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
      logStream.on('error', (error) => {
        console.error('Debug log failed: ' + error.message);
        process.exitCode = 1;
      });
      const overrideLog = (/** @type {string} */ msg) => {
        // Basic sanitization to remove ANSI color codes before writing
        logStream.write(
          `[${new Date().toISOString()}] ${require('node:util').stripVTControlCharacters(msg)}\n`
        );
      };
      debug.log = overrideLog;
      debugDetailed.log = overrideLog;
      debugAll.log = overrideLog;
    } catch (err) {
      console.error(
        `Error creating log file '${logFilePath}': ${err instanceof Error ? err.message : String(err)}`
      );
      // Continue without file logging if stream creation fails
    }
  }
  debug('Debug mode enabled');
}

/** @param {string|undefined} paramString @param {Record<string,string|number|boolean>} defaultParams */
function parseOptionalParameters(paramString, defaultParams) {
  const options = { ...defaultParams }; // Start with defaults
  if (paramString) {
    const paramsArray = paramString.split(',');
    paramsArray.forEach((param) => {
      const [key, ...parts] = param.split('=');
      const value = parts.length ? parts.join('=') : undefined;
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
module.exports = {
  handleError,
  readConfigFile,
  readVariantsFromFile,
  validateParams,
  mergeParams,
  enableDebugging,
  parseOptionalParameters,
};
