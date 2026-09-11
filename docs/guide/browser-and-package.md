# Browser and package integration

Variant-Linker provides a CLI, a CommonJS npm package, and a browser UMD bundle.
The same `analyzeVariant` pipeline supports annotation, scoring, filtering,
inheritance and custom features when supplied with the corresponding data.

This guide describes the 4.0.0 API. Use `npm install variant-linker@4.0.0` after
that release is published, or build this checkout while validating the release.
Earlier npm releases do not include all the in-memory helpers below.

## Capability matrix

| Capability                                | CLI                                                | Node package                                     | Browser                                                |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| rsID, HGVS, coordinate and CNV annotation | `--variant`, `--variants`, files/stdin             | `analyzeVariant`                                 | `analyzeVariant`                                       |
| Variant Recoder only                      | Integrated during identifier analysis              | `variantRecoder`, `variantRecoderPost`           | Same helpers                                           |
| VEP only                                  | Coordinate/VCF input bypasses Recoder              | `vepRegionsAnnotation`, or parsed VCF analysis   | Same helpers                                           |
| GRCh37/GRCh38 and validated liftover      | `--assembly`                                       | `assembly` option                                | Same option                                            |
| VCF parsing and source preservation       | `--vcf-input`                                      | `readVariantsFromVcf` or `parseVcfText`          | `File.text()` then `parseVcfText`                      |
| Bounded VCF file streaming                | `--stream --chunk-size`                            | `iterateVcfRecords`                              | Text parser materializes input; no filesystem iterator |
| PED/trio inheritance                      | `--ped`, `--calculate-inheritance`, `--sample-map` | Parsed VCF plus `pedigreeData`/`sampleMap`       | Same in-memory inputs                                  |
| BED, gene-list, JSON gene enrichment      | `--bed-file`, `--gene-list`, `--json-genes`        | `loadFeatures` or pure parsers + `buildFeatures` | Pure parsers + `buildFeatures`                         |
| Configurable scoring                      | `--scoring_config_path`                            | `scoringConfig` or Node directory                | Parsed `scoringConfig` objects                         |
| Filtering and picked transcripts          | `--filter`, `--pick-output`                        | `filter`, `pickOutput`                           | Same options                                           |
| JSON, SCHEMA, CSV, TSV, VCF               | `--output`                                         | `output` object/string result                    | Same result; render or download a Blob                 |
| Spreadsheet-safe cells                    | `--spreadsheet-safe`                               | `spreadsheetSafe`                                | Same option                                            |
| Request budgets/concurrency               | CLI flags and JSON config                          | `requestOptions`                                 | Same options                                           |
| Cancellation                              | Process termination                                | `requestOptions.signal`                          | AbortController, e.g. Cancel button                    |
| Memory request cache                      | `--cache`                                          | `cache: true`                                    | `cache: true`                                          |
| Persistent cache                          | Node configuration                                 | Node filesystem backend                          | Unavailable; no IndexedDB adapter                      |
| HTTP proxy                                | Flags or environment                               | `proxyConfig` or environment                     | Deployment/CORS routing, not Node proxy settings       |
| Filesystem output                         | `--output-file`, `--save`                          | Node output helpers                              | Application-controlled Blob download                   |

The [CLI reference](../getting-started/cli-usage.md) lists every command option;
the [API reference](../getting-started/api-usage.md) describes return values and
transport options. The documentation website explains these integrations; it is
not itself an annotation submission application.

## Importing the package

```javascript
// Node CommonJS
const VariantLinker = require('variant-linker');
```

```javascript
// Node ESM or a bundler configured for CommonJS dependencies
import VariantLinker from 'variant-linker';

const result = await VariantLinker.analyzeVariant({
  variant: 'rs6025',
  output: 'JSON',
});
```

The npm entry is CommonJS, not a native browser ESM module. A browser bundler must
handle CommonJS and exclude Node-only modules. The repository's webpack setup
uses `fs`, `crypto`, `os` and `readline` fallbacks set to `false`, and
`path-browserify` for `path`. Reuse that configuration when building from source,
or use the ready-made UMD bundle to avoid application bundler differences.

Copy `node_modules/variant-linker/dist/variant-linker.bundle.js` to your site's
static assets, then load it before your application:

```html
<script src="/vendor/variant-linker.bundle.js"></script>
<script type="module">
  const { analyzeVariant } = globalThis.VariantLinker;
  // Call analyzeVariant from an explicit application action.
</script>
```

A source checkout produces the same artifact with `npm ci` and `npm run build`.
Pin your npm dependency and serve the built asset with your application. Network
annotation still requires a reachable endpoint and browser CORS permission.
An application backend can provide an explicitly configured compatible endpoint;
do not embed server credentials in browser JavaScript.

## VCF, pedigree, features and scoring

The following function works in Node or a browser. Its arguments are text and
parsed JSON supplied by the application. In a browser, obtain selected file text
with `await file.text()`; this reads the whole selected file into memory. In Node,
use filesystem readers or the iterator for large VCFs.

