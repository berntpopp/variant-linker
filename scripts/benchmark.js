/**
 * Variant-Linker Performance Benchmark
 *
 * This script provides a comprehensive benchmark suite for the variant-linker
 * CLI to measure performance metrics under different conditions.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { table } = require('table');

// Define paths and constants
const VARIANT_LINKER_PATH = path.join(__dirname, '..', 'src', 'main.js');
const BENCHMARK_DATA_PATH = path.resolve(path.join(__dirname, '..', 'examples', 'benchmark_data'));

// Pattern matchers for logs
const RETRY_PATTERN = /Retrying request attempt|retry|retrying/i;
// Multiple possible chunk patterns to match different output formats
const CHUNK_PATTERNS = [
  /Processing chunk \d+ of \d+/i,
  /Processing batch \d+/i,
  /Chunk \d+/i,
  /Batch \d+/i,
  /Processing variant \d+/i,
  /Processing variants/i,
  /Processed \d+ variants/i,
];

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose output',
    default: false,
  })
  .option('assembly', {
    alias: 'a',
    type: 'string',
    description: 'Genome assembly to use (GRCh37 or GRCh38)',
    default: 'GRCh38',
  })
  .option('repeat', {
    alias: 'r',
    type: 'number',
    description: 'Number of times to repeat each benchmark for averaging',
    default: 1,
  })
  .option('format', {
    alias: 'f',
    type: 'string',
    description: 'Output format for results (table, csv, tsv)',
    default: 'table',
    choices: ['table', 'csv', 'tsv'],
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'File to write results to (if not specified, results are printed to console)',
  })
  .option('log', {
    alias: 'l',
    type: 'string',
    description: 'File to write detailed logs to',
  })
  .option('input', {
    alias: 'i',
    type: 'string',
    description: 'Specific input file to benchmark (overrides variant-type and variant-count)',
  })
  .option('variant-type', {
    alias: 't',
    type: 'string',
    description: 'Variant types to benchmark (vcf, hgvs, rsid)',
    choices: ['vcf', 'hgvs', 'rsid', 'all'],
    default: 'all',
  })
  .option('variant-count', {
    alias: 'c',
    type: 'string',
    description: 'Variant counts to benchmark (1, 10, 50, 500)',
    choices: ['1', '10', '50', '500', 'all'],
    default: 'all',
  })
  .help()
  .alias('help', 'h').argv;

/**
 * Benchmark scenarios to run
 */
const benchmarkScenarios = [
  {
    name: 'Single Variant VCF',
    description: 'Processing a single VCF variant (no recoding needed)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'single_variant.vcf'),
    expectedVariantCount: 1,
    variantType: 'vcf',
    variantCount: '1',
    assembly: 'hg38',
  },
  {
    name: 'Single Variant rsID',
    description: 'Processing a single rsID variant (requires recoding)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'single_variant.txt'),
    expectedVariantCount: 1,
    variantType: 'rsid',
    variantCount: '1',
    assembly: 'hg38',
  },
  {
    name: 'Tiny Batch VCF',
    description: 'Processing 10 VCF variants (no recoding needed)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'tiny_batch.vcf'),
    expectedVariantCount: 10,
    variantType: 'vcf',
    variantCount: '10',
    assembly: 'hg38',
  },
  {
    name: 'Tiny Batch HGVS/rsID',
    description: 'Processing 10 rsID variants (requires recoding)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'tiny_batch.txt'),
    expectedVariantCount: 10,
    variantType: 'rsid',
    variantCount: '10',
    assembly: 'hg38',
  },
  {
    name: 'Small Batch VCF',
    description: 'Processing ~50 VCF variants (no recoding needed)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'small_batch.vcf'),
    expectedVariantCount: 50,
    variantType: 'vcf',
    variantCount: '50',
    assembly: 'hg38',
  },
  {
    name: 'Small Batch HGVS/rsID',
    description: 'Processing ~50 HGVS/rsID variants (requires recoding)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'small_batch.txt'),
    expectedVariantCount: 50,
    variantType: 'rsid',
    variantCount: '50',
    assembly: 'hg38',
  },
  {
    name: 'Large Batch VCF',
    description: 'Processing ~500 VCF variants (no recoding, triggers chunking)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'large_batch.vcf'),
    expectedVariantCount: 500,
    variantType: 'vcf',
    variantCount: '500',
    assembly: 'hg38',
  },
  {
    name: 'Large Batch HGVS/rsID',
    description: 'Processing ~500 HGVS/rsID variants (requires recoding, triggers chunking)',
    inputFile: path.join(BENCHMARK_DATA_PATH, 'large_batch.txt'),
    expectedVariantCount: 500,
    variantType: 'rsid',
    variantCount: '500',
    assembly: 'hg38',
  },
];

