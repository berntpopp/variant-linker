'use strict';

const fs = require('fs');
const readline = require('readline');
const VCF = require('@gmod/vcf').default;
const { projectGenotype } = require('./inheritance/genotypeUtils');

/** @typedef {ReturnType<InstanceType<typeof VCF>['parseLine']>} ParsedRecord */
/**
 * @typedef {object} VcfEntry
 * @property {string} key Canonical annotation identity (not original row identity).
 * @property {string} chrom
 * @property {number} pos
 * @property {string} ref
 * @property {string} alt
 * @property {number} altIndex One-based ALT position; zero for reference-only passthrough records.
 * @property {string} originalRecordId Stable source line identity.
 * @property {string} originalLine Exact fields without line terminator.
 * @property {ParsedRecord & {CHROM:string, REF:string}} originalRecord
 * @property {Map<string,string>} genotypes Target ALT presence, preserving ploidy/phase/missingness.
 * @property {Map<string,string>} originalGenotypes Original unprojected GT.
 * @property {VcfEntry[]} [records] Additional occurrences including the first row.
 * @property {boolean} [passthrough] Valid reference-only row with no ALT to annotate.
 */
/** @typedef {{headerLines:string[], samples:string[], recordId:string, originalLine:string, entries:VcfEntry[]}} VcfRecord */

/** @param {string[]} headerLines @returns {string[]} */
function samplesFromHeader(headerLines) {
  return (headerLines.find((line) => line.startsWith('#CHROM')) || '').split('\t').slice(9);
}

/**
 * @param {InstanceType<typeof VCF>} parser
 * @param {string} line
 * @param {string} recordId
 * @param {string[]} samples
 * @returns {VcfEntry[]}
 */
function parseEntries(parser, line, recordId, samples) {
  const record = parser.parseLine(line);
  if (!record?.CHROM || !record.POS || !record.REF)
    throw new Error(`Invalid VCF record at ${recordId}`);
  const { CHROM: chrom, POS: pos, REF: ref } = record;
  const originalRecord = { ...record, CHROM: chrom, REF: ref };
  const columns = line.split('\t');
  const gtIndex = (columns[8] || '').split(':').indexOf('GT');
  const originalGenotypes = new Map(
    samples.map((sample, index) => [
      sample,
      gtIndex < 0 ? './.' : (columns[index + 9] || '').split(':')[gtIndex] || './.',
    ])
  );
  if (columns[4] === '.')
    return [
      {
        key: `passthrough:${recordId}`,
        chrom,
        pos,
        ref,
        alt: '.',
        altIndex: 0,
        originalRecordId: recordId,
        originalLine: line,
        originalRecord,
        originalGenotypes,
        genotypes: new Map(originalGenotypes),
        passthrough: true,
      },
    ];
  if (
    !Array.isArray(record.ALT) ||
    !record.ALT.length ||
    record.ALT.some((alt) => !alt || alt === '.')
  )
    throw new Error(`Invalid VCF ALT at ${recordId}`);
  return record.ALT.flatMap((alt, index) => {
    if (!alt || alt === '.') return [];
    const altIndex = index + 1;
    const key = `${record.CHROM}-${record.POS}-${record.REF}-${alt}`;
    return [
      {
        key,
        chrom,
        pos,
        ref,
        alt,
        altIndex,
        originalRecordId: recordId,
        originalLine: line,
        originalRecord,
        originalGenotypes,
        genotypes: new Map(
          [...originalGenotypes].map(([sample, gt]) => [sample, projectGenotype(gt, altIndex)])
        ),
      },
    ];
  });
}

/**
 * Iterate input records with bounded memory. The caller owns analysis buffering.
 * Header-only files yield a final empty record, so callers can preserve headers.
 * @param {string} filePath
 * @returns {AsyncGenerator<VcfRecord>}
 */
async function* iterateVcfRecords(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`VCF file not found: ${filePath}`);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  /** @type {string[]} */
  const headerLines = [];
  /** @type {InstanceType<typeof VCF>|undefined} */
  let parser;
  let lineNumber = 0;
  let records = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      if (line.startsWith('#')) {
        headerLines.push(line);
        continue;
      }
      if (!headerLines.length) throw new Error('No header lines found in VCF file');
      parser ||= new VCF({ header: headerLines.join('\n') });
      const samples = samplesFromHeader(headerLines);
      const recordId = `line:${lineNumber}`;
      const entries = parseEntries(parser, line, recordId, samples);
      records++;
      yield { headerLines, samples, recordId, originalLine: line, entries };
    }
    if (!headerLines.length) throw new Error('No header lines found in VCF file');
    if (!records)
      yield {
        headerLines,
        samples: samplesFromHeader(headerLines),
        recordId: '',
        originalLine: '',
        entries: [],
      };
  } catch (error) {
    throw new Error(
      `Error parsing VCF file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  } finally {
    lines.close();
    stream.destroy();
  }
}

/**
 * Compatibility materializer. Use iterateVcfRecords for bounded processing.
 * Duplicate canonical keys share an annotation lookup, but retain all original rows.
 * @param {string} filePath
 * @returns {Promise<{variantsToProcess:string[],vcfRecordMap:Map<string,VcfEntry>,headerText:string,headerLines:string[],samples:string[]}>}
 */
async function readVariantsFromVcf(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`VCF file not found: ${filePath}`);
  try {
    return parseVcfText(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Error parsing VCF file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/** Parse complete VCF text with the same original-record and genotype contracts as the file reader.
 * @param {string} text
 * @returns {{variantsToProcess:string[],vcfRecordMap:Map<string,VcfEntry>,headerText:string,headerLines:string[],samples:string[]}}
 */
function parseVcfText(text) {
  const lines = text.split(/\r?\n/);
  const headerLines = lines.filter((line) => line.startsWith('#'));
  if (!headerLines.length) throw new Error('No header lines found in VCF file');
  const headerText = headerLines.join('\n');
  const parser = new VCF({ header: headerText });
  const samples = samplesFromHeader(headerLines);
  /** @type {Map<string,VcfEntry>} */
  const vcfRecordMap = new Map();
  const variantsToProcess = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    for (const entry of parseEntries(parser, line, `line:${index + 1}`, samples)) {
      const previous = vcfRecordMap.get(entry.key);
      if (previous) {
        previous.records ||= [{ ...previous, genotypes: new Map(previous.genotypes) }];
        previous.records.push(entry);
        // Conflicting independent observations are uncertain for inheritance.
        for (const [sample, gt] of previous.genotypes) {
          if (gt !== entry.genotypes.get(sample)) previous.genotypes.set(sample, './.');
        }
      } else {
        vcfRecordMap.set(entry.key, entry);
        if (!entry.passthrough) variantsToProcess.push(entry.key);
      }
    }
  }
  return { variantsToProcess, vcfRecordMap, headerText, headerLines, samples };
}

module.exports = { readVariantsFromVcf, iterateVcfRecords, parseVcfText };
