# Security Policy

## Threat model

figma-relai consists of three cooperating processes on your machine:

```
MCP server  ⇄  Relay (WebSocket, default 127.0.0.1:9055)  ⇄  Figma plugin
```

Key properties and limitations:

- **The relay has no authentication.** Room membership is the only access control: any client that can reach the relay and knows a room name can join it, receive every command/response in the session, and issue commands to the Figma plugin. Room names are generated with a cryptographically random suffix to make guessing impractical, but they are secrets — don't share them.
- **The relay binds to `127.0.0.1` by default.** Setting `HOST=0.0.0.0` exposes the relay to your network; only do this on a network where you trust every host, since it allows session eavesdropping and hijacking by anyone who obtains or brute-forces a room name.
- **The Figma plugin's network access is restricted** by its manifest to `ws://localhost:9055`; it cannot reach other hosts.
- **No eval:** the plugin executes a fixed set of named commands; it does not execute arbitrary code sent over the wire.
- The MCP server runs with the permissions of the AI client that spawned it. Anything the AI can do through its tools (including deleting nodes and pages) happens in whatever Figma file the plugin is open in.

## Reporting a vulnerability

Please open a GitHub security advisory (or a private issue) rather than a public issue for anything exploitable. Include reproduction steps and affected versions.
