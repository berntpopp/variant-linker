'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const proxyquire = require('proxyquire');

const variants = ['1-100-A-C', '1:200-300:DEL', 'NM_123.1:c.1A>C'];
function recoder(input) {
  return { input, A: { input, vcf_string: ['2-400-G-A'] } };
}
function annotation(input) {
  return { input, transcript_consequences: [{ consequence_terms: ['missense_variant'] }] };
}
const { analyzeVariant } = proxyquire('../src/variantLinkerCore', {
  './vepRegionsAnnotation': async (inputs) => inputs.map(annotation),
  './variantRecoder': async (input) => [recoder(input)],
  './variantRecoderPost': async (inputs) => inputs.map(recoder),
});
function rows(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'));
}

describe('Direct input VCF output', () => {
  for (const variant of variants) {
    it(`emits one VCF data row for ${variant}`, async () => {
      const output = await analyzeVariant({ variant, output: 'VCF' });
      const records = rows(output);
      assert.equal(records.length, 1);
      const expected = variant.startsWith('NM_')
        ? ['2', '400', 'G', 'A']
        : variant.includes(':')
          ? ['1', '200', 'N', '<DEL>']
          : ['1', '100', 'A', 'C'];
      assert.deepEqual([records[0][0], records[0][1], records[0][3], records[0][4]], expected);
      if (variant.includes(':200-')) {
        assert.match(output, /##INFO=<ID=END,Number=1,Type=Integer/);
        assert.match(output, /##INFO=<ID=SVTYPE,Number=1,Type=String/);
        assert.match(records[0][7], /(?:^|;)END=300(?:;|$)/);
        assert.match(records[0][7], /(?:^|;)SVTYPE=DEL(?:;|$)/);
      }
    });
  }
  it('emits all types in a mixed batch', async () => {
    assert.equal(rows(await analyzeVariant({ variants, output: 'VCF' })).length, 3);
  });
  it('retains distinct structural spans sharing the same start and type', async () => {
    const records = rows(
      await analyzeVariant({ variants: ['1:200-300:DEL', '1:200-500:DEL'], output: 'VCF' })
    );
    assert.equal(records.length, 2);
    assert.match(records[0][7], /END=300/);
    assert.match(records[1][7], /END=500/);
  });
  it('emits a data row through the actual --variant CLI path', () => {
    const bootstrap = `const p=require.resolve('./src/vepRegionsAnnotation');
      require.cache[p]={id:p,filename:p,loaded:true,exports:async inputs=>inputs.map(input=>({input,transcript_consequences:[]}))};
      process.argv=['node','src/main.js','--variant','1-100-A-C','--output','VCF'];
      require('./src/main.js');`;
    const result = spawnSync(process.execPath, ['-e', bootstrap], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(rows(result.stdout).length, 1);
  });
});
