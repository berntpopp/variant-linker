# Inheritance Pattern Analysis

Variant-Linker provides powerful inheritance pattern analysis capabilities, helping researchers identify variants that follow expected inheritance patterns in family studies.

## Overview

The inheritance analysis module automatically examines genotype data and family relationships to deduce potential inheritance patterns for variants. This feature is essential for:

- **Clinical Genetics**: Identifying causative variants in family studies
- **Research**: Filtering variants based on inheritance expectations
- **Variant Prioritization**: Ranking variants by inheritance pattern compatibility
- **Quality Control**: Validating family relationships and genotype data

## Supported Inheritance Patterns

### De Novo Variants
Variants present in the child but absent in both parents:
- Indicates potential new mutations
- High priority for disease causation studies
- Requires trio or extended family data

### Autosomal Dominant (AD)
Heterozygous variants that segregate with affected status:
- One copy of variant causes phenotype
- Affected individuals typically have one affected parent
- 50% transmission rate to offspring

### Autosomal Recessive (AR)
Homozygous variants in affected individuals with carrier parents:
- Two copies required for phenotype
- Parents typically unaffected carriers
- 25% transmission rate for affected offspring from carrier parents

### X-linked Dominant (XLD)
Variants on X chromosome following dominant inheritance:
- Affects both males and females
- Affected males pass trait to all daughters
- Affected females have 50% transmission rate

### X-linked Recessive (XLR)
Variants on X chromosome following recessive inheritance:
- Primarily affects males
- Carrier mothers transmit to 50% of sons
- Affected fathers pass carrier status to all daughters

### Compound Heterozygous
Two different variants in the same gene that together cause recessive phenotype:
- Each variant inherited from different parents
- Gene-level analysis required
- Both variants must affect gene function

## Analysis Modes

### Single Sample Mode
When only one sample is present in the VCF file:
- Limited inheritance pattern analysis
- Focuses on variant annotation and basic pattern possibilities
- Cannot determine de novo status or segregation

### Trio Mode
When parent-child trio is available:
- Full de novo analysis
- Basic dominant/recessive pattern assessment
- Optimal for most clinical applications

**Trio specification methods:**

```bash
# Using PED file
variant-linker --vcf-input trio.vcf --ped trio.ped --calculate-inheritance

# Manual specification (Index, Mother, Father)
variant-linker --vcf-input trio.vcf --sample-map "PROBAND,MOTHER,FATHER" --calculate-inheritance
```

### Extended Family Mode
When comprehensive family structure is provided via PED file:
- Multi-generational inheritance analysis
- Complex pattern recognition
- Compound heterozygous detection
- Inheritance pattern validation across generations

```bash
# Extended family analysis
variant-linker --vcf-input extended_family.vcf --ped extended_family.ped --calculate-inheritance
```

## Usage Examples

### Basic Trio Analysis

```bash
# Simple trio analysis
variant-linker \
  --vcf-input family_trio.vcf \
  --ped trio.ped \
  --calculate-inheritance \
  --output JSON \
  --save trio_results.json
```

### Extended Family Study

```bash
# Multi-generational family analysis
variant-linker \
  --vcf-input large_family.vcf \
  --ped large_family.ped \
  --calculate-inheritance \
  --output VCF \
  --save annotated_with_inheritance.vcf
```

### Compound Heterozygous Analysis

```bash
# Gene-level compound heterozygous detection
variant-linker \
  --vcf-input family.vcf \
  --ped family.ped \
  --calculate-inheritance \
  --vep_params "CADD=1,SIFT=1,PolyPhen=1" \
  --output CSV \
  --save compound_het_analysis.csv
```

## Output Format

### Inheritance Analysis Results

When inheritance analysis is enabled, each variant annotation includes a `deducedInheritancePattern` object:

```json
{
  "deducedInheritancePattern": {
    "patterns": ["autosomal_recessive", "compound_heterozygous"],
    "confidence": "high",
    "patternDetails": {
      "segregationStatus": "consistent",
      "affectedCarriers": 2,
      "unaffectedCarriers": 0,
      "genotypeCounts": {
        "homozygous_ref": 2,
        "heterozygous": 4,
        "homozygous_alt": 1
      }
    }
  }
}
```

#### Pattern Fields

- **patterns**: Array of possible inheritance patterns
- **confidence**: Confidence level (high, medium, low)
- **patternDetails**: Additional analysis information
- **segregationStatus**: Whether variant segregates with phenotype
- **genotypeCounts**: Genotype distribution in family

### Confidence Levels

**High Confidence**
- Clear segregation pattern
- Sufficient family members
- Consistent with single inheritance mode

**Medium Confidence**
- Some evidence for pattern
- Limited family size or incomplete data
- Multiple possible patterns

