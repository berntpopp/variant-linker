# VCF and PED File Handling

Variant-Linker provides comprehensive support for VCF (Variant Call Format) and PED (Pedigree) files, enabling robust family-based genetic analysis.

## VCF File Support

### VCF Input Processing

Variant-Linker can read standard VCF files and process variants while preserving important metadata:

```bash
# Process VCF file
variant-linker --vcf-input sample.vcf --output JSON

# Process VCF with inheritance analysis
variant-linker --vcf-input family.vcf --ped family.ped --calculate-inheritance --output VCF
```

#### VCF Input Features

- **Header Preservation**: Original VCF headers are maintained in output
- **Multi-allelic Support**: Multi-allelic sites are automatically split and processed as separate variants
- **Sample Information**: Sample genotype data is preserved for inheritance analysis
- **Metadata Handling**: VCF metadata fields are carried through the annotation process

### VCF Output Generation

Variant-Linker can generate annotated VCF files from any input type:

#### VCF Output Features

- **Universal VCF Output**: Works with any input type (single variant, batch file, or VCF input)
- **INFO Field Annotation**: Annotations added as `VL_CSQ` INFO field
- **Header Generation**: Creates standard-compliant VCF headers when input is not VCF
- **Format Compatibility**: Output is compatible with standard VCF processing tools

#### VL_CSQ Annotation Format

The `VL_CSQ` field contains pipe-delimited annotations similar to VEP's CSQ format:

```
Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen
```

#### Example VCF Output Header

```vcf
##fileformat=VCFv4.2
##INFO=<ID=VL_CSQ,Number=.,Type=String,Description="Consequence annotations from variant-linker. Format: Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|HGVSc|HGVSp|Protein_position|Amino_acids|Codons|SIFT|PolyPhen">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO
```

### VCF Usage Examples

#### VCF-to-VCF Processing

```bash
# Annotate VCF file, preserving original structure
variant-linker --vcf-input input.vcf --output VCF --save annotated.vcf
```

#### Non-VCF to VCF Conversion

```bash
# Convert single variant to VCF format
variant-linker --variant "rs6025" --output VCF --save rs6025.vcf

# Convert batch file to VCF format
variant-linker --variants-file variants.txt --output VCF --save batch_annotated.vcf
```

## PED File Support

### PED File Format

Variant-Linker supports standard 6-column PED files for defining family structure:

```
FamilyID SampleID FatherID MotherID Sex AffectedStatus
```

#### Column Definitions

| Column | Description | Values |
|--------|-------------|---------|
| **FamilyID** | Family group identifier | Any string |
| **SampleID** | Unique sample identifier | Must match VCF sample names |
| **FatherID** | Father's sample ID | Sample ID or '0' for unknown/founder |
| **MotherID** | Mother's sample ID | Sample ID or '0' for unknown/founder |
| **Sex** | Biological sex | 1=male, 2=female, 0=unknown |
| **AffectedStatus** | Disease status | 0=unknown, 1=unaffected, 2=affected |

### Example PED File

```ped
# Family structure for trio analysis
FAM001 PROBAND FATHER MOTHER 1 2    # Affected male child
FAM001 FATHER 0 0 1 1                # Unaffected male founder
FAM001 MOTHER 0 0 2 1                # Unaffected female founder

# Extended family example
FAM002 CHILD1 DAD MOM 2 2            # Affected female child
FAM002 CHILD2 DAD MOM 1 1            # Unaffected male child  
FAM002 DAD GRANDDAD GRANDMOM 1 1     # Unaffected father
FAM002 MOM 0 0 2 1                   # Unaffected mother
FAM002 GRANDDAD 0 0 1 0              # Grandfather (unknown status)
FAM002 GRANDMOM 0 0 2 0              # Grandmother (unknown status)
```

### PED File Features

- **Flexible Delimiters**: Supports both tabs and spaces as column separators
- **Comment Support**: Lines starting with '#' are treated as comments
- **Multiple Families**: Single PED file can contain multiple family structures
- **Relationship Validation**: Automatically validates parent-child relationships

### PED Usage Examples

#### Basic Trio Analysis

```bash
# Analyze inheritance patterns using PED file
variant-linker --vcf-input family.vcf --ped family.ped --calculate-inheritance
```

#### Alternative Trio Specification

If you don't have a PED file, you can specify trio relationships directly:

```bash
# Manual trio specification (Index, Mother, Father)
variant-linker --vcf-input trio.vcf --sample-map "PROBAND,MOTHER,FATHER" --calculate-inheritance
```

## Combined VCF and PED Analysis

### Family-Based Variant Analysis

When both VCF and PED files are provided, Variant-Linker can perform comprehensive inheritance analysis:

```bash
# Full family analysis with inheritance patterns
variant-linker \
  --vcf-input extended_family.vcf \
  --ped extended_family.ped \
  --calculate-inheritance \
  --output VCF \
  --save annotated_with_inheritance.vcf
```

### Analysis Modes

1. **Single Sample Mode**: Basic annotation without inheritance analysis
2. **Trio Mode**: Parent-child trio analysis for de novo and simple inheritance patterns
3. **Extended Family Mode**: Multi-generational analysis with complex inheritance patterns

### Output with Inheritance Information

When inheritance analysis is enabled, the output includes additional fields:

- **deducedInheritancePattern**: Possible inheritance patterns
- **confidence**: Confidence level in pattern deduction
- **patternDetails**: Additional inheritance-specific information

## File Format Validation

### VCF Validation

Variant-Linker validates VCF files for:
- Proper header format
- Column structure compliance
- Sample name consistency
- Coordinate format validity

### PED Validation

PED file validation includes:
- Column count verification
- Sample ID uniqueness
- Parent-child relationship consistency
- Sex and affected status value validation

## Best Practices

### File Preparation

1. **Sample Name Consistency**: Ensure sample names match between VCF and PED files
2. **Complete Relationships**: Include all family members referenced in parent columns
3. **Proper Encoding**: Use UTF-8 encoding for special characters
4. **Coordinate Systems**: Ensure VCF coordinates use consistent reference genome

### Performance Optimization

1. **VCF Indexing**: For large VCF files, consider indexing with tabix
2. **Multi-allelic Handling**: Large multi-allelic sites may impact processing time
3. **Family Size**: Very large pedigrees may require additional processing time

### Error Handling

Common issues and solutions:

- **Sample Mismatch**: Verify sample names match between VCF and PED files
- **Invalid Coordinates**: Check VCF coordinate format and reference genome
- **Missing Parents**: Use '0' for unknown or founder individuals in PED file
- **Encoding Issues**: Ensure files use standard text encoding

## Next Steps

- Learn about [inheritance analysis patterns](./inheritance-analysis.md)
- Explore [custom scoring configuration](./scoring-engine.md)
- Check out the [CLI usage guide](../getting-started/cli-usage.md) for more examples