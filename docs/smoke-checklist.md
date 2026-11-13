# Manual Smoke Checklist

Run against a real Figma file after changing plugin handlers, the transport, or pairing.
Setup: MCP client (Claude Code / Cursor) started — the relay is embedded, no `bun socket` needed. Figma plugin installed.

Items 1–39 are the core sheet (~25 min). Items 40–57 cover 0.5–0.7 and need things a driver cannot fake: two files open at once, a branch, a REST token, and a component set that is genuinely broken. Items 58–66 cover what 0.7.11 changed, and 67–79 what 0.8.0 changed. Run the section that matches what you touched; run all of it before a release that changes pairing, the kit, or the transport.

## Pairing & connection

1. **Cold-start auto-pair**: fresh machine state (`rm -rf ~/.figma-relai`), open the plugin (it auto-connects and shows a room), then ask the AI to run `get_document_overview` **without** `join_room` → it pairs automatically and succeeds.
2. **Room persistence**: close and reopen the plugin → same room name reappears; the AI keeps working without re-pairing.
3. **Figma restart**: quit and relaunch Figma Desktop, run the plugin → auto-connects to the same room; next AI command succeeds without `join_room`.
4. **Relay handover**: with two MCP clients running (e.g. Claude Code + Cursor), kill the one that started first (hosting the relay) → within a few seconds the other takes over; plugin badge flips to "Reconnecting…" then back to connected; commands work again.
5. **Presence**: with the plugin closed, ask the AI to run a command → immediate "No Figma plugin is connected" (not a 30 s timeout). Open the plugin → its badge shows "AI connected ✓" once the agent is in the room.
6. **Stop button**: run a large `set_text` bulk edit (50+ nodes), press **Stop** in the plugin → remaining items are skipped and reported as `cancelled`, the items already written as applied, and the result is `partial` (see item 67 for the full Stop check).
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
29. Scope lock: parentless creates and out-of-scope targets get a "Scope lock" error (including batch sub-commands); `execute_figma` outside the lock reports SCOPE VIOLATION in warnings, and the same script inside `batch_execute` reports it too.
30. `npx figma-relai doctor` with Figma open → relay ok + plugin online with the file name; with nothing running → actionable warns.

## 0.3–0.4 additions (memory, guards, dial, gauges)

31. Record a precedent by chat ("这是意图,记住") — agent calls record_precedent AND says so; MEMORY row count increments live.
32. Panel memory modal: "+ note a precedent" input adds an entry; ✕ deletes it; agent's list_precedents reflects both within one call.
33. Approval card shows the agent's intent line (or the no-description callout); typed reason becomes a `decision` precedent with the op's refs.
34. Touch a variable referenced by a precedent → the write result carries `precedents:[…]`; reads never do.
35. Guard a page from the NO-GO modal → any write targeting nodes on it is rejected with the page named; unguard **from the panel** restores. `manage_pages action:unguard` on that page is refused with "Designer-only" and points to the panel; a zone the agent added with `manage_pages action:guard` in the same plugin session can be lifted by the agent. `manage_pages action:guard` refuses without pageId.
36. Dial stops: OPEN passes a `delete_variable` silently; RISK stops it (`ghost-risk` tag on the card); BULK also stops execute_figma, and a `batch_execute` that wraps a single `execute_figma`; ALL stops a single-node write and every `execute_figma`, even one that only reads; a batch of reads at ALL does not ask. Legacy settings migrate to the right stop on first load after update.
37. Bulk write (10+ nodes) leaves an amber evidence row in the feed and a `bulk_write` event in get_events.
38. analyze_design voice/readiness/ghosts return on the current page; ghosts criterion line names the live-list rule; validate_design_rules includes advisory `voice_drift` that never fails the run.
39. User skill in ~/.figma-relai/skills appears as `user:<name>` prompt after server restart; doctor counts it; broken frontmatter is named by doctor and skipped by the server.

## 0.5–0.7 additions

### Install & rooms

