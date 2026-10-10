# Changelog

All notable changes to this project will be documented here.

This project was named `dsh-model-panel` until 0.4.0; earlier entries keep the names in use at the time.

## 0.8.1

- Add native drag-and-drop ordering and per-account card visibility to Usage Statistics. A display chooser offers checkboxes, accessible up/down controls and restore defaults; card grips support arrow-key ordering. Browser local storage retains only bounded, validated card IDs and display preferences. Refresh/remount preserves layout, new accounts append, and hiding cards does not alter authentication or queries.

## 0.8.0

- Replace the Claude roadmap card with official CLI-owned login/status, advisory Sonnet/Opus/Haiku aliases, model visibility and a registered `anthropic-claude-cli` inference route. Reuse the pinned MIT DSH Claude CLI adapter with Windows native/npm launcher support; DSH owns tool execution, with bounded process output and awaited cancellation. No Claude OAuth credentials are imported or stored; quota/end dates remain unknown unless the CLI reports them.
- Add the read-only `claude_channel` status/models tool. Keep login user-only. Disclose text transcript replay, unsupported sampling fields and API-key/third-party billing configurations.
- Fix the inert OpenCode picker row: row selection and browsing now share one catalog, click opens the model pane, and a missing Host catalog produces an explicit setup/reload hint instead of silently returning to Codex or advertising static models.

## Unreleased

- Polish account card hierarchy: 15px brand titles, 24px wallet figures and tabular quota values lead; 13px account identity, 12px body/subscription lines and 11px footnotes recede. Subscription dates sit right under the account name, and slimmed progress bars match each provider's brand fill.

- Read each Codex account’s real subscription deadline from the account-scoped plan endpoint (`backend-api/subscriptions`, `active_until`) instead of a JWT claim that pi-ai never persists; the plan read is best-effort and never blocks quota display.
- Harden subscription dates: accept ISO or epoch deadline payloads, and hide the line (never "Invalid Date") when a host or provider omits or corrupts the value.
- Show each account’s subscription end date on Statistics account cards when the provider reports one (ChatGPT plan active-until). Providers without subscription deadlines keep showing nothing rather than inventing a date.
- Configure every saved Codex account’s model switches simultaneously without switching accounts: each account loads its own catalog through account-scoped authentication (native refresh included), and switches stay strictly per account. Reject invalid account targets at the RPC boundary for both usage and catalog reads.
- Clip the account card's brand stripe to the card's rounded silhouette so the top edge and corners join cleanly.

- Normalize Statistics' built-in Codex provider name to OpenAI Codex, matching provider settings without renaming unrelated routes.
- Keep the last public account snapshot in connection-scoped browser memory across Statistics navigation; show it immediately with a background-refresh hint and original check timestamps. Preserve it on failed/invalid requests, replace it on fresh results (including sign-out/removal), and ignore replies from disposed pages. No browser-storage persistence or cross-connection reuse.

- Replace provider settings' AG/GPT/CL/OC letter tiles with locally bundled official Antigravity, OpenAI, Claude and OpenCode marks. Tint provider settings cards using their brand colors, including Claude terracotta and OpenCode monochrome; record asset provenance in third-party notices.
- Add provider brand accents to account cards: DeepSeek blue, ChatGPT green, Google multicolor and OpenCode monochrome. Match quota fills to each provider and blend surfaces/text with DSH theme tokens; all accounts of a provider share the same identity colors.

- Read both active and inactive Antigravity accounts directly; refresh each account's credentials under the existing store lock without changing active selection. Codex targeted quota reads now use the native refreshable OAuth resolver and persist rotated tokens for the specified account. Keep failures isolated and never fall back to another account.
- Remove the activity heatmap's Less/More color legend while retaining fixed-size cells, date labels and activity summaries.

- Expand Statistics account balances/quotas: real per-account Codex windows and credits, active Antigravity groups, and Host-side OpenCode Go usage. UI and the `balances` tool action share one secret-free operation; unsupported/inactive data stays explicit. Reads never switch accounts, and failed Codex account-specific reads fail closed rather than returning active-account quota. Antigravity Statistics reads use isolated fresh readers to avoid reusing a previous account's in-flight result.

- Add the profile-wide Usage Statistics page and sidebar entry in the same installable bundle: all workspaces, sessions and subagents, historical log replay, activity heatmap, trends, rankings and request performance.
- Exclude fork-inherited prefixes from physical request totals; retain missing usage, cancellations and retries separately. No message content or credentials are returned by usage reports.
- Reuse the signed-in DeepSeek account's recharge/bonus wallets. DeepSeek prices are optional, profile-local per-channel/model inputs; estimates and currencies remain separate from actual billing. No budget notifications or automatic request limits.
- Expose the same report, wallet and pricing operations to the page and the `usage_statistics` tool. Historical-read errors and incomplete imports are visible rather than treated as zero usage.
- Use fixed-size 20px activity squares; add/remove weekly columns with panel width rather than stretching squares (up to the 365-day data window), and align dates with the actual grid separately from its legend.
- Add nearest-day hover snapping to the daily token trend: daily details, aligned crosshair/date-axis marker, and keyboard inspection. Keep missing/partial usage explicit.
- Theme the filter dropdown pickers using Chromium's native customizable select, retaining keyboard navigation. Restore the activity-day and streak summary below the heatmap.
- Improve light-theme card/table/control boundary contrast and make inactive heatmap cells visible without changing dark-theme styling.
- Normalize inclusive Chat and exclusive Messages cache-read accounting per attempt before pricing; ambiguous totals stay unpriced. Read actual title projections for conversation rankings, and round displayed wallet balances to two decimals.

- Distinguish an observed Antigravity HTTP 503 `UNAVAILABLE` / "No capacity available" response from account quota exhaustion, generic upstream failures, network disconnects, and timeouts. Capacity detection checks the structured error and requested wire model; error bodies remain bounded.
- Fail promptly when a proxy/upstream closes before complete HTTP response headers instead of waiting for the header timeout. Preserve request acceptance information and do not replay uncertain generation requests.
- Add regression coverage for capacity JSON/SSE responses, invalid/oversized error bodies, quota/network failures, partial output, and incomplete proxy CONNECT responses.
- Design reference: [dsh-agy-link](https://github.com/amlyczz/dsh-agy-link) separates server overload from hard account quota errors. These changes are independently implemented; no CLI bridge or source code was copied, and its automatic process retry policy was deliberately not adopted.

## 0.5.2 — 2026-09-16

- Allow clicking anywhere inside a model card box (not just the model title text) to immediately select and switch to that model.
- Dynamically transfer active highlight and accent styling to the hovered model during vertical drag, turning off the initial model's glow.
- Sync top reasoning effort pills to the hovered model in real time during drag.
- Added `cursor: pointer` to model row cards for clearer interactive feedback.

## 0.5.1 — 2026-09-16

- Fix slider thumb and track endpoints curvature: explicitly declare `corner-shape: round` to opt out of the host's global superellipse squircle and render a true Euclidean circle.

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
