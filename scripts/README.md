# Variant-Linker Scripts

This directory contains utility scripts for the variant-linker project.

## Available Scripts

### Benchmark Script (`benchmark.js`)

A comprehensive benchmarking tool that measures variant-linker performance across different scenarios.

> **Latest benchmark results:** [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md)

#### Features

- Tests multiple input types (VCF, HGVS, rsID)
- Measures API performance with different batch sizes (single variant, small, large)
- Calculates detailed performance metrics (execution time, API retries, chunks processed)
- Supports statistical analysis with multiple runs (min/max times, standard deviation)
- Generates formatted output to console and markdown reports

#### Usage

```bash
node benchmark.js [options]
```

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--verbose` | `-v` | Run with verbose output | `false` |
| `--assembly` | `-a` | Genome assembly to use | `GRCh38` |
| `--repeat` | `-r` | Number of runs for each scenario | `1` |
| `--format` | `-f` | Output format (table, csv, tsv) | `table` |
| `--output` | `-o` | File to save results | Console output |
| `--readme` | `-md` | Generate a markdown report | `false` |
| `--log` | `-l` | Log file for detailed output | N/A |
| `--variant-type` | `-t` | Filter by variant type (vcf, hgvs, rsid, all) | `all` |
| `--variant-count` | `-c` | Filter by variant count (1, 10, 50, 500, all) | `all` |

#### Examples

Run all benchmark scenarios once:
```bash
node benchmark.js
```

Run benchmarks 3 times and generate statistical analysis:
```bash
node benchmark.js --repeat 3
```

Generate a detailed markdown report:
```bash
node benchmark.js --repeat 3 --readme
```

Focus only on VCF file benchmarks:
```bash
node benchmark.js --variant-type vcf
```

#### Results

The benchmark generates a detailed report in [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md) when run with the `--readme` option.

#### Understanding Metrics

The benchmark captures several key performance metrics:

- **Runtime (s)**: Total execution time in seconds for the variant-linker process
- **Variants**: Number of variant records successfully processed
- **Time/Variant (s)**: Average processing time per variant (Runtime ÷ Variants)
- **Retries**: Number of API request retries due to rate limiting or transient errors
- **Chunks**: Number of variant chunks processed when batching is enabled

**Important Note:** Do not confuse the `--repeat` parameter (number of benchmark runs for statistical analysis) with the *Retries* metric. The repeat count determines how many times each benchmark is executed to calculate averages, while retries indicates how many times API requests were retried due to errors during a single run.

## Development

When modifying these scripts, please follow the project's coding conventions:
- Use modular design with clear separation of concerns
- Follow KISS and DRY principles
- Add JSDoc comments for functions
- Maintain consistent error handling
