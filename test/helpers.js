// test/helpers.js
// Common test utilities and mock data for variant-linker tests

// Handle ESM modules correctly
const chai = require('chai');
const expect = chai.expect;
const nock = require('nock');
const apiConfig = require('../config/apiConfig.json');
const fs = require('fs');

/**
 * Standard mock responses for common API endpoints
 */
// Common test variant formats used across tests
const vcfVariant = '1-65568-A-C';
const hgvsVariant = 'ENST00000366667:c.803C>T';
const rsVariant = 'rs123';
const mixedVariants = [vcfVariant, hgvsVariant, rsVariant];

const mockResponses = {
  // Common variant formats for easy reference
  variantFormats: {
    vcfVariant,
    hgvsVariant,
    rsVariant,
    mixedVariants,
  },

  // Common Variant Recoder GET response (single variant)
  variantRecoderGet: {
    rs123: {
      id: 'rs123',
      A: {
        hgvsg: ['NC_000001.11:g.1000A>T'],
        vcf_string: ['1-1000-A-T'],
      },
      T: {
        hgvsg: ['NC_000001.11:g.1000A>G'],
        vcf_string: ['1-1000-A-G'],
      },
    },
  },

  // Common Variant Recoder POST response (multiple variants)
  variantRecoderPost: [
    {
      input: 'rs123',
      id: 'rs123',
      A: {
        hgvsg: ['NC_000001.11:g.1000A>T'],
        vcf_string: ['1-1000-A-T'],
      },
      T: {
        hgvsg: ['NC_000001.11:g.1000A>G'],
        vcf_string: ['1-1000-A-G'],
      },
    },
    {
      input: 'rs456',
      id: 'rs456',
      C: {
        hgvsg: ['NC_000002.12:g.2000G>C'],
        vcf_string: ['2-2000-G-C'],
      },
    },
    {
      input: 'ENST00000366667:c.803C>T',
      T: {
        hgvsg: ['NC_000010.11:g.52389C>T'],
        vcf_string: ['10-52389-C-T'],
      },
    },
  ],

  // VEP response for VCF variant
  vepVcfResponse: [
    {
      input: '1 65568 . A C . . .',
      id: 'variant1_1_65568_A_C',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000001',
          gene_id: 'ENSG00000001',
          gene_symbol: 'GENE1',
          consequence_terms: ['missense_variant'],
          impact: 'MODERATE',
          polyphen_score: 0.85,
          sift_score: 0.1,
        },
        {
          transcript_id: 'ENST00000002',
          gene_id: 'ENSG00000001',
          gene_symbol: 'GENE1',
          consequence_terms: ['5_prime_UTR_variant'],
          impact: 'MODIFIER',
        },
      ],
    },
  ],

  // VEP response for HGVS variant
  vepHgvsResponse: [
    {
      input: '10 52389 . C T . . .',
      id: 'variant2_10_52389_C_T',
      most_severe_consequence: 'missense_variant',
      transcript_consequences: [
        {
          transcript_id: 'ENST00000366667',
          gene_id: 'ENSG00000002',
          gene_symbol: 'GENE2',
          consequence_terms: ['missense_variant'],
          impact: 'MODERATE',
          polyphen_score: 0.92,
          sift_score: 0.05,
          cadd_phred: 25.1,
        },
      ],
    },
  ],
};

/**
 * Sets up common nock interceptors for the test
 * @param {Object} options Configuration options for mocking
 * @param {string} options.baseUrl Base URL for the Ensembl API
 * @param {string} options.endpoint Endpoint path to mock
 * @param {Object|Array} options.response Response data to return
 * @param {number} options.statusCode HTTP status code to return (default: 200)
 * @param {string} options.method HTTP method to mock (default: 'GET')
 * @param {Function} options.requestValidator Optional function to validate the request
 * @returns {Object} Nock interceptor
 */
function setupMock({
  baseUrl,
  endpoint,
  response,
  statusCode = 200,
  method = 'GET',
  requestValidator = null,
}) {
  const mock = nock(baseUrl)[method.toLowerCase()](endpoint).query(true); // Accept any query params

  if (requestValidator) {
    return mock.reply(function (uri, requestBody) {
      try {
        requestValidator(uri, requestBody);
        return [statusCode, response];
      } catch (error) {
        console.error('Request validation failed:', error.message);
        return [400, { error: error.message }];
      }
    });
  }

  return mock.reply(statusCode, response);
}

