# Changelog

All notable changes to this project will be documented here.

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

- Initial standalone community release.
- Add per-model reasoning-effort sliders and an active-model effort selector.
- Reuse the authoritative DSH session model directory.
- Support models without reasoning controls.
- Add asynchronous lifecycle protection, failure recovery, and accessible dismissal.
- Explicitly report unsupported context-window selection.
- Include prebuilt DSH client artifacts, bilingual documentation, tests, CI, and a backup-first profile installer.
