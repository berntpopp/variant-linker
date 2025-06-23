# Benchmarking

Variant-Linker includes a comprehensive benchmarking suite to measure performance metrics and track optimization improvements. The benchmarking system helps identify bottlenecks, compare different processing scenarios, and ensure consistent performance across versions.

## Overview

The benchmark suite is essential for:
- **Performance Testing**: Measuring processing speed across different variant types and batch sizes
- **Bottleneck Identification**: Pinpointing slow components in the processing pipeline
- **API Performance**: Comparing performance across different Ensembl API endpoints
- **Regression Testing**: Ensuring changes don't negatively impact performance
- **Capacity Planning**: Understanding system limitations and scalability

## Running Benchmarks

### Basic Benchmark Execution

```bash
# Run all benchmarks with default settings
npm run benchmark

# Run with verbose output showing detailed progress
npm run benchmark -- --verbose

# Run specific benchmark file
npm run benchmark -- --input examples/benchmark_data/tiny_batch.txt

# Save results to a file
npm run benchmark -- --format csv --output benchmark_results.csv
```

### Command-Line Options

| Option | Short | Description |
|--------|-------|-------------|
| `--verbose` | `-v` | Run with detailed output showing each processing step |
| `--input` | `-i` | Specify a specific input file to benchmark |
| `--assembly` | `-a` | Genome assembly to use (GRCh37 or GRCh38, default: GRCh38) |
| `--repeat` | `-r` | Number of times to repeat each benchmark for averaging (default: 1) |
| `--format` | `-f` | Output format for results (table, csv, tsv, default: table) |
| `--output` | `-o` | File to write results to (prints to console if not specified) |
| `--variant-type` | `-t` | Variant types to benchmark (vcf, hgvs, rsid, all, default: all) |
| `--variant-count` | `-c` | Variant counts to benchmark (1, 10, 50, 500, all, default: all) |

### Advanced Benchmark Options

```bash
# Test specific variant types
npm run benchmark -- --variant-type vcf --format csv

# Test specific batch sizes
npm run benchmark -- --variant-count 50 --repeat 3

# Test different genome assemblies
npm run benchmark -- --assembly GRCh37 --output grch37_results.csv

# Comprehensive testing with multiple repeats
npm run benchmark -- --repeat 5 --format csv --output comprehensive_results.csv
```

## Benchmark Scenarios

### Single Variant Tests
- **Single Variant VCF**: Processing one VCF-format variant (no recoding needed)
- **Single Variant rsID**: Processing one rsID variant (requires recoding)
- **Single Variant HGVS**: Processing one HGVS notation variant

### Small Batch Tests
- **Tiny Batch VCF**: Processing 10 VCF variants
- **Tiny Batch HGVS/rsID**: Processing 10 HGVS/rsID variants

### Medium Batch Tests
- **Small Batch VCF**: Processing ~50 VCF variants
- **Small Batch HGVS/rsID**: Processing ~50 HGVS/rsID variants

### Large Batch Tests
- **Large Batch VCF**: Processing ~500 VCF variants (triggers API chunking)
- **Large Batch HGVS/rsID**: Processing ~500 HGVS/rsID variants (triggers chunking)

## Performance Metrics

### Key Metrics Reported

| Metric | Description |
|--------|-------------|
| **Total Runtime** | Complete processing time from start to finish |
| **Variants Processed** | Number of variants successfully processed |
| **Time per Variant** | Runtime divided by variant count (efficiency metric) |
| **API Retries** | Number of retry attempts due to transient failures |
| **Chunks Processed** | Number of API request chunks (for batch operations) |
| **Memory Usage** | Peak memory consumption during processing |
| **API Call Count** | Total number of API requests made |

### Example Benchmark Output

```
📊 BENCHMARK RESULTS
=================================================================================
| Scenario              | Runtime (s) | Variants | Time/Variant (s) | Retries | Chunks |
---------------------------------------------------------------------------------
| Single Variant VCF    |       0.85 |        1 |           0.8500 |       0 |      0 |
| Single Variant rsID   |       1.25 |        1 |           1.2500 |       0 |      0 |
| Tiny Batch VCF        |       2.15 |       10 |           0.2150 |       0 |      0 |
| Tiny Batch HGVS/rsID  |       3.45 |       10 |           0.3450 |       0 |      0 |
| Small Batch VCF       |       5.25 |       50 |           0.1050 |       0 |      0 |
| Small Batch HGVS/rsID |       7.75 |       50 |           0.1550 |       1 |      0 |
| Large Batch VCF       |      18.50 |      500 |           0.0370 |       2 |      3 |
| Large Batch HGVS/rsID |      25.75 |      500 |           0.0515 |       3 |      3 |
=================================================================================
```

## Benchmark Data Files

### Standard Test Files

Located in `examples/benchmark_data/`:

| File | Variants | Type | Description |
|------|----------|------|-------------|
| `single_variant.txt` | 1 | Mixed | Single variant test |
| `single_variant.vcf` | 1 | VCF | Single VCF variant |
| `tiny_batch.txt` | 10 | Mixed | Small batch test |
| `tiny_batch.vcf` | 10 | VCF | Small VCF batch |
| `small_batch.txt` | ~50 | Mixed | Medium batch test |
| `small_batch.vcf` | ~50 | VCF | Medium VCF batch |
| `large_batch.txt` | ~500 | Mixed | Large batch test |
| `large_batch.vcf` | ~500 | VCF | Large VCF batch |

