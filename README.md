# Provider Extension · 提供商拓展插件

[简体中文](README.zh-CN.md)

`dsh-provider-extension` is an **unofficial community plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that owns the composer's provider seat in DSH Desktop and hosts one integration module per provider.

> This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names are trademarks of their respective owners.

This project was previously published as `dsh-model-panel`. The installer migrates an existing installation automatically.

## Provider integrations

| Provider | State | What the plugin adds |
| --- | --- | --- |
| ChatGPT / Codex subscription (`dsh-codex-subscription` 2.x) | **Implemented** | Lists every saved account, switches the real active account, and shows each account's weekly remaining quota |
| OpenAI GPT (API) | Planned | — |
| Google Gemini | Planned | — |
| OpenCode | Planned | — |

Each provider gets its own module under `src/client/providers/`. Nothing is claimed as integrated until it is implemented and accepted in a real DSH window.

## Features

- Uses DSH's authoritative per-session `ModelDirectory`; it does not create a second model catalog.
- Replaces the shipped `conversation.input.model` visual seat while keeping its authoritative service and `/model` command.
- Renders exactly two model-related controls: a provider/account picker followed by a model/reasoning picker.
- Shows the chosen provider's models as accent-colored effort sliders, and the active model's declared reasoning-effort buttons.
- Keeps models without reasoning controls selectable.
- Choosing an ordinary provider changes the browsed catalog group; the active session model changes only after a model is chosen.
- Reports unsupported context-window selection honestly instead of showing fake 256K/512K/1M controls.

### ChatGPT / Codex subscription accounts

- Every saved account is listed under its provider with its label, masked email, and active marker.
- The header shows the account count instead of a model count.
- Selecting an account calls the subscription plugin's authenticated `account/select` RPC, refreshes its quota indicator, and reloads the model directory. OAuth credentials never reach this plugin.
- The active account's weekly remaining quota is read automatically when the list opens.
- Upstream's `usage` endpoint only reports the **active** account, so another account's quota is read on demand: the plugin switches to it, reads, and immediately switches back. A failed restore is reported instead of leaving the switch silent.

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

- `src/index.ts` — empty Host carrier required by the Cordis loader.
- `src/client/index.ts` — client registration and lifecycle-owned stylesheet.
- `src/client/ProviderPanel.tsx` — composer triggers, popovers, sliders, and accessibility behavior.
- `src/client/providers/codex.ts` — ChatGPT/Codex subscription roster, account switching, and quota reads.
- `src/client/selection.ts` — pure model/effort selection policy.
- `cordis.patch.yml` — bundle patch registering the `provider-extension` row.
- `scripts/profile.mjs` — backup-first profile installer/uninstaller and rename migration.
- `lib/client.js` — prebuilt browser artifact consumed by DSH.

The plugin declares `sessions`, `remote`, and `remote.session` because `modelDirectories.directoryFor(sessionId)` reads those services through the caller's Cordis context.

## Privacy and security

The plugin reads only the current session's model-directory state and calls its existing `load`/`select` methods. It optionally reads the secret-free account roster exposed by `dsh-codex-subscription` 2.x and calls that plugin's own authenticated endpoints for account switching and quota. It does not read prompts, messages, files, or credentials, makes no independent third-party requests, and includes no telemetry. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
