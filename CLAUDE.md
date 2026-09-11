# Claude Code instructions

Read [AGENTS.md](AGENTS.md) for the canonical architecture, workflow and quality gates.
It applies to all repository changes. Keep this file below 80 physical lines.

Use focused behavior regressions during development, then `npm run verify` before
claiming completion. Report actual command outcomes. Never weaken type, coverage,
formatting or file-size gates to hide unfinished work.

Scoring formulas execute trusted JavaScript. Do not introduce untrusted formula
uploads or print proxy credentials/genomic payloads in routine diagnostics.
