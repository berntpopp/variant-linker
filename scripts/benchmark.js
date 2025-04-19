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
const RETRY_PATTERN = /Retry attempt \d+\/\d+ for retryable error/gi;
const RETRY_EXHAUSTED_PATTERN = /Exhausted all \d+ retries for URL/gi;

// Chunk patterns for processing batches
const CHUNK_PATTERN = /Processing chunk \d+ with \d+ variants/gi;
const CHUNKING_STARTED_PATTERN = /Chunking (\d+) variants into batches/i;

// Default chunk size from config
const DEFAULT_CHUNK_SIZE = 200; // This matches the default in the config

// Max length for truncated output
const MAX_LOG_PREVIEW_LENGTH = 1000;
const MAX_DETAILED_LOG_LENGTH = 200; // Maximum length for detailed API responses

/**
 * Helper function to truncate long strings for console output
 * @param {string} str - The string to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - Truncated string with indicator if truncated
 */
function truncateLog(str, maxLength = MAX_LOG_PREVIEW_LENGTH) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}... (truncated ${str.length - maxLength} characters)`;
}

/**
 * Helper function to truncate API response data and other verbose logs
 * Keeps a shorter max length to make logs easier to analyze
 * @param {string} str - The string to truncate
 * @returns {string} - Truncated string with indicator if truncated
 */
function truncateDetailedLog(str) {
  if (!str) return '';
  if (str.length <= MAX_DETAILED_LOG_LENGTH) return str;
  // For JSON objects, try to shorten while keeping structure
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      return `${str.substring(0, MAX_DETAILED_LOG_LENGTH)}... (truncated JSON, ${str.length} chars)`;
    } catch (e) {
      // Fall back to simple truncation if JSON parsing fails
      const truncatedChars = str.length - MAX_DETAILED_LOG_LENGTH;
      return `${str.substring(0, MAX_DETAILED_LOG_LENGTH)}... (truncated ${truncatedChars} chars)`;
    }
  }
  const truncatedChars = str.length - MAX_DETAILED_LOG_LENGTH;
  return `${str.substring(0, MAX_DETAILED_LOG_LENGTH)}... (truncated ${truncatedChars} chars)`;
}

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
    const matchingScenarios = benchmarkScenarios.filter(
      (scenario) => path.resolve(scenario.inputFile) === inputPath
    );

    // If no existing scenario matches, create a custom scenario
    if (matchingScenarios.length === 0) {
      // Determine variant type from file extension
      const fileExt = path.extname(inputPath).toLowerCase();
      const variantType = fileExt === '.vcf' ? 'vcf' : 'rsid';
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
  let scenariosToRun = benchmarkScenarios;

  // Filter by variant count if specified
  if (argv.variantCount !== 'all' && argv.c !== 'all') {
    scenariosToRun = scenariosToRun.filter(
      (scenario) => scenario.variantCount === argv.variantCount || scenario.variantCount === argv.c
    );
  }

  // Filter by variant type if specified
  if (argv.variantType !== 'all' && argv.t !== 'all') {
    scenariosToRun = scenariosToRun.filter(
      (scenario) => scenario.variantType === argv.variantType || scenario.variantType === argv.t
    );
  }

  // Warn about potential memory issues with large batches
  const hasLargeBatches = scenariosToRun.some((s) => s.variantCount === '500');
  if (hasLargeBatches) {
    console.log('\n⚠️  Warning: Running large batch scenarios may require significant memory.');
    console.log('   If you encounter "null status" errors, try:');
    console.log('   1. Reducing the number of variants');
    console.log('   2. Increasing Node.js memory with NODE_OPTIONS="--max-old-space-size=8192"');
  }

  return scenariosToRun;
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

// This function declaration was moved to the top of the file

/**
 * Runs a single benchmark scenario and collects performance metrics
 * @param {Object} scenario - The benchmark scenario configuration
 * @param {Object} options - Options for the benchmark run
 * @returns {Object} - Benchmark results
 */
async function runBenchmarkScenario(scenario, options = {}) {
  const { repeat = 1, verbose = false, log: logFile = null } = options;

  const debugLog = (message) => {
    if (verbose) {
      console.log(message);
    }
    if (logFile) {
      // Check if this might be a detailed API response or JSON data line
      let logMessage = message;

      // Case 1: Check for API response pattern with a prefix
      const responsePatterns = [
        /Response data:\s*(.+)$/,
        /Chunk request body:\s*(.+)$/,
        /API response:\s*(.+)$/,
        /Request body:\s*(.+)$/,
        /Constructed API URL:\s*(.+)$/,
      ];

      // Try each pattern
      for (const pattern of responsePatterns) {
        const match = message.match(pattern);
        if (match && match[1] && match[1].length > MAX_DETAILED_LOG_LENGTH) {
          // Found a match with the pattern, truncate the data portion
          const prefix = message.substring(0, message.indexOf(match[1]));
          logMessage = prefix + truncateDetailedLog(match[1]);
          break;
        }
      }

      // Case 2: Check for JSON content without a clear prefix
      if (
        logMessage === message &&
        (message.includes('{') || message.includes('[')) &&
        message.length > MAX_DETAILED_LOG_LENGTH
      ) {
        // Look for the first { or [ character
        const jsonStartIndex = Math.min(
          message.indexOf('{') >= 0 ? message.indexOf('{') : Infinity,
          message.indexOf('[') >= 0 ? message.indexOf('[') : Infinity
        );

        if (jsonStartIndex < Infinity && jsonStartIndex >= 0) {
          const prefix = message.substring(0, jsonStartIndex);
          const jsonContent = message.substring(jsonStartIndex);
          logMessage = prefix + truncateDetailedLog(jsonContent);
        }
      }

      fs.appendFileSync(logFile, logMessage + '\n', 'utf8');
    }
  };

  console.log(`\n🔬 Running benchmark: ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log(`   Input: ${scenario.inputFile}`);
  console.log(`   Assembly: ${scenario.assembly}`);
  console.log(`   Repeating ${repeat} time(s)...`);

  const results = [];

  for (let i = 0; i < repeat; i++) {
    if (repeat > 1) {
      console.log(`   Run ${i + 1}/${repeat}...`);
    }

    // Initialize all variables at the top of the loop scope
    // to avoid ReferenceError issues in any code path
    let stdout = '';
    let stderr = '';
    let variantsProcessed = 0;
    let retryCount = 0;
    let chunkCount = 0;
    let avgTimePerVariant = 0;
    let result;

    try {
      const startTime = performance.now();

      // Construct command based on variant type
      const command = [
        VARIANT_LINKER_PATH,
        scenario.variantType === 'vcf' ? '--vcf-input' : '--variants-file',
        scenario.inputFile,
        '--assembly',
        scenario.assembly,
        '--format',
        'json',
      ];

      if (options.silent) {
        command.push('--silent');
      }

      if (options.verbose) {
        console.log(`   Executing command: node ${command.join(' ')}`);
        debugLog(`   Command: node ${command.join(' ')}`);
      }

      // Run the command with debug logging enabled and increased memory allocation
      result = spawnSync('node', ['--max-old-space-size=4096', ...command], {
        env: { ...process.env, DEBUG: 'variant-linker:detailed,variant-linker:all' },
        encoding: 'utf8',
        stdio: 'pipe',
        // Add timeout to prevent hanging
        timeout: 120000, // 2 minute timeout
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for stdout/stderr (increased from default 1MB)
      });

      // Assign stdout/stderr values as soon as we have them
      stdout = result.stdout || '';
      stderr = result.stderr || '';

      // Add delay to prevent overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const endTime = performance.now();
      const executionTime = (endTime - startTime) / 1000; // Convert to seconds

      // If log file is specified, write full stdout/stderr to dedicated run log file
      if (logFile) {
        // Sanitize filename by replacing spaces, slashes, colons, and other invalid chars
        const runLogFile = `${logFile}.${scenario.name.replace(/[\s\/:*?"<>|]+/g, '_')}.run${i + 1}.log`;
        // Process stdout/stderr to truncate large API responses
        const processedStdout = stdout.replace(/([\[{].{1,})$/gm, (match) =>
          truncateDetailedLog(match)
        );
        const processedStderr = stderr.replace(
          /(Response data:|Chunk request body:|API response:)(.+)$/gm,
          (match, prefix, data) => `${prefix} ${truncateDetailedLog(data)}`
        );

        const fullOutput = [
          `=== COMMAND ===\n${command.join(' ')}\n`,
          `=== STDOUT ===\n${processedStdout}\n`,
          `=== STDERR ===\n${processedStderr}\n`,
          `=== EXIT CODE: ${result.status} ===\n`,
          `=== EXECUTION TIME: ${executionTime.toFixed(2)}s ===\n`,
        ].join('\n');
        fs.writeFileSync(runLogFile, fullOutput, 'utf8');
        debugLog(`   💾 Full command output saved to: ${runLogFile}`);
      }

      // Check if the command succeeded
      if (result.status !== 0) {
        const errorMessage = result.stderr || result.error?.message || 'Unknown error';
        const statusMsg =
          result.status === null ? 'null (likely memory issue or timeout)' : result.status;

        debugLog(`   ❌ Command failed with status ${statusMsg}`);
        debugLog(`   Error: ${truncateLog(errorMessage)}`);

        // Add specific guidance for memory errors
        if (result.status === null) {
          debugLog(`   💡 This may indicate an out-of-memory issue or timeout.`);
          debugLog(
            `      Try running with fewer variants or increasing Node.js memory limit further.`
          );
        } else if (result.signal) {
          debugLog(`   💡 Process terminated with signal: ${result.signal}`);
        }

        throw new Error(`Command failed: ${errorMessage}`);
      }

      if (verbose) {
        debugLog(`   --- STDOUT PREVIEW ---`);
        debugLog(`   ${truncateLog(stdout)}`);
        debugLog(`   --- STDERR PREVIEW ---`);
        debugLog(`   ${truncateLog(stderr)}`);
      }
      debugLog(`   Execution time: ${executionTime.toFixed(2)}s`);

      // Count retries from debug output
      const retryAttempts = (stderr.match(RETRY_PATTERN) || []).length;
      const retriesExhausted = (stderr.match(RETRY_EXHAUSTED_PATTERN) || []).length;
      retryCount = retryAttempts + retriesExhausted;

      // Count chunks with fallback logic
      chunkCount = (stderr.match(CHUNK_PATTERN) || []).length;

      // If no specific chunk messages, try to estimate from chunking started message
      if (chunkCount === 0) {
        const chunkingMatch = stderr.match(CHUNKING_STARTED_PATTERN);
        if (chunkingMatch) {
          const totalVariants = parseInt(chunkingMatch[1], 10);
          if (!isNaN(totalVariants) && totalVariants > DEFAULT_CHUNK_SIZE) {
            chunkCount = Math.ceil(totalVariants / DEFAULT_CHUNK_SIZE);
          }
        }
      }

      // Parse output to get variant count
      try {
        const output = JSON.parse(stdout);
        variantsProcessed = output?.annotationData?.length || 0;
      } catch (error) {
        debugLog(`Failed to parse output JSON: ${error.message}`);
        // If JSON parsing failed but process succeeded, use expected count
        if (result.status === 0 && scenario.expectedVariantCount) {
          variantsProcessed = scenario.expectedVariantCount;
          debugLog(`Using expected variant count: ${variantsProcessed}`);
        }
      }

      // If still no chunks but we processed variants, assume 1 chunk
      if (chunkCount === 0 && variantsProcessed > 0) {
        chunkCount = 1;
      }

      debugLog(`   API retries: ${retryCount}`);
      debugLog(`   Chunks processed: ${chunkCount}`);

      // Calculate average time per variant, avoid division by zero
      avgTimePerVariant = variantsProcessed > 0 ? executionTime / variantsProcessed : 0;
      debugLog(
        `   Average time per variant: ${variantsProcessed > 0 ? avgTimePerVariant.toFixed(4) : 'N/A'}s`
      );

      // Add successful run to results
      results.push({
        status: 'success',
        name: scenario.name,
        executionTime,
        variantsProcessed,
        retryCount,
        chunkCount,
        avgTimePerVariant,
        repeatIndex: i,
      });

      if (verbose) {
        debugLog(`   ✅ Run completed successfully`);
      }
    } catch (error) {
      // Use stderr if available or a generic message if not
      const errorDetails = stderr ? `\nStderr: ${truncateLog(stderr)}` : '';
      debugLog(`   ❌ Error: ${error.message}${errorDetails}`);

      // Add failed run to results
      results.push({
        status: 'error',
        name: scenario.name,
        error: error.message,
        stderr: truncateLog(stderr), // Include stderr in result for reporting
        repeatIndex: i,
      });
    }
  }

  // Calculate average metrics across all successful runs
  const successfulRuns = results.filter((run) => run.status === 'success');

  const avgExecutionTime =
    successfulRuns.reduce((acc, r) => acc + r.executionTime, 0) / successfulRuns.length;
  const avgVariantsProcessed = Math.round(
    successfulRuns.reduce((acc, r) => acc + r.variantsProcessed, 0) / successfulRuns.length
  );
  const avgRetryCount = Math.round(
    successfulRuns.reduce((acc, r) => acc + r.retryCount, 0) / successfulRuns.length
  );
  const avgChunkCount = Math.round(
    successfulRuns.reduce((acc, r) => acc + r.chunkCount, 0) / successfulRuns.length
  );
  const avgTimePerVariant =
    successfulRuns.reduce((acc, r) => acc + r.avgTimePerVariant, 0) / successfulRuns.length;

  // Return the result with averages if we had multiple runs, or just the single run result
  if (repeat > 1) {
    return {
      name: scenario.name,
      status: successfulRuns.length > 0 ? 'success' : 'error',
      averages:
        successfulRuns.length > 0
          ? {
              executionTime: avgExecutionTime,
              variantsProcessed: avgVariantsProcessed,
              retryCount: avgRetryCount,
              chunkCount: avgChunkCount,
              avgTimePerVariant: avgTimePerVariant,
              runsCompleted: successfulRuns.length,
              totalRuns: repeat,
            }
          : null,
      // Return individual run data as well
      runs: results,
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
