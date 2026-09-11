# Repository Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track completion in the execution ledger.

**Goal:** Fix audited data/reliability defects and deliver a strict, locally verifiable repository suited to sustained agent development.
**Architecture:** Preserve CommonJS public APIs, split responsibilities into small modules, use typed JSDoc contracts and immutable request contexts. Keep ordinary tests offline and make one local quality command the CI contract.
**Tech Stack:** Node >=22.14, JavaScript/CommonJS, TypeScript checkJs strict, ESLint flat config, Prettier, Mocha, c8, webpack/VitePress.
**Spec:** docs/superpowers/specs/2026-09-11-modernization-design.md

## Global constraints

- Maximum 649 physical lines in maintained handwritten code files; instruction files below 80 lines.
- At least 81% statements, branches, functions, and lines over all production source.
- Strict checked production JS without broad type suppression; strict lint with zero warnings; separate formatting check.
- Normal tests offline including children; live smoke opt-in; committed locks with npm ci; local verification precedes release.
- No publish/push/merge. Exclusive file ownership for concurrent tasks; no worker commits while shared files are under integration.

## Task 1: Quality infrastructure and deterministic tests

Files: package.json/lock, docs/package.json/lock, eslint.config.js, tsconfig.json, prettier configuration, .mocharc*, .github/workflows/*, scripts/check-loc.cjs, scripts/verify.cjs, AGENTS.md, CLAUDE.md, test infrastructure and formerly live integration tests.
Interfaces: npm run lint, format:check, typecheck, check:loc, test, test:coverage, test:live, verify; source entrypoints unchanged.

- [ ] Add a test for the LOC checker using a temporary 649-line and 650-line file; assert pass/fail respectively. Do not mock the checker implementation.
- [ ] Build an offline HTTP fixture/preload used by parent and spawned CLI; make unexpected network fail immediately. Convert old live fixture/streaming/format tests to deterministic data with response identity and actual CLI output assertions.
- [ ] Configure c8 all-source thresholds to 81 for all four metrics; keep coverage gap output visible for task 5.
- [ ] Add ESLint flat recommended correctness rules, no warnings, format checks, strict checkJs, and local verification orchestration; refresh compatible dependencies/locks without audit-fix-force.
- [ ] Replace verbose agent docs with canonical AGENTS.md and minimal CLAUDE.md. Make CI call local gates using npm ci; gate release on verification; run docs/package checks.
- [ ] Run deterministic tests and tooling-specific tests. Report exact changed interfaces and remaining typing/coverage failures for integration, without weakening checks.

## Task 2: API/cache/assembly corrections

Files: src/apiHelper.js, cache.js, cache/_, assemblyConverter.js, variantRecoder_.js, vep*Annotation.js, configHelper.js, new src/api/* helpers; matching dedicated tests.
Interfaces: fetchApi(path, query, cache, method, body, proxy, requestOptions?) where requestOptions carries baseUrl/assembly/timeout/signal; wrapper functions accept the same optional trailing transport context. Existing arguments remain valid.

- [ ] Regression first: stub only Axios transport, call real VEP wrapper with 201 variants/cache, assert exactly 201 corresponding inputs and two requests. Run red before changing cache identity.
- [ ] Add immutable endpoint tests (including overlapping liftover/default calls), finite timeout/cancellation tests, POST identity and async disk-hit tests.
- [ ] Implement canonical request keys, deadline/retry controls, redacted diagnostics, async L2 reads, diagnostic stderr-only behavior.
- [ ] Add real temporary-directory tests for unrelated JSON preservation, 1KB budget, expiry, concurrent writers and bounded maintenance. Implement owned-entry cleanup, byte eviction and unique atomic writes.
- [ ] Add negative-strand/full-span/ambiguous/target-reference liftover tests. Implement correct mappings and pass request context without changing process.env.
- [ ] Split modules below 650 lines, add strict JSDoc contracts, run scoped tests and report exported interfaces for task 4 integration.

## Task 3: VCF, inheritance, and feature correctness

Files: src/vcfReader.js, vcfFormatter.js, inheritance/*, featureParser.js, featureAnnotator.js, pedReader.js and focused tests.
Interfaces: preserve readVariantsFromVcf result fields; record entries retain original line/record identity and ALT index; expose an async record iterator if added. Annotation variant keys stay canonical, with explicit original-key mapping for liftover.

- [ ] Add red tests for ALT=C,G child0/1, calls 0/2,1/2,2/2,haploid1; verify target-allele dosage and no invented inheritance.
- [ ] Add parser-backed roundtrip test with GT:AD:DP:GQ:PL:PS, multiple samples, independent same-site rows, FILTER dot, semicolon IDs and Number=A/R/G data.
- [ ] Implement stable record identity and lossless annotation output. Preserve original records instead of merging by coordinates.
- [ ] Add missing-opposite-parent compound-het regression, haploid and multi-gene cases; implement uncertainty-aware grouping/segregation and allele-aware genotype interpretation.
- [ ] Test actual interval-tree import and BED boundary points 100/101/200/201; fix coordinate conversion and payload coordinates.
- [ ] Split files below 650 lines, supply strict JSDoc types, run scoped tests and report compatibility changes.

## Task 4: Pipeline, scoring, browser and output

Files: src/main.js, variantLinkerCore.js, variantLinkerProcessor.js, scoring.js, dataExtractor.js, schemaMapper.js, index.js, webpack.config.js, schema/_, scripts/benchmark.js and extracted src/cli/_, src/core/_, src/scoring/_ helpers.
Interfaces: retain analyzeVariant and public exports; normalize assembly/request context once; serializers own output and fixed stream column configuration.

- [ ] Add red tests for stream failure status/header, filter/pick composition, fixed SNV/CNV schema, reordered response matching, schema single/batch, empty-transcript scoring and MANE priority.
- [ ] Split CLI parsing/input/output and core acquisition/enrichment/result assembly into focused modules. Preserve public APIs and pass task 2 transport context explicitly.
- [ ] Apply filtering once, freeze stream schema, honor stdout drain/EPIPE, count failed records, and keep diagnostics off stdout. Use task 3 record iterator for bounded input where possible; preserve cross-record inheritance requirements explicitly.
- [ ] Fix scoring defaults/MANE fields and cache compiled trusted expressions. Document executable-config trust; redact/escape output boundaries.
- [ ] Statically import/compile output schema and align metadata; remove browser process assumptions and smoke-test bundle transport/exports and npm pack contents.
- [ ] Remove benchmark sleep/log inflation; add strict types and keep all source/scripts below 650 lines; run scoped regression tests.

## Task 5: Integration, coverage and independent review

- [ ] Run npm run verify; fix actual errors without narrowing production typechecking/coverage scope or weakening size gates.
- [ ] Inspect coverage-summary and uncovered branches; add behavior tests for substantive gaps until every global metric exceeds 80% (gate 81%).
- [ ] Split remaining large test/script files by suite/responsibility. Ensure lint, format, typecheck and file-size checks catch intentionally introduced violations using temporary fixtures.
- [ ] Run clean-lock installation checks, documentation build, browser/packed-package smoke and production dependency audit; distinguish unresolved advisories by reachability.
- [ ] Dispatch an independent final review against spec, audit and complete diff; fix important findings and run relevant gates again.
- [ ] Record evidence, coverage percentages, audit dispositions and exact final command outcomes in execution ledger. Leave local changes reviewable; do not publish or merge.

## Accepted additions during execution

The user authorized regular commits and a consolidated draft PR, then requested
Dependabot, GitHub security checks and faster local/CI gates. These extend the
same plan: enable available repository security features, schedule reviewed
root/docs/Actions updates, add CodeQL and dependency review, cache static analysis,
parallelize independent checks, and deploy only artifacts from the successful
verification run. Keep all strict and coverage thresholds intact. Run the complete
local verifier before pushing the branch; inspect the draft PR checks before handoff.
