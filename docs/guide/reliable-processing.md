# Reliable processing and local development

Use Node.js 22.14 or newer. For a checkout, install the committed dependencies with
`npm ci` and `npm --prefix docs ci`. Run `npm run verify` before opening a pull
request. It checks strict lint, formatting, checked JavaScript types, the 649-line
limit, offline tests with at least 81% coverage on all four metrics, the browser
bundle and package contents, documentation, and root and documentation dependency advisories.
GitHub CI runs the same command on Node 22 and 24 and reuses its verified artifacts
for release and documentation deployment.

Use `npm run verify:static` during editing, `npm run test:focus -- test/file.test.js`
for a single offline suite, or `npm run typecheck:watch` for continuous feedback.
ESLint and Prettier use content-based caches; TypeScript records incremental state.
Caches live under `node_modules/.cache` and are disposable; `npm ci` clears them.
Static gates run concurrently. Full verification then runs independent test,
browser/package, documentation and advisory branches concurrently, reporting
individual and total wall times. A failed static gate prevents downstream work.

## Streaming and failure accounting

Standard input accepts one variant per line. CSV/TSV streams use a fixed column
layout across chunks, including empty or differently annotated chunks. JSON and
SCHEMA streams are newline-delimited JSON: one compact document per chunk.
SCHEMA adds a versioned JSON-LD Dataset envelope and validates the annotation payload.
An unsuccessful input makes the CLI exit with a nonzero status even if other inputs
produced usable output. Diagnostic messages go to stderr.

For bounded VCF processing, use:

```sh
variant-linker --vcf-input input.vcf --stream --chunk-size 100 --output VCF --save annotated.vcf
```

The iterator retains at most one chunk plus the current original record. A
multiallelic record stays together, so a single record with many ALT alleles can
exceed the chunk size. Duplicate records also count against the chunk budget.
Writes finish before the next chunk is acquired. Original IDs, QUAL, FILTER,
INFO, FORMAT, sample values and phase are preserved while annotations are added.
Explicit filters retain whole selected original records, including their ALT list.

Inheritance requires full-file analysis: omit `--stream` when using a pedigree or
sample map. Compound heterozygous inference needs variants across the dataset;
bounded VCF mode never silently substitutes a per-chunk inheritance calculation.

Liftover validates the full reference span, orientation and target reference allele.
Unsupported or ambiguous mappings are reported as failures. JSON metadata records
source/target assemblies and original/lifted identities. Annotated VCF retains the
original input coordinates and headers; annotations may describe the target
assembly. Use JSON when consuming detailed liftover provenance.

## Scoring and tabular text

Scoring formulas **and conditions execute trusted JavaScript** through `Function`.
Configuration files are executable code, not a sandbox. Only use models you trust;
do not expose model upload or evaluation to untrusted users. Compiled expressions
are cached without reusing values between variants. Transcript-free annotations
use declared defaults; MANE Select and Plus Clinical metadata are recognized.

TSV cells encode literal backslashes, tabs, carriage returns and newlines as `\\`,
`\t`, `\r`, and `\n`, respectively. CSV uses quoted cells for delimiters, quotes and
line breaks. Use `--spreadsheet-safe` to prefix formula-like text cells with an
apostrophe before importing into a spreadsheet; signed numeric values remain numeric.

## Tests, benchmarks and cache operations

`npm test` is offline, including spawned CLI processes. Tests exercise real parsers
and temporary files and replace only external API responses. `npm run test:live`
is a separate opt-in check against Ensembl. Never use real patient data in fixtures.

`npm run benchmark` uses deterministic synthetic responses by default. `--live`
opts into public API timing. Reports distinguish CLI startup from measured process
wall time and label throughput as end-to-end; they do not subtract guessed overhead
or inject deliberate sleeps into measurements.

Request options support assembly/base URL, timeout/deadline, cancellation and response
size limits. They are passed per request rather than changing process-wide state.
Persistent caching uses owned files, atomic replacement, size accounting and an
exclusive writer lock. If a process is killed while holding its disk lock, reads
remain available but writes fail after a bounded wait and increment `writeErrors`.
Remove a stale lock only after confirming no process is using that cache directory.

See [AGENTS.md](https://github.com/berntpopp/variant-linker/blob/main/AGENTS.md) for
the concise contribution contract and [SECURITY.md](https://github.com/berntpopp/variant-linker/blob/main/SECURITY.md)
for vulnerability reporting.
