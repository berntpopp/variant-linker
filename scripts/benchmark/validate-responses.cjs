#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
}

function inspectRecording(mode, recording, cohort) {
  const expected = new Map(
    cohort.map((item) => [mode === 'vep' ? item.vcfInput : item.recoderInput, item])
  );
  const byInput = new Map();
  const recordedRequestInputs = new Set();
  let responseCount = 0;
  let invalidResponseBodies = 0;
  let recordCount = 0;
  let duplicateInputs = 0;
  let ambiguousInputRecords = 0;
  let unexpectedInputs = 0;
  let coordinateMatches = 0;
  let coordinateMismatches = 0;
  let multipleAlleleBranches = 0;
  let multipleReturnedCoordinates = 0;
  const statuses = {};
  for (const entry of Object.values(recording.entries)) {
    const body =
      typeof entry.request.body === 'string' ? JSON.parse(entry.request.body) : entry.request.body;
    for (const input of body?.[mode === 'vep' ? 'variants' : 'ids'] || [])
      recordedRequestInputs.add(input);
    for (const response of entry.responses) {
      responseCount++;
      statuses[response.status] = (statuses[response.status] || 0) + 1;
      if (response.status !== 200) continue;
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (!Array.isArray(data)) {
        invalidResponseBodies++;
        continue;
      }
      for (const row of data) {
        recordCount++;
        const branches =
          mode === 'vep'
            ? []
            : Object.values(row).filter(
                (value) => value && typeof value === 'object' && !Array.isArray(value)
              );
        const inputs = [
          ...new Set(
            [row.input, ...branches.map((value) => value.input)].filter(
              (value) => typeof value === 'string'
            )
          ),
        ];
        if (inputs.length !== 1) {
          ambiguousInputRecords++;
          continue;
        }
        const input = inputs[0];
        if (byInput.has(input)) duplicateInputs++;
        byInput.set(input, row);
        const original = expected.get(input);
        if (!original) {
          unexpectedInputs++;
          continue;
        }
        let coordinatesMatch;
        if (mode === 'vep') {
          coordinatesMatch =
            row.assembly_name === 'GRCh37' &&
            String(row.seq_region_name) === original.chromosome &&
            row.start === original.position &&
            row.end === original.position &&
            row.strand === 1 &&
            row.allele_string === `${original.ref}/${original.alt}`;
        } else {
          const coordinates = new Set(branches.flatMap((branch) => branch.vcf_string || []));
          if (branches.length > 1) multipleAlleleBranches++;
          if (coordinates.size > 1) multipleReturnedCoordinates++;
          coordinatesMatch = coordinates.has(
            `${original.chromosome}-${original.position}-${original.ref}-${original.alt}`
          );
        }
        if (coordinatesMatch) coordinateMatches++;
        else coordinateMismatches++;
      }
    }
  }
  const covered = [...expected.keys()].filter((input) => byInput.has(input));
  const orderedResponses = [...byInput].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const missing = [...expected.keys()].filter((input) => !byInput.has(input));
  const completeCohort = covered.length === cohort.length;
  return {
    byInput,
    summary: {
      recordedRequests: Object.keys(recording.entries).length,
      recordedRequestInputs: recordedRequestInputs.size,
      unexpectedRequestInputs: [...recordedRequestInputs].filter((input) => !expected.has(input))
        .length,
      recordedResponses: responseCount,
      responseStatuses: statuses,
      responseRecords: recordCount,
      uniqueEchoedInputs: byInput.size,
      coveredCohortInputs: covered.length,
      missingCohortInputs: missing.length,
      missingInputListSha256: sha256(canonical(missing)),
      unexpectedInputs,
      duplicateInputs,
      ambiguousInputRecords,
      invalidResponseBodies,
      coordinateMatches,
      coordinateMismatches,
      multipleAlleleBranches,
      multipleReturnedCoordinates,
      completeCohort,
      completeAndIdentityValid:
        completeCohort &&
        coordinateMatches === cohort.length &&
        !unexpectedInputs &&
        !duplicateInputs &&
        !ambiguousInputRecords &&
        !invalidResponseBodies,
      fullResponsesByInputSha256: sha256(canonical(orderedResponses)),
    },
  };
}

