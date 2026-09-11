# CLI reference

Run `npx variant-linker --help`, or `npm install --global variant-linker`.
Node.js 22.14+ is required. For integration, see the [API](api-usage.md) and
[browser/package guide](../guide/browser-and-package.md).

## Inputs and basic usage

Supply one of `--variant`, `--variants`, `--variants-file` or `--vcf-input`.
Without these, redirected stdin is read as one variant per line.

```bash
variant-linker --variant "rs6025" --output JSON
variant-linker --variant "ENST00000366667:c.803C>T" --output CSV
variant-linker --variant "1-65568-A-C" --output TSV
variant-linker --variant "7:117559600-117559609:DEL" --output VCF
variant-linker --variants "rs6025,rs1799963" --output JSON
variant-linker --variants-file variants.txt --output TSV
variant-linker --vcf-input family.vcf --output VCF --output-file annotated.vcf
cat variants.txt | variant-linker --output TSV --chunk-size 100
```

Supported inputs include rsIDs, HGVS, VCF-style coordinates, and CNVs expressed
as `chrom:start-end:DEL`, `DUP` or `CNV`. Use `--vcf-input` for a complete VCF
with headers and sample genotypes. Variant text files contain one input per line.

## All options

| Option                    | Alias  | Purpose                                                     |
| ------------------------- | ------ | ----------------------------------------------------------- |
| `--variant`               | `-v`   | Single input.                                               |
| `--variants`              | `-vs`  | Comma-separated inputs.                                     |
| `--variants-file`         | `-vf`  | Variant text file.                                          |
| `--vcf-input`             | `-vi`  | VCF file path.                                              |
| `--output`                | `-o`   | `JSON` (default), `CSV`, `TSV`, `SCHEMA`, `VCF`.            |
| `--output-file`           | `-of`  | Output path.                                                |
| `--save`                  | `-s`   | Filename to save results (alternative to --output-file).    |
| `--assembly`              |        | `hg38` (default), `hg19`, `hg19tohg38`.                     |
| `--vep_params`            | `-vp`  | Comma-separated VEP `key=value` options.                    |
| `--recoder_params`        | `-rp`  | Comma-separated Recoder `key=value` options.                |
| `--filter`                | `-f`   | JSON-encoded result filter.                                 |
| `--pick-output`           | `-po`  | Retain selected transcript output.                          |
| `--scoring_config_path`   | `-scp` | Scoring configuration directory.                            |
| `--ped`                   | `-p`   | PED pedigree file.                                          |
| `--calculate-inheritance` | `-ci`  | Infer inheritance using genotype and pedigree/trio context. |
| `--sample-map`            | `-sm`  | Three sample IDs in index,mother,father order.              |
| `--bed-file`              | `-bf`  | BED path; repeat for multiple files.                        |
| `--gene-list`             | `-gl`  | Gene-list path; repeat for multiple files.                  |
| `--json-genes`            | `-jg`  | JSON gene path; repeat for multiple files.                  |
| `--json-gene-mapping`     |        | JSON object with `identifier` and optional `dataFields`.    |
| `--stream`                |        | Process a VCF in bounded record chunks.                     |
| `--chunk-size`            | `-cs`  | Logical streaming chunk size (default 100).                 |
| `--spreadsheet-safe`      |        | Protect CSV/TSV text cells for spreadsheet import.          |
| `--cache`                 | `-C`   | Enable request caching.                                     |
| `--api-base-url`          |        | Explicit Ensembl-compatible endpoint.                       |
| `--api-timeout`           |        | Per-attempt timeout in milliseconds (default 60,000).       |
| `--api-concurrency`       |        | Simultaneous POST batches: `1` (default) or `2`.            |
| `--proxy`                 |        | HTTP proxy URL.                                             |
| `--proxy-auth`            |        | `username:password`; requires `--proxy`.                    |
| `--config`                | `-c`   | JSON config; explicit CLI options take precedence.          |
| `--debug`                 | `-d`   | Repeat for diagnostic levels 1–3.                           |
| `--log_file`              | `-lf`  | Diagnostic log path.                                        |
| `--semver`                | `-sv`  | Display semantic-version details and exit.                  |
| `--version`               | `-V`   | Display version.                                            |
| `--help`                  | `-h`   | Display generated help.                                     |

