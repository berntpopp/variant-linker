# Reliable, agent-maintainable Variant-Linker

The user authorized specification, planning, and end-to-end implementation of the audit fixes and repository modernization. This design implements that authorization without additional approval stops. The baseline is ee861a8; the preceding audit is at docs/reviews/2026-09-11-repository-audit.md.

## Decisions and alternatives

Keep CommonJS JavaScript and add strict checked JSDoc contracts. A wholesale TypeScript/ESM rewrite would simultaneously change packaging, mocks, and runtime interfaces without improving biological correctness; leaving checkJs disabled would not satisfy the requested typechecking. Preserve public exports and existing CLI flags, except unsafe behavior must become explicit errors or documented uncertainty.

Use Node >=22.14 (CI Node 22 and 24), maintained ESLint flat configuration, Prettier, TypeScript noEmit/checkJs/strict, Mocha with deterministic fixtures, and c8 with all production source included. Retaining Mocha keeps existing behavior tests useful; migrating to another runner would add churn without solving parent/child mock isolation.

Work in the current checkout on chore/reliable-agentic-development so the user sees changes and the audit artifacts remain accessible. No publishing, pushing, or merging is part of local implementation. Superpowers review and TDD apply; independent workstreams may run concurrently with exclusive file ownership.

## Non-negotiable gates

- Every maintained handwritten code file in src, test, scripts, root configs, and docs theme/config must have fewer than 650 physical lines (649 maximum, including blanks/comments). Data fixtures, lockfiles, generated bundles/reports, and vendored files are excluded by explicit category, never individual grandfathering. Agent instruction files remain below 80 lines each.
- AGENTS.md is the canonical concise workflow; CLAUDE.md references it and contains only Claude-specific essentials. Explain module boundaries, commands, test contracts, and completion requirements without duplicating the design.
- Production source uses strict checkJs/noEmit checking. No ts-nocheck, broad suppression, or blanket any replacement to manufacture a green result. External extensible annotation payloads may use documented boundary types; internal options/records/functions need useful types.
- ESLint fails on warnings, formatting is a separate non-mutating check, file-size enforcement is executable, and the local verification command runs the same quality/build/package gates as CI.
- Ordinary tests never require Ensembl or external network access, including spawned CLI processes. A separate opt-in live smoke command exercises the real API. Network-disabled fixture tests cover the previous live workflows.
- Coverage includes unexecuted src files. Enforce at least 81% statements, branches, functions, and lines globally; do not exclude difficult business logic or add meaningless invocation tests to reach the target.
- CI uses npm ci with committed root/docs locks. Release requires successful verification of the same revision, with minimum job permissions. Docs build must run locally. No workflow deletes locks or bypasses dependencies with legacy-peer-deps.

## Runtime contracts

API: request identity includes method, normalized endpoint/query/body, and assembly. Each request has immutable endpoint options, finite timeout, cancellation, response-size limits and bounded retries. Optional transport options extend existing signatures, preserving callers. Cache hits cannot reorder/substitute results. Persistent reads use L1 then L2, with explicit TTL, owned filenames, enforced bytes, unique atomic temp writes and amortized cleanup.

VCF: original record identity, FORMAT/sample columns, IDs, QUAL, FILTER and INFO cardinalities survive annotation. Split analysis records retain original ALT indexes; inheritance evaluates target-allele presence while preserving phase/ploidy/missingness. Separate records at the same coordinate remain separate. Haploid calls are valid. Ambiguous parental origin remains possible rather than confirmed/segregating.

Liftover: no global environment mutation. Map the entire reference span, handle negative strand and reference validation, reject ambiguous/discontinuous mappings, and keep original/lifted keys associated for genotype/output lookups. Preserve target assembly provenance. Do not invent a clinically validated inference guarantee.

Pipeline: normalize inputs and options once, join responses by echoed input identities rather than index, and return accounted outcomes. Split large core and CLI modules by input normalization, acquisition, enrichment, and output. Streaming filtering/pick behavior matches file mode, output schema is stable across chunks, writes honor backpressure, failures produce nonzero status and counts, and stdout contains only the selected output format.

Scoring/features: real BED dependency import, explicit coordinate conversion, type-correct defaults for transcript-free records, actual MANE fields, and compiled expressions cached per configuration. Executable scoring configuration remains an explicitly documented trusted-code boundary unless a compatible safe evaluator is implemented; ordinary data cannot become executable source. Redact proxy userinfo and offer explicit spreadsheet-safe serialization without corrupting ordinary scientific values.

Packaging/schema: static schema import/compilation matches actual single/batch result metadata. Browser client never assumes process/fs availability; Node-only functions fail clearly. Include the browser artifact in the packed package and smoke-test exports/API transport and archive contents.

## Workstreams and acceptance matrix

1. Tooling and test infrastructure: instructions, file-size rule, formatting/lint/type/coverage commands, dependency refresh, deterministic fixtures, local verification and gated workflows.
2. API/cache/assembly: audit 1, 5, 6, 9, 18, 19 plus persistent cache budget, disk hits, maintenance cost and concurrent writes.
3. VCF/inheritance/features: audit 2, 3, 4, 7, 12, 13 plus original/lifted identity integration and multi-gene grouping.
4. Core/CLI/scoring/output: audit 8, 10, 11, 14, 15, 16, 17, 20, 23, 24 plus bounded input processing, backpressure and benchmark accuracy.
5. Whole-repository integration: strict types, coverage gap tests, every code file <650 lines, security/dependency audit, package/browser/docs checks, independent code review and final local verification.

Every audit recommendation must end as a regression-backed implementation or an explicit evidence-based disposition in the execution ledger. Hypotheses must be investigated before changes. Measurements compare equivalent offline fixtures; no unsupported speedup claims.

## Validation examples

- 201 cached VEP inputs return 201 unique corresponding outcomes; two POST bodies and assemblies never share values.
- Trio ALT=C,G with child 0/1 and reference parents cannot assign de novo to G; GT 0/2,1/2,2/2,1 and missing calls have explicit cases.
- Multi-sample VCF roundtrip preserves exact sample strings and independent same-site records.
- Negative-strand A>C maps as T>G; an indel's entire span and target REF are checked; concurrent assemblies remain isolated.
- A failed first streaming chunk returns nonzero; later output has a header; SNV/CNV chunks share column counts and filtering matches JSON/file mode.
- Real BED [100,200) matches one-based 101 and 200, not 100/201.
- Missing transcript arrays do not crash bundled scoring; mane_select outranks canonical according to documented policy.
- Invalid cache JSON outside owned files survives cleanup; byte budgets hold; concurrent writers publish complete entries.
- Local verify exits nonzero for lint/type/format/size/coverage violations and passes on the completed implementation.