40. **The public entrance still works**: download `relai-plugin-<version>.zip` from the latest GitHub release, unzip, **Plugins → Development → Import plugin from manifest…**, pick `manifest.json` → the panel opens and connects. (This is the only install path; the filename is version-stamped, so a README that names a bare `relai-plugin.zip` is wrong.)
41. **Rooms are per file, not per machine**: open the plugin in two different files at the same time → two different room names, and `join_room` with no argument lists both with their file names. Open a *branch* of one of them → a third room (the seed lives in the file, and `root.name` splits branches and copies, which share plugin data). No command ever lands in the wrong document.
42. **The session follows a plugin that moved**: mid-session, switch the file to one of its branches (a different `root.name` mints a fresh room — reopening the *same* file must not, see item 2) → the next command is refused once with `room_changed` naming the new file (a different file is where wrong-file writes come from), and sent again it works without `join_room`, instead of "the Figma plugin is not open". With plugins live in several files, the error names them so you can choose. Item 70 covers the confirmation in full.

### Kits — law that has to survive a merge

43. **Restore will not walk backwards**: with the file linked to a kit, write new conventions in the file, then `manage_rulesets action:restore` → refused, naming both sizes and both dates; the panel's drift card leads with **Send mine to the kit** because the file is the newer side. `force:true` goes through.
44. **Push carries a lease**: link two files to one kit. Push from A; then push from B, which has not synced since → refused, naming the kit's size, its date, and the file that last wrote it (`updatedBy`). `force:true` overrides.
45. **A kit that won't hold a write says so**: after a push, quit and reopen the plugin → the kit still holds the new law. Every write is read back; a store that silently keeps the old value must fail loudly rather than report success. (This is the one that turned a kit into a fake backup for five days.)
46. **Merge healing, and the switch that must not disarm itself**: on a file whose root law was wiped by a branch→main merge, open the plugin with the kit's auto-restore on → the law comes back on its own and the panel says so. Then re-import a ruleset package exported *before* auto-restore was enabled → the local switch stays on.

### The file's no

47. **A law rejection does not look like a crash**: in one session, trigger a no-go rejection and a genuinely failing `execute_figma` → the rejection is vermilion with a hairline rule at its left edge and a faint wash; the crash is plain error red. The colour keys on the error code, not the wording (item 69). The NO-GO count in the file card is vermilion while a fence stands, and the timestamp column does not shift by a pixel between the two.
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

## 0.7.11 additions

58. **Annotations land**: `annotate set` on a frame → Dev Mode's sidebar shows the markdown label. Add a second one to the same frame → the first is still there. `set` on a GROUP → an error that names `GROUP`. `set_multiple` with one frame, one group and one deleted id → per item: success, the group's type, "Not found".
59. **A restore into a full memory keeps the law and says what it skipped**: fill the file memory close to its cap, then restore from a kit with seed precedents, and again with link + restore → the conventions come back, no seed precedent is written, and the panel's notice gives the skipped count. The automatic heal after a merge uses the same words.
60. **A token ref has to name a variable**: record a precedent with a token ref written as a bare `N:M` → a later write to that variable surfaces it. Record one with an id that names no variable → an error, and nothing is saved.
61. **diff_nodes leaves the file alone**: save a checkpoint, edit, compare → the differences are listed, and the node carries no `relai.checkpoint` plugin data. Restart the MCP server and compare again → "no checkpoint … in this server session".
62. **join_room names the file**: with two files open, `join_room` to the second file's room → the reply names that file, and the next command lands there. `join_room` to a room with no plugin → the reply says no plugin is there yet.
63. **execute_figma returns rows whole and nodes as summaries**: a script returning `{ id, type, parent, extra }` → `extra` is still there. A script returning `figma.currentPage.selection[0]` → a node summary, as before. A script returning a paint style → its fields, not a node summary.
64. **token_debt counts every borrow**: on a file with more than 40 borrowed tokens → the summary's number equals `borrowCount`, says "(showing 40)", and `borrowsTruncated` is true.

### Plugin window controls

65. **Resize and restore**: drag the panel's bottom-right grip in both directions → the window follows, stays between 320×320 and 960×1200, and its content scrolls at small sizes. Focus the grip and use arrow keys (20 px; Shift: 100 px). Minimize with the header button → only the header remains; restore → the previous expanded size and scroll position return. Repeat while disconnected and while connected; the room and activity feed stay intact. Switch EN/日/中 → control tooltips follow the language. Size is remembered for the current plugin session only.
66. **Minimized work stays controllable**: minimize during a long command → the compact header exposes Stop once it is armed; Stop cancels the command. Trigger an approval request or a no-go proposal while minimized → the panel expands to show the request, and Approve/Deny still work. Close and reopen the plugin → the normal 380×850 panel opens.

