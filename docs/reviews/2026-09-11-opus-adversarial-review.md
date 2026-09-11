# Opus adversarial review of draft PR 77

The user requested parallel adversarial review through Claude Code CLI using Opus
at `xhigh` effort. Three read-only reviews inspected the same immutable tracked
snapshot, `c7da9e7`, against `ee861a8`. Claude Code 2.1.267 ran with
`--model opus --effort xhigh --safe-mode`, Read/Glob/Grep only, no MCP connections,
no interactive permission prompts and no session persistence. The returned model
metadata identifies `claude-opus-5`; auxiliary Haiku bookkeeping was also reported.
All three reviews completed without a model error. Reviewers explicitly performed
static inspection, not execution; the implementation team reproduced findings.

Separate focused Opus reviews covered the subsequently added restricted scoring
interpreter and bounded POST concurrency. Both returned `claude-opus-5` metadata
at requested `xhigh` effort and completed without a model error. Local raw outputs
and prompts remain in ignored temporary storage.

## Findings and dispositions

| Area           | Finding                                                         | Disposition and evidence                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming      | Axios errors with `code` abort the stream as if output failed   | Reproduced and fixed; a failed HTTP chunk is counted and a following chunk is written. Actual writer failures still abort.                                                                                                                                            |
| Liftover       | Normalized reverse-map identity loses `chr` spelling            | Reproduced and fixed; original input survives, and a real trio VCF retains consequence and de novo inheritance annotations.                                                                                                                                           |
| VCF            | Repeated rows multiply annotations                              | Reproduced and fixed; acquisition deduplicates identities while original records and samples remain retained.                                                                                                                                                         |
| VCF            | Extra blank lines between chunks                                | Reproduced and fixed; streamed output has exactly one terminating newline per record.                                                                                                                                                                                 |
| VCF            | Empty-file consequence schema differs from populated output     | Reproduced and fixed with one shared consequence-field definition.                                                                                                                                                                                                    |
| VCF            | Valid `ALT=.` rows disappear                                    | Reproduced and fixed with original-row passthrough. Rejected the separate suggestion to silently continue after malformed VCF; malformed records still fail explicitly.                                                                                               |
| Proxy          | Missing CLI proxy disables Axios environment discovery          | Reproduced and fixed; absent configuration passes `null`, while explicit library `false` still disables proxies.                                                                                                                                                      |
| Mirrors        | CLI ignores `ENSEMBL_BASE_URL`                                  | Restored at the CLI boundary; explicit flag/configuration wins. Library request contexts retain explicit assembly/base-URL precedence.                                                                                                                                |
| Timeouts       | 15-second attempts risk repeated expensive requests             | Initial Recoder p95 was 13.922 seconds. Raised the default to 60 seconds, retained the 120-second overall budget, and exposed a CLI override. The review's claim that no override existed was overstated: configuration/library request options already supported it. |
| Retry          | Server cooldown could be shortened                              | Independent documentation review reproduced this additional defect. The full server wait now overrides client backoff caps; an insufficient deadline fails before another request.                                                                                    |
| Cache          | Cancellation during a cache write rejects an available response | Retained intentionally: the overall deadline/caller cancellation covers the complete operation. Ignoring cancellation or waiting beyond the deadline, as suggested, would break the explicit request-budget contract. Ordinary cache-write failures remain nonfatal.  |
| Cache          | Legacy entries are outside the new owned directory              | Documented migration. Automatic deletion of ambiguous legacy hash-named JSON was rejected; the new cache clears only positively identified owned entries.                                                                                                             |
| Cache          | Statistics writes generation markers and causes rescans         | Reproduced and fixed; statistics refreshes are read-only and preserve the previous complete snapshot if refresh fails or races a writer.                                                                                                                              |
| Scoring        | `UNIQUE` defaults differ from lowercase `unique`                | Reproduced and fixed by normalizing the aggregator before default handling.                                                                                                                                                                                           |
| Scoring        | Bundled CNV statement formulas fail                             | Fixed by the restricted interpreter's bounded constant-and-return programs; actual bundled configuration and top-level dosage/phenotype data are tested.                                                                                                              |
| Browser        | `path: false` overrides the path polyfill                       | Reproduced in the built browser bundle; changed the mapping and verified feature annotation through browser HTTP transport.                                                                                                                                           |
| Security gates | Advisory updates can block publishing                           | Retained intentionally: the user explicitly requested enforced security checks. Advisory checking is time-dependent and is distinguished from deterministic offline tests.                                                                                            |
| Release        | Exact-SHA checkout might break semantic-release                 | Rejected after inspecting pinned checkout and installed semantic-release: full-history checkout fetches branch refs, and semantic-release explicitly handles detached HEAD by fetching the release branch.                                                            |
| Tooling        | Unused development dependencies and dead shim                   | Removed five unused development dependencies, their 147-package subtree, obsolete Babel configuration and the dead filesystem shim. Root audit remains clean.                                                                                                         |
| CI             | Ignore drift, dependency release prefix and Windows coverage    | Fixed ignores; runtime Dependabot commits now trigger patch releases. Added Windows Node 22 verification alongside Ubuntu Node 22/24.                                                                                                                                 |
| Docs           | Vite override crosses the VitePress declared major              | Deliberate security compatibility exception; both build and local serving are validated and the override remains documented for removal on a compatible stable VitePress upgrade.                                                                                     |
| Package smoke  | Smoke is outside source coverage/type checking                  | The smoke executes on every full verification against the actual built bundle and package contents. Added an actual missing browser-feature case; source coverage thresholds remain scoped to runtime source.                                                         |
| Test budgets   | Parallel verification may time out on loaded hosts              | A risk observation, not a demonstrated defect. Final local and Node 22/24 plus Windows CI runs determine whether changes are needed.                                                                                                                                  |

## Focused scoring review

The reviewer found no JSON/formula interpreter escape. Regressions reproduced and
fixed repeated parsing/warnings for invalid conditions, undercharged scope-copy
work, null/boolean computed keys, skipped keys in multi-score objects, legacy string
defaults, and unsafe regular-expression substitution in debug rendering. CNV
annotation-level mappings and callback receiver identity were already corrected
while review ran. Bare callbacks are rejected as formula results; supported
callbacks and array-only spread remain documented. Scoring budgets are centralized
in validated configuration, while syntax and callable-method allowlists remain
security constraints.

## Focused batching review

The reviewer found no high-severity defect. Reproduced and fixed a rate interval
that never recovered after a quota change, inconsistent Retry-After parsing, and
unvalidated Recoder species paths. Rejected the cache-write-rejection hypothesis
because the existing cache boundary catches write failures. Retained temporal
first-error cancellation and conservative quota merging as explicit contracts;
negative quota headers were an undocumented hypothetical. Twelve offline replays
returned all 1,000 results, five logical chunks and no retries, with identical
canonical outputs at concurrency one and two for each endpoint.

## Verification limits

Static review findings were not treated as test results. Offline regressions use
real parsers/files and replace external transport; live benchmark measurements
use public, provenanced datasets. Neither establishes clinical validity. Final
whole-repository verification passed in 92.04 seconds with 611 tests and coverage
of 91.59% statements/lines, 86.59% branches and 97.86% functions. The 4.0.0 tarball
also passed an isolated Node API/CLI consumer and a fresh browser-bundler build.
One full-suite test-order assumption was reproduced and fixed: the invalid-
condition cache regression now counts that condition's parse calls, independent
of formulas already cached by other suites. GitHub checks and release verification
follow the final commit.
