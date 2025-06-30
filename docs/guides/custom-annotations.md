# Custom Annotation with Local Files

Variant-Linker supports annotating variants with custom genomic features from your own files. This powerful feature allows you to overlay variants with region-based annotations (BED files), gene lists, or structured gene data (JSON files) to identify clinically relevant overlaps.

## Overview

The custom annotation feature enables you to:

- **Annotate with genomic regions** from BED files (promoters, enhancers, regulatory elements)
- **Filter by gene lists** (cancer genes, disease panels, custom gene sets)
- **Add structured gene metadata** from JSON files (panel information, pathogenicity scores, classifications)
- **Combine multiple file types** for comprehensive annotation
- **Include results in all output formats** (JSON, CSV, TSV, VCF)

All custom annotations appear in the `user_feature_overlap` field (JSON) or `UserFeatureOverlap` column (CSV/TSV).

## Quick Start

```bash
# Annotate with a BED file containing regulatory regions
variant-linker --variant "rs6025" --bed-file regulatory_regions.bed --output CSV

# Filter variants by a cancer gene list
variant-linker --vcf-input variants.vcf --gene-list cancer_genes.txt --output JSON

# Add structured gene panel information
variant-linker --variants-file batch.txt \
  --json-genes gene_panels.json \
  --json-gene-mapping '{"identifier":"gene_symbol","dataFields":["panel","classification"]}' \
  --output TSV
```

## File Formats

### BED Files (`--bed-file` / `-bf`)

BED (Browser Extensible Data) files define genomic regions. Variant-Linker supports standard BED formats:

#### 3-Column BED (Minimal)
```
chr1	1000	2000
chr1	5000	6000
chrX	10000	11000
```

#### 4-Column BED (With Names)
```
chr1	1000	2000	promoter_region_1
chr1	5000	6000	enhancer_region_1
chrX	10000	11000	regulatory_element_1
```

#### 6-Column BED (Full Format)
```
chr1	1000	2000	promoter_BRCA1	800	+
chr1	5000	6000	enhancer_TP53	600	-
chrX	10000	11000	regulatory_AR	900	+
```

**Columns:**
1. **Chromosome** (required): `chr1`, `1`, `chrX`, `X` (chr prefix optional)
2. **Start** (required): 0-based start position
3. **End** (required): 1-based end position  
4. **Name** (optional): Region identifier/description
5. **Score** (optional): Numeric score (0-1000)
6. **Strand** (optional): `+`, `-`, or `.`

**Features:**
- Header lines (`#`, `track`, `browser`) are automatically skipped
- Empty lines and comments are ignored
- Invalid coordinates are skipped with warnings
- Chromosome names are normalized (chr prefix removed)

### Gene List Files (`--gene-list` / `-gl`)

Simple text files with one gene identifier per line:

```
BRCA1
BRCA2
TP53
ATM
CHEK2
PALB2
# This is a comment line
MLH1
MSH2
```

**Supported Identifiers:**
- Gene symbols: `BRCA1`, `TP53`, `MYC`
- Ensembl gene IDs: `ENSG00000012048`, `ENSG00000141510`

**Features:**
- One gene per line
- Comment lines starting with `#` are ignored
- Empty lines are skipped
- Case-sensitive matching
- Multiple files can be specified

### JSON Gene Files (`--json-genes` / `-jg`)

Structured JSON files containing gene information with flexible field mapping:

#### Array Format
```json
[
  {
    "gene_symbol": "BRCA1",
    "panel": "Hereditary Cancer",
    "classification": "High Penetrance",
    "inheritance": "Autosomal Dominant",
    "diseases": ["Breast Cancer", "Ovarian Cancer"]
  },
  {
    "gene_symbol": "BRCA2", 
    "panel": "Hereditary Cancer",
    "classification": "High Penetrance",
    "inheritance": "Autosomal Dominant",
    "diseases": ["Breast Cancer", "Ovarian Cancer", "Pancreatic Cancer"]
  }
]
```

#### Object Format
```json
{
  "BRCA1": {
    "symbol": "BRCA1",
    "panel_name": "Breast_Cancer_Panel",
    "pathogenicity_score": 0.95,
    "clinical_significance": "Pathogenic"
  },
  "TP53": {
    "symbol": "TP53",
    "panel_name": "Tumor_Suppressor_Panel", 
    "pathogenicity_score": 0.98,
    "clinical_significance": "Pathogenic"
  }
}
```

**Required Parameter:** `--json-gene-mapping`

