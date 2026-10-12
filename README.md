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

## Codex response detail

Open **Providers → OpenAI Codex** and choose **Default / Concise / Balanced / Detailed** under **Response detail**. Both quick and full views share this one preference for the current DSH profile. Changes save through the native configuration editor and affect subsequent Codex requests only; they neither switch models/accounts nor alter other providers or search. Default follows the model's reported default, falling back to the adapter's usual balanced setting. Models that report no verbosity support retain their original behavior. This is a style preference, not a hard response-length limit.

The control displays acknowledged saves and failures; Hosts without persistent configuration editing are read-only. The deferred `codex_output_verbosity` tool reads/sets this same narrow preference. Restart DSH after updating the linked build, then test the preference and retention after another restart. Subsequent feature additions require separate user approval, as recorded in [CODEX-ROADMAP.md](CODEX-ROADMAP.md).

## Codex context length

In **OpenAI Codex → Manage settings**, **Context length** offers Standard (model defaults), Extended (model maxima), or Custom. The current effective size for each model is shown below the mode. Custom edits one shared profile-wide value such as **256k**; 1k means 1,000 tokens. Models use that value up to their own catalog maximum, so a smaller model cannot inherit another model's higher limit. Mode changes save automatically; custom size saves when you press **Save**. Larger contexts may use more input tokens and do not unlock server access.

Existing per-model overrides are kept in native config for compatibility, but the UI no longer edits them separately. The shared value applies to future requests; prepared calls retain their prior capacity. Restart DSH after updating, then test Custom `k` value and persistence after a second restart. The context tool also reads/writes one `tokensK` value. Automated tests use mocked config and provider streams.

## Codex quota details

The Composer quota tooltip and each Codex account's expanded details show 5h/week windows only when the provider reports them, plus any additional rate-limit groups, Credits and an individual spending cap when present. **Credits are not currency**; credit balances and spend-cap values are shown as reported, with no inferred unit or currency conversion. The Usage page already has separate provider balance cards and reset-credit details. No additional inference calls are made for this display.

## Codex image tools

In **OpenAI Codex → Manage settings**, the separate **Image generation** and **Image editing** switches control tool availability. They save to native config and changing them does not start an image request; an explicit image request may use subscription quota. The switches are user-only and cannot be enabled through an Agent settings tool. In Codex-routed sessions, explicit image-output requests are directed to `codex_image_generate`; image discussion alone does not call it, disabled switches are not bypassed, and other provider routes are unchanged. They do not alter input-image handling or model/quality defaults. Annotated edits require Image editing to be enabled.

## Codex original image

For a completed `codex_image_generate` call, the chat tool card keeps the generated preview and offers **View original** and **Download PNG**. The original is read from the DSH Host's private store, scoped to the current Session and validated in bounded chunks. This makes no image-provider request and uses no additional subscription quota. When an original is unavailable, the card reports it instead of reading an arbitrary host path.

## Codex annotated edits

When **Image editing** and annotations are enabled, open a completed image result, choose **Mark areas**, click to place numbered pins, and add a note for each area. **Continue editing** adds the clean source image, a numbered PNG location reference, and the coordinate/note prompt to the current Codex composer. It does not alter the saved original or send the request; review the prepared draft and press Send. Sending may use subscription quota.

## Codex speed mode

In **OpenAI Codex → Manage settings**, select **Standard** or **Fast**. It saves the Codex-profile preference for subsequent requests. The existing catalog capability determines which models can actually receive the Fast priority tier; other models keep standard behavior, and an empty advertised support list is shown in the panel. Fast does not change reasoning effort, model, account or other providers and may consume subscription quota faster. It does not unlock access.

The shared native config editor persists this preference. The deferred `codex_speed_mode` tool reads and sets the same operation. After updating the linked build, restart DSH and test a supported model in both modes, then restart again to verify persistence. Automated payload tests use mocked streams and make no billable calls. Ultrafast is not included.

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

Account cards can be dragged by their grip to change order, or moved with the grip's arrow keys. “Choose visible cards” provides per-account checkboxes and up/down controls; each card also has a hide button. Restore default layout to reset order and visibility. Only card IDs and display preferences are kept in browser local storage, not balances, labels or tokens. New accounts are appended without disturbing the saved order, and hiding a card does not change authentication or provider queries.

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
