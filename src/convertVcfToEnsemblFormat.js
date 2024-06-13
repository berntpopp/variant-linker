// src/convertVcfToEnsemblFormat.js

/**
 * Converts VCF notation to Ensembl region and allele format for the VEP API.
 * 
 * @param {string} vcf - The VCF notation in the format "chrom-pos-ref-alt".
 * @returns {Object} An object containing the Ensembl region format and the allele.
 */
function convertVcfToEnsemblFormat(vcf) {
    const [chrom, pos, ref, alt] = vcf.split('-');
    const start = parseInt(pos);
    const end = start + ref.length - 1;
    const strand = '1'; // Assuming positive strand
  
    let region, allele;
  
    if (ref.length === 1 && alt.length === 1) {
      // Single nucleotide variant (SNV)
      region = `${chrom}:${start}-${start}:${strand}`;
      allele = alt;
    } else if (ref.length > 1 && alt === '-') {
      // Deletion
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = '-';
    } else if (ref === '-' && alt.length > 1) {
      // Insertion
      region = `${chrom}:${start + 1}-${start}:${strand}`;
      allele = alt.slice(1); // Remove the first base which matches the reference
    } else {
      // Complex indel (e.g., substitution with different lengths of ref and alt)
      region = `${chrom}:${start + 1}-${end}:${strand}`;
      allele = alt.slice(1); // Remove the first base which matches the reference
    }
  
    return { region, allele };
  }
  
  module.exports = convertVcfToEnsemblFormat;
  