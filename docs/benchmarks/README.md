# Public VCF and Variant Recoder benchmarks

These paired workloads use 1,000 real public variants. They measure VEP annotation
and Variant Recoder separately. Ordinary tests and the default benchmark stay
offline; public requests require `--live`.

## Provenance and scope

The source is the official 1000 Genomes Phase 3 integrated v5b chromosome 22
GRCh37 release, dated 20130502. The fetcher reads a bounded compressed prefix,
selects the first 1,000 PASS biallelic A/C/G/T SNVs in source order, retains the
first eight original VCF columns, and removes individual genotype/sample columns.
It scans 1,039 records spanning chr22:16050075–16141716. The derived file is
155,515 bytes, SHA-256
`8e439d73dd7aad3da6d6a5f48ba3b7e0fa70d86069d793b2d1f622d4e1c55bec`.

[VCF provenance](./1000genomes-1000.json) records the exact source URL, retrieval
timestamp, response headers, source-header and consumed-prefix hashes, selection
algorithm, transfer accounting and reuse/citation references. Only the prefix and
derived data were hashed; this is not a verification of the entire upstream gzip.
This regional SNV cohort is not a random genomic sample or an inheritance benchmark.

The Recoder workload derives genomic HGVS on RefSeq `NC_000022.10` from those exact
same coordinates and alleles, preserving order. The source VCF has missing IDs,
so this avoids inventing rsIDs. [Recoder provenance](./recoder-1000.json) records
the NCBI accession authority, transformation and derived SHA-256
`9bec9502fd24f919a2955b202f5ba5ae89c2b20228c30ee0931c80f0fcad8ae1`.

## Reproduction

From the repository root, fetch once and derive the paired identifiers:

```sh
node scripts/benchmark/fetch-dataset.cjs --count 1000
node scripts/benchmark/derive-recoder-dataset.cjs
```

Capture one public run of each stage:

```sh
node scripts/benchmark.js --input local_data/benchmarks/1000genomes-chr22-grch37-1000.vcf --assembly GRCh37 --live --record local_data/benchmarks/vep-recording.json --format json --output local_data/benchmarks/vep-live.json
node scripts/benchmark.js --input local_data/benchmarks/1000genomes-chr22-grch37-1000.hgvs.txt --stage recoder --assembly GRCh37 --live --record local_data/benchmarks/recoder-recording.json --format json --output local_data/benchmarks/recoder-live.json
```

Repeat offline with the same responses:

```sh
node scripts/benchmark.js --input local_data/benchmarks/1000genomes-chr22-grch37-1000.vcf --assembly GRCh37 --replay local_data/benchmarks/vep-recording.json --repeat 5 --format json
node scripts/benchmark.js --input local_data/benchmarks/1000genomes-chr22-grch37-1000.hgvs.txt --stage recoder --assembly GRCh37 --replay local_data/benchmarks/recoder-recording.json --repeat 5 --format json
```

Add `--api-concurrency 2` for the bounded parallel experiment. Both comparisons
use `--api-timeout 60000`; the timeout changes no requested fields. Cache is off.
Raw datasets, public response recordings and local machine-specific reports stay
under ignored `local_data/benchmarks`. The committed manifests and validation
report provide provenance without turning the offline test suite into a download.

## API constraints and implementation

Both [VEP region POST](https://rest.ensembl.org/documentation/info/vep_region_post)
and [Variant Recoder POST](https://rest.ensembl.org/documentation/info/variant_recoder_post)
document a maximum of **200 inputs per POST**. The workload therefore needs five
logical requests per stage. VEP is bypassed entirely in `--stage recoder`; the
Recoder result retains all requested representations with `vcf_string=1`.

[Ensembl's rate documentation](https://github.com/Ensembl/ensembl-rest/wiki/Rate-Limits)
describes a per-IP quota of 55,000 requests/hour, approximately 15/second on
average. Actual `X-RateLimit-*` response headers govern the available quota, and
the complete fractional `Retry-After` delay must elapse before retrying.

Opt-in concurrency uses two ordered workers and a shared per-origin scheduler.
It starts at most ten requests/second and honors stricter returned limits,
exhausted quota, cooldowns, cancellation and deadlines. Once activated for an
origin, interleaved sequential requests in that process share its scheduler.
Separate applications sharing the same public IP still share the server quota.
Default concurrency remains one; choose two based on endpoint/workload evidence.

The attempt timeout is 60 seconds, within the 120-second per-request overall
deadline. `--api-timeout`, `--api-base-url`, and `--api-concurrency` expose explicit
CLI controls; library callers use `requestOptions`. Server cooldowns are never
shortened by the client backoff cap.

## Measurement boundaries

Reports include process wall time, a separate startup invocation, successful and
failed annotations, actual HTTP attempts/chunks/retries, request p50/p95, peak RSS,
event-loop delay, byte counts, revision and input/annotation hashes. Startup is
not subtracted. The Recoder driver excludes downstream VEP/scoring. A recording
run includes writing its local capture; replay removes public network delay and
fails closed if a request is missing. Replay throughput is not API throughput.

Initial sequential live measurements completed 1,000 inputs each with five POSTs
and zero retries: VEP 11.576 seconds, Recoder 54.810 seconds. VEP's first parallel
run took 7.980 seconds. The first parallel Recoder experiment timed out on one
batch after four responses; it is retained as a failure, not averaged into
successful runs. Repeated matched measurements and exact response validation
are recorded in [machine-readable measurements](./2026-09-11-measurements.json)
and [response validation](./response-validation.json).

| Live experiment        |                        Sequential | Two concurrent batches | Result                                                                                         |
| ---------------------- | --------------------------------: | ---------------------: | ---------------------------------------------------------------------------------------------- |
| Initial VEP            |                          11.576 s |                7.980 s | 1,000 annotations each, five POSTs, no retries                                                 |
| Matched VEP repeat     |                          22.726 s |               12.777 s | Identical canonical outputs, five POSTs, no retries                                            |
| Initial Recoder        |                          54.810 s |       Deadline failure | Sequential run completed all 1,000; parallel capture retained 800                              |
| Matched Recoder repeat | Deadline failure (148.078 s wall) |              104.466 s | Parallel run completed 1,000 with two retries; sequential run exhausted one request's deadline |

Both VEP observations favored two batches (31.1% and 43.8% lower wall time).
Recoder variability does not justify a default-concurrency change or a reliable
speedup claim. The implementation exposes bounded concurrency for measured use,
retains sequential defaults and respects request budgets under failures.

Three offline runs per endpoint/concurrency configuration all returned identical
canonical annotation hashes, 1,000 records, five chunks and zero retries. Offline
timings include scheduler overhead but omit server work, so they establish
repeatability and output equivalence, not public-service acceleration.

The cohort verifies software throughput and response association. It does not
validate annotation accuracy or establish clinical validity. Live observations
include server load and network variability and cannot establish a universal
speedup.