The mapping parameter defines how to extract gene identifiers and additional data:

```bash
# Basic mapping (identifier only)
--json-gene-mapping '{"identifier":"gene_symbol"}'

# Full mapping (identifier + metadata fields)
--json-gene-mapping '{"identifier":"symbol","dataFields":["panel_name","pathogenicity_score","clinical_significance"]}'
```

**Mapping Fields:**
- `identifier` (required): Field containing the gene identifier
- `dataFields` (optional): Array of additional fields to include in output

## CLI Options

### Core Options

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--bed-file` | `-bf` | Array | Path to BED file(s) with genomic regions |
| `--gene-list` | `-gl` | Array | Path to gene list file(s) |
| `--json-genes` | `-jg` | Array | Path to JSON gene file(s) |
| `--json-gene-mapping` | | String | JSON mapping for JSON gene files |

### Usage Notes

- **Multiple Files**: Each option accepts multiple files: `--bed-file file1.bed file2.bed`
- **File Combinations**: Mix and match different file types in a single command
- **Required Mapping**: `--json-gene-mapping` is required when using `--json-genes`
- **Path Resolution**: Supports absolute and relative file paths

## Output Formats

### JSON Output

Custom annotations appear in the `user_feature_overlap` array:

```json
{
  "annotationData": [
    {
      "seq_region_name": "17",
      "start": 43094692,
      "end": 43094692,
      "user_feature_overlap": [
        {
          "type": "region",
          "name": "BRCA1_promoter",
          "source": "regulatory_regions.bed",
          "chrom": "17",
          "region_start": 43090000,
          "region_end": 43100000,
          "score": 850,
          "strand": "+"
        },
        {
          "type": "gene", 
          "identifier": "BRCA1",
          "source": "cancer_genes.txt",
          "gene_source_type": "gene_list"
        }
      ]
    }
  ]
}
```

### CSV/TSV Output

Custom annotations appear in the `UserFeatureOverlap` column:

```csv
OriginalInput,Location,GeneSymbol,UserFeatureOverlap
rs80357906,17:43094692-43094692(1),BRCA1,"region:BRCA1_promoter(regulatory_regions.bed);gene:BRCA1(cancer_genes.txt)"
```

**Format Specification:**
- **Regions**: `region:name(filename)`
- **Genes**: `gene:identifier(filename)` 
- **Multiple**: Separated by semicolons (`;`)
- **Missing Names**: `unknown` placeholder used

### VCF Output

Custom annotations are included in the `VL_CSQ` INFO field following the same format as CSV output.

## Advanced Usage

### Multiple File Types

Combine different annotation sources for comprehensive analysis:

```bash
variant-linker --vcf-input sample.vcf \
  --bed-file enhancers.bed \
  --bed-file promoters.bed \
  --gene-list oncogenes.txt \
  --gene-list tumor_suppressors.txt \
  --json-genes clinical_panels.json \
  --json-gene-mapping '{"identifier":"gene","dataFields":["panel","evidence_level"]}' \
  --output JSON
```

### Complex JSON Mapping

Extract multiple metadata fields from structured gene data:

```bash
# Full clinical annotation
variant-linker --variant "BRCA1:c.68_69delAG" \
  --json-genes comprehensive_gene_data.json \
  --json-gene-mapping '{
    "identifier": "hgnc_symbol",
    "dataFields": [
      "disease_panel",
      "inheritance_pattern", 
      "clinical_actionability",
      "evidence_level",
      "last_reviewed"
    ]
  }' \
  --output TSV
```

### Batch Processing with Features

Process large datasets with custom annotations:

```bash
# Large-scale variant screening
variant-linker --variants-file population_variants.txt \
  --bed-file pathogenic_regions.bed \
  --gene-list disease_genes.txt \
  --scoring_config_path scoring/clinical_score/ \
  --calculate-inheritance \
  --ped family.ped \
  --output CSV \
  --save annotated_results.csv
```

### VCF Workflow with Features

Annotate VCF files and preserve formatting:

```bash
# Clinical VCF annotation pipeline
variant-linker --vcf-input patient_variants.vcf \
  --bed-file clinvar_regions.bed \
  --json-genes acmg_genes.json \
  --json-gene-mapping '{"identifier":"gene_symbol","dataFields":["acmg_classification","curation_date"]}' \
  --output VCF \
  --save annotated_patient_variants.vcf
