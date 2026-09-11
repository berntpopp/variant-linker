# Benchmarking

The benchmark runner measures complete CLI invocations with synthetic offline annotation fixtures by default. It records actual returned annotation counts, input hashes, runtime versions, assembly, and transport mode so results can be reproduced. Offline measurements describe application overhead with fixtures; they do not predict Ensembl latency or validate biological annotations.

```bash
# Run every built-in scenario without public network requests
npm run benchmark

# Repeat a small scenario and save complete machine-readable results
npm run benchmark -- --input examples/benchmark_data/tiny_batch.txt --repeat 3 --format json --output benchmark-results.json

# Explicitly opt into public Ensembl calls
npm run benchmark -- --live --variant-count 1 --repeat 3
```

## Options

| Option            | Short  | Purpose                                         |
| ----------------- | ------ | ----------------------------------------------- |
| `--input`         | `-i`   | Use a custom VCF or variant list                |
| `--assembly`      | `-a`   | GRCh37/hg19 or GRCh38/hg38; default GRCh38      |
| `--repeat`        | `-r`   | Positive number of complete runs; default 1     |
| `--variant-type`  | `-t`   | Filter built-in scenarios: vcf, hgvs, rsid, all |
| `--variant-count` | `-c`   | Filter built-in scenarios: 1, 10, 50, 500, all  |
| `--format`        | `-f`   | table, csv, tsv, json; default table            |
| `--output`        | `-o`   | Write the report to a file                      |
| `--verbose`       | `-v`   | Print benchmark progress to stderr              |
| `--log`           | `-l`   | Write each run's JSON metrics and errors        |
| `--readme`        | `--md` | Regenerate scripts/BENCHMARK_RESULTS.md         |
| `--live`          |        | Enable actual Ensembl requests                  |

The HGVS filter also includes built-in rsID scenarios for compatibility. Custom `.vcf` files use the CLI's VCF input path; other files use its variant-list input path.

## What the timings mean

**CLI wall time** starts immediately before spawning the annotation process and ends when it exits. It includes Node.js startup, input parsing, annotation, and output serialization. Report formatting, deliberate sleeps, and forced diagnostic output are outside this measurement. The runner does not enable child debug logging.

**Startup baseline** measures a separate `--semver` invocation with the same transport preload. It is reported alongside wall time and is never subtracted: it does not establish the precise startup cost of an annotation run.

**Annotations per second** divides successfully returned annotation objects by CLI wall time. One submitted input can produce more than one annotation. Counts come from parsed JSON output; invalid output fails the run rather than falling back to a scenario's expected count. Retry and chunk counts appear as `N/A` unless the CLI explicitly supplies those metrics.

Repeated runs report successful-run counts, means, minimum, maximum, and standard deviation in JSON. Failed and partial runs remain in the report and produce a nonzero exit status. Averages use successful runs only, so compare completion counts alongside timings.

## Reproducing a comparison

Keep the input SHA-256, assembly, fixture/live mode, Node.js version, package version, and machine conditions consistent. Each JSON result includes this metadata. Each invocation starts a fresh process without persistent caching. For live runs, record network conditions and allow for upstream service variability and rate limits.

The historical report in `scripts/BENCHMARK_RESULTS.md` predates these measurement corrections. Its fixed delay and forced logging make those numbers unsuitable for direct comparison with the current runner. Regenerate a baseline before assessing performance changes.
