#!/usr/bin/env node
// src/main.js

const yargs = require('yargs');
const debug = require('debug')('variant-linker:main');
const variantRecoder = require('./variantRecoder');
const vepAnnotation = require('./vepAnnotation');
const {
  processVariantLinking,
  filterAndFormatResults,
  outputResults
} = require('./variantLinkerProcessor');

/**
 * Sets up the command-line arguments for the Variant-Linker tool.
 */
const argv = yargs
  .option('variant', {
    alias: 'v',
    description: 'The variant to be analyzed',
    type: 'string',
    demandOption: true
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
    type: 'boolean',
    description: 'Enable debug mode',
    default: false
  })
  .option('vep_params', {
    alias: 'vp',
    description: 'Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1")',
    type: 'string'
  })
  .help()
  .alias('help', 'h')
  .argv;

if (argv.debug) {
  debug.enabled = true;
  require('debug').enable('variant-linker:*');
}

/**
 * Parses optional parameters from command line.
 * 
 * @returns {Object} The parsed optional parameters.
 */
function parseOptionalParameters() {
  let options = { CADD: '1' }; // Default value

  if (argv.vep_params) {
    const paramsArray = argv.vep_params.split(',');
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
 * The main function that orchestrates the variant analysis process.
 * It links the variant recoding and VEP annotation, applies optional filtering,
 * formats the results, and handles the output.
 */
async function main() {
  try {
    const options = parseOptionalParameters();
    const { variantData, annotationData } = await processVariantLinking(argv.variant, variantRecoder, vepAnnotation, options);
    
    // Define a filter function as needed
    const filterFunction = null; // Example: (results) => { /* filtering logic */ }

    const formattedResults = filterAndFormatResults({ variantData, annotationData }, filterFunction, argv.output);
    outputResults(formattedResults, argv.save);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
