# Scoring Engine

Variant-Linker includes a powerful, configurable scoring system that allows users to create custom scoring formulas for variant prioritization. The scoring engine supports both annotation-level and transcript-level scoring with flexible variable assignment.

## Overview

The scoring system consists of two main components:

1. **Formula Configuration**: Defines mathematical formulas for calculating scores
2. **Variable Assignment**: Maps annotation fields to variables used in formulas

This modular approach allows researchers to:
- Create domain-specific scoring models
- Integrate multiple annotation sources
- Apply complex mathematical transformations
- Generate reproducible scoring results

## Configuration Structure

### Directory Organization

Scoring configurations are organized in directories within the `scoring/` folder:

```
scoring/
├── nephro_variant_score/
│   ├── formula_config.json
│   └── variable_assignment_config.json
└── meta_score_example/
    ├── formula_config.json
    └── variable_assignment_config.json
```

### Formula Configuration File

The `formula_config.json` file defines mathematical formulas for score calculation:

```json
{
  "@context": "https://schema.org/",
  "@type": "Configuration",
  "formulas": {
    "annotationLevel": [
      {
        "score_name": "mathematical_formula_here"
      },
      {
        "gene_symbol": "gene_symbol"
      }
    ],
    "transcriptLevel": [
      {
        "transcript_score": "formula_for_transcript_scoring"
      }
    ]
  }
}
```

### Variable Assignment Configuration

The `variable_assignment_config.json` file maps annotation data to variables:

```json
{
  "@context": "https://schema.org/",
  "@type": "Configuration",
  "variables": {
    "annotation.field.path": "variable_name|operation:modifier|default:value",
    "transcript_consequences.*.consequence_terms": "unique:consequence_terms|default:[]"
  }
}
```

## Scoring Levels

### Annotation-Level Scoring

Applied to the overall variant annotation, incorporating variant-wide properties:

- **Use Case**: Overall variant pathogenicity scores
- **Data Sources**: Population frequencies, conservation scores, overall impact
- **Output**: Single score per variant

### Transcript-Level Scoring

Applied to individual transcript consequences:

- **Use Case**: Transcript-specific impact assessment
- **Data Sources**: Protein predictions, transcript biotype, canonical status
- **Output**: Score per transcript consequence

## Variable Assignment Operations

### Basic Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `max` | Maximum value from array | `max:cadd_scores` |
| `min` | Minimum value from array | `min:conservation_scores` |
| `unique` | Unique values from array | `unique:consequence_terms` |
| `sum` | Sum of numeric values | `sum:allele_counts` |
| `avg` | Average of numeric values | `avg:quality_scores` |

### Default Values

Specify default values when data is missing:

```json
"transcript_consequences.*.cadd_phred": "max:cadd_phred_variant|default:7.226"
```

### Path Expressions

Use JSONPath-like expressions to access nested data:

- `transcript_consequences.*` - All transcript consequences
- `colocated_variants.0.frequencies.*` - First colocated variant frequencies
- `regulatory_feature_consequences.*.impact` - All regulatory impacts

## Example: Nephrology Variant Score

### Variable Assignment

```json
{
  "variables": {
    "transcript_consequences.*.consequence_terms": "unique:consequence_terms_variant|default:0",
    "transcript_consequences.*.cadd_phred": "max:cadd_phred_variant|default:7.226",
    "transcript_consequences.*.impact": "unique:impact_variant|default:LOW",
    "colocated_variants.0.frequencies.*.gnomade": "gnomade_variant|default:1.626e-05",
    "colocated_variants.0.frequencies.*.gnomadg": "gnomadg_variant|default:5.256e-05"
  }
}
```

### Formula Configuration

```json
{
  "formulas": {
    "annotationLevel": [
      {
        "nephro_variant_score": "1 / (1 + Math.exp(-((-36.30796) + ((gnomade_variant - 0.00658) / 0.05959) * (-309.33539) + ((gnomadg_variant - 0.02425) / 0.11003) * (-2.54581) + ... )))"
      }
    ]
  }
}
```

This example implements a logistic regression model incorporating:
- Population frequencies (gnomAD exomes and genomes)
- Consequence type indicators
- CADD pathogenicity scores
- Impact severity levels

## Usage Examples

### Apply Custom Scoring

```bash
# Use nephrology-specific scoring
variant-linker \
  --variants-file variants.txt \
  --scoring_config_path scoring/nephro_variant_score/ \
  --output CSV \
  --save scored_variants.csv
```

### Compare Multiple Scoring Models

```bash
# Apply different scoring models
variant-linker --variant "rs6025" --scoring_config_path scoring/nephro_variant_score/ --output JSON
variant-linker --variant "rs6025" --scoring_config_path scoring/meta_score_example/ --output JSON
```

### Batch Scoring

