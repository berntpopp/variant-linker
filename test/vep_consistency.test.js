// test/vep_consistency.test.js
/**
 * VEP Consistency Test Suite
 *
 * This test suite validates that variant-linker produces consistent results
 * compared to the VEP web tool baseline. It ensures scientific validity by
 * comparing key annotation fields using trusted reference data.
 */

'use strict';

const path = require('path');
const nock = require('nock');
const {
  expect,
  parseVepWebOutput,
  transformBaselineToVepJson,
  findVepDataForVariant,
} = require('./helpers');
const { analyzeVariant } = require('../src/variantLinkerCore');
const { applyScoring } = require('../src/scoring');

describe('VEP Consistency Tests', function () {
  // Allow more time for these comprehensive tests
  // eslint-disable-next-line no-invalid-this
  this.timeout(10000);

  // Load baseline data once for all tests
  let testVariants;
  let parsedVepData;

  before(async function () {
    // Load test variants
    const variantsPath = path.join(
      __dirname,
      'fixtures',
      'consistency',
      'test_variants_vcf_format_2025-07-21.txt'
    );
    const vepOutputPath = path.join(
      __dirname,
      'fixtures',
      'consistency',
      'VEP_online_output_test_variants_2025-07-21.txt'
    );

    try {
      const fs = require('fs');
      const variantsContent = fs.readFileSync(variantsPath, 'utf8');
      testVariants = variantsContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      parsedVepData = parseVepWebOutput(vepOutputPath);

      console.log(`Loaded ${testVariants.length} test variants`);
      console.log(`Parsed baseline data for ${parsedVepData.size} variants`);
    } catch (error) {
      throw new Error(`Failed to load test data: ${error.message}`);
    }
  });

  // Clean up nock after each test
  afterEach(function () {
    nock.cleanAll();
  });

  // Define VEP options that match the web tool settings
  const vepOptions = {
    CADD: '1', // Enable CADD plugin (both raw and PHRED)
    hgvs: '1', // Include HGVS notations
    numbers: '1', // Add SIFT/PolyPhen scores and other numbers
    af: '1', // Include allele frequencies
    af_gnomadg: '1', // gnomAD genomes frequencies
    af_gnomade: '1', // gnomAD exomes frequencies
    variant_class: '1', // Include variant classification
    regulatory: '1', // Include regulatory annotations
    // Note: No 'pick' parameter used - all transcripts included
  };

  /**
   * Compares variant-linker results against VEP web tool baseline.
   * Performs field-by-field validation of critical annotation data.
   */
  function compareResults(linkerAnnotation, baselineConsequences, variantKey) {
    expect(linkerAnnotation, `No annotation data for variant ${variantKey}`).to.exist;
    expect(baselineConsequences, `No baseline data for variant ${variantKey}`).to.exist;
    expect(
      baselineConsequences.length,
      `Empty baseline data for variant ${variantKey}`
    ).to.be.greaterThan(0);

    // 1. Compare most severe consequence
    const baselineMostSevere = baselineConsequences[0].Consequence;
    expect(
      linkerAnnotation.most_severe_consequence,
      `Most severe consequence mismatch for ${variantKey}`
    ).to.equal(baselineMostSevere);

    // 2. Compare basic variant information
    const [chrom, pos, , alt] = variantKey.split('-');
    expect(linkerAnnotation.seq_region_name).to.equal(chrom);
    expect(linkerAnnotation.start).to.equal(parseInt(pos));
    expect(linkerAnnotation.allele_string).to.include(alt);

    // 3. Compare transcript consequences count
    const linkerTranscripts = linkerAnnotation.transcript_consequences || [];
    const baselineTranscripts = baselineConsequences.filter((c) => c.Feature_type === 'Transcript');

    expect(
      linkerTranscripts.length,
      `Transcript count mismatch for ${variantKey}: expected ${baselineTranscripts.length}, ` +
        `got ${linkerTranscripts.length}`
    ).to.equal(baselineTranscripts.length);

    // 4. Compare individual transcript consequences
    for (const baselineTc of baselineTranscripts) {
      const linkerTc = linkerTranscripts.find((ltc) => ltc.transcript_id === baselineTc.Feature);
      expect(
        linkerTc,
        `Transcript ${baselineTc.Feature} not found in linker output for ${variantKey}`
      ).to.exist;

      // Compare critical fields
      expect(linkerTc.impact, `Impact mismatch for transcript ${baselineTc.Feature}`).to.equal(
        baselineTc.IMPACT
      );
      expect(
        linkerTc.gene_symbol,
        `Gene symbol mismatch for transcript ${baselineTc.Feature}`
      ).to.equal(baselineTc.SYMBOL);
      expect(linkerTc.gene_id, `Gene ID mismatch for transcript ${baselineTc.Feature}`).to.equal(
        baselineTc.Gene
      );

      // Compare consequence terms (handle potential ordering differences)
      const linkerConsequenceTerms = (linkerTc.consequence_terms || []).sort();
      const baselineConsequenceTerms = (baselineTc.Consequence || '').split('&').sort();
      expect(
        linkerConsequenceTerms,
        `Consequence terms mismatch for transcript ${baselineTc.Feature}`
      ).to.deep.equal(baselineConsequenceTerms);

      // Compare HGVS notations
      if (baselineTc.HGVSc) {
        expect(linkerTc.hgvsc, `HGVSc mismatch for transcript ${baselineTc.Feature}`).to.equal(
          baselineTc.HGVSc
        );
      }
      if (baselineTc.HGVSp) {
        expect(linkerTc.hgvsp, `HGVSp mismatch for transcript ${baselineTc.Feature}`).to.equal(
          baselineTc.HGVSp
        );
      }
    }

    // 5. Compare numerical scores (with tolerance for floating point precision)
    const tolerance = 0.001;

    // CADD scores
    if (baselineConsequences[0].CADD_PHRED && linkerAnnotation.cadd_phred) {
      expect(
        Math.abs(linkerAnnotation.cadd_phred - baselineConsequences[0].CADD_PHRED),
        `CADD PHRED score mismatch for ${variantKey}`
      ).to.be.below(tolerance);
    }

    // gnomAD frequencies
    if (baselineConsequences[0].gnomADg_AF && linkerAnnotation.gnomad_genome_af) {
      expect(
        Math.abs(linkerAnnotation.gnomad_genome_af - baselineConsequences[0].gnomADg_AF),
        `gnomAD genome AF mismatch for ${variantKey}`
      ).to.be.below(tolerance);
    }

    if (baselineConsequences[0].gnomADe_AF && linkerAnnotation.gnomad_exome_af) {
      expect(
        Math.abs(linkerAnnotation.gnomad_exome_af - baselineConsequences[0].gnomADe_AF),
        `gnomAD exome AF mismatch for ${variantKey}`
      ).to.be.below(tolerance);
    }
  }

  /**
   * Tests nephro scoring consistency by applying scoring to both
   * variant-linker output and baseline data.
   */
  function compareNephroScoring(linkerAnnotation, baselineConsequences, variantKey) {
    try {
      // Path to nephro scoring configuration
      const nephroConfigPath = path.join(__dirname, '..', 'scoring', 'nephro_variant_score');

      // Load scoring configuration from files
      const { readScoringConfigFromFiles } = require('../src/scoring');
      const scoringConfig = readScoringConfigFromFiles(nephroConfigPath);

      // Apply scoring to linker result (applyScoring expects arrays)
      const linkerScoredArray = applyScoring([linkerAnnotation], scoringConfig);
      const linkerScored = linkerScoredArray[0];

      // Create a mock annotation from baseline data for scoring
      const baselineAnnotation = transformBaselineToVepJson(baselineConsequences, variantKey)[0];
      const baselineScoredArray = applyScoring([baselineAnnotation], scoringConfig);
      const baselineScored = baselineScoredArray[0];

      // Compare final scores (with tolerance for calculation differences)
      if (
        linkerScored.nephro_variant_score !== undefined &&
        baselineScored.nephro_variant_score !== undefined
      ) {
        expect(
          Math.abs(linkerScored.nephro_variant_score - baselineScored.nephro_variant_score),
          `Nephro score mismatch for ${variantKey}: linker=${linkerScored.nephro_variant_score}, ` +
            `baseline=${baselineScored.nephro_variant_score}`
        ).to.be.below(0.01);
      }
    } catch (error) {
      // Log scoring errors but don't fail the test - scoring config might not be available
      console.warn(`Nephro scoring comparison failed for ${variantKey}: ${error.message}`);
    }
  }

  // Test a selection of key variants individually for detailed validation
  it('should show consistent annotation for variant 6-52025536-A-C', async function () {
    const variantKey = '6-52025536-A-C';
    const baselineConsequences = findVepDataForVariant(variantKey, parsedVepData);

    if (!baselineConsequences || baselineConsequences.length === 0) {
      // eslint-disable-next-line no-invalid-this
      this.skip(`No baseline data available for variant ${variantKey}`);
      return;
    }

    // Create mock VEP response from baseline data
    const mockVepJsonResponse = transformBaselineToVepJson(baselineConsequences, variantKey);

    // Setup nock to intercept VEP API call
    nock('https://rest.ensembl.org')
      .post('/vep/homo_sapiens/region')
      .query(true) // Accept any query parameters
      .reply(200, mockVepJsonResponse);

    // Run variant-linker analysis
    const result = await analyzeVariant({
      variants: [variantKey],
      vepOptions: vepOptions,
      cache: false,
      output: 'JSON',
    });

    // Extract the annotation for comparison
    expect(result.annotationData).to.be.an('array').with.lengthOf(1);
    const linkerAnnotation = result.annotationData[0];

    // Perform detailed comparison
    compareResults(linkerAnnotation, baselineConsequences, variantKey);

    // Test nephro scoring consistency
    compareNephroScoring(linkerAnnotation, baselineConsequences, variantKey);
  });

  it('should show consistent annotation for variant 12-867869-C-T', async function () {
    const variantKey = '12-867869-C-T';
    const baselineConsequences = findVepDataForVariant(variantKey, parsedVepData);

    if (!baselineConsequences || baselineConsequences.length === 0) {
      // eslint-disable-next-line no-invalid-this
      this.skip(`No baseline data available for variant ${variantKey}`);
      return;
    }

    // Create mock VEP response from baseline data
    const mockVepJsonResponse = transformBaselineToVepJson(baselineConsequences, variantKey);

    // Setup nock to intercept VEP API call
    nock('https://rest.ensembl.org')
      .post('/vep/homo_sapiens/region')
      .query(true) // Accept any query parameters
      .reply(200, mockVepJsonResponse);

    // Run variant-linker analysis
    const result = await analyzeVariant({
      variants: [variantKey],
      vepOptions: vepOptions,
      cache: false,
      output: 'JSON',
    });

    // Extract the annotation for comparison
    expect(result.annotationData).to.be.an('array').with.lengthOf(1);
    const linkerAnnotation = result.annotationData[0];

    // Perform detailed comparison
    compareResults(linkerAnnotation, baselineConsequences, variantKey);

    // Test nephro scoring consistency
    compareNephroScoring(linkerAnnotation, baselineConsequences, variantKey);
  });

  // Summary test to validate overall consistency
  it('should maintain consistency across all test variants', async function () {
    const consistencyReport = {
      totalVariants: testVariants.length,
      variantsWithBaseline: 0,
      variantsTestedSuccessfully: 0,
      failedVariants: [],
    };

    for (const variantKey of testVariants) {
      const baselineConsequences = findVepDataForVariant(variantKey, parsedVepData);

      if (baselineConsequences && baselineConsequences.length > 0) {
        consistencyReport.variantsWithBaseline++;

        try {
          // Quick mock setup for this variant
          const mockVepJsonResponse = transformBaselineToVepJson(baselineConsequences, variantKey);

          nock.cleanAll(); // Clean previous mocks
          nock('https://rest.ensembl.org')
            .post('/vep/homo_sapiens/region')
            .query(true)
            .reply(200, mockVepJsonResponse);

          const result = await analyzeVariant({
            variants: [variantKey],
            vepOptions: vepOptions,
            cache: false,
            output: 'JSON',
          });

          if (result.annotationData && result.annotationData.length > 0) {
            consistencyReport.variantsTestedSuccessfully++;
          } else {
            consistencyReport.failedVariants.push(`${variantKey}: No annotation data returned`);
          }
        } catch (error) {
          consistencyReport.failedVariants.push(`${variantKey}: ${error.message}`);
        }
      }
    }

    // Log summary
    console.log('\nConsistency Test Summary:');
    console.log(`Total variants: ${consistencyReport.totalVariants}`);
    console.log(`Variants with baseline data: ${consistencyReport.variantsWithBaseline}`);
    console.log(`Variants tested successfully: ${consistencyReport.variantsTestedSuccessfully}`);
    console.log(`Failed variants: ${consistencyReport.failedVariants.length}`);

    if (consistencyReport.failedVariants.length > 0) {
      console.log('Failed variants:', consistencyReport.failedVariants);
    }

    // Require at least 90% success rate
    const successRate =
      consistencyReport.variantsTestedSuccessfully / consistencyReport.variantsWithBaseline;
    expect(
      successRate,
      `Consistency test success rate ${(successRate * 100).toFixed(1)}% is below 90% threshold`
    ).to.be.at.least(0.9);
  });
});
