# Security Policy

**Designer-side containment.** Beyond the code-execution toggle: a four-stop confirmation dial (OPEN · RISK · BULK · ALL — RISK stops ghost-making and irreversible operations even in otherwise-silent mode), per-page AI no-go zones, and a selection lock, all set in the panel. No Relai tool changes the dial, the toggle or the lock; an agent can add or lift a no-go zone with `manage_pages`, and that command is listed in the activity feed like any other.

These checks run in the plugin before a Relai command does, with limits stated plainly:

- The dial reads the top-level command, so a destructive operation wrapped in `batch_execute` asks only at ALL, or at BULK when the batch is large.
- Commands that carry their node ids inside a list (a multi-node `set_text`, `annotate set_multiple`) are checked against the current page only, not against the lock or the pages of those nodes.
- Variables and modes belong to no page; no-go zones do not cover them.
- `execute_figma` is refused up front only when the current page is a no-go zone. Otherwise its result warns the agent afterwards about nodes it created through the `relai` helpers or returned that sit on a no-go page or outside the lock.
- With code execution on, a script runs in the same sandbox as these checks and can rewrite them, along with the law stored in the file. Turn code execution off where that matters.
- None of this constrains writes that do not go through Relai: another plugin, another MCP server, manual edits, or anything done while the plugin is closed.

## Threat model

Relai runs entirely on your machine:

```
MCP server (spawned by your AI client)
  hosts an embedded relay on 127.0.0.1:9055
  ⇄ WebSocket ⇄
Figma plugin (inside Figma's plugin sandbox)
```

Key properties and limitations, stated plainly:

- **The relay has no authentication.** Any local process that can reach `127.0.0.1:9055` can ask the relay for the list of open rooms, including each room's file name, then join one, observe the session and send commands to the plugin. Room names carry a random suffix, but the relay hands them out on request, so they do not act as a secret. Assume any local process can drive an open plugin.
- **The relay refuses web pages, which is not authentication.** Both relays reject a WebSocket handshake whose browser `Origin` header is anything other than `"null"` (403), so a page you visit — including one served from `localhost` — cannot list the rooms or drive the plugin. Clients that send no `Origin` (the MCP server, `npx figma-relai doctor`, any local script or program) are let through, as is `"null"`, which is what the plugin panel's sandboxed iframe sends. Other sandboxed iframes and some local files also send `"null"` — including a sandboxed iframe inside an ordinary web page — so this check only keeps out pages with a real origin; it does not tell the plugin apart from anyone else.
- **The relay binds to `127.0.0.1` by default.** The standalone relay (`bun socket`) accepts `HOST=0.0.0.0`, which exposes it to your network; only do that on a network where you trust every host, because any host that can reach it can list the rooms, eavesdrop on a session and hijack it.
- **The plugin's network access is restricted by its manifest** to `ws://localhost:9055–9057`. It cannot reach any other host.
- **`execute_figma` is arbitrary code execution, by design.** The AI can send JavaScript that runs inside Figma's plugin sandbox with full Plugin API access to the open file. It is enabled by default; every execution is listed in the plugin's activity feed, and the designer can disable it at any time with the "Allow code execution" toggle. Scripts are not atomic — a failed script's earlier changes persist in the file.
- **The AI can destroy work.** Deleting nodes and pages, overwriting text, and rebinding variables are all in scope, in whatever file the plugin is open in. The activity feed and the Stop button are the designer's controls; Figma's version history is the backstop.
- **The optional Figma token** (for comments and a library's full component catalog) lives either in your MCP client's config as `FIGMA_TOKEN` or in `~/.figma-relai/credentials.json` (mode 0600, written by `npx figma-relai login`), and is sent only to `api.figma.com` over HTTPS. Relai's relay and plugin never see or transmit it. Give it only the scopes you use: file content read, plus the comment scopes if you want `manage_comments`.
- The MCP server runs with the permissions of the AI client that spawned it. Besides the token file above, it keeps its pairing state (the last room) in `~/.figma-relai/state.json`, and the full text of results too long to hand to the AI in `~/.figma-relai/results/` (mode 0600, the newest 50 files, none older than a day). Those files can hold design content from the open file.

## Reporting a vulnerability

Open a GitHub security advisory (preferred) rather than a public issue for anything exploitable. Include reproduction steps and the affected version.
