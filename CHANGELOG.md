# Changelog

All notable changes to this project will be documented here.

This project was named `dsh-model-panel` until 0.4.0; earlier entries keep the names in use at the time.

## 0.19.2

- Align the sketch header into leading/settings/action groups with uniform 36px controls; keep Close in normal header flow rather than floating over uneven buttons. Adapt the groups to narrow widths without overlapping.
- Refine the layer panel's surface, compact rows, label/input columns and action sizing. Drawing, saved-draft format and composer submission behavior are unchanged.
- Check the actual component header/CSS in Chromium at 1280, 900, 600, 420 and 360px widths; add a header-group regression test.

## 0.19.1

- Move the sketch-board launcher out of the full-width pre-composer dock into the composer's left tool row. Use a compact pen icon with an accessible label and hover title, beside the existing input controls rather than at the page edge.
- Add regression checks for the toolbar slot and icon entry; drawing and image-edit behavior are unchanged.

## 0.19.0

- Replace inline marking with a native top-layer image viewer: click thumbnails for zoom/pan, draggable numbered notes, exact original download, erase-mask brush, background removal and aspect-ratio edit drafts. Disable browser image dragging and preserve the source raster.
- Add a standalone sketch board from the Codex composer and image viewer: pen/pencil/highlighter, brush/object erasers, shapes/curves/text, object movement/scale, editable visible/locked/reordered layers, undo/redo, image import, PNG and editable JSON export, and up to 20 local saved drafts.
- Keep all image actions as explicit composer preparation, not automatic submission. Recheck route, switches, draft revision/reference chips and attachment limits; match mask/source dimensions and keep unsaved sketches when closing/reopening within the page. Local saved drafts use this extension's JSON format.

## 0.18.2

- Fix Codex image cards crashing and being retired by the slot renderer on DSH 0.2: normalize `attachmentIds` and use the current attachment draft/actions API while retaining legacy support. Test image-card remount from existing durable results without generating new images.

## 0.18.1

- Render Codex image results as Chat rows below the assistant answer, independently of collapsed tool-call details. Reuse the existing session image attachment and original-image card; do not issue another image request.

## 0.18.0

- Add numbered Codex image annotations with per-region notes. Prepare a clean source plus a PNG location reference and coordinate prompt in the current composer; do not modify the saved original or auto-send. Respect Codex route, image-edit/annotation switches, and DSH attachment limits.
- Add tests for marker coordinates, canvas reference-size limits, existing composer-state preservation, and disabled edits.

## 0.17.0

- Add Codex-route-only image instructions so explicit image requests use `codex_image_generate` while image discussion does not trigger it. Respect each image switch and block fallback to the other provider's image-generation tool in Codex-routed sessions.
- Non-Codex routes and text-only Codex sessions remain unchanged; no automatic image calls or new quota requests are added.

## 0.16.0

- Add a session-scoped Codex image tool view with on-demand original PNG preview and download. Read only the existing private Host image store through the validated `image/original/chunk` route; no generation request, remote image fetch, or additional quota use.
- Preserve the generated result preview and report unavailable originals. Test metadata validation, session-bound chunk reads, malformed chunks, and preview/download behavior.

## 0.15.0

- Add separate user-only Codex subscription image-generation and image-editing switches under Manage settings. Persist through native config, reflect read-only Hosts, and register the image tool only while at least one operation is enabled. Changing either switch does not invoke image generation or editing.
- Keep output model/quality, image viewer, annotations and input image handling unchanged; do not expose a separate Agent setting tool that can enable subscription image access.

## 0.14.0

- Extend the existing Codex usage readout in the Composer tooltip and account details with provider-reported additional rate-limit groups, Credits balance (explicitly non-currency), individual spend limit and state. Keep existing 5h/week windows and reset-credit actions; show nothing for missing fields instead of inventing percentages or values. Reuse the existing account usage read path and make no model-inference requests.
- Extend the secret-free quota decoder and add tests for partial provider responses, distinct quota groups, Credits/limit labels and both UI surfaces.

## 0.13.1

- Show the current effective context size for each catalog model in Standard, Extended and Custom modes, without adding per-model editors. Keep one shared Custom K value and display each model's individually capped effective size.
- Verify model names/capacities from the preference response and add localized read-only capacity rows.

## 0.13.0

