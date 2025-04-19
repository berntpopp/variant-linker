# Variant-Linker Benchmark Results

Benchmark run completed on: 4/20/2025, 1:20:46 AM

## Benchmark Parameters

- Assembly: GRCh38
- Repeat Count: 3
- Variant Types: All Types
- Variant Counts: All Sizes

## System Information

- Node.js Version: v22.12.0
- Platform: Linux 5.15.167.4-microsoft-standard-WSL2
- CPU: 12th Gen Intel(R) Core(TM) i7-1260P (16 cores)
- Memory Usage: 63MB / 123MB

## Results

### Basic Metrics

| Scenario | Runtime (s) | Variants | Time/Variant (s) | Retries | Chunks |
| --- | --- | --- | --- | --- | --- |
| Single Variant VCF | 9.00 | 1 | 9.0024 | 0 | 1 |
| Single Variant rsID | 10.14 | 1 | 10.1392 | 0 | 1 |
| Tiny Batch VCF | 9.96 | 10 | 0.9963 | 0 | 1 |
| Tiny Batch HGVS/rsID | 16.69 | 13 | 1.2840 | 0 | 1 |
| Small Batch VCF | 13.43 | 50 | 0.2685 | 0 | 1 |
| Small Batch HGVS/rsID | 24.75 | 67 | 0.3694 | 0 | 1 |
| Large Batch VCF | 28.95 | 499 | 0.0580 | 0 | 3 |
| Large Batch HGVS/rsID | 91.30 | 680 | 0.1343 | 1 | 7 |

### Detailed Statistics

| Scenario | Min Runtime (s) | Max Runtime (s) | Std Deviation (s) | Success Ratio |
| --- | --- | --- | --- | --- |
| Single Variant VCF | 8.24 | 9.46 | 0.5410 | 3/3 |
| Single Variant rsID | 8.55 | 12.42 | 1.6560 | 3/3 |
| Tiny Batch VCF | 8.99 | 11.36 | 1.0135 | 3/3 |
| Tiny Batch HGVS/rsID | 14.70 | 17.87 | 1.4143 | 3/3 |
| Small Batch VCF | 10.02 | 18.91 | 3.9161 | 3/3 |
| Small Batch HGVS/rsID | 18.19 | 29.94 | 4.8912 | 3/3 |
| Large Batch VCF | 23.74 | 32.11 | 3.7122 | 3/3 |
| Large Batch HGVS/rsID | 86.23 | 97.50 | 4.6712 | 3/3 |

## Notes

- Time/Variant: Average processing time per variant in seconds
- Retries: Number of API request retries needed
- Chunks: Number of variant chunks processed
- Min/Max Runtime: Fastest and slowest run times in seconds
- Std Deviation: Standard deviation in execution times between runs
- Success Ratio: Number of successful runs out of total run attempts
