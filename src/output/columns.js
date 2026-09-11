'use strict';
const { formatUserFeatureOverlaps } = require('../featureAnnotator');

/**
 * Default column configuration for CSV/TSV output.
 * Each entry defines a column with:
 * - header: The column header name
 * - path: Dot-notation path to the data within the object
 * - isConsequenceLevel: Whether the path is relative to a consequence (true) or annotation (false)
 * - defaultValue: Value to use if the path is not found
 * - formatter: Optional function to format the extracted value
 */
/**
 * Gets the default column configuration for data extraction.
 * @param {{includeInheritance?:boolean,includeUserFeatures?:boolean,includeCnv?:boolean,scoringFields?:string[]}} options - Optional settings for column generation
 * @returns {import('../analysisTypes').Column[]} Array of column configuration objects
 */
function getDefaultColumnConfig(options = {}) {
  const {
    includeInheritance = false,
    includeUserFeatures = false,
    includeCnv = false,
    scoringFields = [],
  } = options;

  // Start with core columns that are always included
  /** @type {import('../analysisTypes').Column[]} */
  const defaultColumns = [
    {
      header: 'OriginalInput',
      path: 'originalInput', // <-- FIX: Use originalInput field added by processor
      isConsequenceLevel: false,
      defaultValue: '',
    },
  ];

  // Add inheritance pattern columns if requested
  if (includeInheritance) {
    defaultColumns.push(
      {
        header: 'DeducedInheritancePattern',
        path: 'deducedInheritancePattern.prioritizedPattern',
        isConsequenceLevel: false,
        defaultValue: '',
      },
      {
        header: 'CompHetPartner',
        path: 'deducedInheritancePattern.compHetDetails.partnerVariantKeys',
        isConsequenceLevel: false,
        defaultValue: '',
        formatter: (value) => (Array.isArray(value) ? value.join(',') : value),
      },
      {
        header: 'CompHetGene',
        path: 'deducedInheritancePattern.compHetDetails.geneSymbol',
        isConsequenceLevel: false,
        defaultValue: '',
      }
    );
  }

  // Add remaining standard columns
  defaultColumns.push(
    {
      header: 'VEPInput',
      path: 'input', // <-- FIX: Use the 'input' field which holds the VEP-formatted input
      isConsequenceLevel: false,
      defaultValue: '',
    },
    {
      header: 'Location',
      path: 'seq_region_name',
      isConsequenceLevel: false,
      defaultValue: '',
      formatter: (value, obj) => {
        if (!value) return '';
        const start = obj?.start || '';
        const end = obj?.end || '';
        const strand = obj?.strand || '';
        return `${value}:${start}-${end}(${strand || '1'})`; // Ensure strand defaults to 1 if missing
      },
    },
    {
      header: 'Allele',
      path: 'allele_string',
      isConsequenceLevel: false,
      defaultValue: '',
    },
    {
      header: 'MostSevereConsequence',
      path: 'most_severe_consequence',
      isConsequenceLevel: false,
      defaultValue: '',
    },
    {
      header: 'Impact',
      path: 'impact', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'GeneSymbol',
      path: 'gene_symbol', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'GeneID',
      path: 'gene_id', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'FeatureType',
      path: 'feature_type', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'TranscriptID',
      path: 'transcript_id', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ConsequenceTerms',
      path: 'consequence_terms', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
    },
    {
      header: 'MANE',
      path: 'mane_select', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      formatter: (value, obj) => {
        const mane = obj?.mane_select || obj?.mane_plus_clinical || obj?.mane || value;
        return Array.isArray(mane)
          ? mane.map(String).join(',')
          : typeof mane === 'string'
            ? mane
            : '';
      },
    },
    {
      header: 'HGVSc',
      path: 'hgvsc', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'HGVSp',
      path: 'hgvsp', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ProteinPosition',
      path: 'protein_start', // Base path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
      formatter: (value, obj) => {
        // obj here is the consequence object
        if (!value) return '';
        const end = obj?.protein_end || value;
        return `${value}-${end}`;
      },
    },
    {
      header: 'Amino_acids',
      path: 'amino_acids', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'Codons',
      path: 'codons', // Correct path relative to consequence
      isConsequenceLevel: true,
      defaultValue: '',
    },
    {
      header: 'ExistingVariation',
      path: 'existing_variation',
      isConsequenceLevel: false, // This IS annotation level
      defaultValue: '',
      formatter: (value) => (Array.isArray(value) ? value.join('&') : value),
    },
    {
      header: 'CADD',
      // CADD scores are often top-level, but check VEP response structure.
      // If cadd_phred exists within consequence, change isConsequenceLevel to true
      // Assuming it's annotation level for now based on previous structure.
      path: 'cadd_phred',
      isConsequenceLevel: false, // This IS annotation level
      defaultValue: '',
    },
    {
      header: 'SIFT',
      path: 'sift_prediction', // <-- FIX: Path relative to consequence
      isConsequenceLevel: true, // Should be true
      defaultValue: '',
    },
    {
      header: 'PolyPhen',
      path: 'polyphen_prediction', // <-- FIX: Path relative to consequence
      isConsequenceLevel: true, // Should be true
      defaultValue: '',
    }
    // Add any other custom score columns here if needed
    // e.g., from the scoring module output, which might be top-level or consequence-level
  );

  // Add user feature overlap column if requested
  if (includeUserFeatures) {
    defaultColumns.push({
      header: 'UserFeatureOverlap',
      path: 'user_feature_overlap',
      isConsequenceLevel: false,
      defaultValue: '',
      formatter: (value) => (Array.isArray(value) ? formatUserFeatureOverlaps(value) : ''),
    });
  }

  // Add CNV-specific columns if requested
  if (includeCnv) {
    defaultColumns.push(
      {
        header: 'BP_Overlap',
        path: 'bp_overlap',
        isConsequenceLevel: true, // This is a per-consequence field from VEP
        defaultValue: '',
      },
      {
        header: 'Percentage_Overlap',
        path: 'percentage_overlap',
        isConsequenceLevel: true, // This is a per-consequence field from VEP
        defaultValue: '',
      },
      {
        header: 'Phenotypes',
        path: 'phenotypes',
        isConsequenceLevel: false, // This is a top-level annotation field
        defaultValue: '',
        formatter: (value) => {
          if (!value) return '';
          if (Array.isArray(value)) {
            return value.map((p) => p.phenotype || p).join(';');
          }
          return value;
        },
      },
      {
        header: 'DosageSensitivity',
        path: 'dosage_sensitivity',
        isConsequenceLevel: false, // This is a top-level annotation field
        defaultValue: '',
        formatter: (value) => {
          if (!value) return '';
          if (typeof value === 'object') {
            // Format dosage sensitivity information
            const parts = [];
            if ('gene_name' in value && value.gene_name) parts.push(`Gene:${value.gene_name}`);
            if ('phaplo' in value && value.phaplo) parts.push(`Haplo:${value.phaplo}`);
            if ('ptriplo' in value && value.ptriplo) parts.push(`Triplo:${value.ptriplo}`);
            return parts.join(';');
          }
          return value;
        },
      }
    );
  }

  // Add scoring columns if provided
  if (scoringFields && scoringFields.length > 0) {
    scoringFields.forEach((fieldName) => {
      defaultColumns.push({
        header: fieldName
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(''),
        path: fieldName,
        isConsequenceLevel: false, // Scoring fields are typically annotation-level
        defaultValue: '',
      });
    });
  }

  return defaultColumns;
}

module.exports = { getDefaultColumnConfig };
