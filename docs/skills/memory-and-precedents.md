# File memory & precedents

Every Figma file this plugin touches can carry its own case law: **precedents** — single adjudications the designer made, stored inside the file (shared plugin data) so they reach every future session from any AI client. Conventions are the statutes; precedents are the case law. Together they are the file's law, and `manage_conventions action:get` returns both.

## Read before you work

At the start of any session that will modify the file, call `manage_conventions action:get`. Treat what comes back the way you treat user instructions:

- `content` — the conventions doc (statutes).
- `precedents` — recent adjudications (case law), newest first, with `precedentCount` for the total.

A precedent outranks your own judgment about what "looks wrong". If a precedent says a deviation is intent, do not "fix" it — and do not re-ask about it.

## When to record

Record a precedent (`action:record_precedent`) when the designer **rules** on something durable. The signal is adjudication language:

- "This is intentional, not drift" → `kind: "intent"`
- "Approved — but never restructure this table again" → `kind: "decision"`
- "Don't do it that way; do X instead" → `kind: "correction"`

One precedent = one sentence (≤280 chars), written so a future session with zero context understands the ruling. Attach `refs` — the variable IDs, node IDs, or page IDs the ruling concerns — because refs power in-band surfacing: any future write that touches them gets the precedent attached to its result automatically.

**Always say in your reply that you recorded it** ("已记入文件记忆: …"). Recording silently breaks the designer's trust in what the file knows.

## When NOT to record

- Transient, one-off choices ("make this one red for the screenshot").
- Anything already in the conventions doc (point to it instead; propose a conventions edit if it deserves statute status).
- Secrets, personal information, or anything about people rather than the file.
- Your own inferences the designer has not confirmed. Precedents are the DESIGNER's rulings, not your observations. When unsure, ask: "记为判例吗?"

## Promote rulings into enforcement

When conventions or repeated precedents describe something ENFORCEABLE, propose the promotion in chat — never enact it silently:

- "Never touch page X" (in conventions or a repeated ruling) → offer: "要把 X 设为 AI 禁区吗?(manage_pages action:guard)" — set it only after the designer agrees.
- Repeated identical adjudications ("this is intent" three times on the same token family) → offer to consolidate them into one conventions line, then remove the superseded precedents.

Guards belong to the designer: never guard/unguard on your own judgment, and mention any guard change in your reply.

## Reporting style as trust matures

Early sessions: report every change. Once the designer clearly stops reading full receipts (they say "简报就好" or approve digests), switch to digest mode: lead with **the two changes you are least sure about** and anything a precedent or guard touched, then one line for the rest ("其余 N 处按规约"). Full detail must always remain one question away — digest is a summary, never a omission. Never digest away errors, guard rejections, or precedent hits.

## Maintenance

- The designer sees and can delete every entry in the plugin panel (Memory section). Their record, their rules.
- Memory holds 200 entries / 64KB. When recording fails with a capacity error, offer a consolidation pass: `list_precedents`, merge superseded rulings into fewer summary entries (`record_precedent` the summaries, `remove_precedent` the merged ones), preserving every still-active ruling. Show the merge plan before applying it.
- If a precedent contradicts current reality (the token it references is gone, the ruling was reversed), ask the designer whether to update or remove it — never silently drop case law.
