# Security policy

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/berntpopp/variant-linker/security/advisories/new). If private reporting is unavailable, open an issue requesting a private contact channel without publishing vulnerability details.

Include the affected version, operating system and Node.js version, a minimal reproduction using synthetic data, expected and actual behavior, and the potential impact. Remove credentials, identifying genomic data, and private endpoint details from attachments. Avoid public disclosure until maintainers have assessed the report and coordinated a fix.

Security fixes target the latest release. Reports affecting the npm package, CLI, browser bundle, documentation tooling, or dependency chain are welcome. Reproduce against the latest release when practical; older versions may require an upgrade.

## Trust boundaries

- Scoring formulas are executable JavaScript configuration. Only load formulas from trusted sources; they are not a sandbox for untrusted expressions.
- Variant inputs and upstream annotation responses are data. They must not become shell commands or executable configuration.
- Proxy credentials, private endpoints, patient data, and annotation payloads do not belong in diagnostic logs or public issue reports.
- Persistent caches are disposable local data. Use a private writable directory and apply the same access controls as the input data.

## Automated checks

Pull requests run the same `npm run verify` gates used locally, plus dependency review, root and documentation dependency audits, and CodeQL analysis of JavaScript/TypeScript and GitHub Actions. Scheduled checks detect advisories published after a dependency update. Dependabot proposes weekly root npm, documentation npm, and pinned GitHub Actions updates; major npm updates remain separate for review. Security updates are grouped separately and are not limited to the weekly version-update schedule.

Maintainers should review lockfile changes and security findings before merging. Passing checks do not establish clinical validity or guarantee that a dependency has no vulnerabilities.
