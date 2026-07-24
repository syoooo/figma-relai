# Contributing to figma-relai

Thanks for your interest in contributing!

## Development setup

Prerequisites: [Bun](https://bun.sh/) v1.0+, [Figma Desktop](https://www.figma.com/downloads/).

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup        # install + build + write .mcp.json/.cursor/mcp.json for the local build
```

Load the plugin in Figma Desktop: **Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`.

The dev loop:

- The relay is embedded in the MCP server — there is no separate process to run. Your AI client launches the server from the config `bun setup` wrote; restart the client (or its MCP connection) to pick up a rebuilt server.
- After changing `packages/figma-plugin/`, run `bun run build:plugin` and reload the plugin in Figma (right-click → Plugins → Development → your last plugin).
- `bun socket` runs a standalone relay; it's only needed when the relay must live on a different machine than the MCP server.

## Before opening a PR

```bash
bun run build       # all packages must build
bun run typecheck   # tsc --noEmit across packages
bun test            # unit tests must pass
```

If your change touches plugin handlers, the transport, or pairing, also run the manual smoke checklist against a real Figma file (`docs/smoke-checklist.md`).

## Guidelines

- Keep handlers thin: resolve the node with `resolveNode` (`packages/figma-plugin/src/utils/preconditions.ts`), assert preconditions, then call the Figma API. Error messages should name the node, its actual type, and the next step the caller can take.
- New MCP tools: define input schemas with zod in `packages/mcp-server/src/tools/`, reusing the shared schemas in `packages/shared/src/utils/schemas.ts`. Add numeric bounds (`.positive()`, `.min(0)`) where Figma would reject the value.
- Learned a new Plugin API gotcha? Add one entry to `packages/shared/src/pitfalls.ts` — it becomes both a runtime error hint and a cheat-sheet bullet at the next build. Do not edit the generated section of `docs/skills/figma-plugin-api.md` by hand.
- Precondition logic that inspects nodes should be a pure function over `NodeLike` so it can be unit-tested without the `figma` global.
- Never wrap the `figma` global in a Proxy (its methods are non-configurable; the sandbox throws `proxy: inconsistent get`), and don't build synchronous logic on `nodechange` timing — delivery is async with no upper bound.
- Match the existing code style; comments in English.

## Reporting issues

Include: what tool was called, the exact error message returned to the AI, and (if possible) the node type/structure it was called on. The plugin's activity feed shows the failing command and timing.
