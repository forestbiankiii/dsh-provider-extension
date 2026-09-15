# dsh-model-panel

[简体中文](README.zh-CN.md)

An **unofficial community plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that adds a compact model and reasoning-effort slider panel to DSH Desktop.

> This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names are trademarks of their respective owners.

## Features

- Uses DSH's authoritative per-session `ModelDirectory`; it does not create a second model catalog.
- Replaces the shipped `conversation.input.model` visual seat while keeping its authoritative service and `/model` command.
- Renders exactly two model-related controls: a provider picker followed by a model/reasoning picker.
- Shows the chosen provider's models as accent-colored effort sliders.
- Provides the active model's declared reasoning-effort buttons.
- Keeps models without reasoning controls selectable.
- Uses the shipped model directory and survives page reloads.
- Opens upward from the composer and supports Escape/outside-click dismissal.
- Reports unsupported context-window selection honestly instead of showing fake 256K/512K/1M controls.
- Choosing a provider changes the browsed catalog group; the active session model changes only after the user chooses a model.

## Compatibility

The initial release was verified in **DSH Desktop v2.0.9** against the public `0.1.2-rc.1` DSH package contracts. Those contracts are pre-release APIs, so newer Desktop versions may require a plugin update.

The current selection request is limited to:

```ts
{ provider: string, model: string, reasoningEffort?: string }
```

A real context budget requires Host request preparation, persistence, provider support, and compaction integration. Catalog metadata alone is not treated as a working backend capability.

## Install

Requirements: DSH Desktop with an initialized `desktop` profile, Git, and Node.js 20 or newer.

```powershell
git clone https://github.com/forestbiankiii/dsh-model-panel.git
cd dsh-model-panel
node scripts/profile.mjs install
```

The repository includes prebuilt `lib/index.js` and `lib/client.js`, so installation does **not** require `npm install` or a compiler.

The installer:

1. copies an allow-listed runtime package to `~/.dsh/local-plugins/dsh-model-panel`;
2. declares a local file dependency in `~/.dsh/profiles/desktop/package.json`;
3. copies the runtime into the profile's `node_modules` for immediate resolution;
4. adds one idempotent row to the user-owned `cordis.patch.yml`;
5. backs up both edited profile files first.

It never edits the installed application or `app.asar`. If your home or profile differs:

```powershell
node scripts/profile.mjs install --dsh-home D:\path\to\.dsh --profile desktop
```

Then **fully quit and restart DSH Desktop**. Reloading the page is insufficient when adding a new client-module row.

## Update

From the cloned repository:

```powershell
git pull --ff-only
node scripts/profile.mjs install
```

Restart DSH Desktop afterward. Re-running the installer is idempotent and creates a fresh backup.

## Uninstall

From the cloned repository:

```powershell
node scripts/profile.mjs uninstall
```

Restart DSH Desktop afterward. The uninstaller removes only this plugin's exact dependency, marked patch block, runtime copies, and preserves a backup of the edited profile files.

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
- `src/client/ModelPanel.tsx` — composer trigger, popover, sliders, and accessibility behavior.
- `src/client/selection.ts` — pure model/effort selection policy.
- `cordis.patch.yml` — bundle patch for composition-aware installers.
- `scripts/profile.mjs` — backup-first profile installer/uninstaller.
- `lib/client.js` — prebuilt browser artifact consumed by DSH.

The plugin declares `sessions`, `remote`, and `remote.session` because `modelDirectories.directoryFor(sessionId)` reads those services through the caller's Cordis context.

## Privacy and security

The plugin reads only the current session's model-directory state and calls its existing `load`/`select` methods. It does not read prompts, messages, files, or credentials; it makes no independent network requests and includes no telemetry. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
