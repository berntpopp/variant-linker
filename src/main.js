#!/usr/bin/env node
'use strict';
const { parseArguments } = require('./cli/arguments');
const defaults = require('../config/cliDefaults.json');
const {
  readConfigFile,
  mergeParams,
  enableDebugging,
  validateParams,
  handleError,
} = require('./cli/helpers');
const { parseProxyConfig } = require('./apiHelper');
const { processStream } = require('./cli/stream');
const { processFileBased } = require('./cli/file');
const { processVcfStream } = require('./cli/vcfStream');
async function main() {
  const argv = parseArguments(process.argv.slice(2));
  if (argv.help || argv.version) return;
  if (argv.semver) {
    const { getVersionDetails } = require('./version');
    const details = getVersionDetails();
    console.log('Semantic Version Details:');
    for (const [name, value] of Object.entries(details).slice(0, 4)) {
      console.log(name[0].toUpperCase() + name.slice(1) + ': ' + value);
    }
    if (details.prerelease.length) console.log('Prerelease: ' + details.prerelease.join('.'));
    if (details.build.length) console.log('Build Metadata: ' + details.build.join('.'));
    return;
  }
  const params = mergeParams(readConfigFile(argv.config), argv);
  if (params.debug && params.debug > 0) enableDebugging(params.debug, params.log_file);
  params.assembly = params.assembly || defaults.assembly;
  params.proxyConfig = params.proxy ? parseProxyConfig(params.proxy, params.proxyAuth) : null;
  params.requestOptions = {
    ...params.requestOptions,
    ...(params.apiBaseUrl || params.requestOptions?.baseUrl || process.env.ENSEMBL_BASE_URL
      ? {
          baseUrl:
            params.apiBaseUrl || params.requestOptions?.baseUrl || process.env.ENSEMBL_BASE_URL,
        }
      : {}),
    ...(params.apiTimeout !== undefined ? { timeoutMs: params.apiTimeout } : {}),
    ...(params.apiConcurrency !== undefined ? { postConcurrency: params.apiConcurrency } : {}),
  };
  params.isStreaming =
    !params.variant &&
    !params.variants &&
    !params.variantsFile &&
    !params.vcfInput &&
    !process.stdin.isTTY;
  validateParams(params);
  if (params.stream) await processVcfStream(params);
  else if (params.isStreaming) await processStream(params);
  else await processFileBased(params);
}
main().catch((error) => {
  handleError(error);
  process.exitCode = 1;
});
