# Contributing to figma-relai

Thanks for your interest in contributing!

## Development setup

Prerequisites: [Bun](https://bun.sh/) v1.0+, [Figma Desktop](https://www.figma.com/downloads/).

```bash
git clone <repo-url> figma-relai
cd figma-relai
bun install
bun run build
```

Run the pieces:

```bash
bun socket          # relay server (keep running)
bun run dev         # MCP server in watch mode
```

Load the plugin in Figma Desktop: **Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`. Rebuild the plugin with `bun run build:plugin` after changing `packages/figma-plugin/`.

## Before opening a PR

```bash
bun run build       # all packages must build
bun run typecheck   # tsc --noEmit across packages
bun test            # unit tests must pass
```

If your change touches plugin handlers or the transport, also run a quick manual smoke test against a real Figma file (see `docs/smoke-checklist.md`).

## Guidelines

- Keep handlers thin: resolve the node with `resolveNode` (packages/figma-plugin/src/utils/preconditions.ts), assert preconditions, then call the Figma API. Error messages should name the node, its actual type, and the next step the caller can take.
- New MCP tools: define input schemas with zod in `packages/mcp-server/src/tools/`, reusing the shared schemas in `packages/shared/src/utils/schemas.ts`. Add numeric bounds (`.positive()`, `.min(0)`) where Figma would reject the value.
- Precondition logic that inspects nodes should be a pure function over `NodeLike` so it can be unit-tested without the `figma` global.
- Match the existing code style; comments in English.

## Reporting issues

Include: what tool was called, the exact error message returned to the AI, and (if possible) the node type/structure it was called on.
