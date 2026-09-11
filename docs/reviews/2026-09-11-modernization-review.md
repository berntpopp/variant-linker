# Modernization integration review

Reviewed on 2026-09-11 on `chore/reliable-agentic-development`, against the current
integrated worktree and the modernization design, implementation plan and initial
repository audit. This is an independent cross-owner review of CLI routing,
core acquisition, output processing, schema mapping, browser/package checks and
API/cache/assembly boundaries. The reviewer implemented the data, inheritance,
feature, scoring and tabular modules; those modules are not represented as
independently reviewed here.

## Result

No unresolved P1 finding remains in the reviewed integration scenarios. All six
initial integration findings were reproduced before correction and replayed
successfully after correction. A subsequent partial-liftover failure-accounting
finding was also corrected and covered by a focused regression. This conclusion
does not replace the repository-wide verification gate.

## Findings resolved

| Severity | Trigger and original failure                                                                                                       | Verified correction                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Direct coordinate input with VCF output returned only headers with exit status 0.                                                  | Acquisition supplies the original VCF representation. A real child CLI invocation now emits one data row. Direct SNV, CNV and HGVS tests also cover structural END/SVTYPE and distinct spans.                                                                    |
| P1       | Mixed successful and failed inputs written as CSV exited 0, while JSON exited 1.                                                   | File routing obtains structured results before serialization and accounts for unsuccessful inputs. Replayed mixed-input CSV and JSON both exit 1.                                                                                                                |
| P2       | SCHEMA output ignored an explicit annotation filter.                                                                               | Filtering precedes schema mapping. A two-variant input filtered to start greater than 150 produces one annotation within the Dataset envelope.                                                                                                                   |
| P2       | Streaming SCHEMA output emitted ordinary JSON without the Dataset envelope.                                                        | Each chunk is mapped and validated, then emitted as one compact JSON-LD document. Replayed stdin output contains the schema context.                                                                                                                             |
| P1       | Repeated identical VCF keys escaped the chunk limit because the budget counted unique keys.                                        | Every retained allele occurrence contributes to the budget. A real-parser probe with 1,000 duplicate rows and chunk size 10 produced 100 batches, each retaining at most 10 rows.                                                                                |
| P2       | Explicit VCF filters still emitted excluded original rows.                                                                         | The formatter receives only records selected by filtered annotation keys. File and streaming CLI replays retain the selected position-200 row and exclude position 100. Selected multiallelic records retain their complete original ALT list and sample fields. |
| P1       | A chunk containing a successful annotation and a failed liftover could report success because only annotation errors were counted. | Stream failure accounting includes unsuccessful liftover metadata. The focused regression verifies one failed outcome alongside a successful annotation.                                                                                                         |

## Verification evidence

Focused review runs completed successfully:

- API reliability, assembly, persistent cache, expiry diagnostics, core acquisition,
  stream integrity and CLI contracts: 58 passing in the initial combined run.
- Direct-input VCF, core modernization and data integrity: 24 passing.
- Updated stream integrity and CLI contracts, including partial liftover accounting:
  13 passing.
- Legacy inheritance integration and VEP consistency after minimal lint cleanup:
  11 passing, with the offline preload explicitly enabled. The consistency fixture
  contained 34 variants and all 34 produced annotation data.
- ESLint with zero warnings and Prettier passed for the two cleaned legacy suites.

The counts overlap and must not be added together. API response substitutes were
used at external transport boundaries; parser regressions used real files and
dependencies. The duplicate-budget probe replaced only the downstream chunk
consumer to observe retained input sizes. Browser/package source inspection
confirmed the smoke exercises the built bundle with a fetch transport and checks
the package file list; it is not a real-browser deployment test.

The data/scoring implementation's separate scoped run passed 200 tests and measured
91.95% statements/lines, 82.21% branches and 100% functions. That is a module-scoped
measurement, not a claim about repository-wide coverage. The integration owner
records the final whole-repository verification result separately.

## Remaining limits and operational behavior

- Bounded VCF processing requires explicit streaming. Inheritance uses the
  materialized dataset because compound-heterozygous inference crosses records.
  A single multiallelic record can exceed the configured chunk count, and the
  iterator is not an absolute byte-memory limit.
- Annotated source VCF preserves the original coordinates and headers even when
  annotations use a target assembly. JSON contains the detailed liftover
  provenance; consumers needing that provenance should use JSON.
- Persistent cache writes use an exclusive lock with a bounded wait. A forcibly
  terminated writer can leave a stale lock: reads remain available, writes fail
  and increment diagnostics, and recovery requires confirming the writer has
  stopped before removing the lock. Automatic lease recovery is not implemented.
- Scoring formulas and conditions remain trusted executable JavaScript. Compilation
  caching does not make externally supplied scoring configurations safe to execute.
- Offline baseline and inheritance fixtures verify software contracts and known
  cases. They do not establish clinical validity or validate every possible
  biological representation; unresolved parental origins remain uncertain.

The streaming, liftover, scoring and cache limitations are documented in the
[reliable-processing guide](../guide/reliable-processing.md).
