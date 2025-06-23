# Introduction

Welcome to Variant-Linker, a powerful command-line interface (CLI) tool and JavaScript library for genetic variant annotation.

## What is Variant-Linker?

Variant-Linker is designed to facilitate the retrieval of genetic variant annotations by integrating with Ensembl's Variant Recoder and Variant Effect Predictor (VEP) REST APIs. It provides a streamlined process for obtaining detailed annotations for genetic variants.

In addition to its CLI capabilities, Variant-Linker features a modular architecture that allows its core functionalities to be easily imported and used as an API within other Node.js projects.

## Key Features

- **🔄 Variant Translation**: Converts genetic variant inputs into various formats to all possible variant IDs and HGVS notations
- **📊 VEP Annotations**: Retrieves detailed variant annotations from the VEP API
- **🔍 Filtering**: Filters VEP annotations based on transcript specifications
- **🧩 Modular Design**: Structured to facilitate reuse of core functionalities as a library in other projects
- **🚀 Extensibility**: Prepared for future extensions to include local installations of VEP and Variant Recoder
- **📋 Output Customization**: Users can specify the output format (JSON, CSV, TSV, VCF) with configurable field selection
- **📈 Tabular Data Export**: Provides CSV and TSV output with a "flatten by consequence" strategy for comprehensive variant analysis
- **👨‍👩‍👧‍👦 PED File Support**: Reads standard 6-column PED files to extract family structure and affected status information for inheritance analysis
- **🧬 Inheritance Pattern Analysis**: Automatically deduces potential inheritance patterns (de novo, autosomal dominant/recessive, X-linked) from multi-sample VCF files and family structure information
- **🗂️ VCF Handling**: Supports standard VCF file input and generation of annotated VCF output, preserving original headers and adding annotations to the INFO field
- **⚡ Batch Request Chunking**: Automatically splits large batches of variants into smaller chunks for API requests, ensuring compliance with Ensembl limits and efficient processing
- **🔄 Exponential Backoff Retry**: Implements automatic retry with exponential backoff for transient API errors, improving reliability when Ensembl services experience temporary issues
- **⚙️ Configuration File Support**: Allows users to provide parameters through a structured configuration file

## Quick Start

Get started with Variant-Linker in just a few commands:

```bash
# Install dependencies
npm install

# Analyze a single variant
node src/main.js --variant "rs6025" --output JSON

# Process a VCF file with inheritance analysis
node src/main.js --vcf-input sample.vcf --ped family.ped --calculate-inheritance --output VCF
```

## Use Cases

Variant-Linker is perfect for:

- **Clinical Genetics**: Annotating variants from clinical sequencing data
- **Research**: Batch processing of variants for population studies
- **Pipeline Integration**: As a library component in larger bioinformatics workflows
- **Family Studies**: Inheritance pattern analysis in family-based genetic studies
- **Variant Prioritization**: Scoring and ranking variants based on custom criteria

Ready to get started? Check out our [Installation Guide](./getting-started/installation.md) to begin using Variant-Linker in your projects.