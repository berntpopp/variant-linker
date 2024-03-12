#!/usr/bin/env node

const yargs = require('yargs');
const debug = require('debug')('variant-linker:main');
const variantRecoder = require('./variantRecoder');
const vepAnnotation = require('./vepAnnotation');

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
  .option('debug', {
    alias: 'd',
    type: 'boolean',
    description: 'Enable debug mode',
    default: false
  })
  .help()
  .alias('help', 'h')
  .argv;

if (argv.debug) {
  debug.enabled = true;
  require('debug').enable('variant-linker:*');
}

async function main() {
    try {
      const variantData = await variantRecoder(argv.variant);
      if (!variantData || variantData.length === 0) {
        throw new Error('No data returned from Variant Recoder');
      }
  
      // Example: Select the first HGVS notation and possibly a transcript
      const selectedHgvs = variantData[0].T.hgvsc[0]; // Simplified selection for this example
      const selectedTranscript = selectedHgvs.split(':')[0];
  
      const annotationData = await vepAnnotation(selectedHgvs, selectedTranscript);
      if (!annotationData || annotationData.length === 0) {
        throw new Error('No annotation data returned from VEP');
      }
  
      // Output formatting (for now, only JSON is supported)
      if (argv.output.toUpperCase() === 'JSON') {
        console.log(JSON.stringify(annotationData, null, 2));
      } else {
        // Additional output formats can be added here
        console.log('Currently only JSON format is supported for output.');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

main();
