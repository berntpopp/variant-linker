'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

async function smoke() {
  const root = path.resolve(__dirname, '..');
  const library = require('../src');
  assert.equal(typeof library.analyzeVariant, 'function');
  assert.equal(library.detectInputFormat('1-100-A-C'), 'VCF');

  const requests = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    ReadableStream,
    Request,
    Response,
    Headers,
    FormData,
    Blob,
    fetch: async (request) => {
      requests.push(typeof request === 'string' ? request : request.url);
      return new Response(JSON.stringify({ fixture: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'dist/variant-linker.bundle.js'), 'utf8'),
    context,
    { timeout: 10000, filename: 'variant-linker.bundle.js' }
  );
  assert.equal(typeof context.VariantLinker.analyzeVariant, 'function');
  const response = await context.VariantLinker.apiHelper.fetchApi('/audit-smoke', {}, false);
  assert.equal(response.fixture, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/rest\.ensembl\.org\/audit-smoke/);

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this smoke through npm run test:package');
  const pack = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (pack.error) throw pack.error;
  assert.equal(pack.status, 0, pack.stderr);
  const files = new Set(JSON.parse(pack.stdout)[0].files.map((file) => file.path));
  for (const required of [
    'src/index.js',
    'src/main.js',
    'dist/variant-linker.bundle.js',
    'schema/variant_annotation.schema.json',
  ])
    assert.ok(files.has(required), `Missing ${required}`);
  console.log('Node exports, browser HTTP transport, and package contents verified.');
}

smoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
