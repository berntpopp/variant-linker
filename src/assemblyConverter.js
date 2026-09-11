'use strict';
const apiConfig = require('../config/apiConfig.json');
const { fetchApi } = require('./apiHelper');
const { getBaseUrl } = require('./configHelper');
/** @typedef {{chr: string, pos: number, ref: string, alt: string}} ParsedVariant */
/** @typedef {{seq_region_name: string, start: number, end: number, strand?: number, assembly?: string}} Region */
/** @typedef {{original?: Region, mapped: Region}} Mapping */
/** @typedef {import('./apiHelper').RequestOptions} RequestOptions */

/** Map a complete GRCh37 region with an immutable source assembly context.
 * @param {string} region @param {boolean} [cacheEnabled] @param {RequestOptions} [requestOptions]
 * @returns {Promise<{mappings: Mapping[]}>}
 */
async function liftOverCoordinates(region, cacheEnabled = false, requestOptions = {}) {
  const endpoint = apiConfig.ensembl.endpoints.assemblyMap.replace(':region', region);
  return fetchApi(endpoint, {}, cacheEnabled, 'GET', null, null, {
    ...requestOptions,
    assembly: 'GRCh37',
    baseUrl: requestOptions.baseUrl || getBaseUrl('GRCh37'),
  });
}

/** Parse explicit small variant alleles; symbolic/spanning alleles require other mapping semantics.
 * @param {string} variant @returns {ParsedVariant | null}
 */
function parseVcfVariant(variant) {
  if (typeof variant !== 'string') return null;
  const match = /^(?:chr)?([^:\s-]+)[:-](\d+)[:-]([ACGTN]+)[:-]([ACGTN]+)$/i.exec(variant);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1) return null;
  return {
    chr: match[1],
    pos: Number(match[2]),
    ref: match[3].toUpperCase(),
    alt: match[4].toUpperCase(),
  };
}
/** @param {ParsedVariant} variant */
function constructRegionString(variant) {
  return `${variant.chr}:${variant.pos}-${variant.pos + variant.ref.length - 1}`;
}
/** @param {string} allele */
function reverseComplement(allele) {
  /** @type {Record<string, string>} */
  const complement = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
  return [...allele]
    .reverse()
    .map((base) => complement[base])
    .join('');
}
/** This low-level helper transforms strand; liftOverVariant additionally verifies and normalizes.
 * @param {ParsedVariant} variant @param {Mapping} mapping
 */
function constructLiftedVariant(variant, mapping) {
  const reverse = mapping.mapped.strand === -1;
  return `${mapping.mapped.seq_region_name}-${mapping.mapped.start}-${reverse ? reverseComplement(variant.ref) : variant.ref}-${reverse ? reverseComplement(variant.alt) : variant.alt}`;
}

/** @param {string} chr @param {number} start @param {number} end
 * @param {boolean} cacheEnabled @param {RequestOptions} context @returns {Promise<string>}
 */
async function referenceSequence(chr, start, end, cacheEnabled, context) {
  if (start < 1 || end < start)
    throw new Error('Cannot anchor lifted variant before chromosome start');
  /** @type {{seq?: string}} */
  const response = await fetchApi(
    `/sequence/region/human/${chr}:${start}..${end}:1`,
    { coord_system_version: 'GRCh38' },
    cacheEnabled,
    'GET',
    null,
    null,
    { ...context, assembly: 'GRCh38', baseUrl: context.baseUrl || getBaseUrl('GRCh38') }
  );
  const sequence = response.seq?.toUpperCase();
  if (!sequence || sequence.length !== end - start + 1 || !/^[ACGTN]+$/.test(sequence)) {
    throw new Error('Target reference sequence unavailable or incomplete');
  }
  return sequence;
}

/** Validate complete, unambiguous mapping; orient alleles, validate REF and normalize indels.
 * @param {string} variant @param {boolean} [cacheEnabled] @param {RequestOptions} [requestOptions]
 */
async function liftOverVariant(variant, cacheEnabled = false, requestOptions = {}) {
  const original = parseVcfVariant(variant);
  if (!original)
    throw new Error('Liftover requires an explicit small variant with a positive position');
  const response = await liftOverCoordinates(
    constructRegionString(original),
    cacheEnabled,
    requestOptions
  );
  if (!Array.isArray(response.mappings) || response.mappings.length === 0)
    throw new Error('No liftover mapping found');
  if (response.mappings.length !== 1) throw new Error('Ambiguous liftover mapping');
  const mapping = response.mappings[0];
  const mapped = mapping.mapped;
  if (
    !mapped ||
    !mapping.original ||
    mapping.original.start !== original.pos ||
    mapping.original.end !== original.pos + original.ref.length - 1 ||
    mapping.original.seq_region_name.replace(/^chr/i, '') !== original.chr ||
    mapped.end - mapped.start + 1 !== original.ref.length ||
    !Number.isSafeInteger(mapped.start) ||
    mapped.start < 1 ||
    ![1, -1].includes(mapped.strand ?? 0) ||
    (mapping.original.strand !== undefined && mapping.original.strand !== 1)
  ) {
    throw new Error('Incomplete or discontinuous liftover reference span');
  }
  if (mapped.assembly && mapped.assembly !== 'GRCh38')
    throw new Error('Unexpected target assembly');
  const strand = mapped.strand === -1 ? -1 : 1;
  let ref = strand === -1 ? reverseComplement(original.ref) : original.ref;
  let alt = strand === -1 ? reverseComplement(original.alt) : original.alt;
  let pos = mapped.start;
  const targetRef = await referenceSequence(
    mapped.seq_region_name,
    pos,
    mapped.end,
    cacheEnabled,
    requestOptions
  );
  if (ref !== targetRef) throw new Error('Target reference mismatch after liftover');
  // Suffix trimming and left extension also reanchor reverse-strand indels.
  let shifts = 0;
  while (ref.length !== alt.length && ref.at(-1) === alt.at(-1)) {
    if (++shifts > 1000) throw new Error('Liftover normalization exceeds 1000 bases');
    ref = ref.slice(0, -1);
    alt = alt.slice(0, -1);
    if (!ref || !alt) {
      const preceding = await referenceSequence(
        mapped.seq_region_name,
        pos - 1,
        pos - 1,
        cacheEnabled,
        requestOptions
      );
      ref = preceding + ref;
      alt = preceding + alt;
      pos--;
    }
  }
  while (ref.length > 1 && alt.length > 1 && ref.at(-1) === alt.at(-1)) {
    ref = ref.slice(0, -1);
    alt = alt.slice(0, -1);
  }
  while (ref.length > 1 && alt.length > 1 && ref[0] === alt[0]) {
    ref = ref.slice(1);
    alt = alt.slice(1);
    pos++;
  }
  const liftedKey = `${mapped.seq_region_name}-${pos}-${ref}-${alt}`;
  const originalKey = `${original.chr}-${original.pos}-${original.ref}-${original.alt}`;
  return {
    variant: liftedKey,
    originalVariant: variant,
    originalKey,
    liftedKey,
    sourceAssembly: 'GRCh37',
    targetAssembly: 'GRCh38',
    strand,
  };
}
module.exports = {
  liftOverCoordinates,
  parseVcfVariant,
  constructRegionString,
  constructLiftedVariant,
  liftOverVariant,
};
