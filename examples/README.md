# Variant-Linker Examples

This directory contains example files to help you get started with variant-linker.

## Sample Files

- `sample_variants.txt`: A collection of variants in different formats (rsIDs, HGVS notations, and VCF format) to test batch processing capabilities.

## Running Batch Processing

You can use the sample variants file with the `--variants-file` option:

```bash
# Process all variants in the file
variant-linker --variants-file examples/sample_variants.txt --output JSON --save batch_results.json
```

## Other Batch Processing Methods

### Using comma-separated list of variants:

```bash
variant-linker --variants "rs56116432,ENST00000366667:c.803C>T,1-65568-A-C" --output JSON
```

### Using a configuration file:

Create a JSON configuration file like this:

```json
{
  "variants": ["rs56116432", "ENST00000366667:c.803C>T", "1-65568-A-C"],
  "output": "JSON",
  "save": "batch_results.json",
  "scoring_config_path": "scoring/meta_score_example/"
}
```

Then run:

```bash
variant-linker --config batch_config.json
```
