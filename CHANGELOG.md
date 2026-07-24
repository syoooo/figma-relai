# Changelog

## 0.2.5

- npm publishing is now mistake-proof: bare `npm publish` fails with the correct command in the error (`npm run release -- --otp=…`); the release script places the root README/LICENSE before npm captures metadata, and a restored `prepack` keeps the tarball covered either way. (0.2.2–0.2.4 each missed the npm-page README a different way; this closes the case.)
- New pitfall: a freshly-converted Figma slot can still report `type: "FRAME"` to the Plugin API — match slot frames by name, never gate automation on the SLOT type.

## 0.2.4

- Plugin: redial immediately when the Figma window regains attention — backgrounded windows suspend the plugin iframe, freezing the 2s retry loop until now (the relay's staleness sweep would kick the silent socket; the full causal chain is recorded as a pitfall).
- Localization pass across the panel and READMEs: natural-Japanese rewrite of 8 panel strings and 12 README.ja passages; 6 panel strings and full-width punctuation normalization in Chinese; lock label renamed for clarity in ja/zh (選択範囲に限定 / 仅限选区).
- npm publishing: `npm run release` wraps publish so the root README/LICENSE are in place before npm captures metadata — lifecycle hooks alone proved too late, which is why 0.2.2/0.2.3 pages showed no README.

## 0.2.3

- `get_design_system` adds a top-level `TRUNCATED` note when a component list is capped, naming how many items are hidden and that usage-sorting cuts exactly the newest zero-usage components (the per-list field existed but proved missable in a real audit).
- `validate_design_rules` token_coverage now uses the `audit_colors` deep walk with node/prop counts in the message; the legacy shallow calculation (which reported 100% on component sets with unbound variants) remains only as a fallback for old plugin builds.
- npm package: README/LICENSE copy moved to `prepublishOnly` (earliest publish hook) — 0.2.2's tarball contained the README but the registry metadata was captured before `prepack` ran, so the npm page showed none.

## 0.2.2

- Plugin panel: the RULES row is now clickable — a read-only modal shows the file's conventions in full (monospace, selectable text; close via ✕ / backdrop / Esc). Conventions were previously visible only to connected AI clients.
- Panel layout: RULES joined the RELAY/AGENT status rows; the room line moved below as the quiet last line.
- Three pitfalls learned building a real component: Figma's slot feature has no Plugin API (scaffold + let the designer press ⇧⌘S); a converted SLOT node stops hugging (re-assert layout sizing); variantizing can silently pin a hug axis to FIXED (verify sizing modes after combineAsVariants).

## 0.2.1

Fixes and additions driven by a real design-system audit session (the tools were used in anger; these are the gaps that surfaced).

- **Fixed: style counts were always 0** in `get_document_overview` and `get_design_tokens` — the server expected a flat array from the plugin's `get_styles` but receives `{paintStyles, textStyles, …}`. Both shapes are now understood. The overview also stops reporting a misleading "0 components": component counts are marked unknown and deferred to `get_design_system`.
- **Fixed: shallow color audit.** `analyze_design aspect:color` walked only two levels and skipped `visible:false` paints entirely — hidden hardcoded fills on component variants passed as "100% bound". A new plugin-side `audit_colors` command walks the whole subtree in one round-trip and reports hidden unbound paints separately (`hidden: true`, counted in `hiddenCount`). Falls back to the legacy path against older plugin builds.
- **`set_properties` gains `fills` / `strokes`** — raw `Paint[]` passthrough, including `[]` to clear. Clearing a decorative fill no longer requires `execute_figma` (and an approval) for a one-liner.
- **`manage_components action:"reset_instance"`** — clear all overrides on an instance so it re-inherits its main component; returns property snapshots before/after so the caller can re-apply intended content. The manual recipe this replaces took three approvals.
- **`validate_design_rules` gains `orphaned_instances`** — flags instances whose main component was deleted (they survive on a detached internal copy and silently stop updating). Old plugin builds simply omit the rule.

## 0.2.0

Design-system intelligence and designer-side trust controls. All additive — no breaking changes. Tool count: 30 → 32.

- **`get_design_system`** — the "look before you draw" inventory: local components/styles/variable collections with usage counts, remote items the file already uses, and enabled libraries' variable collections. Honest three-tier model for imported libraries; full library catalogs via REST when `FIGMA_TOKEN` + `libraryFileUrl` are provided. `execute_figma` now steers UI building through the file's own system first.
- **Token drift**: `analyze_design` gains a `tokens` aspect — hardcoded colors (OKLab ΔE match) and numbers that visually equal an existing variable, each finding naming the variable to bind. `manage_variables action:"tokenize" fix:true` binds them in one pass.
- **Approval gate**: a plugin setting ("Ask before big edits": off / bulk / all) holds bulk writes and code execution until the designer presses Approve in the panel. Keepalive progress prevents MCP-side timeouts while the card waits; Deny returns the cancelled envelope.
- **Scope lock**: restrict edits to the current selection. Declarative commands are pre-checked (including batch sub-commands); `execute_figma` cannot be intercepted up front and is instead linted after the fact, with violations reported loudly — documented honestly.
- **Dry-run**: `batch_execute` and `set_properties` accept `dryRun:true` and return the exact command plan without touching the canvas.
- **File conventions** (`manage_conventions`) — a CLAUDE.md that lives inside the Figma file (shared plugin data): naming rules, spacing habits, do-not-touch areas. `get_document_overview` auto-includes it; the panel shows a RULES row when present.
- **Comment-driven tasks**: `manage_comments` list gains `since` / `unresolved` filters and a `checkedAt` cursor; a new skill documents the scan → claim → execute → report-back loop (polling, honestly labeled).
- Three new skill prompts: `design-system-first`, `janitorial-cleanup`, `comment-driven-tasks` (nine total).
- **CLI**: `figma-relai manifest` prints the machine-readable contract (tool JSON schemas captured from a real in-process MCP handshake, plugin commands, pitfalls; emitted to `docs/manifest.json` each build — drift-proof by construction and pinned by tests); `figma-relai docs [tool]` renders the same data for humans; `figma-relai doctor` triages the environment (node, relay ports, plugin presence, saved room, token).
- Plugin build target raised to es2017 after root-causing a launch-bricking sandbox crash: Figma's plugin VM cannot compile es2015's generator-lowered `await` inside a `for…of` head. A new test compiles every build in the same VM family so the class is caught in CI.

## 0.1.4

- The plugin's connected card now leads with the **file name**; the room name — infrastructure since auto-pairing, and a secret besides — moved to a small hover-to-copy line. Room listings carry the plugin's file name, so the multiple-plugins error reads `"Landing v2" (room …)` instead of bare room strings.
- Motion polish: named easing tokens replace the browser-default `ease`, the progress bar animates `transform` instead of `width`, and transitions declare explicit properties.
- Docs rewritten for their audience (designer-first README in three languages, truthful SECURITY.md, embedded-relay CONTRIBUTING).

## 0.1.3

Fixes from an adversarial smoke pass against live Figma:

- **Fix (critical): `execute_figma` broke on any `figma.create*` call** — wrapping the `figma` global in a Proxy violated Proxy invariants (its methods are non-configurable), throwing `proxy: inconsistent get`. Created-node tracking now uses deterministic sources instead (relai-created nodes plus node ids present in the script's return value), which also isolates concurrent scripts from each other.
- **Retracted: atomic rollback of failed scripts.** The undo-stack approach proved unreliable in practice; a false atomicity promise is worse than none. Errors no longer claim rollback; docs and the tool description now say plainly that partial changes persist — keep scripts small and idempotent.
- **Fix: presence fast-fail never fired after joining a room** (the join-time presence broadcast raced `currentRoom`); presence is now recorded per room, so commands in a plugin-less room fail in milliseconds instead of a 30s timeout.
- Fix: `relai.query` crashed on empty/garbage selectors — now matches nothing.
- New pitfall entry: nodes are non-extensible (`object is not extensible`) — use `setPluginData` or return the data.

## 0.1.2

- **`relai.*` sandbox helpers**: `execute_figma` scripts get a `relai` object alongside `figma` — `text()` (font-safe), `autoLayout()`, `set()` (ordering-safe), `hug()`, `focusRing()`, `page()` (content-based lookup), `query()` (CSS-like selector subset: types, name matchers, descendant/child combinators, comma), and `placeholder()` (construction veil for work-in-progress sections). The correct way is now the shortest way.
- **Atomic scripts**: a failed `execute_figma` script rolls back its partial changes (undo-step based) — errors leave the file untouched.
- **Silent-mistake lint**: nodes created by a script are checked after it runs; zero-ambiguity problems (spread shadows on a non-clipping frame) come back as `warnings` on the result.
- **Pitfall registry**: Plugin API arcana now lives in one place (`shared/src/pitfalls.ts`) and is delivered through two channels that can't drift — `execute_figma` errors carry the remedy as a `Hint:` (unloaded fonts, dynamic-page lookups, free-plan page limits, fragile name lookups, stale ids, …), and the same registry renders the Pitfalls section of the `figma-plugin-api` cheat sheet at build time.
- `execute_figma` accepts an optional `timeoutMs` (up to 300000) for scripts that create hundreds of nodes — the 60s default remains.

## 0.1.1

- Fix: on rapid server restarts (MCP client reconnect, successive CLI runs), the new process could hit the relay port-handoff window and stay disconnected permanently — host takeover now also runs when the initial connection fails, so the first command self-heals.

## 0.1.0

Initial release.

- **30 consolidated MCP tools** over a granular, precondition-checked plugin command layer: context/analysis/verification (semantic layer with summaries and recommended next steps), declarative editing (`set_properties`, `create_node`, `edit_structure`, `set_text`), design-system management (`manage_components` / `manage_variables` / `manage_styles`, library imports), assets, annotations, and `batch_execute`.
- **`execute_figma`**: run JavaScript against the Figma Plugin API in the plugin sandbox — gated by a persisted "Allow code execution" toggle in the plugin UI (default on); console output captured, results serialized through a node budget.
- **Embedded relay**: the MCP server hosts the WebSocket relay on 127.0.0.1:9055 (bind-or-connect; multiple MCP clients negotiate a host automatically, with takeover when the host exits). A standalone relay (`bun socket`) remains for remote setups.
- **Zero-copy pairing**: the plugin persists its room and auto-connects; the server persists it too, auto-rejoins after reconnects, and auto-discovers the plugin's room — `join_room` exists only to disambiguate multiple plugins. Presence is displayed in the plugin ("AI connected ✓") and turns plugin-absent timeouts into immediate errors.
- **Plugin UI**: English/Japanese toggle, live activity feed (status, duration, click-to-focus), Stop button with cooperative cancellation, reconnection without losing the connected view, tool list generated at build time.
- **Designer events**: selection/node/page changes are buffered (self-edits suppressed) and surfaced as `designer_events` on responses plus a `get_events` tool. `verify_visual` combines screenshot and property assertions.
- **Errors are actionable**: plugin errors carry command, node id, and node type; handlers validate preconditions (node types, auto-layout membership, dimension bounds, text ranges, gradient stops) and messages name the fix. Schemas reject impossible values at the MCP boundary.
- **Design health score**: `analyze_design` aspect `overall` runs all four audits and returns a weighted 0-100 score with per-category breakdown. Accessibility checks follow WCAG thresholds (3:1 for large text, 4.5:1 for body), factor fill/node opacity into contrast, flag text over image/gradient backgrounds, and catch sub-11px text.
- **Audit trail**: `get_events` scope `agent` returns the session's full command log (outcomes, durations); `diff_nodes` gains checkpoint save/compare to show exactly what changed on a node across an editing session.
- **Comments** (`manage_comments`): list/add/reply/delete file comments — including node-anchored ones — via Figma's REST API. Opt-in with a `FIGMA_TOKEN` env var; every other tool works without it. The file key is auto-detected from the open plugin when possible.
- Six skill documents ship as MCP prompts, including a Plugin API cheat sheet for `execute_figma`.
- MIT licensed; unit tests (`bun test`) and CI (build, typecheck, test).
