'use strict';
const readline = require('readline');
const { analyzeVariant } = require('../variantLinkerCore');
const { filterAndFormatResults } = require('../variantLinkerProcessor');
const { getDefaultColumnConfig, formatToTabular } = require('../dataExtractor');
const { loadFeatures } = require('../featureParser');
const { readScoringConfigFromFiles } = require('../scoring');
const { parseOptionalParameters } = require('./helpers');
const { writeOutput } = require('./write');

/** @param {string[]} chunk @param {boolean} isFirstChunk
 * @param {import('../analysisTypes').StreamParams} params */
async function processAndOutputChunk(chunk, isFirstChunk, params) {
  try {
    const result = await analyzeVariant({
      ...params,
      variants: chunk,
      isStreaming: true,
      output: 'JSON',
      filter: undefined,
      pickOutput: false,
    });
    if (typeof result === 'string') throw new Error('Unexpected serialized analysis result');
    const formatted = filterAndFormatResults(
      result,
      params.filter ? JSON.parse(params.filter) : null,
      params.output,
      params
    );
    if (result.annotationData?.some((annotation) => annotation.error)) {
      params.streamState.failed += result.annotationData.filter(
        (annotation) => annotation.error
      ).length;
    }
    params.streamState.failed += Object.values(result.meta.liftoverMeta || {}).filter(
      (entry) => entry.status !== 'success'
    ).length;
    if (typeof formatted === 'object') {
      if (isFirstChunk && formatted.header)
        await writeOutput(formatted.header + '\n', params.destination);
      if (formatted.data) await writeOutput(formatted.data + '\n', params.destination);
    } else {
      let text = formatted;
      if (['JSON', 'SCHEMA'].includes(params.output.toUpperCase()))
        text = JSON.stringify(JSON.parse(formatted));
      if (params.output.toUpperCase() === 'VCF' && !isFirstChunk) {
        text = text
          .split('\n')
          .filter((line) => !line.startsWith('#'))
          .join('\n');
      }
      await writeOutput(text + '\n', params.destination);
    }
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) throw error;
    params.streamState.failed += chunk.length;
    console.error(
      'Error processing chunk: ' + (error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}

/** @param {import('../analysisTypes').CliParams} params
 * @returns {Promise<import('../analysisTypes').StreamParams>} */
async function prepareStream(params) {
  const recoderOptions = parseOptionalParameters(params.recoder_params, { vcf_string: '1' });
  const vepOptions = parseOptionalParameters(params.vep_params, {
    CADD: '1',
    hgvs: '1',
    merged: '1',
    mane: '1',
  });
  if (params.pickOutput) vepOptions.pick = '1';
  const features =
    params.bedFile || params.geneList || params.jsonGenes ? await loadFeatures(params) : null;
  const scoringConfig = params.scoring_config_path
    ? readScoringConfigFromFiles(params.scoring_config_path)
    : params.scoringConfig;
  const scoringFields = scoringConfig
    ? [
        ...new Set(
          [
            ...(scoringConfig.formulas.annotationLevel || []),
            ...(scoringConfig.formulas.transcriptLevel || []),
          ].flatMap((formula) => Object.keys(formula))
        ),
      ]
    : [];
  const { variants: _variants, sampleMap: _sampleMap, ...streamOptions } = params;
  void _variants;
  void _sampleMap;
  return {
    ...streamOptions,
    recoderOptions,
    vepOptions,
    features,
    scoringConfig,
    isStreaming: true,
    streamState: { failed: 0 },
    columnConfig: getDefaultColumnConfig({
      includeCnv: true,
      includeInheritance: Boolean(params.calculateInheritance),
      includeUserFeatures: Boolean(features),
      scoringFields,
    }),
  };
}

/** @param {import('../analysisTypes').CliParams} params */
async function processStream(params) {
  const common = await prepareStream(params);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chunk = [];
  const chunkSize = params.chunkSize || 100;
  let isFirstChunk = true;
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      chunk.push(trimmed);
      if (chunk.length >= chunkSize) {
        if (await processAndOutputChunk(chunk, isFirstChunk, common)) isFirstChunk = false;
        chunk = [];
      }
    }
    if (chunk.length) {
      if (await processAndOutputChunk(chunk, isFirstChunk, common)) isFirstChunk = false;
    }
    if (
      isFirstChunk &&
      !common.streamState.failed &&
      ['TSV', 'CSV'].includes(params.output.toUpperCase())
    ) {
      await writeOutput(
        formatToTabular(
          [],
          common.columnConfig,
          params.output.toUpperCase() === 'CSV' ? ',' : '\t',
          true
        ) + '\n'
      );
    }
  } finally {
    rl.close();
  }
  if (common.streamState.failed) {
    console.error('Failed inputs: ' + common.streamState.failed);
    process.exitCode = 1;
  }
}
module.exports = { processStream, processAndOutputChunk, prepareStream };