```

## Error Handling

### Common Issues and Solutions

**File Not Found**
```bash
Error: Error parsing BED file /path/to/missing.bed: ENOENT: no such file or directory
```
- Verify file path is correct
- Check file permissions
- Use absolute paths if needed

**Invalid BED Format**
```bash
Warning: Skipping invalid BED line 5: insufficient columns (2)
```
- Ensure minimum 3 columns (chr, start, end)
- Verify tab-separated format
- Check for header lines

**JSON Mapping Error**
```bash
Error: --json-gene-mapping is required when using --json-genes
```
- Always provide mapping parameter with JSON files
- Verify JSON syntax in mapping string

**Invalid JSON Mapping**
```bash
Error: Invalid JSON gene mapping: Unexpected token
```
- Validate JSON syntax: `echo '{"identifier":"gene"}' | jq`
- Escape quotes properly in shell

### Best Practices

1. **File Validation**: Test files with small datasets first
2. **Path Management**: Use absolute paths for production pipelines
3. **Memory Considerations**: Large BED files are loaded into memory
4. **Error Logging**: Use debug flags (`-d`, `-dd`, `-ddd`) for troubleshooting
5. **Performance**: Combine multiple small files rather than processing separately

## Performance Considerations

### Memory Usage

- **BED Files**: Loaded entirely into memory using interval trees
- **Gene Lists**: Stored in hash maps for O(1) lookup
- **JSON Files**: Parsed and indexed by gene identifier

### Optimization Tips

1. **Consolidate Files**: Merge multiple small BED files
2. **Filter Early**: Use smaller, focused gene lists
3. **Batch Processing**: Process variants in groups
4. **Assembly Consistency**: Ensure coordinate system matches variant data

### Scale Guidelines

- **BED Regions**: Efficiently handles 100K+ regions
- **Gene Lists**: Optimized for 10K+ genes  
- **JSON Metadata**: Suitable for complex clinical databases
- **Concurrent Files**: Multiple files processed in parallel

## Integration Examples

### Research Pipeline

```bash
#!/bin/bash
# Research variant annotation pipeline

VARIANTS="research_cohort.vcf"
ENHANCERS="encode_enhancers.bed"
DISEASE_GENES="gwas_catalog_genes.txt"
OUTPUT_DIR="results"

variant-linker --vcf-input $VARIANTS \
  --bed-file $ENHANCERS \
  --gene-list $DISEASE_GENES \
  --calculate-inheritance \
  --output CSV \
  --save "${OUTPUT_DIR}/annotated_variants.csv"
```

### Clinical Workflow

```bash
#!/bin/bash
# Clinical genetics annotation workflow

PATIENT_VCF="patient_exome.vcf"
ACMG_GENES="acmg_incidental_findings.json"
PATHOGENIC_REGIONS="clinvar_pathogenic_regions.bed"
FAMILY_PED="trio.ped"

variant-linker --vcf-input $PATIENT_VCF \
  --ped $FAMILY_PED \
  --bed-file $PATHOGENIC_REGIONS \
  --json-genes $ACMG_GENES \
  --json-gene-mapping '{"identifier":"gene_symbol","dataFields":["acmg_version","recommendation"]}' \
  --calculate-inheritance \
  --scoring_config_path scoring/clinical_score/ \
  --output VCF \
  --save "patient_annotated.vcf"
```

## API Usage

The custom annotation feature is also available programmatically:

```javascript
const { analyzeVariant } = require('variant-linker');
const { loadFeatures } = require('variant-linker/src/featureParser');

// Load features from files
const features = await loadFeatures({
  bedFile: ['regulatory_regions.bed'],
  geneList: ['cancer_genes.txt'],
  jsonGenes: ['gene_panels.json'],
  jsonGeneMapping: '{"identifier":"gene_symbol","dataFields":["panel","classification"]}'
});

// Analyze variants with custom features
const result = await analyzeVariant({
  variants: ['rs6025', '1-12345-A-G'],
  recoderOptions: { vcf_string: '1' },
  vepOptions: { CADD: '1', hgvs: '1' },
  output: 'JSON',
  features: features
});

console.log(result.annotationData[0].user_feature_overlap);
```

## Related Documentation

- [CLI Usage Guide](../getting-started/cli-usage.md) - Complete CLI reference
- [VCF and PED Files](./vcf-and-ped-files.md) - Working with genomic file formats  
- [Inheritance Analysis](./inheritance-analysis.md) - Family-based variant analysis
- [Scoring Engine](./scoring-engine.md) - Custom variant scoring
- [API Usage](../getting-started/api-usage.md) - Programmatic interface