# Provider Extension · 提供商拓展插件

[简体中文](README.zh-CN.md)

`dsh-provider-extension` is an **unofficial community plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that owns the composer's provider seat in DSH Desktop and hosts one integration module per provider.

> This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names are trademarks of their respective owners.

This project was previously published as `dsh-model-panel`. The installer migrates an existing installation automatically.

## Provider integrations

| Provider | State | What the plugin adds |
| --- | --- | --- |
| ChatGPT / Codex subscription (`dsh-codex-subscription` 2.x) | **Implemented** | Lists every saved account, switches the real active account, and shows each account's weekly remaining quota |
| Antigravity (`dsh-antigravity-auth` 0.1.4-rc.1) | **Implemented** | The provider settings page acknowledges the companion's risk notice, signs in a Google account, and lists the models that account reports |
| OpenAI GPT (API) | Planned | — |
| Google Gemini | Planned | — |
| OpenCode Go | Implemented | Gateway models, API-key settings and usage windows |
| Claude subscription (`anthropic-claude-cli`) | Implemented; live inference awaits user login | Official CLI-owned authentication, text streaming, tool-call handoff, model aliases and visibility switches |

Each provider gets its own module under `src/client/providers/`. Nothing is claimed as integrated until it is implemented and accepted in a real DSH window.

Host integrations are included in this bundle, with upstream provenance and licenses recorded in THIRD-PARTY-NOTICES. Do not enable a second adapter owning the same route. Antigravity and Codex credentials stay in their Host integrations; Claude differs by leaving authentication entirely to the official CLI.

## Claude subscription via the official CLI

