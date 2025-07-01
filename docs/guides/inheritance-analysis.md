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

### Core Calculation Algorithm

The inheritance analysis engine uses a multi-step calculation process:

#### 1. Index Sample Determination
The system identifies the proband/index sample using this priority:
- Explicit `sampleMap` with 'index' or 'proband' designation
- First affected individual (phenotype = '2') in PED file
- First sample ID in the VCF genotype data

#### 2. Genotype Classification
Each genotype is classified based on allele counts:
- **0/0 or 0|0**: Homozygous reference (isRef)
- **0/1 or 1/0 or 0|1 or 1|0**: Heterozygous (isHet)
- **1/1 or 1|1**: Homozygous alternate (isHomAlt)
- **./. or .**: Missing genotype
- Multi-allelic calls handled by checking specific allele indices

#### 3. Pattern-Specific Rules

**De Novo Detection**:
```
IF index has variant (Het or HomAlt) AND
   mother is HomRef (0/0) AND
   father is HomRef (0/0)
THEN pattern = de_novo
```

**Autosomal Dominant (AD)**:
```
IF index is Het AND
   (mother is Het OR father is Het) AND
   NOT both parents are Het
THEN pattern = autosomal_dominant
```

**Autosomal Recessive (AR)**:
```
IF index is HomAlt AND
   mother is Het AND
   father is Het
THEN pattern = autosomal_recessive
```

**X-linked Patterns** (requires chromosome information):
- **X-linked Dominant (XLD)**:
  - Affected males: Must have affected mother
  - Affected females: One affected parent sufficient
- **X-linked Recessive (XLR)**:
  - Affected males: Carrier mother (Het) or affected mother
  - Affected females: Both X chromosomes must carry variant

#### 4. Segregation Scoring

For extended families, segregation consistency is calculated:

```
segregation_score = (carriers_affected + non_carriers_unaffected) / total_informative_members
```

Where:
- **carriers_affected**: Variant carriers who are affected
- **non_carriers_unaffected**: Non-carriers who are unaffected
- **total_informative_members**: All family members with both genotype and phenotype data

Segregation categories:
- **Perfect** (score = 1.0): Complete segregation with phenotype
- **High** (score ≥ 0.8): Strong segregation evidence
- **Moderate** (score ≥ 0.6): Some segregation support
- **Low** (score < 0.6): Poor segregation

#### 5. Confidence Calculation

Confidence levels integrate multiple factors:

```javascript
confidence = calculateConfidence({
  segregationScore,
  familySize,
  missingDataCount,
  mendelianErrors,
  patternConsistency
})
```

Confidence modifiers:
- **High**: Large families (≥5), perfect segregation, no missing data
- **Medium**: Small families (3-4), good segregation (≥0.8), minimal missing data
- **Low**: Duo analysis, poor segregation (<0.8), significant missing data

### De Novo Detection

De novo variants are identified when:
- Child has variant (heterozygous or homozygous)
- Both parents lack the variant (homozygous reference)
- High-quality genotype calls for all family members
- No evidence of sample mix-up or technical errors

Additional checks for de novo calls:
- **Allele balance**: Het calls should have ~50% alternate allele frequency
- **Read depth**: Sufficient coverage in all trio members
- **Quality scores**: High genotype quality (GQ) values

### Compound Heterozygous Detection

Compound heterozygous variants are identified by:
1. **Gene-level Analysis**: Group variants by affected gene
2. **Phase Analysis**: Determine if variants are on different chromosomes
3. **Parent-of-Origin**: Verify variants inherited from different parents
4. **Functional Impact**: Both variants must potentially affect gene function

Algorithm for compound het detection:
```
FOR each gene with multiple Het variants in index:
  IF variant1 from mother (mother Het, father HomRef) AND
     variant2 from father (father Het, mother HomRef) AND
     both variants have functional impact
  THEN compound_heterozygous = true
```

### Multi-Allelic Variant Handling