- Restyle Codex response detail, context length and speed controls with a shared theme-matched dropdown and keyboard-accessible option menu.
- Replace per-model context editing with one profile-wide K value (1k = 1,000 tokens). Keep Standard defaults and Extended maxima; Custom applies one shared size, capped at each model's advertised capacity. Preserve legacy per-model config during migration and clamp values to the live global range. Shorten the UI notes.
- Add RPC, UI, model-cap, legacy migration, dropdown dismissal/focus and persistence regressions. No user settings or provider requests are used in tests; live visual acceptance remains pending restart.

## 0.12.0

- Add the explicitly approved Codex Standard/Fast setting beside response detail and context length in the Manage settings tab. Save an atomic volatile native `codexSpeedMode` field and expose the same operation via the deferred `codex_speed_mode` tool. Reuse the existing preference RPC, catalog support metadata and priority service-tier payload, leaving reasoning, model, account and other providers unchanged. Unsupported models retain standard behavior; Fast may consume subscription quota faster. Do not add Ultrafast.
- Refactor the response-detail control onto the same acknowledged-save view component; retain its choices, RPC behavior, locale, error/read-only handling and test coverage. Add tests for persistence, failures, cancellation, tool parity, localization and both actual Codex stream routes.

## 0.11.2

- Replace simultaneous Codex settings/account columns with top-level Manage accounts / Manage settings tabs in both views. Default to accounts, hide account actions on the settings tab, use the full content width, preserve mounted panel state and unsaved setting drafts, and support keyboard tab navigation. No preference or account operation changes.

## 0.11.1

- Split Codex response/context settings and account cards into left/right columns in both quick and full Settings views. Use container-width responsiveness to stack them on narrow panels, allow account headers to wrap, and remove redundant setting-card margins. Keep all preference/account behavior and the shared toolbar unchanged; do not affect other providers.

## 0.11.0

- Add the explicitly approved Codex context-length control in both provider Settings views: Standard / Extended / Custom, current model limits and effective capacities, and explicit saves for edited per-model token counts. Persist one atomic volatile native config field, preserve other providers/preferences and inactive-model overrides, acknowledge saves, retain unsaved drafts through external refreshes, and reject invalid/fixed-model writes. Do not add spending limits, image-fidelity settings or search controls.
- Reuse the preference RPC and a deferred, bounded `codex_context_length` tool. Rebuild provider snapshots and invalidate the official route directory on changes; pin model metadata in each profile snapshot so already-prepared calls keep their previous capacity. Never inherit a different model's larger template maximum when official metadata only advertises a smaller window. Larger capacity does not unlock server entitlement and may increase input-token usage.
- Add regression tests for model-specific bounds, dynamic model groups, persistence, failures, cancellation, shared tool operations, both Settings surfaces and locale parity. Include a no-network smoke check against an explicitly chosen installed PiAiAdapter, covering both reported budgets and actual fake-stream model selection. Live UI/persistence acceptance remains for the user after restarting DSH.

## 0.10.1

- Remove the redundant Refresh button from the Codex response-detail setting in both Settings views. Retain automatic saves, configuration-change synchronization, error messages and fresh reads when reopening; omit the empty status row when idle.

## 0.10.0

- Add the explicitly approved Codex response-detail control: Default / Concise / Balanced / Detailed, shared once per provider in both quick and full Settings. Read the acknowledged Host value, persist automatically on selection, disable duplicate/read-only writes, show failures and refresh external changes. No browser-only preference storage.
- Persist the narrow `codexOutputVerbosity` field with the native configuration editor and mark it volatile to avoid remounting the adapter. Support both native live references and a linked older schema's primitive Config value. Reuse the subscription preference RPC and existing stream payload logic; preserve unrelated config and search preferences. The preference applies to subsequent supported-model Codex requests, not other providers or model selection, and is not a length limit.
- Expose the same preference operation in the deferred `codex_output_verbosity` tool. Add native-owner, failure, cancellation, duplicate-write, tool/RPC, localized control and actual stream/streamSimple payload regressions. The rejected default-model controls remain absent. Live UI acceptance is pending user testing.

## 0.9.1

- Remove the rejected new-conversation default-model feature: both Settings controls, native-default reads/writes, authenticated endpoint, Agent tool and dedicated implementation. Preserve DSH's original selection behavior and do not reset any user model setting.
- Require explicit user confirmation before implementing each future feature. Record this agreement and the rejected feature in AGENTS and the candidate roadmap; the remaining list is not an approved implementation plan.

