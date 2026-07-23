# Changelog

## 0.1.0

Initial release.

- **29 consolidated MCP tools** over a granular, precondition-checked plugin command layer: context/analysis/verification (semantic layer with summaries and recommended next steps), declarative editing (`set_properties`, `create_node`, `edit_structure`, `set_text`), design-system management (`manage_components` / `manage_variables` / `manage_styles`, library imports), assets, annotations, and `batch_execute`.
- **`execute_figma`**: run JavaScript against the Figma Plugin API in the plugin sandbox — gated by a persisted "Allow code execution" toggle in the plugin UI (default on); console output captured, results serialized through a node budget.
- **Embedded relay**: the MCP server hosts the WebSocket relay on 127.0.0.1:9055 (bind-or-connect; multiple MCP clients negotiate a host automatically, with takeover when the host exits). A standalone relay (`bun socket`) remains for remote setups.
- **Zero-copy pairing**: the plugin persists its room and auto-connects; the server persists it too, auto-rejoins after reconnects, and auto-discovers the plugin's room — `join_room` exists only to disambiguate multiple plugins. Presence is displayed in the plugin ("AI connected ✓") and turns plugin-absent timeouts into immediate errors.
- **Plugin UI**: English/Japanese toggle, live activity feed (status, duration, click-to-focus), Stop button with cooperative cancellation, reconnection without losing the connected view, tool list generated at build time.
- **Designer events**: selection/node/page changes are buffered (self-edits suppressed) and surfaced as `designer_events` on responses plus a `get_events` tool. `verify_visual` combines screenshot and property assertions.
- **Errors are actionable**: plugin errors carry command, node id, and node type; handlers validate preconditions (node types, auto-layout membership, dimension bounds, text ranges, gradient stops) and messages name the fix. Schemas reject impossible values at the MCP boundary.
- Six skill documents ship as MCP prompts, including a Plugin API cheat sheet for `execute_figma`.
- MIT licensed; unit tests (`bun test`) and CI (build, typecheck, test).