function compareResponses(baseline, concurrent) {
  let exactMatches = 0;
  const differences = [];
  for (const [input, response] of concurrent.byInput) {
    const before = baseline.byInput.get(input);
    if (before && canonical(before) === canonical(response)) exactMatches++;
    else
      differences.push({
        inputSha256: sha256(input),
        baselineSha256: before ? sha256(canonical(before)) : null,
        concurrentSha256: sha256(canonical(response)),
      });
  }
  return {
    sharedInputs: [...concurrent.byInput.keys()].filter((input) => baseline.byInput.has(input))
      .length,
    exactObjectKeyCanonicalMatches: exactMatches,
    differences: differences.length,
    differenceExamples: differences.slice(0, 10),
    fullCohortEquivalent:
      baseline.summary.completeAndIdentityValid &&
      concurrent.summary.completeAndIdentityValid &&
      differences.length === 0,
    comparison:
      'Full response objects keyed by exact echoed input; sort object keys recursively, preserve every array order and scalar value; HTTP response headers excluded',
  };
}

function validateResponses() {
  const provenance = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'docs/benchmarks/1000genomes-1000.json'), 'utf8')
  );
  const input = fs.readFileSync(path.join(ROOT, provenance.dataset.path));
  assert.equal(sha256(input), provenance.dataset.sha256, 'VCF provenance hash mismatch');
  const cohort = input
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [chromosome, pos, , ref, alt] = line.split('\t');
      return {
        chromosome,
        position: Number(pos),
        ref,
        alt,
        vcfInput: `${chromosome} ${pos} . ${ref} ${alt} . . .`,
        recoderInput: `NC_000022.10:g.${pos}${ref}>${alt}`,
      };
    });
  assert.equal(cohort.length, provenance.dataset.variantCount);
  assert.equal(
    new Set(cohort.map((item) => item.recoderInput)).size,
    cohort.length,
    'Cohort inputs must be unique'
  );
  const results = {};
  const recordings = {};
  for (const name of ['vep', 'vep-concurrent', 'recoder', 'recoder-concurrent']) {
    const relativePath = `local_data/benchmarks/${name}-recording.json`;
    const bytes = fs.readFileSync(path.join(ROOT, relativePath));
    const result = inspectRecording(
      name.startsWith('vep') ? 'vep' : 'recoder',
      JSON.parse(bytes),
      cohort
    );
    results[name] = result;
    recordings[name] = {
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      ...result.summary,
    };
  }
  const report = {
    schemaVersion: 1,
    validatedAt: new Date().toISOString(),
    scope:
      'Offline inspection of captured raw Ensembl response bodies; no public requests or performance claims',
    cohort: {
      provenancePath: 'docs/benchmarks/1000genomes-1000.json',
      sha256: provenance.dataset.sha256,
      variantCount: cohort.length,
      assembly: 'GRCh37',
    },
    recordings,
    comparisons: {
      vep: compareResponses(results.vep, results['vep-concurrent']),
      recoder: compareResponses(results.recoder, results['recoder-concurrent']),
    },
    interpretation: {
      recoderCoordinates:
        'Require original chromosome, one-based position, REF and ALT among returned vcf_string values. Additional allele representations are permitted but counted; they do not replace the required target.',
      incompleteRecording:
        'Response-bearing requests only: a request that timed out without a response is absent from the recording. Missing cohort members are not counted as successes or as equivalent outputs.',
      semanticScope:
        'This verifies recorded upstream annotation identity and complete payload equivalence for shared inputs. It does not independently validate biological correctness or downstream enrichment/serialization.',
    },
    reproduction: {
      command: 'node scripts/benchmark/validate-responses.cjs',
      node: process.version,
    },
  };
  fs.writeFileSync(
    path.join(ROOT, 'docs/benchmarks/response-validation.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  return report;
}

if (require.main === module) {
  const report = validateResponses();
  console.log(JSON.stringify(report.comparisons, null, 2));
}
module.exports = { canonical, inspectRecording, compareResponses, validateResponses };
