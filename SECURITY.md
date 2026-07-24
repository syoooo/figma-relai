# Security Policy

## Threat model

Relai runs entirely on your machine:

```
MCP server (spawned by your AI client)
  hosts an embedded relay on 127.0.0.1:9055
  ⇄ WebSocket ⇄
Figma plugin (inside Figma's plugin sandbox)
```

Key properties and limitations, stated plainly:

- **The relay has no authentication.** Room membership is the only access control: any local process that can reach the relay and knows a room name can join it, observe the session, and issue commands to the plugin. Room names carry a cryptographically random suffix to make guessing impractical, but they are secrets — treat them like one.
- **The relay binds to `127.0.0.1` by default.** The standalone relay (`bun socket`) accepts `HOST=0.0.0.0`, which exposes it to your network; only do that on a network where you trust every host, because it enables session eavesdropping and hijacking by anyone who obtains a room name.
- **The plugin's network access is restricted by its manifest** to `ws://localhost:9055–9057`. It cannot reach any other host.
- **`execute_figma` is arbitrary code execution, by design.** The AI can send JavaScript that runs inside Figma's plugin sandbox with full Plugin API access to the open file. It is enabled by default; every execution is listed in the plugin's activity feed, and the designer can disable it at any time with the "Allow code execution" toggle. Scripts are not atomic — a failed script's earlier changes persist in the file.
- **The AI can destroy work.** Deleting nodes and pages, overwriting text, and rebinding variables are all in scope, in whatever file the plugin is open in. The activity feed and the Stop button are the designer's controls; Figma's version history is the backstop.
- **The optional `FIGMA_TOKEN`** (for comments) lives in your MCP client's config file and is sent only to `api.figma.com` over HTTPS. Relai's relay and plugin never see or transmit it. Scope the token to comments when you create it.
- The MCP server runs with the permissions of the AI client that spawned it and stores only a room name in `~/.figma-relai/state.json`.

## Reporting a vulnerability

Open a GitHub security advisory (preferred) rather than a public issue for anything exploitable. Include reproduction steps and the affected version.
