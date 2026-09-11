# JavaScript API

This reference describes 4.0.0. After publication, install with
`npm install variant-linker@4.0.0` (Node.js 22.14+). The package entry is
CommonJS; Node ESM and compatible bundlers can use its default import. The separate
UMD bundle exposes `globalThis.VariantLinker` in browsers. See the
[browser and package guide](../guide/browser-and-package.md) for the capability
matrix and complete VCF, pedigree, feature and scoring integration.

## Analyze variants

```javascript
const { analyzeVariant } = require('variant-linker');

async function main() {
  const result = await analyzeVariant({
    variants: ['rs6025', 'rs1799963'],
    assembly: 'hg38',
    vepOptions: { hgvs: '1', CADD: '1' },
    output: 'JSON',
  });
  console.log(result.annotationData);
}
main().catch(console.error);
```

For ESM, use `import VariantLinker from 'variant-linker';` and call
`VariantLinker.analyzeVariant(...)`. Analysis sends supplied identifiers or
coordinates to Ensembl or the explicitly selected annotation service.

| Parameter                                               | Meaning                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `variant` / `variants`                                  | One string or an array; use one input source. Supports rsID, HGVS, VCF-style coordinates, and `chrom:start-end:DEL`, `DUP` or `CNV`. |
| `assembly`                                              | `hg38` (default), `hg19`, or validated `hg19tohg38` coordinate liftover.                                                             |
| `vepOptions`, `recoderOptions`                          | Upstream query option objects.                                                                                                       |
| `output`                                                | `JSON` (default), `SCHEMA`, `CSV`, `TSV`, or `VCF`.                                                                                  |
| `filter`                                                | JSON-encoded filter string, matching CLI `--filter` syntax.                                                                          |
| `pickOutput`                                            | Selected transcript output; combine with `vepOptions: { flag_pick: '1' }`.                                                           |
| `scoringConfig`                                         | Parsed in-memory scoring configuration.                                                                                              |
| `scoringConfigPath`                                     | Node-only scoring directory; use `scoringConfig` in browsers.                                                                        |
| `features`                                              | Prepared interval trees and gene sets from `buildFeatures`.                                                                          |
| `pedigreeData`, `calculateInheritance`, `sampleMap`     | Parsed pedigree Map, inference switch, and optional `{ index, mother, father }` sample IDs. Requires VCF sample genotypes.           |
| `vcfInput`, `vcfRecordMap`, `vcfHeaderLines`, `samples` | Parsed VCF context. `vcfInput: true` does not read a file.                                                                           |
| `cache`                                                 | Request caching; memory works in browsers, persistent storage requires Node.                                                         |
| `requestOptions`                                        | Endpoint, budgets, cancellation and POST concurrency.                                                                                |
| `proxyConfig`                                           | Node proxy `{ host, port, protocol, auth?: { username, password } }`.                                                                |
| `spreadsheetSafe`                                       | Protect CSV/TSV text cells for spreadsheet import.                                                                                   |
| `columnConfig`                                          | Explicit ordered CSV/TSV column definitions.                                                                                         |

## Return values and failures

`JSON` returns an object with `annotationData` and `meta`, plus optional Recoder,
VCF and pedigree context. `SCHEMA` returns a validated JSON-LD Dataset object.
`CSV`, `TSV` and `VCF` return formatted strings. Serialize object outputs with
`JSON.stringify`. `isStreaming` is an internal CLI formatting contract, not an
async iterator API.

Handle rejected promises **and** batch records containing `error`. A batch can
retain usable results alongside failed inputs. Missing upstream annotations are
explicit error records. For liftover, inspect `meta.liftoverMeta` for unsuccessful
inputs; no successful mappings causes an exception. A resolved request does not
prove every requested variant was annotated.

```javascript
const result = await VariantLinker.analyzeVariant({ variants, output: 'JSON' });
const failures = result.annotationData.filter((annotation) => annotation.error);
if (failures.length) console.error(failures);
```

## Budgets, cancellation and concurrency

