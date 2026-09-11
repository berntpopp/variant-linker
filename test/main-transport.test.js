'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

describe('CLI transport configuration', function () {
  this.timeout(20000);
  it('honors configured API presets and lets explicit parameter strings override them', async () => {
    const { prepareStream } = require('../src/cli/stream');
    const result = await prepareStream({
      output: 'JSON',
      vepOptions: { CADD: 0, hgvs: 1 },
      recoderOptions: { vcf_string: 0 },
      vep_params: 'hgvs=0',
    });
    assert.equal(result.vepOptions.CADD, 0);
    assert.equal(result.vepOptions.hgvs, '0');
    assert.equal(result.recoderOptions.vcf_string, 0);
  });
  function run(args, environment = {}) {
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `
      const file = require.resolve('./src/cli/file');
      require.cache[file] = { id:file, filename:file, loaded:true, exports:{processFileBased: async params => console.log(JSON.stringify({proxy:params.proxyConfig, requestOptions:params.requestOptions}))} };
      process.argv = ['node','src/main.js',...JSON.parse(process.env.VL_TRANSPORT_ARGS)];
      require('./src/main.js');
    `,
      ],
      {
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          ENSEMBL_BASE_URL: '',
          ...environment,
          VL_TRANSPORT_ARGS: JSON.stringify(['--variant', '1-100-A-C', ...args]),
        },
      }
    );
    assert.equal(child.status, 0, child.stderr + child.stdout);
    return JSON.parse(child.stdout);
  }
  it('leaves environment proxy discovery enabled when no explicit proxy was supplied', () => {
    assert.equal(run([]).proxy, null);
  });
  it('forwards explicit API controls and gives an explicit mirror precedence over the environment', () => {
    const result = run(
      [
        '--api-base-url',
        'https://explicit.test',
        '--api-timeout',
        '60000',
        '--api-concurrency',
        '2',
      ],
      { ENSEMBL_BASE_URL: 'https://environment.test' }
    );
    assert.deepEqual(result.requestOptions, {
      baseUrl: 'https://explicit.test',
      timeoutMs: 60000,
      postConcurrency: 2,
    });
  });
  it('preserves the CLI environment mirror override', () => {
    assert.equal(
      run([], { ENSEMBL_BASE_URL: 'https://environment.test' }).requestOptions.baseUrl,
      'https://environment.test'
    );
  });
});