## 0.9.0

- First staged Codex expansion increment (awaiting user acceptance): set the native DSH default model for new conversations from either Settings surface, with the current default, per-model default badges, explicit save actions and persistence failures. Use the installed `agentDefaultModel` owner, without selecting a Session model or switching accounts. Changing the model clears incompatible previous reasoning selection; keeping the same Codex model retains its reasoning.
- Validate the active saved account and its exact catalog on the Host, recheck account selection after catalog reads, reject unsupported/no-op persistence and duplicate writes, and share one operation between the authenticated page route and deferred `codex_default_model` tool. Keep browser model-visibility preferences independent and refresh native catalog/default observations after settings changes.
- Record the remaining expansion roadmap, excluding web search. Only this increment is implemented; subsequent items wait for user acceptance. Add Host, transport, tool, client-response and both-settings-view regressions.

## 0.8.10

- Remove the redundant account/selection hint above the reset-credit list in Settings and Statistics. Keep account binding, credit expiry details and explicit confirmation unchanged.

## 0.8.9

- Move Codex reset credits out of the flex account-metadata row into a full-width section below quotas in both settings views. Use a compact count header, numbered credit rows, aligned expiry/action metadata, an earliest-expiry hint, and localized labels for the provider's known full-reset credit title. Reuse the same theme-token styles in Statistics and remove the duplicate count there.
- Separate selection from redemption with a focused confirmation heading, selected-account/credit summary, acknowledgement, delayed primary action, and return-to-list control. Collapsing/reopening preserves pending confirmations (including uncertain results), without starting a new request. Keep the completed-reset section mounted while post-reset quotas refresh. Add layout, confirmation-resumption and no-flicker regressions.

## 0.8.8

- Register the missing `codex-subscription/models` authenticated HTTP route. The account-specific model handler existed but was absent from the transport endpoint list, so both settings views received HTTP 404. Add regression coverage through the actual route registration and request-envelope dispatch, including account identity forwarding and wrong-method rejection.

## 0.8.7

- Add account-card actions to inspect each Codex quota reset credit, its provider-reported expiry, and choose which credit to redeem. Missing expiry stays explicitly unknown. Reading details never redeems a credit; redemption requires a selected credit, acknowledgement, and the Host's five-second confirmation delay.
- Bind reset inspection, preparation and consumption to the explicit saved account without switching the active inference account. Keep challenges and opaque credit references account-scoped, reject cross-account/expired confirmations, preserve idempotency on uncertain outcomes, and refresh quotas after redemption. Replace the old settings reset shortcut with the same confirmed flow; only the user can redeem credits.

## 0.8.6

- Hide the Anthropic Claude provider from the composer provider picker until the official Claude Code CLI confirms a signed-in account. Missing, signed-out, checking and failed CLI states remain hidden; the provider appears reactively once login is confirmed. Probe CLI status at startup and avoid a duplicate status call when the settings view opens during that check.

## 0.8.5

- Fix completed history imports repeatedly showing “importing N / N”: periodic report reads previously started a fresh scan before capturing its status. Capture completed report/coverage first, then launch maintenance; initial imports and genuinely pending scans still expose progress, and unreadable history/missing usage remain explicit. Add repeated-poll, slow-maintenance/failure and UI-completion regression tests.

## 0.8.4

- Preserve every heatmap cell's original data-level fill during hover. Exclude cells from the generic button hover rule and remove the cell-specific hover fill; only the outline and tooltip change. Add a source/build regression check for the CSS exclusion.

## 0.8.3

- Replace click-selected heatmap details with an anchored hover/focus tooltip showing date, Tokens, steps, input/output and estimated cost. Hovering the popup keeps it open; leaving closes it, Escape/blur dismisses it, and clicks no longer pin an inline panel. Clamp horizontal placement, flip lower-edge popups above their cell, and dismiss stale anchors on scroll/resize/filter changes. Keep 万/亿 Token formatting and unknown-day hints; no extra provider queries.

## 0.8.2

- Format displayed Token counts with 万 from 10,000 and 亿 from 100,000,000, keeping up to two fractional digits. Apply consistently to overview cards, heatmap/day detail, trend axis/tooltips, Token breakdowns and rankings. Preserve raw report counts, calculations and ordinary step/latency/currency formatting; ranking/tooltip hover titles retain full numeric values.

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
