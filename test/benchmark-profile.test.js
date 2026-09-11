'use strict';
const { expect } = require('chai');
const axios = require('axios').default;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createProfiler } = require('../scripts/benchmark/profile.cjs');

describe('Benchmark request profiler', () => {
  it('records adapter attempts, failures, request quantiles and server rate headers', async () => {
    let time = 0;
    let calls = 0;
    const client = axios.create({
      adapter: async (config) => {
        time += ++calls === 1 ? 10 : 30;
        if (calls === 2)
          throw Object.assign(new Error('throttled'), {
            response: { status: 429, headers: { 'retry-after': '40.5' } },
          });
        return { config, status: 200, data: [], headers: { 'x-ratelimit-remaining': '54999' } };
      },
    });
    const profiler = createProfiler({ client, now: () => time, fixtures: true });
    await client.post('https://rest.ensembl.org/vep/human/region', { variants: ['a', 'b'] });
    try {
      await client.post('https://rest.ensembl.org/vep/human/region', { variants: ['c'] });
    } catch {
      // The injected 429 is the measured failure.
    }
    const report = profiler.stop();
    expect(report.requestCount).to.equal(2);
    expect(report.failedRequestCount).to.equal(1);
    expect(report.requestLatencyMs).to.deep.equal({ p50: 10, p95: 30, total: 40 });
    expect(report.requests.map((request) => request.inputCount)).to.deep.equal([2, 1]);
    expect(report.requests[1].rateLimit.retryAfter).to.equal('40.5');
    expect(report.requests[0].rateLimit.remaining).to.equal('54999');
    expect(report.runtimeMs).to.equal(40);
    expect(report.peakRssBytes).to.be.greaterThan(0);
  });

  it('requires explicit live opt-in before permitting a non-fixture transport', async () => {
    let called = false;
    const client = axios.create({
      adapter: async () => {
        called = true;
        return {};
      },
    });
    const profiler = createProfiler({ client });
    let failure;
    try {
      await client.get('https://rest.ensembl.org/info/ping');
    } catch (error) {
      failure = error;
    }
    profiler.stop();
    expect(failure.message).to.include('explicit live opt-in');
    expect(called).to.equal(false);
  });

  it('permits recorded replay without live opt-in and labels it separately from synthetic fixtures', async () => {
    const client = axios.create({
      adapter: async (config) => ({ config, status: 200, data: [], headers: {} }),
    });
    const profiler = createProfiler({ client, replay: true });
    await client.get('https://rest.ensembl.org/info/ping');
    const report = profiler.stop();
    expect(report.transport).to.equal('replay');
    expect(report.requestCount).to.equal(1);
  });

  it('distinguishes retries from chunks using fetch signals and records UTF-8 body byte counts', async () => {
    const client = axios.create({
      adapter: async (config) => ({ config, status: 200, data: '["é"]', headers: {} }),
    });
    const profiler = createProfiler({ client, fixtures: true });
    const first = new AbortController();
    await client.post(
      'https://rest.ensembl.org/vep/human/region',
      { variants: ['é'] },
      { signal: first.signal }
    );
    await client.post(
      'https://rest.ensembl.org/vep/human/region',
      { variants: ['é'] },
      { signal: first.signal }
    );
    await client.post(
      'https://rest.ensembl.org/vep/human/region',
      { variants: ['é'] },
      { signal: new AbortController().signal }
    );
    const report = profiler.stop();
    expect(report.retryCount).to.equal(1);
    expect(report.chunkCount).to.equal(2);
    expect(report.requests.map((request) => request.attempt)).to.deep.equal([1, 2, 1]);
    expect(report.requests[0].requestBodyBytes).to.equal(Buffer.byteLength('{"variants":["é"]}'));
    expect(report.requests[0].responseBodyBytes).to.equal(Buffer.byteLength('["é"]'));
    expect(report.requests[0].responseByteSource).to.equal('adapter-body');
  });

  it('restores the transport after stopping and preserves request ordering under concurrency', async () => {
    const resolvers = [];
    const adapter = (config) =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ config, status: 200, data: [], headers: {} }));
      });
    const client = axios.create({ adapter });
    const profiler = createProfiler({ client, fixtures: true });
    const first = client.get('https://rest.ensembl.org/first');
    const second = client.get('https://rest.ensembl.org/second');
    resolvers[1]();
    resolvers[0]();
    await Promise.all([first, second]);
    const report = profiler.stop();
    expect(report.maxInFlight).to.equal(2);
    expect(report.requests.map((request) => request.endpoint)).to.deep.equal(['/first', '/second']);
    expect(client.defaults.adapter).to.equal(adapter);
  });

  it('writes a usable sidecar from an offline CLI subprocess without changing JSON stdout', function () {
    this.timeout(10000);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-profiler-'));
    try {
      const output = path.join(directory, 'profile.json');
      const child = spawnSync(
        process.execPath,
        [
          '--require',
          path.resolve('scripts/benchmark/profile.cjs'),
          '--require',
          path.resolve('test/support/offline-guard.cjs'),
          path.resolve('src/main.js'),
          '--variant',
          '1-100-A-C',
          '--output',
          'JSON',
        ],
        {
          encoding: 'utf8',
          timeout: 8000,
          env: { ...process.env, VL_TEST_FIXTURES: '1', VL_BENCHMARK_PROFILE: output },
        }
      );
      expect(child.status, child.stderr).to.equal(0);
      expect(JSON.parse(child.stdout).annotationData).to.have.length(1);
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      expect(report.transport).to.equal('fixture');
      expect(report.requestCount).to.equal(1);
      expect(report.requests[0].inputCount).to.equal(1);
      expect(report.requests[0].status).to.equal(200);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
