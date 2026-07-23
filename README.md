<img src="assets/relai-logo.svg" alt="Relai" height="36" />

English | [日本語](README.ja.md) | [中文](README.zh.md)

An MCP bridge that lets any AI agent (Claude Code, Cursor, …) drive Figma directly — read, create, edit, and quality-check designs with **29 consolidated tools** plus a Plugin-API escape hatch.


```
AI (Claude Code / Cursor)
  ↕ stdio
MCP Server            … 29 tools, analysis, verification
  (embedded relay)    … WebSocket room hub on port 9055
  ↕ WebSocket
Figma Plugin          … executes Figma API calls
  ↕ Plugin API
Figma                 … reads and writes design data
```

The relay runs **inside the MCP server** — there is no separate process to keep alive. If several MCP clients run at once (e.g. Cursor and Claude Code), the first hosts the relay and the rest connect to it automatically.

---

## What you can do

### 🔍 Understand a design
"Explain how this screen is put together" — the AI reads structure, colors, layout, and token usage of your selection in one pass, and can `screenshot` the canvas to actually see it.

### 🎨 Quality checks
`analyze_design` audits color-token coverage, auto-layout quality, component health, or accessibility (contrast, touch targets) and suggests fixes.

### ✏️ Bulk edits
"Translate all button labels", "recolor for dark mode" — `set_text` and `set_properties` apply changes across many nodes in one round-trip, and the plugin shows a live activity feed with a **Stop** button.

### 🧱 Design systems
Variable collections, modes, token binding, shared styles, team-library imports — `manage_variables` / `manage_styles` / `import_from_library`.

### ⚡ Anything else
`execute_figma` runs JavaScript against the Figma Plugin API inside the plugin sandbox — the same approach as Figma's official MCP. You can disable it anytime with the plugin's "Allow code execution" toggle.

---

## Relai and Figma's official MCP server

They approach the same canvas from opposite sides, and they compose well.

The official MCP server is built for turning designs into code: its design context, Code Connect integration, and screenshot pipeline are the best way to hand a finished design to a developer's agent. Relai works the other direction — it helps a designer *make and maintain the design itself*: token architectures, component libraries with proper variants and bindings, audits, bulk edits, and freeform UI work — with whichever AI client and model you prefer, on any Figma plan (writes go through the Plugin API, so no particular seat type is required).

The philosophies differ where you'd expect. For repetitive design-system work, Relai prefers declarative, precondition-checked tools over generating fresh code per operation — the same operation runs the same way every time, and failures come back as instructions ("call set_layout_mode first"), not stack traces. `execute_figma` still covers the long tail, in the same spirit as the official `use_figma`. And because the operator is a designer, the plugin keeps them in the loop: a live activity feed, presence, and a Stop button.

If your team has the seats, run both — the official server to read designs out, Relai to build them in the first place.

## Quickstart

Requires [Node.js](https://nodejs.org/) 18+, [Figma Desktop](https://www.figma.com/downloads/), and an MCP client ([Claude Code](https://claude.com/claude-code), [Cursor](https://cursor.com/), …).

### 1. Install the Figma plugin

[Install from Figma Community](https://www.figma.com/community/plugin/1613474334525847301) and run it. It connects automatically and remembers its room across restarts.

### 2. Register the MCP server

```bash
# Claude Code
claude mcp add Relai -- npx -y figma-relai

# OpenAI Codex CLI
codex mcp add Relai -- npx -y figma-relai
```

For Cursor, add to `.cursor/mcp.json`:

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

### 3. Talk to your AI

That's it. The MCP server hosts the relay itself, discovers the plugin's room, and pairs automatically — no commands to copy. `join_room` exists only for the rare case where several Figma files run the plugin at once.

## From source (contributors)

```bash
git clone <repo-url> figma-relai
cd figma-relai
bun setup
```

Requires [Bun](https://bun.sh/) v1.0+ (bash script — on Windows, use WSL). Installs dependencies, builds all packages, and writes MCP configs (`.cursor/mcp.json`, `.mcp.json`) pointing at the local build by absolute path. For plugin development: **Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`.

---

## The 29 tools

| Group | Tools |
|-------|-------|
| Context | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| Analysis | `analyze_design` (color / layout / components / accessibility) · `diff_nodes` |
| Verification | `verify_changes` · `validate_design_rules` · `verify_visual` |
| Read | `get_node_data` (summary / tree / full / css / variables) |
| Create & edit | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| Components | `manage_components` |
| Design system | `manage_variables` · `manage_styles` · `import_from_library` |
| Document | `manage_pages` · `navigate` |
| Assets | `export_asset` · `add_image` |
| Annotations | `annotate` |
| Advanced | `batch_execute` · `execute_figma` · `join_room` |

Each tool is self-describing; the AI sees full parameter docs. The consolidated surface keeps the always-loaded tool context small — well inside the range where LLMs use tools reliably — while the plugin executes granular, precondition-checked commands underneath. Six skill documents (token strategy, component conventions, audit workflows, a Plugin API cheat sheet for `execute_figma`) ship as MCP prompts.

## Designer experience

- **Auto-pairing** — the plugin remembers its room (`clientStorage`); the MCP server remembers it too (`~/.figma-relai/state.json`) and rejoins after restarts, sleep, or relay handover.
- **Presence** — the plugin shows "AI connected ✓" when your agent is actually in the room, not just when the relay is up.
- **Activity feed** — every command with status, duration, and error text; entries with a node target are click-to-focus on canvas.
- **Stop button** — cancels queued work in batch operations (the in-flight atomic command finishes; that's a JavaScript single-thread limit).
- **Designer events** — selection / node / page changes reach the AI as `designer_events` on the next response (or via `get_events`), so it knows what you did without polling.
- **English / Japanese / Chinese UI** — toggle persists.

## Ports & security

- The relay binds **127.0.0.1:9055** only. Figma's plugin sandbox allowlists `ws://localhost:9055–9057` in the manifest — **other ports cannot work** without editing `manifest.json`; there is deliberately no port setting in the UI.
- Room names include a crypto-random suffix. Anyone on your machine who knows a room name can join it — see [SECURITY.md](SECURITY.md) for the threat model.
- `execute_figma` runs AI-authored code in the plugin sandbox. It is on by default (visible in the activity feed) and can be disabled with the plugin's "Allow code execution" toggle.

## Advanced: standalone relay

```bash
bun socket        # runs the relay alone on port 9055 (HOST/PORT env to override)
node packages/mcp-server/dist/index.js --server=<host> --room=<room>
```

Useful only when the relay must live on another machine. The embedded relay covers normal use.

## Development

```bash
bun install
bun run build     # shared → mcp-server → figma-plugin (injects the UI tool list)
bun test          # unit tests (55)
```

Manual QA: [docs/smoke-checklist.md](docs/smoke-checklist.md). Logs go to stderr only (stdio is reserved for MCP).

## License

MIT — see [LICENSE](LICENSE). Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).