```bash
# Score large batch of variants
variant-linker \
  --vcf-input large_cohort.vcf \
  --scoring_config_path scoring/nephro_variant_score/ \
  --output VCF \
  --save scored_cohort.vcf
```

## Creating Custom Scoring Models

### Step 1: Create Directory Structure

```bash
mkdir scoring/my_custom_score
```

### Step 2: Define Variable Assignments

Create `scoring/my_custom_score/variable_assignment_config.json`:

```json
{
  "@context": "https://schema.org/",
  "@type": "Configuration",
  "variables": {
    "transcript_consequences.*.sift_prediction": "unique:sift_prediction|default:unknown",
    "transcript_consequences.*.polyphen_prediction": "unique:polyphen_prediction|default:unknown",
    "transcript_consequences.*.cadd_phred": "max:cadd_phred|default:0",
    "colocated_variants.0.frequencies.*.gnomade": "gnomade_freq|default:0.001"
  }
}
```

### Step 3: Create Scoring Formula

Create `scoring/my_custom_score/formula_config.json`:

```json
{
  "@context": "https://schema.org/",
  "@type": "Configuration",
  "formulas": {
    "annotationLevel": [
      {
        "pathogenicity_score": "cadd_phred * 0.1 + (gnomade_freq < 0.001 ? 10 : 0) + (sift_prediction.includes('deleterious') ? 5 : 0) + (polyphen_prediction.includes('damaging') ? 5 : 0)"
      },
      {
        "gene_symbol": "gene_symbol"
      }
    ]
  }
}
```

### Step 4: Test Your Model

```bash
variant-linker \
  --variant "rs6025" \
  --scoring_config_path scoring/my_custom_score/ \
  --output JSON
```

## Advanced Formula Features

### Conditional Logic

Use JavaScript conditional operators in formulas:

```javascript
// Ternary operator
"score": "cadd_phred > 20 ? 1 : 0"

// Multiple conditions
"risk_score": "gnomad_freq < 0.001 ? (cadd_phred > 15 ? 'high' : 'medium') : 'low'"
```

### Array Operations

Work with arrays of values:

```javascript
// Check if array includes value
"has_missense": "consequence_terms.includes('missense_variant') ? 1 : 0"

// Map and reduce operations
"max_impact": "Math.max(...impact_scores.map(x => x || 0))"

// Array filtering
"severe_consequences": "consequence_terms.filter(x => ['stop_gained', 'frameshift_variant'].includes(x)).length"
```

### Mathematical Functions

Use standard JavaScript Math functions:

```javascript
// Logarithmic scaling
"log_score": "Math.log10(cadd_phred + 1)"

// Exponential functions
"sigmoid_score": "1 / (1 + Math.exp(-cadd_phred))"

// Power functions
"power_score": "Math.pow(cadd_phred / 10, 2)"
```

## Output Integration

### CSV/TSV Output

Scores are included as additional columns in tabular output:

```csv
OriginalInput,VariantID,GeneSymbol,nephro_variant_score,pathogenicity_score
rs6025,rs6025,F5,0.89,15.2
```

### JSON Output

Scores are added to the annotation object:

```json
{
  "scores": {
    "nephro_variant_score": 0.89,
    "pathogenicity_score": 15.2
  }
}
```

### VCF Output

Scores are included in the `VL_CSQ` INFO field:

```
VL_CSQ=T|missense_variant|MODERATE|F5|...|nephro_variant_score=0.89
```

## Best Practices

### Model Development

1. **Start Simple**: Begin with basic formulas and add complexity gradually
2. **Validate Logic**: Test formulas with known variants
3. **Document Assumptions**: Comment complex formulas thoroughly
4. **Version Control**: Track scoring model versions

### Variable Selection

1. **Relevant Features**: Choose variables relevant to your research question
2. **Data Quality**: Ensure reliable annotation sources
3. **Missing Data**: Handle missing values appropriately with defaults
4. **Scale Consistency**: Normalize variables to similar scales

### Formula Design

1. **Interpretability**: Keep formulas interpretable when possible
2. **Computational Efficiency**: Avoid overly complex calculations
3. **Boundary Conditions**: Test edge cases and missing data scenarios
4. **Score Interpretation**: Define clear score interpretation guidelines

## Troubleshooting

### Common Issues

**Formula Syntax Errors**
- Check JavaScript syntax in formulas
- Verify variable names match assignments
- Test formulas with simple examples

**Missing Variables**
- Ensure variable paths exist in annotation data
- Use appropriate default values
- Check JSONPath expressions

**Score Calculation Errors**
- Validate mathematical operations
- Handle division by zero cases
- Check for null/undefined values

### Debug Mode

Use debug mode to troubleshoot scoring issues:

```bash
variant-linker \
  --variant "rs6025" \
  --scoring_config_path scoring/my_custom_score/ \
  --debug 3 \
  --output JSON
```

Debug output includes:
- Variable assignment details
- Formula evaluation steps
- Error messages and stack traces

