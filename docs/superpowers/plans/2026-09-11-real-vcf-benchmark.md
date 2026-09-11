# Reproducible public VCF performance benchmark

The user requests approximately 1,000 public variants, documented provenance,
current Ensembl API limits, and measured optimization. This extends the existing
modernization PR; ordinary tests and the default synthetic benchmark remain offline.

## Dataset and provenance

Use an official 1000 Genomes Phase 3 GRCh37 chromosome 22 VCF release. Stream a
bounded prefix instead of downloading the entire chromosome. Select the first
1,000 PASS, biallelic single-nucleotide variants in source order. Preserve the
first eight VCF fields and metadata, while removing FORMAT and individual sample
columns for a sites-only throughput fixture. Record the exact source URL, release,
assembly, retrieval timestamp, selection rules, source-header/prefix hashes,
compressed bytes consumed, derived SHA-256, and licensing/reuse references.

Keep downloaded data and API recordings under ignored `local_data/benchmarks`;
commit the fetch script, provenance manifest, small synthetic fetch tests and
benchmark report. The selected regional prefix is a performance fixture and is
not a representative sample for biological validation.

## Baseline and experiments

1. Verify current primary Ensembl documentation for region POST batch ceilings,
   request-rate limits, response rate headers, retry behavior and assembly endpoint.
2. Validate count, syntax, uniqueness and assembly of the derived fixture. Run the
   real reader and annotation pipeline against the matching GRCh37 endpoint.
3. Measure submitted/successful/failed counts, HTTP requests and retries, batch
   sizes, wall time, request p50/p95, throughput, peak RSS and event-loop delay.
   Keep startup, live network, warm cache and recorded-response replay distinct.
4. Save real public responses for repeatable offline profiling. Compare repeated
   runs on identical input/options and check annotation identities and output
   semantics, rather than inferring correctness from timing or row count alone.
5. Optimize only a demonstrated bottleneck. Test bounded batching/concurrency
   against documented limits, avoid unnecessary work, and retain backpressure,
   cancellation, deadline and failure-accounting contracts. Do not reduce output
   fields silently to report a speedup.
6. Report before/after measurements and variability, exact commands/revisions,
   chosen defaults and tradeoffs. Do not claim a universal speedup from one live
   network observation. Add behavior regressions, run local verification and then
   validate the updated draft PR checks.

## Coordination

The dataset/provenance work and API-limit research run independently. One owner
coordinates live Ensembl traffic so parallel experiments do not share an unknown
request budget. The adversarial Opus review remains separate and its findings are
reproduced before fixes are accepted.

## Paired Variant Recoder experiment

The user additionally requests an independently measured Recoder benchmark. Derive
1,000 genomic HGVS identifiers from the same public GRCh37 SNVs using the verified
chromosome 22 RefSeq accession. Record the derivation, accession authority, parent
VCF hash, derived identifier hash and exact command. This preserves a paired cohort
without inventing rsIDs for source records whose ID field is missing.

Provide a Recoder-only runner so VEP annotation time does not contaminate its
measurement. Verify the Recoder endpoint's own POST ceiling, count all returned
input identities and alternatives, and record/replay responses independently.
Compare sequential and bounded parallel batches with identical identifiers,
options and outputs; retain full server cooldowns and caller cancellation.
