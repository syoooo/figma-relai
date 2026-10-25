# Manual Smoke Checklist

Run against a real Figma file after changing plugin handlers, the transport, or pairing.
Setup: MCP client (Claude Code / Cursor) started — the relay is embedded, no `bun socket` needed. Figma plugin installed.

Items 1–39 are the core sheet (~25 min). Items 40–57 cover 0.5–0.7 and need things a driver cannot fake: two files open at once, a branch, a REST token, and a component set that is genuinely broken. Run the section that matches what you touched; run all of it before a release that changes pairing, the kit, or the transport.

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

## 0.2.0 checks

23. `get_design_system` → local components with usage counts, remote-used items, library variable collections; second call says `cached`, `refresh:true` rescans.
24. `analyze_design {aspect:"tokens"}` on a node with a hardcoded near-token color and an unbound radius → both findings name scope-appropriate variables; `manage_variables {action:"tokenize", fix:true}` binds them and a re-scan is clean.
25. A shape fill must never tokenize to a TEXT_FILL-scoped variable (scope discipline negative).
26. `batch_execute` / `set_properties` with `dryRun:true` → plan returned, canvas untouched.
27. `manage_conventions` set → get roundtrip (unicode/markdown intact); `get_document_overview` includes the conventions; clearing removes them; panel shows the RULES row.
28. Approvals BULK: a 10+ command batch shows the approval card; Approve executes fully; Deny returns "Denied by designer" with nothing applied; the MCP side does not time out while the card waits.
29. Scope lock: parentless creates and out-of-scope targets get a "Scope lock" error (including batch sub-commands); `execute_figma` outside the lock reports SCOPE VIOLATION in warnings.
30. `npx figma-relai doctor` with Figma open → relay ok + plugin online with the file name; with nothing running → actionable warns.

## 0.3–0.4 additions (memory, guards, dial, gauges)

31. Record a precedent by chat ("这是意图,记住") — agent calls record_precedent AND says so; MEMORY row count increments live.
32. Panel memory modal: "+ note a precedent" input adds an entry; ✕ deletes it; agent's list_precedents reflects both within one call.
33. Approval card shows the agent's intent line (or the no-description callout); typed reason becomes a `decision` precedent with the op's refs.
34. Touch a variable referenced by a precedent → the write result carries `precedents:[…]`; reads never do.
35. Guard a page from the NO-GO modal → any write targeting nodes on it is rejected with the page named; unguard restores. `manage_pages action:guard` refuses without pageId.
36. Dial stops: OPEN passes a `delete_variable` silently; RISK stops it (`ghost-risk` tag on the card); BULK also stops execute_figma; ALL stops a single-node write. Legacy settings migrate to the right stop on first load after update.
37. Bulk write (10+ nodes) leaves an amber evidence row in the feed and a `bulk_write` event in get_events.
38. analyze_design voice/readiness/ghosts return on the current page; ghosts criterion line names the live-list rule; validate_design_rules includes advisory `voice_drift` that never fails the run.
39. User skill in ~/.figma-relai/skills appears as `user:<name>` prompt after server restart; doctor counts it; broken frontmatter is named by doctor and skipped by the server.

## 0.5–0.7 additions

### Install & rooms

40. **The public entrance still works**: download `relai-plugin-<version>.zip` from the latest GitHub release, unzip, **Plugins → Development → Import plugin from manifest…**, pick `manifest.json` → the panel opens and connects. (This is the only install path; the filename is version-stamped, so a README that names a bare `relai-plugin.zip` is wrong.)
41. **Rooms are per file, not per machine**: open the plugin in two different files at the same time → two different room names, and `join_room` with no argument lists both with their file names. Open a *branch* of one of them → a third room (the seed lives in the file, and `root.name` splits branches and copies, which share plugin data). No command ever lands in the wrong document.
42. **The session follows a plugin that moved**: mid-session, switch the file to one of its branches (a different `root.name` mints a fresh room — reopening the *same* file must not, see item 2) → the next command still works without `join_room`, instead of "the Figma plugin is not open". With plugins live in several files, the error names them so you can choose.

