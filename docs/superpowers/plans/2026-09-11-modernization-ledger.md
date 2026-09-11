# Execution ledger

- Baseline: ee861a8; audit has 361 passing/3 live timeouts and 188 passing focused units.
- User authorizes spec, plan and implementation end to end; approval stages are satisfied by that instruction.
- Decision: current checkout/new local branch; preserve existing untracked review artifacts.
- Decision: CommonJS JavaScript with strict checked JSDoc; Node >=22.14; CI Node22/24.
- Decision: 649 physical-line maximum for handwritten code; <80 lines each for AGENTS.md/CLAUDE.md; generated/data files excluded categorically.
- Decision: c8 all-source coverage threshold 81% for all four metrics; no artificial exclusions.
- Task 1: implemented. Root/docs audits report zero vulnerabilities; isolated npm ci checks pass; docs build passes. Local gates and deterministic offline infrastructure installed. Final combined verification passes.
- Task 2: implemented. 170 scoped tests pass; API/cache/core-helper coverage 97.94% statements/lines, 88.41% branches, 100% functions. Synthetic SNV/CNV/HGVS VCF metadata and deterministic TTL follow-ups pass.
- Task 3: implemented. 200 scoped tests pass; data/scoring coverage 91.95% statements/lines, 82.21% branches, 100% functions. Strict types/lint/format checks pass for owned files.
- Task 4: complete. CLI failures, immutable filtering, bounded VCF processing, schema mapping and browser build implemented. Browser HTTP/package smoke passes. Independent review reproduced seven additional integration issues; all are resolved with regression evidence and documented limitations.
- Task 5: local verification complete. `npm run verify` passes every gate in 109.60s. Latest all-source coverage: 88.50% statements/lines, 83.45% branches, 96.89% functions. Final draft PR and remote checks follow.

- User now requests regular commits and one consolidated, fully tested draft PR. Commit completed slices; push only the feature branch and open a draft after final local verification.

- Additional user scope: configure Dependabot and GitHub security checks; optimize repeat local and CI checks for speed.
- GitHub repository: enabled vulnerability alerts, automated security updates, secret scanning, push protection, and private vulnerability reporting. Workflow defaults already read-only with PR approval disabled. No paid security features or branch rules were enabled.
- GitHub configuration: weekly grouped npm root/docs and Actions updates; CodeQL JavaScript/TypeScript and Actions; dependency review and full audits. Remote main had 123 existing Dependabot alerts; local refreshed locks report zero. Existing alerts require merged locks and rescanning.
- Efficiency: content-aware ESLint/Prettier caches, incremental strict types, parallel independent gates, focused test/watch commands. Warm `npm run verify:static` passed in 5.87s. Wrapper/API subset runs 61 tests in about 2s after removing irrelevant retry waits. Dedicated retry regressions remain.
- CI verifies Node22/24 once and shares the tested bundle and Pages artifacts with reusable release/deploy workflows. All actions are pinned; draft PR cannot publish or deploy.

## Final expanded scope

- Implemented provenanced 1,000-variant 1000 Genomes VCF and paired genomic-HGVS
  Recoder workloads, bounded downloads, capture/replay, exact response validation
  and measured live/replay reports under `docs/benchmarks/`.
- Added optional two-worker POST batching, shared rate/cooldown control and full
  Retry-After handling. Retained sequential defaults because live Recoder results
  were variable. Both complete recordings reproduce identical outputs at either
  concurrency setting.
- Replaced executable scoring JavaScript with a restricted expression interpreter.
  Three parallel Opus xhigh reviews plus focused scoring/batching reviews were
  reproduced and dispositioned in the adversarial review report.
- Added shared in-memory VCF/PED/BED/gene parsers and public browser/package
  integration documentation. The built bundle exercises features, inheritance,
  scoring and VCF/Schema.org output; an isolated packed consumer also builds with
  a browser bundler without resolving repository development dependencies.
- Centralized transport, batching, pacing, cache timing, scoring budgets, CLI
  presets and benchmark defaults in JSON configuration, with validated overrides.
- User explicitly authorized merging after Actions pass, choosing an appropriate
  version bump and verifying the package release. Selected 4.0.0 because the
  scoring language and Node compatibility baseline change; the installed release
  analyzer independently confirms the intended squash commit produces a major.
- Package version is set before the verified build. Final `npm run verify` passed
  in 92.04 seconds: 611 tests; 91.59% statements/lines, 86.59% branches and 97.86%
  functions. The isolated 4.0.0 tarball passes Node API/CLI usage and a fresh browser
  consumer build. Actions, conditional merge and release confirmation follow.
