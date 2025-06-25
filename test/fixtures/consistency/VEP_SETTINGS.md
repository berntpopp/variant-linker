# VEP Web Tool Settings Used for Baseline Generation

This document records the exact settings used in the VEP web tool to generate the baseline output file `VEP_online_output_test_variants_2024-06-20.txt`.

## Settings Used

### Basic Settings
- **Assembly**: GRCh38
- **Input Format**: VCF-style (chromosome-position-ref-alt)
- **Identifier**: Uploaded variation (default)

### Annotation Options
- **HGVS notations**: Enabled
- **Numbers**: Enabled (includes SIFT/PolyPhen scores and other numerical annotations)

### Plugins Enabled
- **CADD**: Enabled with both raw score and PHRED score
- **Frequencies**: Enabled for population frequency data

### Frequency Sources
- **gnomAD genomes** (gnomADg): Enabled with all sub-populations
- **gnomAD exomes** (gnomADe): Enabled with all sub-populations

### Additional Options
- **Clinical significance**: Enabled (ClinVar data)
- **Phenotypes**: Enabled 
- **Regulatory features**: Default settings
- **Transcript selection**: All transcripts (no PICK flag used)

## API Parameter Mapping

These web tool settings correspond to the following VEP REST API parameters:

```javascript
const vepOptions = {
    CADD: '1',           // Enable CADD plugin
    hgvs: '1',           // Include HGVS notations  
    numbers: '1',        // Add SIFT/PolyPhen scores and other numbers
    af: '1',             // Include allele frequencies
    af_gnomadg: '1',     // gnomAD genomes frequencies
    af_gnomade: '1',     // gnomAD exomes frequencies
    variant_class: '1',  // Include variant classification
    regulatory: '1',     // Include regulatory annotations
    // Note: No 'pick' parameter used - all transcripts included
};
```

## File Generation Date
- **Generated**: 2024-06-20
- **VEP Version**: Web tool version as of June 2024
- **Input File**: test_variants_vcf_format_2024-06-20.txt

## Maintenance Notes

When updating baseline files:
1. Use identical settings in the VEP web tool
2. Update this documentation if settings change
3. Regenerate both input and output files together
4. Update the consistency tests if the VEP output format changes