## 0.8.0 additions — honest results & per-call target

Run these with the 0.8.0 server and the 0.8.0 plugin unless an item says otherwise. Each failure should come back with `isError`, a `[relai]` line naming the outcome and code, and the same receipt under `_meta["io.github.syoooo.figma-relai/call"]`.

### Stop and the feed

67. **Stop no longer lies**: run a 2–3 minute write script that `await`s inside its loop, press **Stop** midway → the feed row first reads "Stop requested", and settles only when the command really ends. The agent gets the real result (its `[relai]` line says the designer pressed Stop) or, if nothing follows within 10 s, `cancel_unconfirmed` / `unknown` — never "Cancelled by designer" followed by a command that finished anyway. A Stop that comes too late for a command that succeeded shows "Stop came too late". If the panel's relay link is down when Stop is pressed, the server hears nothing and waits for the full timeout; that is expected.
68. **Stop in a batch and at an approval card**: a 30-command `batch_execute`, Stop midway → written items `applied`, skipped items `cancelled` / `not_applied`, top level `partial`. Approval card: Deny → `denied_by_designer`; leave it for 120 s → `approval_timeout`; press Stop while the card shows → `cancelled`. All three `not_applied`, and the canvas is unchanged.
69. **Law colour keys on the code**: one no-go rejection and one genuinely failing `execute_figma` in one session → the rejection is vermilion, the crash plain red, as in item 47. Then reword the no-go message in `guards.ts`, rebuild and repeat → still vermilion.
70. **The result settles while the link is down**: start a 10 s write script, then stop the MCP client (or kill the process hosting the relay with no other client running) before it ends → the plugin finishes, the row settles with its real result plus an amber "The result did not reach the AI" note, and it never spins forever.

### Targeting a file

71. **Per-call room**: open the plugin in two files at once. From one session, alternate writes with `room` set to each file's room → each write lands in its own file; `join_room` with no argument shows the default room did not move. Both panels' AGENT lamps light (known side effect).
72. **expect_file is checked before sending**: pass a wrong `expect_file` → `wrong_file`, the canvas is unchanged (compare screenshots before and after), and the error names the actual file and the room where the expected one is open. Repeat against a 0.7.11 plugin → the server's check still refuses it.
73. **Room change asks once**: the item 42 scenario (switch the file to a branch mid-session) → the first command is `room_changed` and names the branch; sending it again goes through. With a matching `expect_file` it goes through at once. Closing and reopening the same file never triggers it.
74. **join_room reports what it found**: join a room with a plugin → the file name, and the main file's name on a branch once the identity is known; join a room with none → "no plugin is there yet". With the relay unreachable, the error reads `Error: …` and carries `isError`.
75. **The relay host exits mid-call**: two MCP clients; kill the one hosting the relay while the other has a call in flight → `link_dropped` / `unknown` with the close code and "this process takes over hosting in about 2 seconds"; 2–3 s later the next call works, rooms named per call included.
76. **list_rooms times out as the relay, not Figma**: two MCP clients; pause the hosting process (`kill -STOP <pid>`), then from the other call `join_room` with no argument → after about 5 s, `relay_unresponsive` / `not_applied` saying nothing changed in Figma. `kill -CONT <pid>` restores it.

### Results and the relay

77. **Long results go to a local file**: an `execute_figma` returning about 120,000 characters → the text is cut at 40,000 (50,000 with a 0.8.0 server), `truncated.total` is right, and the named file under `~/.figma-relai/results/` holds the complete JSON (mode 0600). A plain object `{ id, type, parent, extra }` still comes back whole; a real node still as a summary.
78. **The real panel's Origin passes, web pages do not**: with the 0.8.0 server, open the plugin in Figma Desktop → it connects (the panel's sandboxed iframe sends Origin `"null"`). Then from a browser page on `http://localhost` run `new WebSocket("ws://localhost:9055")` → the handshake fails, and the server logs "refused a connection from origin".
79. **Version mismatch**: new server with a 0.7.11 plugin, and a 0.7.11 server (`npx figma-relai@0.7.11`) with the new plugin → both read and write; under the old server large results are still cut at 50,000 by the plugin; an old panel's Stop shows as `unknown` on the new server.