Inputs are sent to the selected annotation service. Debug logs can contain variant
and annotation data; review logs before sharing them.

## Output and streaming

| Mode                  | Contract                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Complete JSON         | One object with annotations and metadata.                                                                          |
| Complete SCHEMA       | One validated JSON-LD Dataset.                                                                                     |
| Streaming JSON/SCHEMA | NDJSON: one compact document per completed chunk.                                                                  |
| CSV/TSV               | Fixed column order; one header for streamed output.                                                                |
| VCF                   | Preserved source records, headers and samples plus annotations. Direct coordinate/CNV inputs can also produce VCF. |

CSV quotes delimiters and quotes. TSV escapes tabs, newlines and backslashes.
`--spreadsheet-safe` protects potentially executable text cells; signed numbers
remain numeric. Diagnostics go to stderr. **Any failed input or chunk gives a
nonzero exit status**, even when partial output has been written. Check pipeline
exit status before considering output complete.

```bash
variant-linker --vcf-input large.vcf --stream --chunk-size 100 --output VCF > annotated.vcf
variant-linker --vcf-input large.vcf --stream --output JSON > annotations.ndjson
```

Streaming retains whole multiallelic records and respects output backpressure.
One record can exceed the logical chunk size; duplicate records count toward it.
Inheritance is rejected with `--stream` because it needs full-file context.
Stdin chunks are also unsuitable for cohort-wide compound-heterozygous inference.

## Enrichment and filtering

```bash
variant-linker --vcf-input family.vcf --ped family.ped --calculate-inheritance --output JSON
variant-linker --vcf-input trio.vcf --calculate-inheritance --sample-map "child,mother,father" --output VCF
variant-linker --variants-file variants.txt --scoring_config_path scoring/nephro_variant_score --output CSV
variant-linker --vcf-input sample.vcf --bed-file regions.bed --gene-list panel.txt --output JSON
variant-linker --variant rs6025 --json-genes genes.json --json-gene-mapping '{"identifier":"gene_symbol","dataFields":["panel_name"]}' --output JSON
variant-linker --variant rs6025 --vep_params "flag_pick=1,hgvs=1" --pick-output --output TSV
```

Scoring directories contain `variable_assignment_config.json` and
`formula_config.json`. Formulas use a restricted expression language; arbitrary
JavaScript is rejected. See [scoring](../guides/scoring-engine.md),
[inheritance](../guides/inheritance-analysis.md), and
[custom annotations](../guides/custom-annotations.md) for formats.

`--filter` takes the JSON filter syntax described in [filtering](../guide/browser-and-package.md#results-filtering-and-downloads).
VCF filtering retains the complete original record and ALT list when any of its
annotations survives. Transcript selection does not invent missing transcripts.

## Assembly and request configuration

```bash
variant-linker --assembly hg19 --variant "22-16050075-A-G" --output JSON
variant-linker --assembly hg19tohg38 --variant "chr17-7578406-C-A" --output JSON
variant-linker --variants-file variants.txt --api-timeout 60000 --api-concurrency 2 --cache
variant-linker --variant rs6025 --proxy http://proxy.example.org:8080
```

Liftover validates reference span, orientation and target reference. Ambiguous
mappings fail explicitly. JSON metadata records original/lifted coordinates.
Source VCF coordinates stay in their original assembly, while annotations may
refer to the target assembly. CLI `hg19tohg38` requires coordinate or VCF input.

Advanced per-fetch budgets can be supplied in `--config config.json`:

```json
{
  "assembly": "hg19",
  "output": "JSON",
  "requestOptions": {
    "timeoutMs": 60000,
    "deadlineMs": 120000,
    "maxRetries": 2,
    "postConcurrency": 1
  }
}
```

The deadline includes retries and backoff for each fetch, not the entire analysis.
`--api-base-url` or `ENSEMBL_BASE_URL` selects an explicit service; choose its
intended assembly. Node environment proxies are supported. See [API budgets](api-usage.md#budgets-cancellation-and-concurrency),
[proxy settings](../guides/proxy-configuration.md), [cache settings](../CACHE.md), and
[reliable processing](../guide/reliable-processing.md).