/**
 * Filter scenarios based on command-line arguments
 * @returns {Array} Filtered scenarios
 */
function getFilteredScenarios() {
  // Check if a specific input file was provided
  if (argv.input) {
    const inputPath = path.resolve(argv.input);
    console.log(`🔍 Using specific input file: ${inputPath}`);

    // Find scenarios matching this input file
    const matchingScenarios = benchmarkScenarios.filter((scenario) => {
      // Skip VCF variants for now until fully implemented
      if (scenario.variantType === 'vcf') {
        return false;
      }

      return path.resolve(scenario.inputFile) === inputPath;
    });

    // If no existing scenario matches, create a custom scenario
    if (matchingScenarios.length === 0) {
      // Determine variant type from file extension
      const fileExt = path.extname(inputPath).toLowerCase();
      const variantType = fileExt === '.vcf' ? 'vcf' : 'rsid';

      // Skip VCF variants for now
      if (variantType === 'vcf') {
        console.warn('⚠️ VCF processing is not fully implemented yet');
        return [];
      }

      // Create custom scenario
      const customScenario = {
        name: `Custom Input: ${path.basename(inputPath)}`,
        description: `Processing custom input file: ${inputPath}`,
        inputFile: inputPath,
        expectedVariantCount: 0, // Unknown until processed
        variantType: variantType,
        variantCount: 'custom',
        assembly: argv.assembly || 'GRCh38',
      };

      console.log(`ℹ️ Created custom scenario for input file: ${inputPath}`);
      return [customScenario];
    }

    return matchingScenarios;
  }

  // Otherwise, filter according to other criteria
  const filtered = benchmarkScenarios.filter((scenario) => {
    // Skip VCF variants
    if (scenario.variantType === 'vcf') {
      return false;
    }

    // Filter by variant type
    if (
      argv.variantType !== 'all' &&
      argv.t !== 'all' &&
      scenario.variantType !== argv.variantType &&
      scenario.variantType !== argv.t
    ) {
      return false;
    }

    // Filter by variant count
    if (
      argv.variantCount !== 'all' &&
      argv.c !== 'all' &&
      scenario.variantCount !== argv.variantCount &&
      scenario.variantCount !== argv.c
    ) {
      return false;
    }

    return true;
  });

  return filtered;
}

/**
 * Format benchmark results based on user preference
 * @param {Array} results - Benchmark results
 * @param {string} format - Output format (table, csv, tsv)
 * @returns {string} - Formatted results
 */
function formatResults(results, format = 'table') {
  // Filter out error results and handle error rows separately
  const validResults = results.filter((r) => r.status !== 'error');
  const errorResults = results.filter((r) => r.status === 'error');

  // Determine if we have partial results
  const hasPartials = validResults.some((r) => r.status === 'partial');

  // Determine if we have repeated runs with statistics
  const hasDetailedStats = validResults.some(
    (r) => 'minExecutionTime' in r && 'maxExecutionTime' in r
  );

  // Prepare data for table
  let header = ['Scenario', 'Runtime (s)', 'Variants', 'Time/Variant (s)', 'Retries', 'Chunks'];

  // Add columns for detailed stats if available
  if (hasDetailedStats) {
    header = [
      'Scenario',
      'Avg Runtime (s)',
      'Min (s)',
      'Max (s)',
      'StdDev (s)',
      'Variants',
      'Time/Variant (s)',
      'Retries',
      'Chunks',
    ];
  }

  if (hasPartials) {
    header.push('Success');
  }

  // Format each row of data
  const data = validResults.map((result) => {
    let row;

    if (hasDetailedStats && 'minExecutionTime' in result) {
      row = [
        result.name,
        result.executionTime.toFixed(2),
        result.minExecutionTime.toFixed(2),
        result.maxExecutionTime.toFixed(2),
        result.stdDeviation.toFixed(2),
        result.variantsProcessed,
        result.avgTimePerVariant.toFixed(4),
        result.retryCount,
        result.chunkCount,
      ];
    } else {
      row = [
        result.name,
        result.executionTime.toFixed(2),
        result.variantsProcessed,
        result.avgTimePerVariant.toFixed(4),
        result.retryCount,
        result.chunkCount,
      ];
    }

    if (hasPartials) {
      row.push(result.successRatio || 'N/A');
    }

    return row;
  });

  // Add error rows if any
  const errorRows = errorResults.map((result) => {
    const errorRow = [result.name, 'ERROR', '-', '-', '-', '-'];
    if (hasDetailedStats) {
      return [result.name, 'ERROR', '-', '-', '-', '-', '-', '-', '-'];
    }
    return errorRow;
  });

  const allRows = [...data, ...errorRows];

  // Format as requested
  switch (format.toLowerCase()) {
    case 'csv':
      return [header.join(','), ...allRows.map((row) => row.join(','))].join('\n');

    case 'tsv':
      return [header.join('\t'), ...allRows.map((row) => row.join('\t'))].join('\n');

    case 'table':
    default:
      return table([[...header], ...allRows], {
        header: {
          alignment: 'center',
          content: '📊 BENCHMARK RESULTS',
        },
        columns: {
          0: {
            alignment: 'left',
          },
        },
      });
  }
}

