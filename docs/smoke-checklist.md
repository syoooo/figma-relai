# Manual Smoke Checklist

Run against a real Figma file after changing plugin handlers, the transport, or pairing (~25 min).
Setup: MCP client (Claude Code / Cursor) started — the relay is embedded, no `bun socket` needed. Figma plugin installed.

## Pairing & connection

1. **Cold-start auto-pair**: fresh machine state (`rm -rf ~/.figma-relai`), open the plugin (it auto-connects and shows a room), then ask the AI to run `get_document_overview` **without** `join_room` → it pairs automatically and succeeds.
2. **Room persistence**: close and reopen the plugin → same room name reappears; the AI keeps working without re-pairing.
3. **Figma restart**: quit and relaunch Figma Desktop, run the plugin → auto-connects to the same room; next AI command succeeds without `join_room`.
4. **Relay handover**: with two MCP clients running (e.g. Claude Code + Cursor), kill the one that started first (hosting the relay) → within a few seconds the other takes over; plugin badge flips to "Reconnecting…" then back to connected; commands work again.
5. **Presence**: with the plugin closed, ask the AI to run a command → immediate "No Figma plugin is connected" (not a 30 s timeout). Open the plugin → its badge shows "AI connected ✓" once the agent is in the room.
6. **Stop button**: run a large `set_text` bulk edit (50+ nodes), press **Stop** in the plugin → remaining items are skipped, the AI receives "Cancelled by designer", the feed marks the command cancelled.
7. **Code-exec toggle**: turn "Allow code execution" OFF → `execute_figma` returns the disabled-error naming the toggle. Turn ON → a small script (e.g. `return figma.currentPage.name`) succeeds, logs appear.
8. **Designer events**: click a different node between two AI commands → the second response contains `designer_events` with the selection change (or `get_events` returns it).

## Error-path checks

Each should return an **immediate, specific error** (never a 30 s timeout):

9. `set_properties` with `layoutSizingHorizontal: "FILL"` on a child whose parent has no auto-layout → error names the parent and its layoutMode.
10. `set_properties` with `layoutMode: "VERTICAL", layoutWrap: "WRAP"` → "only valid when layoutMode is HORIZONTAL".
11. `set_properties` with `width: 0` → rejected at the schema boundary before reaching Figma.
12. Delete a node in Figma, then `set_properties` on its id → "has been deleted" with a re-read suggestion.
13. `set_properties` padding on a RECTANGLE → error says it's a RECTANGLE, not "Node not found".
14. `set_text` with a `range` beyond the text length → range error naming the character count.

## Happy-path checks

15. `manage_components` `{action:"instantiate"}` with a real key from `{action:"list"}` → instance appears.
16. `manage_components` `{action:"set_overrides"}` between two instances (different variant) → target actually changes; verify with `{action:"get_props"}`.
17. `set_text` on a node using a font you don't have → font-loader fallback substitutes and succeeds.
18. `batch_execute` with a failing command in the middle → later commands still run; per-item errors readable.
19. `create_node` frame + `set_properties` auto-layout + `create_node` text inside with `parentId` → all succeed.
20. `verify_visual` on an edited node with `expected` values → returns a screenshot the AI can see plus field-by-field pass/fail.
21. A command returning a falsy result → resolves normally, no timeout.
22. Activity feed: every command above appears with duration and status; clicking an entry with a node target selects it on canvas.
