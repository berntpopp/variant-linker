'use strict';
const yargs = require('yargs');
const packageJson = require('../../package.json');
/** @param {string[]} rawArgs @returns {import('../analysisTypes').CliParams} */
function parseArguments(rawArgs) {
  return /** @type {import('../analysisTypes').CliParams} */ (
    yargs(rawArgs) // Use process.argv.slice(2) for better compatibility
      .option('config', { alias: 'c', description: 'Path to configuration file', type: 'string' })
      .option('api-base-url', { description: 'Explicit Ensembl REST mirror URL', type: 'string' })
      .option('api-timeout', {
        description: 'Timeout per HTTP attempt in milliseconds',
        type: 'number',
      })
      .option('api-concurrency', {
        description: 'Maximum concurrent POST batches (1 or 2)',
        type: 'number',
        choices: [1, 2],
      })
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
      })
      .option('bed-file', {
        description:
          'Path to a BED file containing regions of interest. Can be used multiple times.',
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
        description:
          'Path to a JSON file containing gene information. Requires --json-gene-mapping.',
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
      })
      .option('stream', {
        description: 'Process VCF records in bounded chunks; inheritance requires full-file mode',
        type: 'boolean',
      })
      .option('spreadsheet-safe', {
        description: 'Escape spreadsheet formulas in CSV/TSV text cells',
        type: 'boolean',
      })
      .parserConfiguration({
        'camel-case-expansion': true,
        'strip-aliased': true,
        'strip-dashed': true,
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
      .parseSync()
  ); // Use parse() instead of accessing .argv directly
}
module.exports = { parseArguments };
