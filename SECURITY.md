# Security policy

## Supported version

Only the latest GitHub release is supported with security fixes.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow for this repository. Do not publish credentials, session data, private model names, or exploit details in a public issue.

## Data and permissions

`dsh-provider-extension` is a browser-side DSH plugin. It:

- reads the current session's model directory;
- asks that directory to load when the user opens or reloads the panel;
- sends only `provider`, `model`, and an optional `reasoningEffort` after an explicit user selection;
- does not read prompts, messages, credentials, or files;
- optionally reads the secret-free account roster exposed by `dsh-codex-subscription` 2.x and calls that plugin's own authenticated endpoints for account switching and quota reads (a quota read for a non-active account temporarily switches to it and switches straight back);
- does not make independent third-party network requests and contains no telemetry.

The installer writes only to the selected user-owned DSH home and profile. It creates timestamped backups before changing `package.json` or `cordis.patch.yml`; it never modifies the installed Desktop application or `app.asar`.
