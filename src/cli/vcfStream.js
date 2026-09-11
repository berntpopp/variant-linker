'use strict';
const defaults = require('../../config/cliDefaults.json');
const fs = require('fs');
const { finished } = require('stream/promises');
const { iterateVcfRecords } = require('../vcfReader');
const { prepareStream, processAndOutputChunk } = require('./stream');
const { formatAnnotationsToVcf } = require('../vcfFormatter');
const { formatToTabular } = require('../dataExtractor');
const { writeOutput } = require('./write');
const { vlCsqFormat } = require('../output/vcfFields');

/** Retain complete original records within each chunk; release maps after writes.
 * @param {import('../analysisTypes').CliParams} params */
async function processVcfStream(params) {
  if (typeof params.vcfInput !== 'string') throw new Error('--stream requires --vcf-input');
  if (params.calculateInheritance || params.ped || params.sampleMap) {
    throw new Error('Inheritance requires full-file analysis; omit --stream');
  }
  const common = await prepareStream(params);
  const savePath = params.save || params.outputFile;
  const destination = savePath ? fs.createWriteStream(savePath) : process.stdout;
  // Observe errors immediately, including opening an invalid destination for an empty input.
  const completion = savePath ? finished(destination) : null;
  completion?.catch(() => {});
  common.destination = destination;
  common.calculateInheritance = false;
  common.vcfRecordMap = new Map();
  let first = true;
  /** @type {string[]} */
  let chunk = [];
  let retainedEntries = 0;
  async function flush() {
    if (await processAndOutputChunk(chunk, first, common)) first = false;
    chunk = [];
    retainedEntries = 0;
    common.vcfRecordMap = new Map();
  }
  try {
    for await (const record of iterateVcfRecords(params.vcfInput)) {
      common.vcfHeaderLines = record.headerLines;
      common.samples = record.samples;
      for (const entry of record.entries) {
        retainedEntries++;
        const previous = common.vcfRecordMap.get(entry.key);
        if (previous) {
          previous.records ||= [{ ...previous }];
          previous.records.push(entry);
        } else {
          common.vcfRecordMap.set(entry.key, entry);
          if (!entry.passthrough) chunk.push(entry.key);
        }
      }
      if (retainedEntries >= (params.chunkSize ?? defaults.chunkSize)) await flush();
    }
    if (retainedEntries) await flush();
    if (first && !common.streamState.failed) {
      const format = params.output.toUpperCase();
      const empty =
        format === 'VCF'
          ? formatAnnotationsToVcf([], new Map(), common.vcfHeaderLines, vlCsqFormat)
          : ['CSV', 'TSV'].includes(format)
            ? formatToTabular([], common.columnConfig, format === 'CSV' ? ',' : '\t')
            : '';
      if (empty) await writeOutput(empty.endsWith('\n') ? empty : empty + '\n', destination);
    }
    if (savePath) {
      destination.end();
      await completion;
    }
  } finally {
    if (savePath) destination.destroy();
  }
  if (common.streamState.failed) {
    console.error('Failed inputs: ' + common.streamState.failed);
    process.exitCode = 1;
  }
}
module.exports = { processVcfStream };
