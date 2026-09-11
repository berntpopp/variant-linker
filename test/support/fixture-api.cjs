'use strict';

const nock = require('nock');

// Synthetic transport fixtures: their biological values are test data, not references.
const aliases = {
  rs6025: '1-169549811-C-T',
  rs123: '1-1000-A-G',
  rs456: '2-2000-G-C',
  rs789: '3-3000-C-T',
  rs28897696: '13-32340301-G-A',
  'ENST00000366667:c.803C>T': '1-65568-A-C',
  'ENST00000302118:c.137G>A': '1-55039974-G-A',
  'NM_000059.3:c.7790G>A': '13-32340301-G-A',
  'NM_000088.3:c.589G>T': '17-50198002-G-T',
  'NM_001009944:c.540dup': '1-1000-A-AT',
};

function recode(input) {
  const coordinate = aliases[input];
  if (!coordinate) return { input, error: `No offline recoder fixture for ${input}` };
  const [chromosome, position, ref, alt] = coordinate.split('-');
  return {
    input,
    [alt]: {
      input,
      id: [input],
      vcf_string: [coordinate],
      hgvsg: [`${chromosome}:g.${position}${ref}>${alt}`],
      hgvsc: [`ENST000001.1:c.100${ref}>${alt}`],
    },
  };
}

function annotate(input) {
  const vcf = input.trim().split(/\s+/);
  const coordinate = input.match(/^(?:chr)?([^:-]+)-(\d+)-([A-Z-]+)-([A-Z-]+)$/);
  const cnv = input.match(/^(?:chr)?([^:]+):(\d+)-(\d+):([A-Z]+)$/i);
  let chromosome;
  let start;
  let end;
  let ref;
  let alt;
  if (coordinate) {
    [, chromosome, start, ref, alt] = coordinate;
    end = Number(start) + ref.length - 1;
  } else if (cnv) {
    [, chromosome, start, end, alt] = cnv;
    ref = 'N';
  } else if (vcf.length >= 5) {
    [chromosome, start, , ref, alt] = vcf;
    end = Number(start) + ref.length - 1;
  } else {
    throw new Error(`No offline VEP fixture for ${input}`);
  }
  const gene = Number(start) === 65568 ? 'OR4F5' : input.includes('169549811') ? 'F5' : 'TEST_GENE';
  const transcript = {
    gene_symbol: gene,
    gene_id: 'ENSG00000123456',
    transcript_id: 'ENST00000123456',
    consequence_terms: ['missense_variant'],
    impact: 'MODERATE',
    biotype: 'protein_coding',
    variant_allele: alt,
    strand: 1,
    canonical: 1,
    pick: 1,
    mane_select: 'NM_000001.1',
    cadd_phred: 25,
    cadd_raw: 2.5,
    hgvsc: 'ENST00000123456:c.100A>G',
    hgvsp: 'ENSP000001:p.Lys34Arg',
    sift_prediction: 'deleterious',
    sift_score: 0.01,
    polyphen_prediction: 'probably_damaging',
    polyphen_score: 0.99,
  };
  return {
    input,
    seq_region_name: chromosome,
    start: Number(start),
    end: Number(end),
    strand: 1,
    assembly_name: 'GRCh38',
    allele_string: `${ref}/${alt}`,
    most_severe_consequence: 'missense_variant',
    transcript_consequences: [
      transcript,
      {
        ...transcript,
        transcript_id: 'ENST00000999999',
        pick: 0,
        canonical: 0,
        mane_select: undefined,
        consequence_terms: ['synonymous_variant'],
        impact: 'LOW',
      },
    ],
    colocated_variants: [{ id: 'rs6025', frequencies: { [alt]: { gnomade: 0.0001 } } }],
  };
}

function installFixtureApi() {
  for (const base of ['https://rest.ensembl.org', 'https://grch37.rest.ensembl.org']) {
    nock(base)
      .persist()
      .post(/\/variant_recoder\/(?:human|homo_sapiens)$/)
      .query(true)
      .reply(200, (_uri, body) => (body.ids || []).map(recode));
    nock(base)
      .persist()
      .get(/\/variant_recoder\/(?:human|homo_sapiens)\/.+/)
      .query(true)
      .reply(200, (uri) => {
        const value = recode(decodeURIComponent(uri.split('?')[0].split('/').pop()));
        const alleles = { ...value };
        delete alleles.input;
        return [alleles];
      });
    nock(base)
      .persist()
      .post('/vep/homo_sapiens/region')
      .query(true)
      .reply((_uri, body) => {
        try {
          return [200, (body.variants || []).map(annotate)];
        } catch (error) {
          return [400, { error: error.message }];
        }
      });
  }
}

function useFixtureApi() {
  beforeEach(() => installFixtureApi());
  afterEach(() => nock.cleanAll());
}

module.exports = { aliases, annotate, recode, installFixtureApi, useFixtureApi };
