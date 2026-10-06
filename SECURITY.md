# Security policy

## Supported version

Only the latest GitHub release is supported with security fixes.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow for this repository. Do not publish credentials, session data, private model names, or exploit details in a public issue.

## Data and permissions

`dsh-provider-extension` contains Host integrations and browser UI. The provider integrations can manage authentication and send requests to their providers; those permissions must not be confused with the usage-report boundary.

Claude is an exception to plugin-managed auth: it executes the user's unmodified official Claude Code CLI and projects only its bounded public `auth status` fields, with masked email. It never reads Claude credential files or handles OAuth/session tokens. Login is a user-only official CLI action. API-key/third-party CLI billing remains possible and is disclosed, not claimed as subscription billing. DSH alone executes tools; the isolated schema-only MCP bridge has no tool implementation. Subprocess cancellation and plugin disposal terminate CLI requests before owned temporary manifests are removed. Text-only transcript replay and unsupported sampling fields are explicit limitations. CLI executable/PATH configuration is trusted operator configuration.

The usage feature:

- reads profile-local session records through the Host session query/projection services;
- derives metadata, timing and counters, without retaining message bodies or credentials in its projection or reports;
- queries DeepSeek recharge and bonus wallets through the existing Host account service, without transferring the account grant to the page;
- invokes provider-owned Host readers for Codex per-account quota/credits, per-account Antigravity quota and OpenCode Go usage; credentials stay in their existing Host integrations;
- never switches provider accounts to scan usage or read the Statistics page's account section; targeted Codex failures cannot fall back to another account;
- refreshes account-scoped OAuth through the existing provider implementations; token rotations are persisted under the existing credential-store lock without changing active account selection;
- returns only closed quota/credit projections with masked email labels; credits without a reported currency are never presented as cash;
- stores only optional DeepSeek estimation rates in a profile-local Host domain; the usage cache is derived and rebuildable;
- keeps missing/ambiguous accounting distinct from zero, and estimates distinct from real bills;
- exposes bounded reports and the same validated pricing operation to the page and `usage_statistics` tool;
- adds no telemetry, budget notifications or automatic request limits.

Request bodies are validated. Usage read failures return stable classifications rather than raw errors, credentials or log content. Session titles and workspace paths are visible metadata in reports and should be treated as private when sharing screenshots.

The installer writes only to the selected user-owned DSH home and profile. It creates timestamped backups before changing `package.json` or `cordis.patch.yml`; it never modifies the installed Desktop application or `app.asar`.
