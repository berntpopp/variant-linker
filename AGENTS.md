# Working on Variant-Linker

Use Node >=22.14. Install committed dependency trees with `npm ci` and
`npm --prefix docs ci`. Keep CommonJS exports and the CLI contract compatible.

## Module boundaries

- `src/cli/` and `main.js`: argument parsing, input streams, output and exit status.
- Core modules: normalize requests, acquire annotations, enrich, then serialize.
- API/cache modules: immutable transport contexts, bounded retries, canonical cache keys.
- VCF/inheritance modules: preserve original records, target ALT, phase and uncertainty.
- Scoring configuration is trusted executable code; never accept untrusted formulas.
- Serializers own schema and escaping. Keep browser and Node capabilities explicit.

## Required local checks

`npm run verify` runs the same gates as CI: lint, formatting, strict source types,
physical line limits, offline tests with coverage, browser build, package smoke checks,
documentation build and production dependency audit. Run focused tests while editing.

- `npm run lint`: ESLint correctness rules; warnings fail.
- `npm run format:check`: non-mutating formatting; `npm run format` applies it.
- `npm run typecheck`: strict JSDoc/checkJs over all production source, without emission.
- `npm run check:loc`: maximum 649 physical lines per handwritten code file.
- `npm test`: deterministic tests; external network blocked in parent and CLI children.
- `npm run test:coverage`: all `src` included; >=81% statements, branches, functions, lines.
- `npm run test:live`: explicit opt-in Ensembl smoke test, separate from ordinary tests.

## Test and change contract

Write a failing behavior regression before fixes. Use real parsers and temporary files;
mock the external HTTP boundary. Unexpected external requests must fail immediately.
Put shared fixtures in `test/support`; use the CLI helper so child processes inherit
the offline guard. Never hide integration failures behind conditional assertions.
Run one suite with `npx mocha --no-config --require ./test/support/offline-setup.cjs
test/example.test.js` (join the command onto one line). The default config discovers
all ordinary suites; live tests have a separate command.

Keep source, tests, scripts and handwritten configs below 650 physical lines;
split by responsibility. Keep AGENTS.md and CLAUDE.md below 80 lines each.
Do not disable strict types, remove source from coverage, or suppress diagnostics
to make a gate green. Document extensible external data at typed boundaries.

Do not mutate process-wide endpoint state. Preserve variant identity, original VCF
sample fields, biological uncertainty and counts of unsuccessful records.
Diagnostics go to stderr, with credentials redacted. Cache maintenance only touches
owned entries. No public network belongs in ordinary tests or benchmarks.

Before completion, run relevant checks and report actual results and remaining risks.
Dependency updates preserve committed locks and use reviewed versions.
Do not publish, push, or merge without authorization. Follow exclusive file ownership
when working with other agents; do not overwrite their concurrent edits.
