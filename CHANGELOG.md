# Changelog

All notable changes to this project will be documented here.

This project was named `dsh-model-panel` until 0.4.0; earlier entries keep the names in use at the time.

## 0.5.0 — 2026-09-16

- Add Provider Settings section (`settings.section`, id `provider-extension`) with a "Create provider" catalog and real-time status.
- Integrate Antigravity (`dsh-antigravity-auth` 0.1.4-rc.1): automate risk acknowledgement, trigger Google OAuth sign-in flow, and display live reported models.
- Redesign model sliders: circular endpoints, circular thumb with hover emphasis, prominent track labels for each effort level, and removed right-side text.
- Rework slider interaction: multi-step drag with single commit on release, no-op commit when unchanged, and vertical drag across model rows to switch models directly.
- Separate CSS module bundling per source file to prevent class-name hash collisions across components.

## 0.4.0 — 2026-09-16

- Rename the project to **Provider Extension / 提供商拓展插件** (`dsh-provider-extension`, row id `provider-extension`) so later provider integrations share one plugin.
- Move the ChatGPT/Codex subscription integration into `src/client/providers/codex.ts` as the first provider module.
- Show each ChatGPT account's weekly remaining quota: the active account is read automatically when the list opens, other accounts on demand through a temporary switch that is reverted immediately (upstream `usage` only reports the active account).
- Report quota read failures and a failed switch-back explicitly instead of leaving them silent.
- Extend the installer migration so every earlier package name is removed from dependencies, bundles, patch rows, and runtime copies.
- Document the provider roadmap: GPT, Gemini, and OpenCode integrations only after real-window acceptance.

## 0.3.0 — 2026-09-15

- List the saved ChatGPT accounts of `dsh-codex-subscription` 2.x under their provider instead of one summary row.
- Show each account's label and masked email, marking the active account.
- Switch the real active Codex account through the subscription plugin's authenticated `account/select` RPC, refresh its quota indicator, and reload the model directory.
- Show the account count for the Codex family instead of the model count.
- Fix the profile installer to register the bundle exactly once and to remove legacy or manual `model-panel` rows, which previously caused `duplicate loader entry id "model-panel"` on a full restart.
- Document the single-registration rule and the recovery steps for a duplicated row.

## 0.2.0 — 2026-09-15

- Replace the shipped `conversation.input.model` visual seat instead of adding a duplicate control.
- Split the replacement into a provider picker and a model/reasoning-effort picker.
- Keep the official model directory and `/model` command mounted as the authoritative backend.
- Make provider browsing non-destructive: the Session changes only after a model is selected.
- Add real-window user acceptance as a mandatory pre-push and pre-release gate.

## 0.1.0 — 2026-09-13

- Initial standalone community release as `dsh-model-panel`.
- Add per-model reasoning-effort sliders and an active-model effort selector.
- Reuse the authoritative DSH session model directory.
- Support models without reasoning controls.
- Add asynchronous lifecycle protection, failure recovery, and accessible dismissal.
- Explicitly report unsupported context-window selection.
- Include prebuilt DSH client artifacts, bilingual documentation, tests, CI, and a backup-first profile installer.