/**
 * Creates a sample realistic VEP annotation result for testing
 * @param {Object} options Options for customizing the VEP response
 * @param {string} options.input Input variant identifier
 * @param {string} options.consequence Consequence type
 * @param {string} options.impact Impact level (HIGH, MODERATE, LOW, MODIFIER)
 * @param {number} options.polyphen Polyphen score (0-1)
 * @param {number} options.sift SIFT score (0-1)
 * @param {number} options.cadd CADD score
 * @returns {Object} A realistic VEP annotation object
 */
function createVepAnnotation({
  input = '1 65568 . A C . . .',
  consequence = 'missense_variant',
  impact = 'MODERATE',
  polyphen = 0.85,
  sift = 0.1,
  cadd = 20.5,
}) {
  return {
    input: input,
    id: `variant_${input.replace(/\s+/g, '_').substr(0, 20)}`,
    most_severe_consequence: consequence,
    transcript_consequences: [
      {
        transcript_id: 'ENST00000001',
        gene_id: 'ENSG00000001',
        gene_symbol: 'GENE1',
        consequence_terms: [consequence],
        impact: impact,
        polyphen_score: polyphen,
        sift_score: sift,
        cadd_phred: cadd,
      },
    ],
  };
}

/**
 * Get the API base URL for tests
 * Will use environment variable if set, otherwise use config
 * @returns {string} API base URL
 */
function getApiBaseUrl() {
  return process.env.ENSEMBL_BASE_URL || apiConfig.ensembl.baseUrl;
}

/**
 * Finds VEP baseline data for a given input variant by trying multiple matching strategies
 * @param {string} inputVariant - Variant in CHR-POS-REF-ALT format
 * @param {Map} parsedVepData - Parsed VEP data map
 * @returns {Array|null} VEP consequences or null if not found
 */