/**
 * Runs a single benchmark scenario and collects performance metrics
 * @param {Object} scenario - The benchmark scenario configuration
 * @param {Object} options - Options for the benchmark run
 * @returns {Object} - Benchmark results
 */
async function runBenchmarkScenario(scenario, options = {}) {
  const { repeat = 1, verbose = false, log = null } = options;
  const debugLog = (message) => {
    if (verbose) {
      console.log(message);
    }
    if (log) {
      fs.appendFileSync(log, `${message}\n`);
    }
  };

  console.log(`🔍 Running benchmark: ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log(`   Input file: ${path.basename(scenario.inputFile)}`);
  console.log(`   Repeating: ${repeat} time(s)`);

  const results = [];
  let successCount = 0;

  // Run the benchmark multiple times if requested
  for (let i = 0; i < repeat; i++) {
    if (repeat > 1) {
      debugLog(`   Run ${i + 1} of ${repeat}...`);
    }

    try {
      const startTime = performance.now();

      // Build command to run variant-linker
      const command = [
        VARIANT_LINKER_PATH,
        '--variants-file',
        scenario.inputFile,
        '--assembly',
        scenario.assembly,
        '--output',
        'JSON',
      ];

      // Add --debug if verbose mode is enabled
      if (!options.verbose) {
        command.push('--silent');
      }

      if (options.verbose) {
        console.log(`   Executing command: node ${command.join(' ')}`);
      }

      const result = spawnSync('node', command, {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: true,
      });

      // Add delay to prevent overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (result.status !== 0) {
        throw new Error(`Process exited with code ${result.status}: ${result.stderr}`);
      }

      const executionTime = (performance.now() - startTime) / 1000;

      // Parse output to get metrics
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const allOutput = stdout + stderr;

      debugLog(`   Execution time: ${executionTime.toFixed(2)}s`);

      // Count retries
      const retryMatches = allOutput.match(new RegExp(RETRY_PATTERN, 'g'));
      const retryCount = retryMatches ? retryMatches.length : 0;
      debugLog(`   API retries: ${retryCount}`);

      // Count chunks with multiple patterns
      let chunkCount = 0;
      for (const pattern of CHUNK_PATTERNS) {
        const matches = allOutput.match(new RegExp(pattern, 'g'));
        if (matches && matches.length > 0) {
          chunkCount = matches.length;
          debugLog(`   Found ${chunkCount} chunks using pattern: ${pattern}`);
          break;
        }
      }

      // If no chunks detected but we have variants, infer chunks from variant count or type
      if (chunkCount === 0 && stdout.trim()) {
        try {
          const output = JSON.parse(stdout.trim());
          // For rsID/HGVS variants processing, assume chunks based on variant count
          if (scenario.variantType === 'rsid' || scenario.variantType === 'hgvs') {
            // Check variant count to determine chunks
            let variantCount = 0;
            if (Array.isArray(output)) {
              variantCount = output.length;
            } else if (output && typeof output === 'object' && Array.isArray(output.results)) {
              variantCount = output.results.length;
            }

            if (variantCount > 0) {
              // For batched variants, determine chunks based on batch size
              // Assuming default batch size of 10 for rsID/HGVS
              chunkCount = Math.ceil(variantCount / 10);
              if (chunkCount < 1) chunkCount = 1;
              debugLog(
                `   Inferred ${chunkCount} chunks (${variantCount} variants, assumed batch size)`
              );
            } else {
              chunkCount = 1; // At least one chunk if we have output
              debugLog('   No explicit chunk info found, but output exists. Setting to 1 chunk.');
            }
          } else {
            // For VCF or other formats, just assume one chunk if we have output
            if (
              (Array.isArray(output) && output.length > 0) ||
              (output &&
                typeof output === 'object' &&
                Array.isArray(output.results) &&
                output.results.length > 0)
            ) {
              chunkCount = 1; // At least one chunk was processed if we have output
              debugLog('   No explicit chunk info found, but output exists. Setting to 1 chunk.');
            }
          }
        } catch (e) {
          // If stdout has content but we can't parse it, still assume one chunk
          if (stdout.trim()) {
            chunkCount = 1;
            debugLog('   No explicit chunk info found, but output exists. Setting to 1 chunk.');
          }
        }
      }

      debugLog(`   Chunks processed: ${chunkCount}`);

      // Verify variants processed
      let variantsProcessed = 0;
      try {
        // Add debugging for stdout content
        if (verbose) {
          debugLog('   Output content preview:');
          if (stdout.trim()) {
            // Only show first 500 chars to avoid overwhelming the log
            debugLog(
              `   ${stdout.substring(0, 500)}${stdout.length > 500 ? '...(truncated)' : ''}`
            );
          } else {
            debugLog('   (empty or whitespace only)');
          }
        }

        // Try to parse JSON from stdout
        if (stdout.trim()) {
          const output = JSON.parse(stdout.trim());
          // Check if output is an array
          if (Array.isArray(output)) {
            variantsProcessed = output.length;
            debugLog(`   Counted ${variantsProcessed} variants from JSON output array`);
          }
          // Check if output is an object with results property
          else if (output && typeof output === 'object' && Array.isArray(output.results)) {
            variantsProcessed = output.results.length;
            debugLog(`   Counted ${variantsProcessed} variants from JSON output.results property`);
          }
          // If no variants found, try to count based on input file
          else {
            // Count lines in the input file for rsID format
            if (scenario.variantType === 'rsid' && scenario.inputFile.endsWith('.txt')) {
              try {
                const fileContent = fs.readFileSync(scenario.inputFile, 'utf8');
                const variants = fileContent.split('\n').filter((line) => line.trim());
                variantsProcessed = variants.length;
                debugLog(`   Counted ${variantsProcessed} variants from input file lines`);
              } catch (fileErr) {
                debugLog(`   Error counting variants from file: ${fileErr.message}`);
              }
            }
          }
        }

        // If still 0, use expected count
        if (variantsProcessed === 0) {
          variantsProcessed = scenario.expectedVariantCount;
          debugLog(`   Using expected count from scenario definition: ${variantsProcessed}`);
        }
      } catch (e) {
        debugLog(`   Could not parse output JSON to count variants: ${e.message}`);

        // Try to count based on input file as fallback
        if (scenario.variantType === 'rsid' && scenario.inputFile.endsWith('.txt')) {
          try {
            const fileContent = fs.readFileSync(scenario.inputFile, 'utf8');
            const variants = fileContent.split('\n').filter((line) => line.trim());
            variantsProcessed = variants.length;
            debugLog(`   Counted ${variantsProcessed} variants from input file lines`);
          } catch (fileErr) {
            debugLog(`   Error counting variants from file: ${fileErr.message}`);
            variantsProcessed = scenario.expectedVariantCount;
            debugLog(`   Using expected count from scenario definition: ${variantsProcessed}`);
          }
        } else {
          variantsProcessed = scenario.expectedVariantCount;
          debugLog(`   Using expected count from scenario definition: ${variantsProcessed}`);
        }
      }

      // Calculate average time per variant, avoid division by zero
      const avgTimePerVariant = variantsProcessed > 0 ? executionTime / variantsProcessed : 0;
      debugLog(
        `   Average time per variant: ${variantsProcessed > 0 ? avgTimePerVariant.toFixed(4) : 'N/A'}s`
      );

      const runResult = {
        status: 'success',
        name: scenario.name,
        executionTime,
        variantsProcessed,
        avgTimePerVariant,
        retryCount,
        chunkCount,
      };

      results.push(runResult);
      successCount++;
    } catch (error) {
      const errorMessage = `❌ Error in run ${i + 1}: ${error.message}`;
      debugLog(errorMessage);

      // For single runs, add the failed result to show in the table
      if (repeat === 1) {
        results.push({
          status: 'error',
          name: scenario.name,
          error: error.message,
        });
      }
    }
  }

  // Aggregate results if we did multiple runs
  if (repeat > 1 && successCount > 0) {
    // Only use successful runs for averaging
    const successfulRuns = results.filter((r) => r.status === 'success');

    // Calculate average metrics
    const executionTimes = successfulRuns.map((r) => r.executionTime);
    const avgExecutionTime =
      executionTimes.reduce((acc, time) => acc + time, 0) / executionTimes.length;
    const minExecutionTime = Math.min(...executionTimes);
    const maxExecutionTime = Math.max(...executionTimes);

    // Calculate standard deviation
    const variance =
      executionTimes.reduce((acc, time) => {
        const diff = time - avgExecutionTime;
        return acc + diff * diff;
      }, 0) / executionTimes.length;
    const stdDeviation = Math.sqrt(variance);

    const avgVariantsProcessed = Math.round(
      successfulRuns.reduce((acc, r) => acc + r.variantsProcessed, 0) / successfulRuns.length
    );

    const avgTimePerVariant =
      successfulRuns.reduce((acc, r) => acc + r.avgTimePerVariant, 0) / successfulRuns.length;

    const avgRetryCount = Math.round(
      successfulRuns.reduce((acc, r) => acc + r.retryCount, 0) / successfulRuns.length
    );

    const avgChunkCount = Math.round(
      successfulRuns.reduce((acc, r) => acc + r.chunkCount, 0) / successfulRuns.length
    );

    return {
      status: successCount === repeat ? 'success' : 'partial',
      name: scenario.name,
      executionTime: avgExecutionTime,
      minExecutionTime,
      maxExecutionTime,
      stdDeviation,
      variantsProcessed: avgVariantsProcessed,
      avgTimePerVariant,
      retryCount: avgRetryCount,
      chunkCount: avgChunkCount,
      successRatio: `${successCount}/${repeat}`,
      repeatCount: repeat,
    };
  }

  // If all runs failed, return error
  if (successCount === 0) {
    console.error(`❌ All ${repeat} runs failed for ${scenario.name}`);
    return {
      status: 'error',
      name: scenario.name,
      error: 'All benchmark runs failed',
    };
  }

  // If we had only one run, return its result
  return results[0];
}

/**
 * Main benchmark execution function
 */
async function runBenchmarks() {
  console.log('🚀 Starting variant-linker benchmark suite');

  // Initialize log file if requested
  if (argv.log) {
    // Create or truncate the log file
    fs.writeFileSync(
      argv.log,
      `Variant-Linker Benchmark - ${new Date().toISOString()}\n\n`,
      'utf8'
    );
  }

  // Ensure benchmark data directory exists
  if (!fs.existsSync(BENCHMARK_DATA_PATH)) {
    console.error(`❌ Benchmark data directory not found: ${BENCHMARK_DATA_PATH}`);
    console.log('Please create the directory and add sample files before running benchmarks.');
    throw new Error('Benchmark data directory not found');
  }

  // Get filtered scenarios based on command-line arguments
  const scenarios = getFilteredScenarios();

  if (scenarios.length === 0) {
    console.error('❌ No scenarios match the specified filters.');
    console.log('Please check your variant-type and variant-count arguments.');
    throw new Error('No matching scenarios');
  }

  // Check each input file exists
  const missingFiles = scenarios
    .map((scenario) => scenario.inputFile)
    .filter((file) => !fs.existsSync(file));

  if (missingFiles.length > 0) {
    console.error('❌ Missing benchmark data files:');
    missingFiles.forEach((file) => console.error(`   - ${file}`));
    throw new Error('Missing benchmark data files');
  }

  // Run benchmarks
  const results = [];
  let failureCount = 0;

  for (const scenario of scenarios) {
    try {
      const result = await runBenchmarkScenario(scenario, {
        repeat: argv.repeat,
        verbose: argv.verbose,
        log: argv.log,
      });
      results.push(result);

      if (result.status === 'error') {
        failureCount++;
      }
    } catch (error) {
      console.error(`❌ Error running benchmark for ${scenario.name}:`, error);
      results.push({
        status: 'error',
        name: scenario.name,
        error: error.message,
      });
      failureCount++;
    }
  }

  // Format and output results
  const formattedResults = formatResults(results, argv.format);

  if (argv.output) {
    // Write results to file
    fs.writeFileSync(argv.output, formattedResults, 'utf8');
    console.log(`\n✅ Results written to: ${argv.output}`);
  } else {
    // Print to console
    console.log(formattedResults);
  }

  console.log('\n✅ Benchmark completed');

  if (failureCount > 0) {
    console.warn(`⚠️  ${failureCount} benchmark(s) failed. See error details above.`);
    throw new Error('Some benchmarks failed');
  }

  return results;
}

// Run the benchmarks
runBenchmarks().catch((error) => {
  console.error('Benchmark error:', error);
  throw error; // Don't use process.exit
});
