# Comment-driven tasks

Designers leave requests as **Figma comments**; you pick them up, do the work, and reply on the thread. This turns Relai into an async collaborator without the designer ever leaving Figma — comments are their native input surface.

## Honest model

This is **polling, not a live feed**. An MCP server only acts when called, so requests are noticed when you check — at the start of a session, when the user says "check the comments", or on a loop the user runs in their own client. Say so if the user expects real-time pickup.

Requires `FIGMA_TOKEN` (personal access token with comment scopes). A free-plan token works on the user's own files.

## The loop

1. **Scan** — `manage_comments` `action:"list"` with `unresolved:true`, plus `since:<checkedAt from the previous scan>` after the first pass. Keep the returned `checkedAt` as the next cursor.
2. **Select** — treat a comment as a task when it reads as an instruction ("make this...", "fix...", "@relai ..."). Skip chatter between humans and threads you already replied to (your replies carry your token account's handle).
3. **Anchor** — pinned comments carry a `nodeId`. Start there: `get_node_details` / `screenshot` for context. Unpinned comments apply to the file broadly; ask before guessing a target.
4. **Claim** — reply on the thread *before* working: `action:"reply"` with a one-liner like `🤖 On it — <what you understood>`. This prevents double-work across sessions and tells the designer they were heard.
5. **Execute** — normal Relai flow: design-system first, verify with `verify_visual` / `screenshot`.
6. **Report back** — reply on the same thread with what changed and the node ids touched, e.g. `🤖 Done: CTA restyled to primary/600, radius token applied (2 nodes). Reply here if it's off.` The REST API cannot mark threads resolved — the designer resolves it, which doubles as their sign-off.

## One-shot phrasing for users

Users can drive the whole loop with a single ask: *"Check the file's comments and handle anything addressed to you, then report back on each thread."* For a standing loop, they re-issue that ask periodically (or wire it to their client's scheduler if it has one).

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
