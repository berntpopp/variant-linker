#!/usr/bin/env node
// src/main.js

const yargs = require('yargs');
const debug = require('debug')('variant-linker:main');
const variantRecoder = require('./variantRecoder');
const vepRegionsAnnotation = require('./vepRegionsAnnotation');
const convertVcfToEnsemblFormat = require('./convertVcfToEnsemblFormat');
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
    description: 'Optional parameters for VEP annotation in key=value format, separated by commas (default: "CADD=1,hgvs=1,merged=1")',
    type: 'string'
  })
  .option('recoder_params', {
    alias: 'rp',
    description: 'Optional parameters for Variant Recoder in key=value format, separated by commas (default: "vcf_string=1")',
    type: 'string'
  })
  .help()
  .alias('help', 'h')
  .argv;

if (argv.debug) {
  debug.enabled = true;
  require('debug').enable('variant-linker:*');
  debug('Debug mode enabled');
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
    const recoderOptions = parseOptionalParameters(argv.recoder_params, { vcf_string: '1' });
    const vepOptions = parseOptionalParameters(argv.vep_params, { CADD: '1', hgvs: '1', merged: '1', mane: '1' });
    debug(`Parsed options: recoderOptions = ${JSON.stringify(recoderOptions)}, vepOptions = ${JSON.stringify(vepOptions)}`);
    const inputFormat = detectInputFormat(argv.variant);
    debug(`Detected input format: ${inputFormat}`);
    let variantData, annotationData;

    if (inputFormat === 'VCF') {
      const { region, allele } = convertVcfToEnsemblFormat(argv.variant);
      debug(`Converted VCF to Ensembl format: region = ${region}, allele = ${allele}`);
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions);
      debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
    } else {
      variantData = await variantRecoder(argv.variant, recoderOptions);
      debug(`Variant Recoder data received: ${JSON.stringify(variantData)}`);
      const firstVariant = variantData[0]; // Assuming the first object in the array
      const vcfString = firstVariant[Object.keys(firstVariant)[0]].vcf_string.find(vcf => /^chr?[0-9]+-[0-9]+-[ACGT]+-[ACGT]+$/i.test(vcf));
      if (!vcfString) {
        throw new Error('No valid VCF string found in Variant Recoder response');
      }
      const { region, allele } = convertVcfToEnsemblFormat(vcfString);
      debug(`Converted VCF to Ensembl format from Recoder: region = ${region}, allele = ${allele}`);
      annotationData = await vepRegionsAnnotation(region, allele, vepOptions);
      debug(`VEP annotation data received: ${JSON.stringify(annotationData)}`);
    }
    
    // Define a filter function as needed
    const filterFunction = null; // Example: (results) => { /* filtering logic */ }

    const formattedResults = filterAndFormatResults({ variantData, annotationData }, filterFunction, argv.output);
    debug(`Formatted results: ${JSON.stringify(formattedResults)}`);
    outputResults(formattedResults, argv.save);
    debug('Variant analysis process completed successfully');
  } catch (error) {
    debug(`Error in main variant analysis process: ${error.message}`);
    console.error('Error:', error.message);
  }
}

main();

/**
 * Future Enhancements:
 * - Support ambiguous input like protein level data ("p.") in future updates.
 */