function findVepDataForVariant(inputVariant, parsedVepData) {
  const [chrom, pos, ref, alt] = inputVariant.split('-');
  const position = parseInt(pos);

  // Strategy 1: Direct match (for SNVs and simple cases)
  if (parsedVepData.has(inputVariant)) {
    return parsedVepData.get(inputVariant);
  }

  // Strategy 2: Look for any VEP key that matches this genomic region and variant type
  for (const [vepKey, consequences] of parsedVepData.entries()) {
    const [vepChrom, vepPos] = vepKey.split('-');

    // Must be same chromosome
    if (vepChrom !== chrom) continue;

    const vepPosition = parseInt(vepPos);

    // Check if this VEP entry could represent our input variant
    if (Math.abs(vepPosition - position) <= Math.max(ref.length, alt.length)) {
      // Check if the variant type and change make sense
      const firstConsequence = consequences[0];
      if (firstConsequence) {
        // For deletions: input GT->G should match VEP showing T deletion
        if (ref.length > alt.length) {
          const deleted = ref.substring(alt.length);
          // VEP often represents deletions at the actual deleted position
          // Input: 12-110628749-GT-G means delete T at pos 110628750
          // VEP:   12:110628749-110628750 with T/- means delete T at that span
          if (firstConsequence.Allele === '-' || firstConsequence.Allele === '') {
            // Check if the deleted bases match
            if (
              firstConsequence.REF_ALLELE === deleted ||
              firstConsequence.REF_ALLELE.includes(deleted) ||
              deleted.includes(firstConsequence.REF_ALLELE)
            ) {
              return consequences;
            }
            // Also check position offset for VCF vs VEP coordinate differences
            if (
              Math.abs(vepPosition - (position + alt.length)) <= 1 &&
              firstConsequence.REF_ALLELE === deleted
            ) {
              return consequences;
            }
          }
        }
        // For insertions: input G->GT should match VEP showing T insertion
        else if (alt.length > ref.length) {
          const inserted = alt.substring(ref.length);
          if (firstConsequence.Allele === inserted || firstConsequence.Allele.includes(inserted)) {
            return consequences;
          }
        }
        // For SNVs: should match exactly
        else if (ref.length === alt.length) {
          if (firstConsequence.REF_ALLELE === ref && firstConsequence.Allele === alt) {
            return consequences;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Parses the VEP web tool's tab-separated output file.
 * @param {string} filePath - The path to the VEP TSV output file.
 * @returns {Map<string, Array<Object>>} A map where keys are the 'Uploaded_variation'
 *   and values are arrays of consequence objects.
 */
function parseVepWebOutput(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('##'));

  if (lines.length < 2) {
    return new Map();
  }

  const header = lines[0].split('\t');
  const data = lines.slice(1);
  const parsed = new Map();

  data.forEach((line) => {
    const values = line.split('\t');
    const consequence = {};

    header.forEach((key, index) => {
      const value = values[index] || '';
      // Convert numeric values
      if (value && !isNaN(value) && value !== '-') {
        consequence[key] = parseFloat(value);
      } else {
        consequence[key] = value === '-' ? '' : value;
      }
    });

    // Use location to map variants since Uploaded_variation might be '.'
    const location = consequence.Location;

    let variantKey = consequence.Uploaded_variation;

    // If Uploaded_variation is '.', construct key from location and alleles
    if (!variantKey || variantKey === '.') {
      if (location) {
        // Parse location format like "6:52025536-52025536" or "12:110628749-110628750"
        const locationMatch = location.match(/^(\w+):(\d+)-(\d+)$/);
        if (locationMatch) {
          const [, chrom, startPos, endPos] = locationMatch;
          const start = parseInt(startPos);
          const end = parseInt(endPos);

          // Get allele information
          const refAllele = consequence.REF_ALLELE || '';
          const altAllele = consequence.Allele || '';
          const uploadedAllele = consequence.UPLOADED_ALLELE || '';

          // Handle different variant types based on VEP's representation
          if (altAllele === '-' && uploadedAllele.includes('/')) {
            // This is a deletion - try to reconstruct from UPLOADED_ALLELE
            const [origRef, origAlt] = uploadedAllele.split('/');
            if (origAlt === '-') {
              // Pure deletion: REF_ALLELE is what's deleted, need to find context
              // For deletions like GT->G, VEP shows T/- at the deleted position
              // We need to reconstruct the original REF and ALT

              // Common pattern: if this is a single-base deletion within a larger context
              // Try to match against known patterns
              if (end - start === 0) {
                // Single position deletion - might be GT->G represented as T->''
                variantKey = `${chrom}-${start}-${origRef}${refAllele}-${origRef}`;
              } else {
                // Multi-position deletion
                variantKey = `${chrom}-${start}-${origRef}-${origAlt === '-' ? '' : origAlt}`;
              }
            }
          } else if (uploadedAllele && uploadedAllele.includes('/')) {
            // Handle normal SNVs and complex variants with UPLOADED_ALLELE
            const [ref, alt] = uploadedAllele.split('/');
            variantKey = `${chrom}-${start}-${ref}-${alt}`;
          } else {
            // Fallback to basic format
            variantKey = `${chrom}-${start}-${refAllele}-${altAllele}`;
          }
        }
      }
    }

    if (variantKey && variantKey !== '.') {
      if (!parsed.has(variantKey)) {
        parsed.set(variantKey, []);
      }
      parsed.get(variantKey).push(consequence);
    }
  });

  return parsed;
}

/**
 * Transforms parsed VEP web output into the JSON format expected by VEP REST API.
 * This creates a mock VEP REST API response from baseline TSV data.
 * @param {Array<Object>} consequences - Array of consequence objects from parseVepWebOutput
 * @param {string} variantKey - The variant key (chromosome-position-ref-alt format)
 * @returns {Array<Object>} VEP REST API compatible response
 */
function transformBaselineToVepJson(consequences, variantKey) {
  if (!consequences || consequences.length === 0) {
    return [];
  }

  // Extract variant info from the key
  const [chrom, pos, ref, alt] = variantKey.split('-');

  // Group consequences by location to create annotation objects
  const annotationMap = new Map();

  consequences.forEach((consequence) => {
    const location = consequence.Location || `${chrom}:${pos}-${pos}`;

    if (!annotationMap.has(location)) {
      // Create base annotation object
      annotationMap.set(location, {
        input: `${chrom} ${pos} . ${ref} ${alt} . . .`,
        id: `${chrom}_${pos}_${ref}_${alt}`,
        seq_region_name: chrom,
        start: parseInt(pos),
        end: parseInt(pos),
        strand: 1,
        allele_string: `${ref}/${alt}`,
        most_severe_consequence: consequence.Consequence,
        transcript_consequences: [],
        // Add top-level fields
        existing_variation: consequence.Existing_variation ? [consequence.Existing_variation] : [],
        cadd_phred: consequence.CADD_PHRED || undefined,
        cadd_raw: consequence.CADD_RAW || undefined,
        clin_sig: consequence.CLIN_SIG ? consequence.CLIN_SIG.split(',') : undefined,
        // Add frequency data at top level
        gnomad_genome_af: consequence.gnomADg_AF || undefined,
        gnomad_exome_af: consequence.gnomADe_AF || undefined,
      });
    }

    const annotation = annotationMap.get(location);

    // Create transcript consequence object
    if (consequence.Feature && consequence.Feature_type === 'Transcript') {
      const transcriptConsequence = {
        transcript_id: consequence.Feature,
        gene_id: consequence.Gene,
        gene_symbol: consequence.SYMBOL,
        consequence_terms: consequence.Consequence ? consequence.Consequence.split('&') : [],
        impact: consequence.IMPACT,
        feature_type: consequence.Feature_type,
        biotype: consequence.BIOTYPE,
        hgvsc: consequence.HGVSc || undefined,
        hgvsp: consequence.HGVSp || undefined,
        protein_start: consequence.Protein_position
          ? typeof consequence.Protein_position === 'string'
            ? parseInt(consequence.Protein_position.split('-')[0])
            : consequence.Protein_position
          : undefined,
        protein_end: consequence.Protein_position
          ? typeof consequence.Protein_position === 'string'
            ? parseInt(
                consequence.Protein_position.split('-')[1] ||
                  consequence.Protein_position.split('-')[0]
              )
            : consequence.Protein_position
          : undefined,
        amino_acids: consequence.Amino_acids || undefined,
        codons: consequence.Codons || undefined,
        strand: parseInt(consequence.STRAND) || 1,
        // Add prediction scores at transcript level
        sift_prediction: consequence.SIFT_pred || undefined,
        sift_score: consequence.SIFT_score || undefined,
        polyphen_prediction: consequence.PolyPhen_pred || undefined,
        polyphen_score: consequence.PolyPhen_score || undefined,
        // Add frequency data at transcript level
        gnomad_genome_af: consequence.gnomADg_AF || undefined,
        gnomad_exome_af: consequence.gnomADe_AF || undefined,
        cadd_phred: consequence.CADD_PHRED || undefined,
        cadd_raw: consequence.CADD_RAW || undefined,
        // Add additional frequency breakdowns
        gnomad_genome_afr_af: consequence.gnomADg_AFR_AF || undefined,
        gnomad_genome_amr_af: consequence.gnomADg_AMR_AF || undefined,
        gnomad_genome_asj_af: consequence.gnomADg_ASJ_AF || undefined,
        gnomad_genome_eas_af: consequence.gnomADg_EAS_AF || undefined,
        gnomad_genome_fin_af: consequence.gnomADg_FIN_AF || undefined,
        gnomad_genome_nfe_af: consequence.gnomADg_NFE_AF || undefined,
        gnomad_genome_oth_af: consequence.gnomADg_OTH_AF || undefined,
        gnomad_genome_sas_af: consequence.gnomADg_SAS_AF || undefined,
        gnomad_exome_afr_af: consequence.gnomADe_AFR_AF || undefined,
        gnomad_exome_amr_af: consequence.gnomADe_AMR_AF || undefined,
        gnomad_exome_asj_af: consequence.gnomADe_ASJ_AF || undefined,
        gnomad_exome_eas_af: consequence.gnomADe_EAS_AF || undefined,
        gnomad_exome_fin_af: consequence.gnomADe_FIN_AF || undefined,
        gnomad_exome_nfe_af: consequence.gnomADe_NFE_AF || undefined,
        gnomad_exome_oth_af: consequence.gnomADe_OTH_AF || undefined,
        gnomad_exome_sas_af: consequence.gnomADe_SAS_AF || undefined,
      };

      // Remove undefined values to match real API response
      Object.keys(transcriptConsequence).forEach((key) => {
        if (transcriptConsequence[key] === undefined) {
          delete transcriptConsequence[key];
        }
      });

      annotation.transcript_consequences.push(transcriptConsequence);
    }
  });

  return Array.from(annotationMap.values());
}

module.exports = {
  expect,
  mockResponses,
  setupMock,
  createVepAnnotation,
  getApiBaseUrl,
  parseVepWebOutput,
  transformBaselineToVepJson,
  findVepDataForVariant,
  // Export variant format constants for direct use in tests
  vcfVariant,
  hgvsVariant,
  rsVariant,
  mixedVariants,
};