**Low Confidence**
- Insufficient data for pattern determination
- Conflicting evidence
- Complex inheritance not clearly resolved

## Algorithm Details

### Pattern Detection Logic

1. **Genotype Extraction**: Extract genotypes for all family members
2. **Relationship Mapping**: Map family relationships from PED data
3. **Segregation Analysis**: Analyze variant transmission patterns
4. **Pattern Matching**: Compare observed patterns to expected inheritance models
5. **Confidence Assessment**: Evaluate strength of evidence for each pattern

### De Novo Detection

De novo variants are identified when:
- Child has variant (heterozygous or homozygous)
- Both parents lack the variant (homozygous reference)
- High-quality genotype calls for all family members
- No evidence of sample mix-up or technical errors

### Compound Heterozygous Detection

Compound heterozygous variants are identified by:
1. **Gene-level Analysis**: Group variants by affected gene
2. **Phase Analysis**: Determine if variants are on different chromosomes
3. **Parent-of-Origin**: Verify variants inherited from different parents
4. **Functional Impact**: Both variants must potentially affect gene function

### Quality Control

The analysis includes several quality control measures:
- **Genotype Quality Filtering**: Remove low-quality genotype calls
- **Mendelian Error Detection**: Identify inconsistent inheritance
- **Sample Relationship Validation**: Verify expected family relationships
- **Technical Artifact Filtering**: Remove likely technical errors

## Limitations and Considerations

### Technical Limitations

- **Incomplete Penetrance**: Not explicitly modeled in current version
- **Genomic Imprinting**: Parent-of-origin effects not fully considered
- **Structural Variants**: Limited support for complex structural variations
- **Mosaic Variants**: Low-level mosaicism may not be detected

### Data Requirements

- **High-Quality Genotypes**: Reliable genotype calls essential
- **Complete Pedigree**: Missing family members reduce analysis power
- **Accurate Phenotyping**: Affected status must be correctly assigned
- **Consistent Sample Naming**: Sample IDs must match between VCF and PED files

### Interpretation Guidelines

1. **Multiple Patterns**: Variants may show evidence for multiple inheritance patterns
2. **Confidence Levels**: Consider confidence when interpreting results
3. **Functional Validation**: Inheritance pattern alone insufficient for causality
4. **Clinical Context**: Integrate with clinical and functional evidence

## Advanced Features

### Custom Pattern Definitions

Future versions will support custom inheritance pattern definitions for:
- Disease-specific inheritance models
- Population-specific patterns
- Complex multi-gene interactions

### Integration with Functional Annotation

Inheritance analysis integrates with functional annotation to prioritize variants:
- **Functional Impact**: Consider variant consequence severity
- **Gene Constraint**: Integrate gene constraint metrics
- **Pathogenicity Scores**: Weight by computational pathogenicity predictions

## Troubleshooting

### Common Issues

**No Inheritance Patterns Detected**
- Check sample naming consistency between VCF and PED files
- Verify family relationships in PED file
- Ensure genotype quality is sufficient

**Inconsistent Patterns**
- Review phenotype assignments in PED file
- Check for sample mix-ups or labeling errors
- Consider incomplete penetrance or variable expressivity

**Low Confidence Results**
- Increase family size if possible
- Improve genotype quality through better sequencing
- Validate relationships with independent methods

### Debug Mode

Use debug mode to troubleshoot inheritance analysis:

```bash
variant-linker \
  --vcf-input family.vcf \
  --ped family.ped \
  --calculate-inheritance \
  --debug 3 \
  --output JSON
```

Debug output includes:
- Genotype extraction details
- Family relationship parsing
- Pattern matching logic
- Confidence calculation steps

## Best Practices

### Study Design

1. **Family Selection**: Choose informative family structures
2. **Sample Quality**: Ensure high-quality DNA and sequencing
3. **Phenotype Definition**: Use consistent, well-defined phenotypes
4. **Control Samples**: Include unaffected family members when possible

### Data Processing

1. **Genotype Filtering**: Apply appropriate quality filters
2. **Variant Normalization**: Ensure consistent variant representation
3. **Reference Consistency**: Use consistent reference genome versions
4. **Sample Validation**: Verify sample identity and relationships

### Result Interpretation

1. **Multiple Lines of Evidence**: Combine inheritance with functional data
2. **Population Frequencies**: Consider variant frequencies in relevant populations
3. **Clinical Context**: Integrate with clinical presentation and history
4. **Functional Validation**: Confirm causality through functional studies

## Next Steps

- Explore [custom scoring configuration](./scoring-engine.md) to weight inheritance patterns
- Learn about [VCF and PED file preparation](./vcf-and-ped-files.md)
- Check the [API documentation](../api) for programmatic access to inheritance analysis