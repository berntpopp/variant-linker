# VEP Consistency Test Fixtures

This directory contains baseline data used to validate the scientific accuracy of variant-linker against the VEP web tool.

## Files

### Input Data
- **`test_variants_vcf_format_2024-06-20.txt`** - Test variants in VCF format (chromosome-position-ref-alt)
- **`test_variants_input_2024-06-20.txt`** - Original input variants (may be in different formats)

### Baseline Reference Data
- **`VEP_online_output_test_variants_2024-06-20.txt`** - VEP web tool output in TSV format
- **`VEP_SETTINGS.md`** - Detailed documentation of VEP web tool settings used

## Purpose

The consistency test suite (`test/vep_consistency.test.js`) uses this baseline data to:

1. **Validate Scientific Accuracy** - Ensure variant-linker produces the same annotations as the trusted VEP web tool
2. **Detect Regressions** - Catch any changes that might affect annotation quality
3. **Verify API Mapping** - Confirm that REST API parameters correctly mirror web tool settings
4. **Test Scoring Consistency** - Validate that custom scoring produces consistent results

## Test Methodology

### Data Flow
```
VEP Web Tool → TSV Output → Parser → Mock API Response → variant-linker → Comparison
```

### Comparison Strategy
The tests perform field-by-field comparisons of:
- Most severe consequence
- Transcript consequences (matched by transcript ID)
- Gene symbols and IDs
- Impact ratings
- HGVS notations
- Numerical scores (CADD, frequencies) with floating-point tolerance
- Custom scoring results

### Mock Strategy
Rather than making live API calls, the tests:
1. Parse the VEP web tool TSV output into structured data
2. Transform this data into the JSON format expected from VEP REST API
3. Use nock to mock API responses with this transformed data
4. Run variant-linker analysis against the mocked data
5. Compare results field-by-field

This approach ensures:
- Fast, reliable tests that don't depend on external APIs
- Consistent test results regardless of network conditions
- Ability to test against a stable, known baseline

## Maintenance

### When to Update Baseline Data

Update the baseline data when:
- VEP web tool version changes significantly
- New annotation fields are added to the comparison
- Test variants need to be expanded for better coverage
- VEP API response format changes

### How to Update Baseline Data

1. **Prepare Input Variants**
   ```bash
   # Edit test_variants_vcf_format_2024-06-20.txt with new variants
   # Ensure variants are in format: chromosome-position-ref-alt
   ```

2. **Generate New VEP Web Tool Output**
   - Go to https://www.ensembl.org/Tools/VEP
   - Use settings documented in `VEP_SETTINGS.md`
   - Upload the variant file
   - Download TSV output
   - Save as `VEP_online_output_test_variants_YYYY-MM-DD.txt`

3. **Update Test Files**
   ```bash
   # Update file paths in test/vep_consistency.test.js
   # Update date references in VEP_SETTINGS.md
   ```

4. **Validate Updates**
   ```bash
   npm test -- --grep "VEP Consistency"
   ```

### Quality Criteria

The baseline data should include variants that test:
- Different variant types (SNV, indel, complex)
- Various consequence types (missense, nonsense, frameshift, etc.)
- Multiple transcript consequences per variant
- Different impact levels (HIGH, MODERATE, LOW, MODIFIER)
- Presence and absence of clinical significance
- Range of allele frequencies
- CADD score coverage

## Troubleshooting

### Common Issues

**Test failures after VEP version update:**
- Check if VEP output format has changed
- Verify field names and data types match expectations
- Update the transformer function if needed

**Floating point comparison failures:**
- Adjust tolerance values in comparison functions
- Check for scientific notation differences

**Missing baseline data:**
- Ensure VEP web tool settings exactly match documented configuration
- Verify that all input variants produced output
- Check for variants that may have been filtered out

### Debug Mode

Enable detailed logging:
```bash
DEBUG=variant-linker:* npm test -- --grep "VEP Consistency"
```

### Manual Verification

To manually verify a specific variant:
```bash
# Test single variant
node src/main.js --variant "6-52025536-A-C" --output JSON

# Compare with baseline data
grep "6-52025536-A-C" test/fixtures/consistency/VEP_online_output_test_variants_2024-06-20.txt
```

## Contributing

When adding new test variants:
1. Ensure they add meaningful coverage
2. Document why specific variants were chosen
3. Update this README with any new testing scenarios
4. Verify all tests pass before submitting PR

The consistency test suite is a critical component for maintaining the scientific validity of variant-linker. Treat baseline data as a trusted reference and update it carefully.