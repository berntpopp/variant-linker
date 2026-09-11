'use strict';
const assert = require('node:assert/strict');
const {
  formatToTabular,
  getDefaultColumnConfig,
  detectScoringFields,
  flattenAnnotationData,
} = require('../src/dataExtractor');

describe('Tabular output integrity', () => {
  it('renders optional inheritance, CNV, feature and scoring columns through the real extractor', () => {
    const annotation = {
      originalInput: '1-100-A-C',
      custom_score: 9,
      deducedInheritancePattern: {
        prioritizedPattern: 'compound_heterozygous',
        compHetDetails: { partnerVariantKeys: ['partner1', 'partner2'], geneSymbol: 'GENE' },
      },
      phenotypes: [{ phenotype: 'Kidney disease' }, 'Other finding'],
      dosage_sensitivity: { gene_name: 'GENE', phaplo: 0.5, ptriplo: 0.2 },
      user_feature_overlap: [{ type: 'region', name: 'target', source: 'regions.bed' }],
      transcript_consequences: [
        { bp_overlap: 20, percentage_overlap: 50, mane_plus_clinical: 'NM_1.2' },
      ],
    };
    const config = getDefaultColumnConfig({
      includeInheritance: true,
      includeCnv: true,
      includeUserFeatures: true,
      scoringFields: ['custom_score'],
    });
    const row = flattenAnnotationData([annotation], config)[0];
    assert.equal(row.CompHetPartner, 'partner1,partner2');
    assert.equal(row.CompHetGene, 'GENE');
    assert.equal(row.Phenotypes, 'Kidney disease;Other finding');
    assert.equal(row.DosageSensitivity, 'Gene:GENE;Haplo:0.5;Triplo:0.2');
    assert.equal(row.UserFeatureOverlap, 'region:target(regions.bed)');
    assert.equal(row.CustomScore, 9);
    assert.equal(row.MANE, 'NM_1.2');
  });

  it('retains empty defaults and simple user-supplied CNV values', () => {
    const columns = getDefaultColumnConfig({
      includeCnv: true,
      includeInheritance: true,
      includeUserFeatures: true,
    });
    const empty = flattenAnnotationData([{}], columns)[0];
    assert.equal(empty.Phenotypes, '');
    assert.equal(empty.DosageSensitivity, '');
    assert.equal(empty.CompHetPartner, '');
    const row = flattenAnnotationData(
      [
        {
          phenotypes: 'phenotype',
          dosage_sensitivity: 'unknown',
          transcript_consequences: [{ mane: ['legacy'], protein_start: 3 }],
        },
      ],
      columns
    )[0];
    assert.equal(row.Phenotypes, 'phenotype');
    assert.equal(row.DosageSensitivity, 'unknown');
    assert.equal(row.MANE, 'legacy');
    assert.equal(row.ProteinPosition, '3-3');
  });
  const columns = [
    { header: 'Value', path: 'value' },
    { header: 'Count', path: 'count' },
  ];
  it('escapes TSV tabs, CR, LF and literal backslashes reversibly', () => {
    const value = 'gene\tname\nnext\rline\\t';
    const output = formatToTabular([{ Value: value, Count: 3 }], columns, '\t');
    assert.equal(output, 'Value\tCount\ngene\\tname\\nnext\\rline\\\\t\t3');
    const field = output.split('\n')[1].split('\t')[0];
    assert.equal(
      field.replace(/\\([tnr\\])/g, (_, char) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[char]),
      value
    );
  });

  it('offers spreadsheet-safe text while preserving negative scientific values', () => {
    const rows = ['=SUM(A1:A2)', ' +cmd', '@formula', '-command', '-1.2e-3', -2.5].map((Value) => ({
      Value,
      Count: 1,
    }));
    const normal = formatToTabular(rows, columns, ',', false);
    const safe = formatToTabular(rows, columns, ',', false, { spreadsheetSafe: true });
    assert.equal(normal.split('\n')[0], '=SUM(A1:A2),1');
    assert.deepEqual(safe.split('\n'), [
      "'=SUM(A1:A2),1",
      "' +cmd,1",
      "'@formula,1",
      "'-command,1",
      '-1.2e-3,1',
      '-2.5,1',
    ]);
  });

  it('escapes headers and carriage-return CSV cells consistently', () => {
    const header = [{ header: 'A,B', path: 'x' }];
    assert.equal(formatToTabular([{ 'A,B': 'left\rright' }], header, ','), '"A,B"\n"left\rright"');
    assert.equal(formatToTabular([], header, ','), '"A,B"');
  });

  it('renders actual MANE Select and Plus Clinical transcript fields', () => {
    const column = getDefaultColumnConfig().find((c) => c.header === 'MANE');
    assert.equal(column.formatter(undefined, { mane_select: 'NM_1.2' }), 'NM_1.2');
    assert.equal(column.formatter(undefined, { mane_plus_clinical: 'NM_2.3' }), 'NM_2.3');
  });

  it('does not mistake source identity metadata for scores', () => {
    assert.deepEqual(
      detectScoringFields([{ variantKey: 'X', originalVariantKey: 'Y', custom_score: 2 }]),
      ['custom_score']
    );
  });
});