### Kits — law that has to survive a merge

43. **Restore will not walk backwards**: with the file linked to a kit, write new conventions in the file, then `manage_rulesets action:restore` → refused, naming both sizes and both dates; the panel's drift card leads with **Send mine to the kit** because the file is the newer side. `force:true` goes through.
44. **Push carries a lease**: link two files to one kit. Push from A; then push from B, which has not synced since → refused, naming the kit's size, its date, and the file that last wrote it (`updatedBy`). `force:true` overrides.
45. **A kit that won't hold a write says so**: after a push, quit and reopen the plugin → the kit still holds the new law. Every write is read back; a store that silently keeps the old value must fail loudly rather than report success. (This is the one that turned a kit into a fake backup for five days.)
46. **Merge healing, and the switch that must not disarm itself**: on a file whose root law was wiped by a branch→main merge, open the plugin with the kit's auto-restore on → the law comes back on its own and the panel says so. Then re-import a ruleset package exported *before* auto-restore was enabled → the local switch stays on.

### The file's no

47. **A law rejection does not look like a crash**: in one session, trigger a no-go rejection and a genuinely failing `execute_figma` → the rejection is vermilion with a hairline rule at its left edge and a faint wash; the crash is plain error red. The NO-GO count in the file card is vermilion while a fence stands, and the timestamp column does not shift by a pixel between the two.
48. **Reading a guarded page is not writing to it**: run a script that only *reads* a no-go page — list page names, return the guards value, resolve a component's id — → no rejection. A page id in a result is data, not a confession.
49. **The scope lock covers a page and survives a reload**: flip the lock with **nothing** selected → it means the current page; reload the plugin → still locked, and the switch still says so.

### Lineage & token

50. **The panel says which file and which branch** — including in a design system whose components live inside sections rather than at the top of a page. Open a branch → the line carries the branch's own name, and `manage_comments` returns *that branch's* pins, not the parent file's.
51. **The access-token lamp reports validity, not existence**: store a garbage or expired token → the lamp is not green, and library discovery reports a permission failure instead of "every candidate 404'd".

### Feed & transport

52. **Stop is bound to a streak, not to a command**: run 20 short serial commands → Stop opens once and stays for the streak, and the HISTORY link does not move; a lone 0.1 s command never arms it.
53. **The relay reaps dead sockets and never a busy one**: run a 2–3 minute `findAll`-style script → the plugin stays connected the whole time. Then close the plugin → presence flips within seconds and the close code is logged.

### Audits

54. **A broken component set does not kill a whole-file audit**: with a variant-error set in the file — it may sit on no page at all, reachable only through one forgotten instance — run the property-binding audit → it completes and counts what it skipped.
55. **A fully tokenized set is not accused of 0%**: `get_selection_context` on a COMPONENT_SET whose variants are fully bound → the container reports no coverage metric rather than a zero averaged in from its own dashed frame.
56. **Icon glyphs are not clip risks**: run dimension stability on a page full of icon-font ligatures → they land in `iconGlyphsExcluded`, and `fixedText` carries only boxes that can actually clip.
57. **A scoped search stays in scope**: `search_nodes` with a `parentId` whose subtree does not contain the match → no results; the same query without `parentId` finds it.

### Plugin window controls

58. **Resize and restore**: drag the panel's bottom-right grip in both directions → the window follows, stays between 320×320 and 960×1200, and its content scrolls at small sizes. Focus the grip and use arrow keys (20 px; Shift: 100 px). Minimize with the header button → only the header remains; restore → the previous expanded size and scroll position return. Repeat while disconnected and while connected; the room and activity feed stay intact. Switch EN/日/中 → control tooltips follow the language. Size is remembered for the current plugin session only.
59. **Minimized work stays controllable**: minimize during a long command → the compact header exposes Stop once it is armed; Stop cancels the command. Trigger an approval request or a no-go proposal while minimized → the panel expands to show the request, and Approve/Deny still work. Close and reopen the plugin → the normal 380×850 panel opens.