## 0.8.1 additions — walls and the panel

Run these on a scratch file with at least one page fenced off in the panel, code execution on, and the dial at RISK unless the item says otherwise.

### Walls against the agent in this session

80. **Designer-only**: `batch_execute` with `set_guards {pages: []}` on a file with a guard → refused with `designer_only`, vermilion in the feed, the guard still on.
81. **Wrapped commands ask**: at RISK, `batch_execute [delete_variable]` shows the card (tag `ghost-risk`); at BULK, `batch_execute [execute_code]` shows the card with "contains execute_code". A batch nested four levels deep is refused with `invalid_params`.
82. **Bulk set_text is checked item by item**: with a non-fenced current page, a multi-node `set_text` whose items include a text node on a fenced page → `guard_blocked`, and nothing was written.
83. **Settings tamper**: a script writes `relai.settings` (dial OPEN, code on, lock off) → the next write still obeys the panel's dial and lock; the result carries `law_restored`; reload the plugin → the panel shows the designer's values. With code execution off in the panel, a script that set `allowCodeExec: true` in storage does not make the next `execute_figma` run.
84. **The panel handler is out of reach**: a script returns `typeof figma.ui.onmessage` → `"undefined"`.
85. **Guard tamper**: a script clears `relai/guards` → the result has the LAW RESTORED warning, the guard is back, and the feed shows a pinned vermilion law line. In one batch, a script that clears the guards followed by a write into the fenced page → the write is refused.
86. **The designer is never overwritten**: start a 20-second script; while it runs, lift a guard in the panel → it is not applied: the checkbox goes back, the feed says "The no-go change was not applied because a script was running. Please do it again.", and after the script the guard is still on. Change a setting in the panel within 3 seconds after a script ends → it is not applied, the switch goes back, and the feed says to try again.
87. **Delayed write**: a script schedules a guard clear with `setTimeout` and returns → the next command restores it. Close the plugin right after the script → the guard is still on when reopened.
88. **A script that reaches across a fence**: a script that creates a node on a fenced page with `relai.autoLayout` and returns its id → `violations` (kind `guard`, the page named), a `script_breach` notice pinned in the feed, and the command's row in law style. The same script ending in `throw` → a `script_error` whose message carries the GUARD VIOLATION warning, and the same pinned notice.
89. **Precedents before the write**: with a precedent anchored on a node, a RISK-level delete of it shows the precedent on the approval card; a plain write's result lists `precedents` first; a batch touching it carries the precedent on that item.

### The panel does not go quiet

90. **Approval countdown**: an approval card shows the seconds left, turns amber at 30, shows ×N when more are queued; left alone for 120 s its row reads that it timed out.
91. **Kit refusals stay on the card**: two files linked to one kit; push from A, then push from B → B's card stays open and names the kit's size, date and the file that last wrote it; overwriting takes a second click. "Pull from the kit" when the file is newer still overwrites at once, with the result shown in place.
92. **The heal leaves a card**: after a branch merge wipes the law with auto-restore on, reopen the plugin → a card names the kit, its date and any skipped seeds, until dismissed.
93. **A refused panel action is undone**: while a script runs, flip the code toggle in the panel → it flips back and the feed says the action was not applied.
94. **Errors without toasts**: trigger a failing command and a failing precedent note in the panel → no Figma toast; the feed row, or the line under the note's input, says what failed.

### Results and the server

95. **A closed plugin fails the call at once**: start a 20-second `execute_figma`, then close the plugin → the call fails within a second or two with `link_dropped` / `unknown`, not after its timeout.
96. **Reads carry a receipt**: `get_document_overview` without `room` → its result ends with a `[relai]` line naming the file. A failing command's `[relai]` line names the file too.
97. **Results fit under 50,000**: a script returning 3,000 × 40 characters → the cut text, the notice and the `[relai]` line together stay under 50,000 characters, so the client keeps it inline.
98. **The write log says why**: deny one approval, let one time out and Stop one → `get_events scope:"agent"` lists them as denied, timeout and stopped.
99. **The panel reports itself lost**: start a 20-second script and, while it runs, stop the only MCP client (the relay goes with it) → when the script ends the feed shows a `panel_lost` notice saying the relay link dropped.