### Custom Benchmark Data

You can create custom benchmark files:

```bash
# Generate custom benchmark data
node scripts/generate_benchmark_data.js --count 100 --type vcf --output custom_test.vcf
```

## Performance Analysis

### Understanding Results

**Time per Variant Efficiency**
- Lower values indicate better efficiency
- VCF variants typically faster (no recoding needed)
- Batch processing more efficient than individual requests

**API Retry Patterns**
- Occasional retries are normal due to network conditions
- High retry counts may indicate API or network issues
- Retries add to total processing time

**Chunking Behavior**
- Large batches automatically split into chunks
- Default chunk size is 200 variants per API request
- More chunks indicate larger batch sizes

### Performance Optimization Insights

**Batch Size Optimization**
- Sweet spot typically around 50-200 variants per request
- Very large batches may hit API limits
- Single variants have higher per-variant overhead

**Input Format Impact**
- VCF format variants process faster (no format conversion)
- HGVS and rsID variants require additional recoding step
- Mixed batches have variable processing times

**Network and API Factors**
- Geographic location affects API response times
- Time of day can influence API performance
- Network stability impacts retry frequency

## Continuous Performance Monitoring

### Automated Benchmarking

Integrate benchmarking into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Performance Benchmarks
  run: |
    npm run benchmark -- --format csv --output benchmark_results.csv
    # Compare with baseline results
    node scripts/compare_benchmarks.js baseline.csv benchmark_results.csv
```

### Performance Regression Detection

Track performance over time:

```bash
# Generate baseline
npm run benchmark -- --format csv --output baseline_performance.csv

# After changes, compare performance
npm run benchmark -- --format csv --output current_performance.csv
diff baseline_performance.csv current_performance.csv
```

### Performance Profiling

For detailed performance analysis:

```bash
# Profile memory usage
node --max-old-space-size=4096 scripts/benchmark.js --verbose

# Profile with Node.js inspector
node --inspect scripts/benchmark.js --input large_batch.txt
```

## Interpreting Benchmark Results

### Performance Expectations

**Typical Performance Ranges** (approximate):
- Single variants: 0.5-2.0 seconds
- Small batches (10-50): 0.1-0.3 seconds per variant
- Large batches (200+): 0.03-0.1 seconds per variant

**Factors Affecting Performance**:
- Internet connection speed
- Ensembl API response times
- System hardware (CPU, memory)
- Input variant complexity

### Performance Troubleshooting

**Slow Performance Issues**:
1. Check internet connectivity
2. Verify Ensembl API status
3. Monitor system resource usage
4. Review debug output for bottlenecks

**High Retry Rates**:
1. Check network stability
2. Verify API availability
3. Consider reducing batch sizes
4. Review retry configuration

## Custom Benchmarking

### Creating Custom Benchmark Scripts

```javascript
// custom_benchmark.js
const { analyzeVariant } = require('variant-linker');

async function customBenchmark() {
  const startTime = Date.now();
  
  const result = await analyzeVariant({
    variants: ['rs6025', 'rs113993960'],
    output: 'JSON'
  });
  
  const endTime = Date.now();
  console.log(`Custom benchmark completed in ${endTime - startTime}ms`);
}

customBenchmark();
```

### Specialized Performance Tests

```bash
# Test specific features
node custom_benchmark.js --test inheritance-analysis
node custom_benchmark.js --test scoring-engine
node custom_benchmark.js --test vcf-processing
```

## Integration with Development Workflow

### Pre-commit Performance Checks

```bash
# Quick performance check before committing
npm run benchmark -- --variant-count 10 --format table
```

### Release Performance Validation

```bash
# Comprehensive performance validation for releases
npm run benchmark -- --repeat 3 --format csv --output release_performance.csv
```

### Performance Documentation

Document performance characteristics:
- Expected processing times for different scenarios
- Resource requirements for various batch sizes
- Scalability limits and recommendations

## Best Practices

### Benchmark Design
1. **Consistent Test Data**: Use standardized test datasets
2. **Multiple Runs**: Average results across multiple runs
3. **Controlled Environment**: Run benchmarks in consistent environments
4. **Comprehensive Coverage**: Test various scenarios and edge cases

### Performance Monitoring
1. **Regular Benchmarking**: Run benchmarks regularly to catch regressions
2. **Baseline Tracking**: Maintain performance baselines for comparison
3. **Alert Thresholds**: Set up alerts for significant performance degradation
4. **Documentation**: Document performance characteristics and expectations

### Optimization Strategy
1. **Profile Before Optimizing**: Identify actual bottlenecks before making changes
2. **Measure Impact**: Quantify the impact of optimization efforts
3. **Avoid Premature Optimization**: Focus on significant performance issues first
4. **Balance Trade-offs**: Consider trade-offs between performance and other factors

## Next Steps

- Explore [API documentation](./api) for programmatic performance monitoring
- Learn about [configuration options](./getting-started/cli-usage.md) that affect performance
- Check out [troubleshooting guides](./contributing.md) for performance issues