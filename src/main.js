#!/usr/bin/env node
'use strict';
// src/main.js

/**
 * @fileoverview Main entry point for the Variant-Linker CLI tool.
 * @module main
 */

const fs = require('fs');
const yargs = require('yargs');
const packageJson = require('../package.json');

// Set up debug loggers.
const debug = require('debug')('variant-linker:main');
const debugDetailed = require('debug')('variant-linker:detailed');
const debugAll = require('debug')('variant-linker:all');

// Import our modules.
const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const { convertVcfToEnsemblFormat } = require('./convertVcfToEnsemblFormat');
const {
  processVariantLinking,
  filterAndFormatResults,
  outputResults
} = require('./variantLinkerProcessor');
const { readScoringConfig, applyScoring } = require('./scoring');

/**
 * Reads and parses a JSON configuration file.
 *
 * @param {string} configFilePath - The path to the configuration file.
 * @returns {Object} The parsed configuration object, or an empty object if not provided.
 */
function readConfigFile(configFilePath) {
  if (!configFilePath) {
    return {};
  }
  try {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Error reading configuration file: ${error.message}`);
    return {};
  }
}

/**
 * Validates that the required parameters are present and valid.
 *
 * @param {Object} params - The configuration parameters.
 * @throws {Error} If a required parameter is missing or invalid.
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
    throw new Error(
      `Invalid output format: ${params.output}. Valid formats are ${validOutputs.join(', ')}`
    );
  }

  if (
    params.debug &&
    (typeof params.debug !== 'number' || params.debug < 1 || params.debug > 3)
  ) {
    throw new Error('Debug level must be a number between 1 and 3');
  }
}

/**
 * Merges configuration parameters from a file with CLI parameters.
 * CLI parameters override file parameters.
 *
 * @param {Object} configParams - The configuration file parameters.
 * @param {Object} cliParams - The command-line parameters.
 * @returns {Object} The merged parameters.
 */
function mergeParams(configParams, cliParams) {
  const merged = { ...configParams, ...cliParams };

  // Remove short aliases (they duplicate the long names)
  const shortOptions = ['c', 'v', 'o', 's', 'd', 'vp', 'rp', 'scp', 'lf', 'sv'];
  shortOptions.forEach((option) => {
    delete merged[option];
  });

  return merged;
}

/**
 * Enables debug logging according to the provided debug level.
 *
 * @param {number} debugLevel - The debug level (1, 2, or 3).
 * @param {string} [logFilePath] - Optional path to a log file.
 */
function enableDebugging(debugLevel, logFilePath) {
  let namespaces = 'variant-linker:main';
  if (debugLevel >= 2) {
    namespaces += ',variant-linker:detailed';
  }
  if (debugLevel >= 3) {
    namespaces += ',variant-linker:all';
  }
  require('debug').enable(namespaces);
  if (logFilePath) {
    const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
    const overrideLog = (msg) => {
      logStream.write(
        `[${new Date().toISOString()}] ${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n`
      );
    };
    debug.log = overrideLog;
    debugDetailed.log = overrideLog;
    debugAll.log = overrideLog;
  }
  debug('Debug mode enabled');
}

/**
 * Parses optional parameters from a comma‐delimited string into an object.
 *
 * @param {string} paramString - Parameters in key=value pairs separated by commas.
 * @param {Object} defaultParams - The default parameters.
 * @returns {Object} The parsed parameters.
 */
function parseOptionalParameters(paramString, defaultParams) {
  const options = { ...defaultParams };
  if (paramString) {
    const paramsArray = paramString.split(',');
    paramsArray.forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) {
        options[key] = value;
      }
    });
  }
  return options;
}

/**
 * Determines whether the variant is in VCF or HGVS format.
 *
 * @param {string} variant - The variant string.
 * @returns {string} Returns "VCF" if the variant matches the VCF pattern; otherwise "HGVS".
 * @throws {Error} If no variant is provided.
 */
function detectInputFormat(variant) {
  if (!variant) {
    throw new Error(
      'Variant not specified. Please provide a variant using --variant or in the configuration file.'
    );
  }
  // Remove any "chr" prefix
  const cleanedVariant = variant.replace(/^chr/i, '');
  const vcfPattern = /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i;
  return vcfPattern.test(cleanedVariant) ? 'VCF' : 'HGVS';
}

// Set up CLI options using yargs.
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
    description:
      'Enable debug mode with levels (1: basic, 2: detailed, 3: all). Use multiple -d to increase level.',
    count: true,
    type: 'number'
  })
  .option('vep_params', {
    alias: 'vp',
    description:
      'Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1,hgvs=1,merged=1,mane=1")',
    type: 'string'
  })
  .option('recoder_params', {
    alias: 'rp',
    description:
      'Optional parameters for Variant Recoder in key=value format, separated by commas (default: "vcf_string=1")',
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
  .option('cache', {
    alias: 'C',
    description: 'Enable caching of API responses',
    type: 'boolean',
    default: false
  })
  .option('semver', {
    alias: 'sv',
    description: 'Show semantic version details and exit',
    type: 'boolean'
  })
  .help()
  .alias('help', 'h')
  .version(packageJson.version)
  .alias('version', 'V')
  .argv;

// If the user passed the --semver flag, output semantic version details and exit.
if (argv.semver) {
  const { getVersionDetails } = require('./version');
  const details = getVersionDetails();
  console.log('Semantic Version Details:');
  console.log(`Version: ${details.version}`);
  console.log(`Major: ${details.major}`);
  console.log(`Minor: ${details.minor}`);
  console.log(`Patch: ${details.patch}`);
  if (details.prerelease.length > 0) {
    console.log(`Prerelease: ${details.prerelease.join('.')}`);
  }
  if (details.build.length > 0) {
    console.log(`Build Metadata: ${details.build.join('.')}`);
  }
  process.exit(0);
}

// Merge CLI and configuration file parameters.
const configParams = readConfigFile(argv.config);
const mergedParams = mergeParams(configParams, argv);

try {
  validateParams(mergedParams);
} catch (error) {
  console.error(`Configuration validation error: ${error.message}`);
  process.exit(1);
}

if (mergedParams.debug) {
  enableDebugging(mergedParams.debug, mergedParams.log_file);
}

/**
 * Main function orchestrating the variant analysis process.
 */
async function main() {
  const processStartTime = new Date();
  const stepsPerformed = [];

  try {
    debug('Starting main variant analysis process');
    const recoderOptions = parseOptionalParameters(mergedParams.recoder_params, {
      vcf_string: '1'
    });
    const vepOptions = parseOptionalParameters(mergedParams.vep_params, {
      CADD: '1',
      hgvs: '1',
      merged: '1',
      mane: '1'
    });
    debugDetailed(
      `Parsed options: recoderOptions=${JSON.stringify(recoderOptions)}, vepOptions=${JSON.stringify(vepOptions)}`
    );

    const inputFormat = detectInputFormat(mergedParams.variant);
    stepsPerformed.push(`Input format detected: ${inputFormat}`);
    debug(`Detected input format: ${inputFormat}`);

    let variantData = null;
    let annotationData;
    let inputInfo = '';

    if (inputFormat === 'VCF') {
      debug('Processing variant as VCF format');
      stepsPerformed.push('Processing VCF input');
      // Convert the VCF string to Ensembl format.
      const { region, allele } = convertVcfToEnsemblFormat(mergedParams.variant);
      stepsPerformed.push(`Converted VCF to Ensembl format (region: ${region}, allele: ${allele})`);
      debugDetailed(`Converted VCF to Ensembl format: region=${region}, allele=${allele}`);
      // Retrieve VEP annotations using the region endpoint.
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions, mergedParams.cache);
      stepsPerformed.push('Retrieved VEP annotations');
      debugDetailed(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
      // Build an "input" string from the converted region.
      // Assuming region format is "chrom:start-end:strand"
      const [chrom, rest] = region.split(':');
      const [start, endAndStrand] = rest.split('-');
      const [end, strand] = endAndStrand.split(':');
      inputInfo = `${chrom} ${start} ${end} ${allele} ${strand}`;
    } else {
      debug('Processing variant as HGVS format');
      stepsPerformed.push('Processing HGVS input');
      // Call Variant Recoder first.
      variantData = await variantRecoder(mergedParams.variant, recoderOptions, mergedParams.cache);
      stepsPerformed.push('Called Variant Recoder');
      debugDetailed(`Variant Recoder data received: ${JSON.stringify(variantData)}`);

      // Assume variantData is an array and use the first object.
      const firstKey = Object.keys(variantData[0])[0];
      const recoderEntry = variantData[0][firstKey];

      if (
        !recoderEntry ||
        !recoderEntry.vcf_string ||
        !Array.isArray(recoderEntry.vcf_string)
      ) {
        throw new Error('Variant Recoder response is missing a valid vcf_string array');
      }

      const vcfString = recoderEntry.vcf_string.find((vcf) =>
        /^[0-9XYM]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcf)
      );
      if (!vcfString) {
        debugAll(`Available VCF strings: ${JSON.stringify(recoderEntry.vcf_string)}`);
        throw new Error('No valid VCF string found in Variant Recoder response');
      }
      stepsPerformed.push('Extracted VCF string from Variant Recoder response');
      // Convert the selected VCF string.
      const { region, allele } = convertVcfToEnsemblFormat(vcfString);
      stepsPerformed.push(`Converted extracted VCF to Ensembl format (region: ${region}, allele: ${allele})`);
      debugDetailed(`Converted VCF to Ensembl format from Recoder: region=${region}, allele=${allele}`);
      // Retrieve VEP annotations.
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions, mergedParams.cache);
      stepsPerformed.push('Retrieved VEP annotations');
      debugDetailed(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
      // Build input info from the vcfString.
      // We assume vcfString is in the form "chrom-pos-ref-alt"
      const vcfParts = vcfString.replace(/^chr/i, '').split('-');
      if (vcfParts.length === 4) {
        const [c, posStr, , ] = vcfParts;
        const pos = parseInt(posStr, 10);
        // For HGVS input, we can simulate input info as "chrom pos pos allele strand"
        const { region: r, allele: a } = convertVcfToEnsemblFormat(vcfString);
        const [c2, rest] = r.split(':');
        const [start, endAndStrand] = rest.split('-');
        const [end, strand] = endAndStrand.split(':');
        inputInfo = `${c2} ${start} ${end} ${a} ${strand}`;
      }
    }

    // If scoring is enabled, apply it.
    if (mergedParams.scoring_config_path) {
      const scoringConfig = readScoringConfig(mergedParams.scoring_config_path);
      annotationData = applyScoring(annotationData, scoringConfig);
      stepsPerformed.push('Applied scoring to annotation data');
      debugDetailed(`Applied scoring to annotation data: ${JSON.stringify(annotationData)}`);
    }

    // Before formatting, ensure each annotation in annotationData has an "input" field.
    if (Array.isArray(annotationData)) {
      annotationData = annotationData.map((ann) => {
        return { input: inputInfo, ...ann };
      });
    } else {
      // In case annotationData is not an array, wrap it in one.
      annotationData = [{ input: inputInfo, ...annotationData }];
    }

    // Prepare meta information.
    const processEndTime = new Date();
    const metaInfo = {
      input: mergedParams.variant,
      inputFormat,
      stepsPerformed,
      startTime: processStartTime.toISOString(),
      endTime: processEndTime.toISOString(),
      durationMs: processEndTime - processStartTime,
      recoderCalled: inputFormat === 'HGVS'
    };

    // Final output now includes both variantData and annotationData.
    const finalOutput = {
      meta: metaInfo,
      variantData, // variantRecoder data; may be null for VCF input.
      annotationData
    };

    // If the output format is set to SCHEMA (case-insensitive), map the output to Schema.org.
    let outputObject = finalOutput;
    if (mergedParams.output.toUpperCase() === 'SCHEMA') {
      const { mapOutputToSchemaOrg, validateSchemaOrgOutput, addCustomFormats } = require('./schemaMapper');
      outputObject = mapOutputToSchemaOrg(finalOutput);
      // Register custom formats (including date-time) so that the validator recognizes them.
      addCustomFormats();
      validateSchemaOrgOutput(outputObject, '../schema/variant_annotation.schema.json');
      debug('Schema.org output validated successfully.');
    }

    // Filter and format the final output (currently only JSON formatting is supported).
    const formattedResults = filterAndFormatResults(outputObject, null, 'JSON');

    outputResults(formattedResults, mergedParams.save);
    debug('Variant analysis process completed successfully');
  } catch (error) {
    debugAll(`Error in main variant analysis process: ${error.message}`);
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
