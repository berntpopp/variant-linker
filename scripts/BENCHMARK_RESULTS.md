# Variant-Linker Benchmark Results

Benchmark run completed on: 20.4.2025, 01:05:04

## Benchmark Parameters

- Assembly: GRCh38
- Repeat Count: 3
- Variant Types: All Types
- Variant Counts: All Sizes

## System Information

- Node.js Version: v20.16.0
- Platform: Windows_NT 10.0.26100
- CPU: 12th Gen Intel(R) Core(TM) i7-1260P (16 cores)
- Memory Usage: 62MB / 119MB

## Results

### Basic Metrics

| Scenario | Runtime (s) | Variants | Time/Variant (s) | Retries | Chunks |
| --- | --- | --- | --- | --- | --- |
| Single Variant VCF | 3.07 | 1 | 3.0704 | 0 | 1 |
| Single Variant rsID | 6.04 | 1 | 6.0398 | 0 | 1 |
| Tiny Batch VCF | 2.51 | 10 | 0.2515 | 0 | 1 |
| Tiny Batch HGVS/rsID | 6.01 | 13 | 0.4626 | 0 | 1 |
| Small Batch VCF | 4.60 | 50 | 0.0920 | 0 | 1 |
| Small Batch HGVS/rsID | 15.02 | 67 | 0.2242 | 1 | 1 |
| Large Batch VCF | 21.55 | 499 | 0.0432 | 1 | 3 |
| Large Batch HGVS/rsID | 90.72 | 680 | 0.1334 | 2 | 7 |

### Detailed Statistics

| Scenario | Min Runtime (s) | Max Runtime (s) | Std Deviation (s) | Success Ratio |
| --- | --- | --- | --- | --- |
| Single Variant VCF | 2.48 | 4.23 | 0.8194 | 3/3 |
| Single Variant rsID | 2.82 | 8.46 | 2.3747 | 3/3 |
| Tiny Batch VCF | 2.29 | 2.67 | 0.1621 | 3/3 |
| Tiny Batch HGVS/rsID | 4.81 | 7.34 | 1.0379 | 3/3 |
| Small Batch VCF | 3.52 | 5.84 | 0.9545 | 3/3 |
| Small Batch HGVS/rsID | 12.19 | 19.90 | 3.4610 | 3/3 |
| Large Batch VCF | 16.25 | 28.84 | 5.3264 | 3/3 |
| Large Batch HGVS/rsID | 87.49 | 96.13 | 3.8490 | 3/3 |

## Notes

- Time/Variant: Average processing time per variant in seconds
- Retries: Number of API request retries needed
- Chunks: Number of variant chunks processed
- Min/Max Runtime: Fastest and slowest run times in seconds
- Std Deviation: Standard deviation in execution times between runs
- Success Ratio: Number of successful runs out of total run attempts