```javascript
const controller = new AbortController();
const pending = VariantLinker.analyzeVariant({
  variants: ['rs6025', 'rs1799963'],
  assembly: 'hg19',
  requestOptions: {
    timeoutMs: 60000,
    deadlineMs: 120000,
    maxRetries: 2,
    postConcurrency: 1,
    signal: controller.signal,
  },
});
// A Cancel button can call controller.abort().
const result = await pending;
```

`timeoutMs` bounds one HTTP attempt (default 60,000 ms). `deadlineMs` bounds one
fetch including cache access, retries and backoff (default 120,000 ms), not an
entire multi-request analysis. Use an AbortController for an application-wide
limit. `maxResponseBytes` defaults to 50 MiB and `maxRetryDelayMs` to 10,000 ms;
the latter caps client backoff, not server `Retry-After`. `postConcurrency` accepts
`1` (default) or `2`. Two workers preserve input ordering but can increase rate-limit
pressure. Per-call snapshots allow concurrent analyses of different assemblies.

## VCF and enrichment

Pass `parseVcfText(text).variantsToProcess` as `variants`, with `vcfInput: true`.
Supply its `vcfRecordMap`, `headerLines` as `vcfHeaderLines`, and `samples` for source
preservation and genotype analysis. Use `parsePedigreeText` and
`calculateInheritance: true` for inheritance. Compound heterozygosity needs the
whole cohort; independent chunks are not equivalent.

Use `parseBedText`, `parseGeneListText`, `parseJsonGenesData` and `buildFeatures`
for custom annotations. `scoring.parseScoringConfig(variablesJson, formulasJson)`
accepts parsed configuration objects. Restricted scoring expressions run before
inheritance and feature enrichment. The [complete example](../guide/browser-and-package.md#vcf-pedigree-features-and-scoring)
combines these operations.

## Public helpers

| Export                                                                               | Purpose                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `variantRecoder(variant, options, cacheEnabled, proxyConfig, requestOptions)`        | GET Recoder for one identifier; returns upstream object array.          |
| `variantRecoderPost(variants, options, cacheEnabled, proxyConfig, requestOptions)`   | Ordered bounded POST Recoder batches; supports `options.species`.       |
| `vepRegionsAnnotation(variants, options, cacheEnabled, proxyConfig, requestOptions)` | Ordered POST VEP batches of Ensembl-compatible coordinate lines.        |
| `detectInputFormat`, `convertVcfToEnsemblFormat`                                     | Input classification and coordinate conversion.                         |
| `parseVcfText`, `parsePedigreeText`                                                  | Synchronous in-memory VCF/PED parsing.                                  |
| `parseBedText`, `parseGeneListText`, `parseJsonGenesData`, `buildFeatures`           | In-memory custom annotation preparation.                                |
| `formatAnnotationsToVcf`, `annotateOverlaps`, `inheritance`                          | Standalone VCF formatting, feature annotation and inheritance helpers.  |
| `readVariantsFromVcf`, `iterateVcfRecords`, `readPedigree`, `loadFeatures`           | Node-only filesystem helpers.                                           |
| `scoring`                                                                            | Configuration parsing, Node file loading and scoring helpers.           |
| `filterAndFormatResults`, `jsonApiFilter`, `schemaMapper`                            | Filtering, serialization and JSON-LD mapping.                           |
| `apiHelper`, `configHelper`, `cache`                                                 | Transport, configuration and cache helpers.                             |
| `processVariantLinking`, `outputResults`                                             | Lower-level processing/output helpers; filesystem output requires Node. |

Use `analyzeVariant` for the full pipeline. A standalone helper does not implicitly
perform all other processing steps; consult its documented argument shape when
composing a custom pipeline.

## Cache lifecycle

`cache: true` uses keys covering method, endpoint, parameters, assembly and body.
`cache.getCacheStats()` reports memory usage;
`await cache.getComprehensiveCacheStats()` includes configured persistent storage.
Use `await cache.clearCacheAsync()` when completion matters. Synchronous
`getCache` checks memory only. Browser analysis does not supply IndexedDB or disk
storage. See [cache configuration](../CACHE.md), [proxy configuration](../guides/proxy-configuration.md),
and [reliable processing](../guide/reliable-processing.md).
