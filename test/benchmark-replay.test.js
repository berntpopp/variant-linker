'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const axios = require('axios').default;

describe('Public annotation benchmark replay', () => {
  let directory;
  let recordPath;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-replay-'));
    recordPath = path.join(directory, 'public-vep.json');
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function recordingClient() {
    return axios.create({
      adapter: async (config) => ({
        data: JSON.stringify([
          { input: JSON.parse(config.data).variants[0], id: 'public-fixture' },
        ]),
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '99',
          'set-cookie': 'secret-cookie',
          authorization: 'secret-token',
        },
        config,
      }),
    });
  }

  it('records public responses and replays canonical requests with identical results', async () => {
    const { installTransport } = require('../scripts/benchmark/replay.cjs');
    const client = recordingClient();
    const capture = installTransport({ client, recordPath, live: true });
    const before = await client.post('https://grch37.rest.ensembl.org/vep/human/region?b=2&a=1', {
      variants: ['22 100 . A C . . .'],
    });
    capture.flush();
    capture.restore();
    const saved = fs.readFileSync(recordPath, 'utf8');
    assert.doesNotMatch(saved, /secret-cookie|secret-token/);
    const networkForbidden = axios.create({
      adapter: () => {
        throw new Error('Unexpected network fallback');
      },
    });
    const replay = installTransport({ client: networkForbidden, replayPath: recordPath });
    const after = await networkForbidden.post(
      'https://grch37.rest.ensembl.org/vep/human/region?a=1&b=2',
      { variants: ['22 100 . A C . . .'] }
    );
    assert.deepEqual(after.data, before.data);
    assert.equal(after.status, before.status);
    assert.equal(after.headers['x-ratelimit-remaining'], '99');
    assert.equal(replay.stats().matched, 1);
    await assert.rejects(
      networkForbidden.post('https://grch37.rest.ensembl.org/vep/human/region', {
        variants: ['missing'],
      }),
      /No recorded response/
    );
    replay.restore();
  });

  it('requires explicit live permission and rejects non-Ensembl recording destinations', async () => {
    const { installTransport } = require('../scripts/benchmark/replay.cjs');
    assert.throws(() => installTransport({ recordPath }), /explicit live/);
    const client = recordingClient();
    const capture = installTransport({ client, recordPath, live: true });
    await assert.rejects(
      client.post('https://other.invalid/vep/human/region', { variants: ['rs1'] }),
      /official Ensembl VEP/
    );
    await assert.rejects(
      client.post('https://user:secret@rest.ensembl.org/vep/human/region', {}),
      /credentials/
    );
    capture.restore();
  });

  it('records and replays the equivalent Variant Recoder request', async () => {
    const { installTransport } = require('../scripts/benchmark/replay.cjs');
    const body = { ids: ['NC_000022.10:g.16050075A>G'] };
    const data = [{ input: body.ids[0], G: { vcf_string: ['22-16050075-A-G'] } }];
    const client = axios.create({
      adapter: async (config) => ({ data, status: 200, headers: {}, config }),
    });
    const capture = installTransport({ client, recordPath, live: true });
    const url = 'https://grch37.rest.ensembl.org/variant_recoder/homo_sapiens';
    assert.deepEqual((await client.post(url, body)).data, data);
    capture.flush();
    capture.restore();
    const replay = installTransport({ client, replayPath: recordPath });
    assert.deepEqual((await client.post(url, body)).data, data);
    replay.restore();
  });

  it('preserves recorded failure then success for retry-equivalent replay', async () => {
    const { installTransport } = require('../scripts/benchmark/replay.cjs');
    let attempts = 0;
    const client = axios.create({
      adapter: async (config) => {
        const response = {
          status: ++attempts === 1 ? 429 : 200,
          data: '{}',
          headers: { 'retry-after': '0' },
          config,
        };
        if (response.status === 429)
          throw new axios.AxiosError(
            'Rate limited',
            'ERR_BAD_REQUEST',
            config,
            undefined,
            response
          );
        return response;
      },
    });
    const capture = installTransport({ client, recordPath, live: true });
    const url = 'https://rest.ensembl.org/vep/human/region';
    await assert.rejects(client.post(url, { variants: ['rs1'] }));
    await client.post(url, { variants: ['rs1'] });
    capture.flush();
    capture.restore();
    const replay = installTransport({ client, replayPath: recordPath });
    await assert.rejects(
      client.post(url, { variants: ['rs1'] }),
      (error) => error.response.status === 429
    );
    assert.equal((await client.post(url, { variants: ['rs1'] })).status, 200);
    assert.equal(attempts, 2);
    replay.restore();
  });

  it('blocks unrelated public network requests in the replay preload', function () {
    this.timeout(10000);
    fs.writeFileSync(recordPath, JSON.stringify({ schemaVersion: 1, entries: {} }));
    const child = spawnSync(
      process.execPath,
      [
        '--require',
        path.resolve('scripts/benchmark/replay.cjs'),
        '-e',
        "require('https').get('https://unexpected.invalid/',()=>process.exitCode=1).on('error',e=>console.log(e.message))",
      ],
      {
        env: { ...process.env, VL_BENCHMARK_REPLAY: recordPath },
        encoding: 'utf8',
        timeout: 8000,
      }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /Disallowed net connect/);
  });
});