Install the unmodified official Claude Code CLI on PATH, restart DSH, then open **Provider Extension → Anthropic Claude**. The login button opens the official `claude auth login` in a visible Windows terminal; other platforms show the same command to run yourself. Finish login and refresh status. Choose Anthropic Claude and a Sonnet/Opus/Haiku alias in the composer. Authentication and account switching stay in the CLI: this extension never imports, stores, exports or rewrites its tokens. The current CLI authentication may instead use API-key/third-party billing; the settings view displays that distinction. Follow [Anthropic’s authentication and credential rules](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

The MIT adapter is adapted from [katsos/dsh-claude-cli](https://github.com/katsos/dsh-claude-cli), pinned at `3a3a57f22a3e748c9720a1b96ce64e015f0f9643`. DSH owns the conversation and executes tools; the CLI's built-in tools and local settings are disabled, and an inert MCP bridge supplies tool schemas only. Streams stop after one model message. This first version is text-only and re-renders history as a transcript, not native role-preserving replay; model aliases are advisory, not discovered account entitlements. Unreported subscription quotas/end dates remain unknown; use `/usage` in the CLI rather than extracting tokens or making paid quota probes.

Plugin Config fields: `claudeExecutable` (default `claude`), `claudeStreamIdleTimeoutMs` (default `300000`), `claudeUnsupportedFields` (default `error`). The CLI cannot honor `temperature`, `maxTokens` or `stop` here: remove them from the agent configuration or explicitly choose `ignore` to drop them. `claude_channel` offers read-only status/models to agents; only the UI/user terminal can start login. Installation/status and synthetic streaming tests do not establish live provider availability until your own login and request succeed.

## Features

- Uses DSH's authoritative per-session `ModelDirectory`; it does not create a second model catalog.
- Replaces the shipped `conversation.input.model` visual seat while keeping its authoritative service and `/model` command.
- Renders exactly two model-related controls: a provider/account picker followed by a model/reasoning picker.
- Shows the chosen provider's models as accent-colored effort sliders, and the active model's declared reasoning-effort buttons.
- Keeps models without reasoning controls selectable.
- Choosing an ordinary provider changes the browsed catalog group; the active session model changes only after a model is chosen.
- Reports unsupported context-window selection honestly instead of showing fake 256K/512K/1M controls.

### Usage Statistics (included in this bundle)

The sidebar Usage Statistics page covers every workspace, session and subagent in the current DSH configuration, without cross-profile synchronization. It includes a yearly activity heatmap, usage trends, provider/model/workspace/session rankings and request latency, first-token, retry and failure metrics. It follows the DSH theme and adds no budget notices or automatic request limits.

The first visit imports persisted session history in the background and displays progress and read failures. Fork-inherited prefixes are excluded from physical request totals; original requests remain counted after conversation compaction. Unreported token usage is marked missing, not zero.

DeepSeek recharge and bonus wallets reuse the DSH account login. The existing Usage action opens Platform, not a billing-data API. Wallet changes are not a spending ledger. Monetary figures are **estimates** using the currently configured per-channel/model rates per million tokens, not historical prices or actual bills. Missing rates or ambiguous cache accounting stay unknown; currencies remain separate. Other providers are not priced in this first version.

The account section also reads real Codex per-account 5-hour/weekly quotas and provider credits, per-account Antigravity group quotas, and OpenCode Go's Host-side usage API. It never switches accounts or sends secrets to the page. Both current and inactive saved accounts are queried directly with their own refreshable authentication; unsupported channels are labeled explicitly; missing data is not 100% remaining or zero money. OpenCode's reported percent is not reinterpreted as remaining. Re-entering the page immediately shows the last account snapshot for the same connection while refreshing in the background; checked timestamps remain unchanged until new results arrive. Failed requests retain the previous snapshot with an explicit warning. This browser-memory snapshot is cleared on reload, not persisted to browser storage. Refresh is entry/manual, independent of log filters. The `usage_statistics` action `balances` returns this same combined account view; `balance` remains the legacy DeepSeek-only operation.

DSH session projections own the rebuildable usage cache; the Host stores rates within the current configuration. The page and `usage_statistics` tool share report, balance and pricing operations. Reports expose metadata and counters, not message content or credentials. Required Host capabilities are `sessionQuery`, `sessionProjections` and `connection`; saving rates additionally requires `storageDomain`.

Install or upgrade this bundle through DSH's Plugin Manager to include the page. Replacing a loaded package may require restart; follow the installation result rather than assuming a browser refresh reloads Host code.

### ChatGPT / Codex subscription accounts

- Every saved account is listed under its provider with its label, masked email, and active marker.
- The header shows the account count instead of a model count.
- Selecting an account calls the subscription plugin's authenticated `account/select` RPC, refreshes its quota indicator, and reloads the model directory. OAuth credentials never reach this plugin.
- The active account's weekly remaining quota is read automatically when the list opens.
- The existing composer/settings controller still reads another account on demand through a temporary switch/restore and reports a failed restore. The Usage Statistics page uses the new account-specific read path instead: no switch, and a failed targeted request never falls back to another account's quota.

## Compatibility

Verified in **DSH Desktop v2.0.9** against the public `0.1.2-rc.1` DSH package contracts. Those contracts are pre-release APIs, so newer Desktop versions may require a plugin update.

The current selection request is limited to:

```ts
{ provider: string, model: string, reasoningEffort?: string }
```

A real context budget requires Host request preparation, persistence, provider support, and compaction integration. Catalog metadata alone is not treated as a working backend capability.

## Install

Requirements: DSH Desktop with an initialized `desktop` profile, Git, and Node.js 20 or newer.

```powershell
git clone https://github.com/forestbiankiii/dsh-provider-extension.git
cd dsh-provider-extension
node scripts/profile.mjs install
```

The repository includes prebuilt `lib/index.js` and `lib/client.js`, so installation does **not** require `npm install` or a compiler.

The installer:

1. removes every earlier package name (`dsh-model-panel`, `@dshx/client-ui-model-panel`) from dependencies, bundles, patch rows, and runtime copies;
2. copies an allow-listed runtime package to `~/.dsh/local-plugins/dsh-provider-extension`;
3. declares a local file dependency in `~/.dsh/profiles/desktop/package.json`;
4. copies the runtime into the profile's `node_modules` for immediate resolution;
5. adds `dsh-provider-extension` exactly once to `dsh.profile.bundles`;
6. removes legacy/manual `provider-extension` and `model-panel` rows from the user patch so the bundle cannot be registered twice;
7. backs up both edited profile files first.

It never edits the installed application or `app.asar`. If your home or profile differs:

```powershell
node scripts/profile.mjs install --dsh-home D:\path\to\.dsh --profile desktop
```

Then **fully quit and restart DSH Desktop**. Reloading the page is insufficient when changing the composed plugin rows.

## Update

From the cloned repository:

```powershell
git pull --ff-only
node scripts/profile.mjs install
```

Restart DSH Desktop afterward. Re-running the installer is idempotent and creates a fresh backup.

Upgrading from `dsh-model-panel` needs no extra step: running the installer performs the migration, including removing the old runtime copies.

## Uninstall

From the cloned repository:

```powershell
node scripts/profile.mjs uninstall
```

Restart DSH Desktop afterward. The uninstaller removes only this plugin's exact dependency, bundle entry, legacy/manual patch rows, and runtime copies, while preserving a backup of the edited profile files.

## Develop

```powershell
npm ci
npm run check
```

`npm run check` performs strict TypeScript checking, component/policy/installer tests, rebuilds the DSH client-module artifact, and verifies the publishable package. The dedicated builder uses esbuild plus Lightning CSS, externalizes DSH-provided runtime modules, and wraps browser output in `window.__ModuleLoader__.load(...)`.

UI and runtime changes must pass the real-window acceptance gate documented in [CONTRIBUTING.md](CONTRIBUTING.md): install the candidate locally, let the requester try it in the current DSH Desktop window, and wait for explicit approval before any push, tag, or release.

## Architecture

- `src/index.ts` — Host provider integrations and usage-module mounting.
- `src/usage/` — secret-free metering projection, historical import, reporting, DeepSeek wallets and rate storage.
- `src/client/usage/` — statistics main panel, sidebar entry, filters and charts.
- `src/client/index.ts` — client registration and lifecycle-owned stylesheet.
- `src/client/ProviderPanel.tsx` — composer triggers, popovers, sliders, and accessibility behavior.
- `src/client/providers/codex.ts` — ChatGPT/Codex subscription roster, account switching, and quota reads.
- `src/client/selection.ts` — pure model/effort selection policy.
- `cordis.patch.yml` — bundle patch registering the `provider-extension` row.
- `scripts/profile.mjs` — backup-first profile installer/uninstaller and rename migration.
- `lib/client.js` — prebuilt browser artifact consumed by DSH.

The plugin declares `sessions`, `remote`, and `remote.session` because `modelDirectories.directoryFor(sessionId)` reads those services through the caller's Cordis context.

## Privacy and security

The plugin includes Host provider integrations and Client UI. Usage reporting reads metering, model, timing and relationship records through the Host session query/projection services. Its reports expose only statistics and session metadata, not message bodies or credentials. DeepSeek wallets use the Host account service; the usage feature does not read separate keys or switch provider accounts. Provider authentication and network access have a different permission boundary from usage reporting. No telemetry is added. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
