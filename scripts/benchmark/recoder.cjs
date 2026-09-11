'use strict';

const fs = require('node:fs');
const yargs = require('yargs/yargs');
const recode = require('../../src/variantRecoderPost');
const { alignResponses } = require('../../src/core/responseMatching');
const apiConfig = require('../../config/apiConfig.json');
const benchmarkConfig = require('../../config/benchmarkConfig.json');

// Deliberately stops after recoding: no VEP annotation, scoring or serialization
// of an annotation pipeline is included in this stage's measurements.
function parseOptions(args) {
  return yargs(args)
    .option('variants-file', { type: 'string' })
    .option('assembly', {
      type: 'string',
      choices: ['GRCh37', 'GRCh38', 'hg19', 'hg38'],
      default: benchmarkConfig.assembly,
    })
    .option('output', { type: 'string', choices: ['JSON'], default: 'JSON' })
    .option('semver', { type: 'boolean' })
    .option('api-concurrency', {
      type: 'number',
      choices: Array.from(
        { length: apiConfig.requests.maxPostConcurrency },
        (_value, index) => index + 1
      ),
      default: apiConfig.requests.postConcurrency,
    })
    .option('api-timeout', { type: 'number', default: apiConfig.requests.timeoutMs })
    .strict()
    .parse();
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.semver) {
    console.log(require('../../package.json').version);
    return;
  }
  if (!options.variantsFile) throw new Error('--variants-file is required');
  const live = process.env.VL_BENCHMARK_LIVE === '1';
  const fixtures = process.env.VL_TEST_FIXTURES === '1';
  const replay = Boolean(process.env.VL_BENCHMARK_REPLAY);
  if (Number(live) + Number(fixtures) + Number(replay) !== 1)
    throw new Error('Use scripts/benchmark.js to select an explicit benchmark transport');
  if (fixtures) {
    process.env.VL_BENCHMARK_INPUT = options.variantsFile;
    require('../../test/support/benchmark-preload.cjs');
  } else if (replay) {
    require('./replay.cjs');
  }
  const inputs = fs
    .readFileSync(options.variantsFile, 'utf8')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!inputs.length) throw new Error('Recoder benchmark input is empty');
  const unique = [...new Set(inputs)];
  const response = await recode(unique, { vcf_string: '1' }, false, null, {
    assembly: options.assembly,
    postConcurrency: options.apiConcurrency,
    timeoutMs: options.apiTimeout,
  });
  const annotationData = alignResponses(response, unique, true);
  const failures = annotationData.filter((entry) => entry.error).length;
  console.log(
    JSON.stringify({
      annotationData,
      meta: { submitted: inputs.length, unique: unique.length, failedVariants: failures },
    })
  );
  if (failures) process.exitCode = 1;
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main, parseOptions };
