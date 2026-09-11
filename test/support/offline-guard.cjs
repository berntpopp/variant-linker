'use strict';

const nock = require('nock');

// Do not inherit machine-specific corporate proxies in deterministic tests.
for (const name of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
]) {
  delete process.env[name];
}
process.env.NO_PROXY = '*';
nock.disableNetConnect();
nock.enableNetConnect(/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/);

if (process.env.VL_TEST_FIXTURES === '1') {
  require('./fixture-api.cjs').installFixtureApi();
}
