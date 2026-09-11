# Security policy

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/berntpopp/variant-linker/security/advisories/new). If private reporting is unavailable, open an issue requesting a private contact channel without publishing vulnerability details.

Include the affected version, operating system and Node.js version, a minimal reproduction using synthetic data, expected and actual behavior, and the potential impact. Remove credentials, identifying genomic data, and private endpoint details from attachments. Avoid public disclosure until maintainers have assessed the report and coordinated a fix.

Security fixes target the latest release. Reports affecting the npm package, CLI, browser bundle, documentation tooling, or dependency chain are welcome. Reproduce against the latest release when practical; older versions may require an upgrade.

## Trust boundaries

Variant-Linker submits the variants you select through CLI arguments, input files, configuration, or library calls to Ensembl for annotation. An explicitly configured endpoint can receive those variants instead. This includes genomic information, so choose inputs and endpoints according to your data-sharing requirements. The annotation pipeline does not automatically upload unrelated local files or the complete configuration file.

- Scoring formulas and conditions use a restricted AST interpreter with bounded evaluation. Arbitrary JavaScript, host globals, prototype traversal, getters and input-supplied functions are rejected. Keep models reviewed for their scientific assumptions; safe evaluation does not establish valid scores.
- Variant inputs and upstream annotation responses are data. They must not become shell commands or executable configuration.
- Proxy credentials, private endpoints, patient data, and annotation payloads do not belong in diagnostic logs or public issue reports.
- Persistent caches are disposable local data. Use a private writable directory and apply the same access controls as the input data.

## Automated checks

Pull requests run the same `npm run verify` gates used locally, plus dependency review, root and documentation dependency audits, and CodeQL analysis of JavaScript/TypeScript and GitHub Actions. Scheduled checks detect advisories published after a dependency update. Dependabot proposes weekly root npm, documentation npm, and pinned GitHub Actions updates; major npm updates remain separate for review. Security updates are grouped separately and are not limited to the weekly version-update schedule.

Maintainers should review lockfile changes and security findings before merging. Passing checks do not establish clinical validity or guarantee that a dependency has no vulnerabilities.

CodeQL's `js/file-access-to-http` finding on the annotation POST body was reviewed in [PR #77](https://github.com/berntpopp/variant-linker/pull/77). Its traced source is the user-selected configuration's variant values, which become the intended annotation request body. That specific flow is expected functionality; it is not evidence of an unrelated file upload. The query remains enabled so that future file-to-network flows receive review. See the [CodeQL query guidance](https://codeql.github.com/codeql-query-help/javascript/js-file-access-to-http/) for the distinction between a detected data flow and an unintended disclosure.
