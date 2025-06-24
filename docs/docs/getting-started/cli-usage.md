# CLI Usage

Variant-Linker provides a comprehensive command-line interface for genetic variant annotation. This guide covers all the available options and usage patterns.

> **Note**: If you're interested in using Variant-Linker as a JavaScript library in your Node.js applications, see the [API Usage Guide](api-usage.md) for programmatic integration options.

## Basic Usage

### Single Variant Analysis

```bash
# Process a single variant
variant-linker --variant <variant_input> --output <output_format> [--debug]

# Examples
variant-linker --variant "rs6025" --output JSON
variant-linker --variant "ENST00000366667:c.803C>T" --output CSV
variant-linker --variant "9 130716739 . G GT" --output TSV
```

### Batch Processing

```bash
# Process multiple variants from a file (one per line)
variant-linker --variants-file <file_path> --output <output_format>

# Process multiple variants as a comma-separated list
variant-linker --variants <variant1,variant2,variant3> --output <output_format>

# Process variants from a VCF file
variant-linker --vcf-input <vcf_file_path> --output <output_format>
```

## Command-Line Options

### Input Options

| Option | Short | Description |
|--------|-------|-------------|
| `--variant` | `-v` | Specify a single genetic variant to be analyzed |
| `--variants-file` | `-vf` | Path to a file containing variants (one per line) |
| `--variants` | `-vs` | Comma-separated list of variants |
| `--vcf-input` | `-vi` | Path to a VCF file containing variants |

### Output Options

| Option | Short | Description |
|--------|-------|-------------|
| `--output` | `-o` | Output format: JSON, CSV, TSV, VCF (default: JSON) |
| `--save` | `-s` | Filename to save results (prints to console if not specified) |

### API Parameters

| Option | Short | Description |
|--------|-------|-------------|
| `--vep_params` | `--vp` | VEP annotation parameters in key=value format, comma-separated (default: "CADD=1") |
| `--recoder_params` | `--rp` | Variant Recoder parameters in key=value format, comma-separated (default: "vcf_string=1") |

### Family Analysis Options

| Option | Short | Description |
|--------|-------|-------------|
| `--ped` | `-p` | Path to PED file defining family structure |
| `--calculate-inheritance` | `-ci` | Enable inheritance pattern analysis |
| `--sample-map` | `-sm` | Comma-separated sample IDs for Index, Mother, Father |

### Scoring Options

| Option | Short | Description |
|--------|-------|-------------|
| `--scoring_config_path` | `--scp` | Path to the scoring configuration directory |

### Custom Annotation Options

| Option | Short | Description |
|--------|-------|-------------|
| `--bed-file` | `--bf` | Path to BED file(s) containing genomic regions. Can be used multiple times |
| `--gene-list` | `--gl` | Path to text file(s) with gene symbols/IDs (one per line). Can be used multiple times |
| `--json-genes` | `--jg` | Path to JSON file(s) containing gene information. Can be used multiple times |
| `--json-gene-mapping` | | JSON string to map fields in JSON gene files (required with --json-genes) |

### Configuration Options

| Option | Short | Description |
|--------|-------|-------------|
| `--config` | `-c` | Path to JSON configuration file |
| `--debug` | `-d` | Enable debug mode for detailed logging |

## Configuration File Usage

Variant-Linker accepts JSON configuration files to specify parameters. Command-line parameters override configuration file settings.

### Example Configuration File

Create a file named `config.json`:

```json
{
  "variant": "ENST00000366667:c.803C>T",
  "output": "JSON",
  "save": "output/example_output.json",
  "debug": 3,
  "scoring_config_path": "scoring/meta_score/"
}
```

Use it with:

```bash
variant-linker --config config.json
```

## Output Formats

### JSON Output
Default format providing complete annotation data:

```bash
variant-linker --variant "rs6025" --output JSON
```

### CSV/TSV Output
Tabular format with "flatten by consequence" strategy:

```bash
variant-linker --variant "rs6025" --output CSV
variant-linker --variant "rs6025" --output TSV
```

### VCF Output
Annotated VCF format with `VL_CSQ` INFO field:

```bash
# VCF output from VCF input (preserves original headers)
variant-linker --vcf-input sample.vcf --output VCF

# VCF output from non-VCF input (generates standard headers)
variant-linker --variant "rs6025" --output VCF --save annotated_rs6025.vcf
```

## Advanced Usage Examples

### Family-Based Analysis

```bash
# Using PED file for family structure
variant-linker --vcf-input family.vcf --ped family.ped --calculate-inheritance --output VCF

# Using manual trio mapping
variant-linker --vcf-input trio.vcf --sample-map "PROBAND,MOTHER,FATHER" --calculate-inheritance
```

### Custom Scoring

```bash
# Apply custom scoring configuration
variant-linker --variants-file variants.txt --scoring_config_path scoring/nephro_variant_score/ --output CSV
```

### Custom Annotation with Local Files

```bash
# Annotate with genomic regions from BED files
variant-linker --variant "rs6025" --bed-file regulatory_regions.bed --output CSV

# Filter by gene lists
variant-linker --vcf-input variants.vcf --gene-list cancer_genes.txt --output JSON

# Add structured gene metadata from JSON
variant-linker --variants-file batch.txt \
  --json-genes gene_panels.json \
  --json-gene-mapping '{"identifier":"gene_symbol","dataFields":["panel","classification"]}' \
  --output TSV

# Combine multiple file types
variant-linker --vcf-input sample.vcf \
  --bed-file enhancers.bed \
  --gene-list disease_genes.txt \
  --json-genes clinical_data.json \
  --json-gene-mapping '{"identifier":"gene","dataFields":["pathogenicity","evidence"]}' \
  --output VCF
```

### API Parameter Customization

```bash
# Custom VEP parameters
variant-linker --variant "rs6025" --vep_params "CADD=1,SIFT=1,PolyPhen=1" --output JSON

# Custom Recoder parameters
variant-linker --variant "rs6025" --recoder_params "vcf_string=1,species=homo_sapiens" --output JSON
```

### Debug Mode

Enable different levels of debugging:

```bash
# Basic debug information
variant-linker --variant "rs6025" --debug 1

# Detailed API calls and processing
variant-linker --variant "rs6025" --debug 2

# All debug output including data dumps
variant-linker --variant "rs6025" --debug 3
```

### Batch Processing with Saving

```bash
# Process batch and save to file
variant-linker --variants-file large_batch.txt --output CSV --save results.csv

# Process VCF and save annotated VCF
variant-linker --vcf-input input.vcf --output VCF --save annotated.vcf
```

## Performance Considerations

### Batch Size Optimization
- Single variants: No chunking needed
- Small batches (< 200 variants): Processed in single API calls
- Large batches (> 200 variants): Automatically chunked for optimal performance

### Assembly Selection
Variant-Linker automatically detects the appropriate genome assembly (GRCh37/GRCh38) based on variant coordinates, but you can specify assembly-specific endpoints if needed.

### Retry and Rate Limiting
The tool automatically handles API rate limits and temporary failures with exponential backoff retry logic.

## Next Steps

- Learn about [VCF and PED file handling](../guides/vcf-and-ped-files.md)
- Explore [inheritance analysis features](../guides/inheritance-analysis.md)  
- Set up [custom scoring](../guides/scoring-engine.md)
- Add [custom annotations with local files](../guides/custom-annotations.md)