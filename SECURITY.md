# Security policy

## Supported version

Only the latest GitHub release is supported with security fixes.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow for this repository. Do not publish credentials, session data, private model names, or exploit details in a public issue.

## Data and permissions

`dsh-model-panel` is a browser-side DSH plugin. It:

- reads the current session's model directory;
- asks that directory to load when the user opens or reloads the panel;
- sends only `provider`, `model`, and an optional `reasoningEffort` after an explicit user selection;
- does not read prompts, messages, credentials, or files;
- does not make its own network requests and contains no telemetry.

The installer writes only to the selected user-owned DSH home and profile. It creates timestamped backups before changing `package.json` or `cordis.patch.yml`; it never modifies the installed Desktop application or `app.asar`.
