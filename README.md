# Variant-Linker

[![CI](https://github.com/berntpopp/variant-linker/workflows/CI/badge.svg)](https://github.com/berntpopp/variant-linker/actions)
[![npm version](https://img.shields.io/npm/v/variant-linker.svg)](https://www.npmjs.com/package/variant-linker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful CLI tool and JavaScript library for genetic variant annotation using Ensembl APIs.

## 📚 **[Complete Documentation →](https://berntpopp.github.io/variant-linker/)**

## Quick Start

### Installation
```bash
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker
npm install
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
- 📋 **Multiple Formats** - JSON, CSV, TSV, and VCF output options
- 🎨 **Custom Annotations** - Overlay variants with BED regions, gene lists, and JSON metadata

## Library Usage

Use Variant-Linker as a library in your Node.js projects:

```javascript
const { analyzeVariant, variantRecoderPost, vepRegionsAnnotation } = require('variant-linker');

// Analyze a single variant
const result = await analyzeVariant({
  variant: 'rs6025',
  output: 'JSON'
});

// Analyze a copy number variant (CNV)
const cnvResult = await analyzeVariant({
  variant: '7:117559600-117559609:DEL',
  vepOptions: { Phenotypes: '1', numbers: '1' },
  output: 'JSON'
});

// Batch processing with mixed variant types
const batchResult = await analyzeVariant({
  variants: ['rs123', 'ENST00000366667:c.803C>T', '1:1000-5000:DUP'],
  recoderOptions: { vcf_string: '1' },
  vepOptions: { CADD: '1', hgvs: '1' },
  output: 'JSON'
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup
```bash
git clone https://github.com/berntpopp/variant-linker.git
cd variant-linker
npm install
npm test
npm run lint
```

See our [Contributing Guide](https://berntpopp.github.io/variant-linker/contributing) for detailed information.

## License

This project is licensed under the [MIT License](LICENSE.md).

## Acknowledgements

This tool utilizes the Ensembl Variant Recoder and Variant Effect Predictor APIs, provided by the Ensembl project.