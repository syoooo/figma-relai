# Changelog

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
