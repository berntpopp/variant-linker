# Variant-Linker

[![CI](https://github.com/berntpopp/variant-linker/actions/workflows/ci.yml/badge.svg)](https://github.com/berntpopp/variant-linker/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/variant-linker.svg)](https://www.npmjs.com/package/variant-linker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI and JavaScript library for genetic variant annotation using Ensembl APIs,
with Node.js and browser integrations.

## 📚 **[Complete Documentation →](https://berntpopp.github.io/variant-linker/)**

Start with the [CLI reference](docs/getting-started/cli-usage.md),
[JavaScript API](docs/getting-started/api-usage.md), or
[browser/package capability guide](docs/guide/browser-and-package.md). The latter
includes website bundle setup and in-memory VCF, pedigree, feature and scoring
examples, with the Node-only filesystem features identified explicitly.

## Quick Start

### Installation

Requires Node.js 22.14 or later. Install the CLI with
`npm install --global variant-linker`, or the library with `npm install variant-linker`.
The APIs documented in this checkout target 4.0.0; until that release is published,
build this checkout to use the new in-memory parsers and browser helpers.
For development from source:

```bash
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker
npm ci
npm link  # Optional: for global CLI access
```

#### Windows Installation Issues

If the `variant-linker` command isn't recognized on Windows PowerShell:

**Option 1: Use npx (recommended)**

```powershell
npx variant-linker --help
```

**Option 2: Reinstall globally**

```powershell
npm uninstall -g variant-linker
npm install -g variant-linker
```

### Basic Usage

```bash
# Analyze a single variant
variant-linker --variant "rs6025" --output JSON

# Analyze a copy number variant (CNV)
variant-linker --variant "7:117559600-117559609:DEL" --output JSON

# Process VCF file with inheritance analysis
variant-linker --vcf-input sample.vcf --ped family.ped --calculate-inheritance --output VCF

# Liftover hg19 coordinates to hg38 for annotation
variant-linker --assembly hg19tohg38 --variant "chr17-7578406-C-A" --output JSON

# Batch processing with custom scoring
variant-linker --variants-file variants.txt --scoring_config_path scoring/nephro_variant_score/ --output CSV

# Use HTTP proxy for API requests
variant-linker --variant "rs6025" --proxy http://proxy.company.com:8080 --output JSON

# Use authenticated proxy
variant-linker --variant "rs6025" --proxy http://user:pass@proxy.company.com:8080 --output JSON
```

## Key Features

- 🔄 **Variant Translation** - Convert between rsID, HGVS, VCF, and CNV formats
- 📊 **VEP Annotations** - Comprehensive variant effect predictions including CNV-specific annotations
- 🧬 **Genome Assembly Liftover** - Transparent hg19→hg38 coordinate conversion
- 👨‍👩‍👧‍👦 **Family Analysis** - Inheritance pattern detection from PED files
- 🗂️ **VCF Support** - Full VCF input/output with header preservation
- ⚡ **Batch Processing** - Efficient handling of large variant datasets
- 🌊 **Streaming Support** - Memory-efficient stdin processing for pipeline integration
- 🎯 **Custom Scoring** - Configurable variant prioritization models
- 📋 **Multiple Formats** - JSON, validated SCHEMA JSON-LD, CSV, TSV, and VCF output options
- 🎨 **Custom Annotations** - Overlay variants with BED regions, gene lists, and JSON metadata

## Library Usage

Use Variant-Linker as a library in your Node.js projects:

```javascript
const { analyzeVariant } = require('variant-linker');

async function main() {
  const result = await analyzeVariant({
    variants: ['rs6025', 'rs1799963'],
    vepOptions: { CADD: '1', hgvs: '1' },
    requestOptions: { timeoutMs: 60000, postConcurrency: 1 },
    output: 'JSON',
  });
  console.log(result);
}
main().catch(console.error);
```

ESM applications can use `import VariantLinker from 'variant-linker'`. Websites
can serve `dist/variant-linker.bundle.js`, which exposes `globalThis.VariantLinker`.
Public in-memory parsers include `parseVcfText`, `parsePedigreeText`,
`parseBedText`, `parseGeneListText`, `parseJsonGenesData`, and `buildFeatures`.
See the [integration guide](docs/guide/browser-and-package.md) for full examples.

Annotation sends the supplied variant identifiers/coordinates to Ensembl or an
explicitly configured compatible service. Handle rejected promises and per-input
error records; usable output can accompany failed inputs. Operational defaults
live in the [documented JSON configuration files](docs/guide/browser-and-package.md#configuration-and-environment-boundaries).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

```bash
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker
npm ci
npm --prefix docs ci
npm run verify
```

See our [Contributing Guide](https://berntpopp.github.io/variant-linker/contributing) for detailed information.

Use Node.js >=22.14. `npm run verify` runs the local and CI gates, including strict
lint/types/formatting, files below 650 lines, offline tests and >=81% coverage.
[AGENTS.md](AGENTS.md) defines the shared agent development contract.

For large VCFs, use `--stream --chunk-size 100`; inheritance requires full-file mode.
JSON/SCHEMA streams emit one compact JSON document per chunk. `--spreadsheet-safe`
protects CSV/TSV text cells for spreadsheet import. Scoring formulas and conditions use a **restricted expression language** with
explicitly allowed operators and functions; arbitrary JavaScript is rejected.
See [reliable processing](docs/guide/reliable-processing.md) for output, cache,
liftover, benchmark and failure semantics.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgements

This tool utilizes the Ensembl Variant Recoder and Variant Effect Predictor APIs, provided by the Ensembl project.