```javascript
async function annotateFamily(VariantLinker, input, signal) {
  const parsed = VariantLinker.parseVcfText(input.vcfText);
  const pedigreeData = VariantLinker.parsePedigreeText(input.pedText);
  const features = VariantLinker.buildFeatures({
    beds: [{ source: 'regions.bed', regions: VariantLinker.parseBedText(input.bedText) }],
    geneLists: [
      {
        source: 'panel.txt',
        genes: VariantLinker.parseGeneListText(input.geneListText, 'panel.txt'),
      },
    ],
    jsonGenes: [
      {
        source: 'genes.json',
        genes: VariantLinker.parseJsonGenesData(
          input.geneJson,
          { identifier: 'gene_symbol', dataFields: ['panel_name'] },
          'genes.json'
        ),
      },
    ],
  });
  const scoringConfig = VariantLinker.scoring.parseScoringConfig(
    { variables: { 'transcript_consequences.*.cadd_phred': 'max:cadd|default:0' } },
    { formulas: { annotationLevel: [{ priority: 'cadd' }] } }
  );
  return VariantLinker.analyzeVariant({
    variants: parsed.variantsToProcess,
    vcfInput: true,
    vcfRecordMap: parsed.vcfRecordMap,
    vcfHeaderLines: parsed.headerLines,
    samples: parsed.samples,
    pedigreeData,
    calculateInheritance: true,
    features,
    scoringConfig,
    assembly: 'hg38', // Match the assembly of the supplied VCF and feature data.
    vepOptions: { CADD: '1', hgvs: '1', mane: '1' },
    requestOptions: { signal, timeoutMs: 60000, deadlineMs: 120000 },
    output: 'JSON',
  });
}
```

For a browser's selected files, call it from a submit handler:

```javascript
const controller = new AbortController();
const result = await annotateFamily(
  globalThis.VariantLinker,
  {
    vcfText: await vcfFile.text(),
    pedText: await pedFile.text(),
    bedText: await bedFile.text(),
    geneListText: await geneListFile.text(),
    geneJson: JSON.parse(await geneJsonFile.text()),
  },
  controller.signal
);
// Connect a Cancel button to controller.abort().
```

`parseVcfText` returns `{ variantsToProcess, vcfRecordMap, headerText, headerLines,
samples }`. `parsePedigreeText` returns a Map. BED input uses zero-based half-open
coordinates; `buildFeatures` converts regions into one-based closed intervals
for annotation matching. Gene parsers preserve source metadata. Parsing itself
makes no annotation requests. The application chooses when to submit analysis.

All feature collections are optional; omit unused inputs. Inheritance needs VCF
genotypes and matching pedigree/sample IDs, and compound heterozygosity requires
the whole cohort. Scoring runs before inheritance and feature enrichment, so its
expressions should use acquired annotation fields rather than later additions.
The illustrative `priority` above copies CADD with a zero fallback; it is not a
validated clinical classification model.

## Results, filtering and downloads

`JSON` and `SCHEMA` return objects; `CSV`, `TSV`, and `VCF` return strings.
Select the desired format in the analysis call. VCF output preserves source
fields when parsed VCF context is supplied. Filters use field/operator objects:

```javascript
const filter = JSON.stringify({
  'transcript_consequences.*.impact': { eq: 'HIGH' },
});
```

Supported operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` and `nin`.
Use `pickOutput: true` with `vepOptions: { flag_pick: '1' }` for picked transcripts.
For CSV/TSV spreadsheet downloads, pass `spreadsheetSafe: true`.

A browser can serialize JSON into a Blob without calling Node output helpers:

```javascript
const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'annotations.json';
link.click();
setTimeout(() => URL.revokeObjectURL(url), 0);
```

Handle rejected promises and inspect `annotationData` for per-input `error`
records. Liftover failures appear in `meta.liftoverMeta`. Display partial results
as partial; do not infer completion from the presence of output. Request deadlines
apply per fetch, so cancellation is useful for an application-wide time limit.
See [reliable processing](reliable-processing.md) for exact preservation, failure,
streaming and cache semantics.

## Configuration and environment boundaries

| Configuration file            | Tunable defaults                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `config/cliDefaults.json`     | CLI output/assembly/chunk size and default Recoder/VEP options.                                           |
| `config/apiConfig.json`       | Endpoints, POST sizes, request budgets, concurrency/pacing, retry policy, cache tiers and proxy defaults. |
| `config/benchmarkConfig.json` | Benchmark scenarios, process limits and reproducible public dataset acquisition defaults.                 |
| `config/scoringLimits.json`   | Expression source/AST/evaluation/collection budgets and bounded expression/warning caches.                |

Use CLI flags/`--config` and package `requestOptions` or `scoringConfig` for exposed
runtime overrides. Not every repository default is a per-call option. JSON
configuration imported by modules is loaded when Node starts and embedded when
the browser bundle is built; restart Node or rebuild the bundle after changing
these files. Validate deployment settings before shipping them.

Positive finite budgets, allowed input syntax, safe expression methods,
prototype protection and ownership checks are security/protocol invariants.
They remain enforced even when operational limits are configured. Browser
filesystem readers, directory-based scoring, disk caches and environment proxy
settings are unavailable; supply in-memory data and deployment routing instead.
