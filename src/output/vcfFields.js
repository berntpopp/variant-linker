'use strict';
// One schema for populated, reference-only and header-only VCF output.
const vlCsqFormat = [
  'Allele',
  'Consequence',
  'IMPACT',
  'SYMBOL',
  'Gene',
  'Feature_type',
  'Feature',
  'BIOTYPE',
  'HGVSc',
  'HGVSp',
  'Protein_position',
  'Amino_acids',
  'Codons',
  'Existing_variation',
  'SIFT',
  'PolyPhen',
];
module.exports = { vlCsqFormat };
