'use strict';

const { expect } = require('chai');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function runCli(args, input) {
  const bootstrap = `
    const p = require.resolve('./src/vepRegionsAnnotation');
    require.cache[p] = {id:p, filename:p, loaded:true, exports: async inputs => {
      if(inputs.some(input => input.includes('999'))) throw new Error('fixture failure');
      return inputs.map(input => ({input, seq_region_name:'1',start:100,end:100,
        allele_string:'A/C',most_severe_consequence:'missense_variant',
        transcript_consequences:[{transcript_id:'T',consequence_terms:['missense_variant']}]}));
    }};
    process.argv = ['node','src/main.js',...JSON.parse(process.env.VL_TEST_ARGS)];
    if (process.argv.includes('--stream')) {
      require('./src/vcfReader').readVariantsFromVcf = () => { throw new Error('Unexpected materialization'); };
    }
    require('./src/main.js');
  `;
  return spawnSync(process.execPath, ['-e', bootstrap], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    input,
    timeout: 10000,
    env: { ...process.env, VL_TEST_ARGS: JSON.stringify(args) },
  });
}

describe('CLI stream contracts', function () {
  this.timeout(30000);
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-cli-contract-'));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reports lost chunks as unsuccessful and retains the first successful header', () => {
    const result = runCli(['--output', 'TSV', '--chunk-size', '1'], '1-999-A-C\n1-100-A-C\n');
    expect(result.status).not.to.equal(0);
    expect(result.stdout).to.match(/^OriginalInput\t/);
    expect(result.stdout).to.include('1-100-A-C');
  });

  it('applies tabular filters in streaming mode', () => {
    const result = runCli(
      [
        '--output',
        'TSV',
        '--filter',
        JSON.stringify({ most_severe_consequence: { eq: 'stop_gained' } }),
      ],
      '1-100-A-C\n'
    );
    expect(result.status).to.equal(0);
    expect(result.stdout).not.to.include('missense_variant');
  });

  it('uses the same columns for SNV and CNV chunks', () => {
    const result = runCli(['--output', 'TSV', '--chunk-size', '1'], '1-100-A-C\n1:100-200:DEL\n');
    expect(result.status).to.equal(0);
    const widths = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').length);
    expect(widths).to.have.length(3);
    expect(new Set(widths).size).to.equal(1);
  });

  it('rejects nonpositive chunk sizes instead of silently changing their meaning', () => {
    const result = runCli(['--output', 'TSV', '--chunk-size', '-1'], '');
    expect(result.status).not.to.equal(0);
  });

  it('fails when an explicitly requested feature file cannot be read', () => {
    const result = runCli(['--variant', '1-100-A-C', '--bed-file', 'missing-fixture.bed'], '');
    expect(result.status).not.to.equal(0);
  });

  it('fails when the requested output cannot be saved', () => {
    const result = runCli(
      ['--variant', '1-100-A-C', '--save', 'missing-directory/result.json'],
      ''
    );
    expect(result.status).not.to.equal(0);
  });

  it('streams complete VCF records with original multiallelic sample fields', () => {
    const input = path.join(directory, 'input.vcf');
    const output = path.join(directory, 'output.vcf');
    const lines = [
      '##fileformat=VCFv4.2',
      '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tchild',
      '1\t100\tfirst\tA\tC,G\t50\tPASS\t.\tGT\t1|2',
      '1\t200\tsecond\tA\tC\t60\tPASS\t.\tGT\t0/1',
    ];
    fs.writeFileSync(input, lines.join('\n') + '\n');
    const result = runCli(
      ['--stream', '--vcf-input', input, '--output', 'VCF', '--chunk-size', '1', '--save', output],
      ''
    );
    expect(result.status, result.stderr).to.equal(0);
    const saved = fs.readFileSync(output, 'utf8');
    expect(saved.split('\n').filter((line) => line.startsWith('#CHROM'))).to.have.length(1);
    const records = saved.split('\n').filter((line) => line && !line.startsWith('#'));
    expect(records).to.have.length(2);
    for (let i = 0; i < records.length; i++) {
      const actual = records[i].split('\t');
      const original = lines[i + 3].split('\t');
      expect(actual.slice(0, 7)).to.deep.equal(original.slice(0, 7));
      expect(actual.slice(8)).to.deep.equal(original.slice(8));
      expect(actual[7]).to.include('VL_CSQ=');
    }
  });

  it('emits exactly one compact JSON document per stdin chunk', () => {
    const result = runCli(['--output', 'JSON', '--chunk-size', '1'], '1-100-A-C\n1-200-A-C\n');
    expect(result.status, result.stderr).to.equal(0);
    const records = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records.map((record) => record.annotationData[0].variantKey)).to.deep.equal([
      '1-100-A-C',
      '1-200-A-C',
    ]);
  });

  it('preserves a header-only VCF and rejects inheritance in bounded mode', () => {
    const input = path.join(directory, 'empty.vcf');
    fs.writeFileSync(
      input,
      '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n'
    );
    const args = ['--stream', '--vcf-input', input, '--output', 'VCF'];
    const result = runCli(args, '');
    expect(result.status, result.stderr).to.equal(0);
    expect(result.stdout).to.include('#CHROM');
    const invalid = runCli([...args, '--calculate-inheritance'], '');
    expect(invalid.status).not.to.equal(0);
    expect(invalid.stderr).to.include('Inheritance requires full-file');
  });

  it('honors configuration values when CLI flags are absent', () => {
    const config = path.join(directory, 'config.json');
    fs.writeFileSync(config, JSON.stringify({ output: 'TSV', variant: '1-100-A-C' }));
    const result = runCli(['--config', config], '');
    expect(result.status, result.stderr).to.equal(0);
    expect(result.stdout).to.match(/^OriginalInput\t/);
  });
});
