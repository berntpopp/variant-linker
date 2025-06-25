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

# Copy Number Variants (CNVs)
variant-linker --variant "7:117559600-117559609:DEL" --output JSON
variant-linker --variant "1:1000-5000:DUP" --output CSV
variant-linker --variant "chr22:10000-20000:CNV" --output TSV
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

### Streaming from stdin

For pipeline integration and large datasets, Variant-Linker supports streaming input from stdin:

```bash
# Basic streaming
cat variants.txt | variant-linker --output TSV

# Stream and filter high-impact variants
cat variants.txt | variant-linker --output TSV | grep 'HIGH'

# Use in complex pipelines
bcftools query -f '%CHROM-%POS-%REF-%ALT\n' input.vcf | \
  variant-linker --output CSV --chunk-size 50 > annotated.csv

# Stream with custom API options
echo "1-65568-A-C" | variant-linker --output TSV --vep_params "CADD=1,hgvs=1"
```

**Streaming Features:**
- Automatic detection when no input files are specified and stdin is available
- Memory-efficient chunked processing (default: 100 variants per API call)
- Incremental output with header printed once
- Compatible with TSV, CSV, and JSON output formats
- Configurable chunk size via `--chunk-size` option

## Copy Number Variant (CNV) Support

Variant-Linker supports structural variants including copy number variants (CNVs) using a specialized format for regions annotation.

### CNV Input Format

CNVs use the format: `chr:start-end:TYPE` where:
- **chr**: Chromosome (1-22, X, Y, M)
- **start**: Start coordinate (1-based)
- **end**: End coordinate (1-based, inclusive)
- **TYPE**: Variant type (DEL, DUP, CNV, INS, INV, or custom types)

### Supported CNV Types

| Type | Description | VEP Format |
|------|-------------|------------|
| `DEL` | Deletion | `deletion` |
| `DUP` | Duplication | `duplication` |
| `CNV` | Generic copy number variant | `CNV` |
| `INS` | Insertion | `CNV` (default) |
| `INV` | Inversion | `CNV` (default) |

### CNV Examples

```bash
# Single CNV analysis
variant-linker --variant "7:117559600-117559609:DEL" --output JSON

# CNV with phenotype and dosage sensitivity data
variant-linker --variant "1:1000-5000:DUP" --vep_params "Phenotypes=1,numbers=1" --output CSV

# Mixed batch with SNVs and CNVs
echo -e "rs6025\n7:117559600-117559609:DEL\n1:1000-5000:DUP" | variant-linker --output TSV

# CNV with custom scoring
variant-linker --variant "22:10000-20000:CNV" --scoring_config_path scoring/cnv_score_example/ --output JSON
```

### CNV-Specific Output Fields

When processing CNVs, additional columns are automatically included in CSV/TSV output:

| Column | Description |
|--------|-------------|
| `BP_Overlap` | Base pairs overlapping with features |
| `Percentage_Overlap` | Percentage of feature overlap |
| `Phenotypes` | Associated phenotypes from databases |
| `DosageSensitivity` | Gene dosage sensitivity scores |

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
| `--chunk-size` | `-cs` | Number of variants to process per API batch in streaming mode (default: 100) |

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

## Streaming Considerations

When using streaming mode with stdin input, keep these considerations in mind:

### Output Format Recommendations
- **TSV/CSV**: Optimal for streaming pipelines due to incremental output and easy parsing
- **JSON**: Works but outputs complete JSON objects, less ideal for line-by-line processing

### Performance Tuning
- **Chunk Size**: Adjust `--chunk-size` based on your use case:
  - Smaller chunks (10-50): Better for real-time processing and faster initial output
  - Larger chunks (100-200): Better throughput for batch processing
  - Default 100 provides a good balance for most use cases

### Limitations in Streaming Mode
- File output options (`--save`, `--output-file`) are disabled in streaming mode
- Use shell redirection instead: `cat input.txt | variant-linker --output TSV > output.tsv`
- VCF output in streaming mode has limited header preservation capabilities

### Pipeline Integration
Streaming mode is designed for Unix-style pipeline integration:

```bash
# Extract variants from VCF and annotate
bcftools query -f '%CHROM-%POS-%REF-%ALT\n' input.vcf | \
  variant-linker --output TSV | \
  awk '$6=="HIGH"' > high_impact.tsv

# Process large datasets in memory-efficient manner
gunzip -c huge_variants.txt.gz | \
  variant-linker --output CSV --chunk-size 50 | \
  grep "protein_coding" > coding_variants.csv
```

## Next Steps

- Learn about [VCF and PED file handling](../guides/vcf-and-ped-files.md)
- Explore [inheritance analysis features](../guides/inheritance-analysis.md)  
- Set up [custom scoring](../guides/scoring-engine.md)
- Add [custom annotations with local files](../guides/custom-annotations.md)