## CNV Scoring

Variant-Linker includes specialized support for scoring Copy Number Variants (CNVs) with access to structural variant-specific annotations.

### CNV-Specific Variables

CNV scoring configurations can access additional variables not available for point mutations:

| Variable | Description | Source |
|----------|-------------|---------|
| `bp_overlap` | Base pairs overlapping with gene features | VEP transcript consequences |
| `percentage_overlap` | Percentage of feature overlap | VEP transcript consequences |
| `phenotypes` | Associated disease phenotypes | VEP top-level annotation |
| `phaplo_score` | Haploinsufficiency score | VEP dosage sensitivity |
| `ptriplo_score` | Triplosensitivity score | VEP dosage sensitivity |

### Example CNV Scoring Configuration

The included `cnv_score_example` demonstrates pathogenicity scoring for structural variants:

**Variable Assignment** (`scoring/cnv_score_example/variable_assignment_config.json`):
```json
{
  "aggregates": {
    "consequence_terms": "transcript_consequences.*.consequence_terms:unique",
    "bp_overlap": "transcript_consequences.*.bp_overlap:max",
    "percentage_overlap": "transcript_consequences.*.percentage_overlap:max"
  },
  "transcriptFields": {
    "dosage_gene": "dosage_sensitivity.gene_name",
    "phaplo_score": "dosage_sensitivity.phaplo",
    "ptriplo_score": "dosage_sensitivity.ptriplo",
    "phenotypes": "phenotypes"
  }
}
```

**Scoring Formulas** (`scoring/cnv_score_example/formula_config.json`):
```json
{
  "formulas": {
    "annotationLevel": [{
      "cnv_pathogenicity_score": "const baseScore = consequence_terms.includes('feature_truncation') ? 20 : (consequence_terms.includes('feature_elongation') ? 15 : 0); const overlapScore = Math.min(bp_overlap / 10000, 10); const dosageScore = (phaplo_score || 0) * 5 + (ptriplo_score || 0) * 3; const phenotypeScore = phenotypes && phenotypes.length > 0 ? 5 : 0; return baseScore + overlapScore + dosageScore + phenotypeScore;"
    }],
    "transcriptLevel": [{
      "transcript_cnv_impact": "const hasFeatureTruncation = consequence_terms.includes('feature_truncation'); const hasHighOverlap = (bp_overlap || 0) > 50000; const isHighConfidenceGene = (phaplo_score || 0) >= 3 || (ptriplo_score || 0) >= 3; return hasFeatureTruncation && hasHighOverlap && isHighConfidenceGene ? 'HIGH_IMPACT' : (hasFeatureTruncation || (hasHighOverlap && isHighConfidenceGene) ? 'MODERATE_IMPACT' : 'LOW_IMPACT');"
    }]
  }
}
```

### CNV Scoring Usage

```bash
# Score a deletion with CNV-specific model
variant-linker \
  --variant "7:117559600-117559609:DEL" \
  --scoring_config_path scoring/cnv_score_example/ \
  --vep_params "Phenotypes=1,numbers=1" \
  --output JSON

# Batch CNV scoring
variant-linker \
  --variants-file cnv_variants.txt \
  --scoring_config_path scoring/cnv_score_example/ \
  --output CSV
```

### CNV Scoring Strategy

The example CNV scoring model considers:

1. **Functional Impact**: Feature truncation/elongation consequences
2. **Overlap Significance**: Base pairs and percentage overlap with gene features  
3. **Dosage Sensitivity**: Haploinsufficiency and triplosensitivity scores
4. **Clinical Relevance**: Associated disease phenotypes

This multi-factor approach helps prioritize CNVs likely to have clinical significance.

## Integration with Other Features

### Inheritance Analysis

Combine scoring with inheritance pattern analysis:

```bash
variant-linker \
  --vcf-input family.vcf \
  --ped family.ped \
  --calculate-inheritance \
  --scoring_config_path scoring/nephro_variant_score/ \
  --output CSV
```

### Filtering

Use scores in filtering criteria:

```bash
# Filter by score threshold (requires post-processing)
variant-linker \
  --variants-file variants.txt \
  --scoring_config_path scoring/nephro_variant_score/ \
  --output JSON | jq '.[] | select(.scores.nephro_variant_score > 0.8)'
```

## Performance Considerations

- **Complex Formulas**: Very complex formulas may impact processing speed
- **Array Operations**: Large arrays in formulas can be memory-intensive
- **Batch Processing**: Scoring adds computational overhead to batch jobs
- **Caching**: Consider caching for repeated scoring operations

## Next Steps

- Explore the [CLI usage guide](../getting-started/cli-usage.md) for more command examples
- Learn about [benchmarking](../benchmarking.md) to measure scoring performance
- Check out [inheritance analysis](./inheritance-analysis.md) for family-based prioritization