For variants with multiple alternate alleles:
1. Split multi-allelic sites into biallelic representations
2. Analyze each alternate allele independently
3. Preserve allele-specific genotype information
4. Report inheritance patterns per alternate allele

Example:
```
Original: 1:12345 A T,G (GT: 1/2)
Split to:
  - 1:12345 A T (GT: 1/0)
  - 1:12345 A G (GT: 0/1)
```

### Special Cases and Edge Conditions

#### Hemizygous Calls (Male X Chromosome)
- Males have single X chromosome
- Genotypes reported as "1" (not "1/1")
- Special handling for X-linked inheritance calculations

#### Missing Genotypes
- Pattern reported as "unknown_missing_genotype"
- Segregation analysis excludes missing samples
- Confidence automatically reduced

#### Technical Replicates
- If duplicate samples detected, use highest quality call
- Flag inconsistent genotypes between replicates

### Quality Control

The analysis includes several quality control measures:
- **Genotype Quality Filtering**: Remove low-quality genotype calls
- **Mendelian Error Detection**: Identify inconsistent inheritance
- **Sample Relationship Validation**: Verify expected family relationships
- **Technical Artifact Filtering**: Remove likely technical errors

Quality metrics tracked:
- **Mendelian error rate**: Percentage of impossible inheritance patterns
- **Missing data rate**: Proportion of missing genotypes
- **Hardy-Weinberg equilibrium**: For population-level checks
- **Allele balance**: For heterozygous call validation

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

## Implementation Architecture

### Module Organization

The inheritance analysis system is composed of specialized modules:

#### Core Modules
- **`inheritanceAnalyzer.js`**: Main orchestrator that coordinates all analysis
- **`patternDeducer.js`**: Deduces potential inheritance patterns from genotypes
- **`segregationChecker.js`**: Validates pattern consistency across families
- **`patternPrioritizer.js`**: Ranks patterns by likelihood and evidence
- **`compoundHetAnalyzer.js`**: Detects compound heterozygous variants

#### Utility Modules
- **`genotypeUtils.js`**: Genotype parsing and classification functions
- **`pedigreeUtils.js`**: Family relationship and sex determination utilities

### Data Flow

```
1. VCF + PED Input
   ↓
2. Genotype Extraction (per variant)
   ↓
3. Pattern Deduction
   - Single sample analysis
   - Trio analysis
   - Extended family analysis
   ↓
4. Segregation Checking
   - Calculate segregation scores
   - Validate Mendelian inheritance
   ↓
5. Pattern Prioritization
   - Rank by evidence strength
   - Apply confidence scores
   ↓
6. Compound Het Analysis
   - Group by gene
   - Check parent-of-origin
   ↓
7. Results Integration
   - Merge all analyses
   - Format output
```

### Key Data Structures

#### Genotype Map
```javascript
Map<variantKey, Map<sampleId, genotype>>
// Example:
// "1-12345-A-T" → { "SAMPLE1": "0/1", "SAMPLE2": "1/1", "SAMPLE3": "0/0" }
```

#### Pedigree Data
```javascript
Map<sampleId, {
  familyId: string,
  paternalId: string,
  maternalId: string,
  sex: string,        // "1" (male), "2" (female), "0" (unknown)
  phenotype: string   // "1" (unaffected), "2" (affected), "0" (unknown)
}>
```

#### Pattern Result
```javascript
{
  patterns: ["autosomal_recessive", "compound_heterozygous"],
  confidence: "high",
  segregation: {
    score: 0.95,
    category: "high",
    details: { /* segregation metrics */ }
  },
  priorityScore: 0.85
}
```

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

### Performance Optimization

For large-scale analysis:
- **Parallel Processing**: Variants analyzed concurrently
- **Memory Efficiency**: Streaming VCF processing
- **Caching**: Pedigree relationships cached for reuse
- **Early Termination**: Skip analysis for obvious non-pathogenic variants

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
- Check the [contributing guidelines](../contributing.md) for development guidelines