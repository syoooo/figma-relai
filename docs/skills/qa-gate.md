# QA gate — the full physical, on demand

Human-triggered, review-moment audit of a file (or a set of pages). Run it when the designer says "体检" / "is this ready for review?" / before a library merge. It composes the gauges into one report with receipts.

## The pass

Run in this order (each is read-only):

1. `manage_conventions action:get` — the law you'll be judging against (conventions + precedents). If precedents mark deviations as intent, they are NOT findings — the file already ruled. List them as "waived by precedent", never as problems.
2. `analyze_design aspect:readiness` — agent-readiness score + top gaps.
3. `analyze_design aspect:ghosts` (pass `pageIds` for a multi-page pass) — stale references to soft-deleted variables. Any ghost count > 0 is a red flag for publish.
4. `analyze_design aspect:voice` — the file's signature (radius/spacing/type, tokenized-paint rate, instance rate).
5. `analyze_design aspect:overall` on the key screens the designer names (health score 0-100).
6. `analyze_design aspect:tokens` — hardcoded values that match existing variables (each is one `tokenize` away from bound).

## The report

Produce a compact markdown report, structured exactly like this:

```
# QA gate — <file name> — <date>
verdict: PASS | PASS WITH NOTES | BLOCK

readiness  NN/100   (top gap: …)
ghosts     N refs   (0 required for publish)
health     NN/100   (screens: …)
tokens     N unbound-but-matchable
voice      radius …, spacing …, …% tokenized

## findings (ranked)
1. [BLOCK|NOTE] … — evidence: <numbers/nodeIds> — fix: <one tool call>
…

## precedent-protected (not findings)
- … (per precedent "…", YYYY-MM-DD)
```

Verdict rules: any ghosts or health < 60 on a named key screen → BLOCK; readiness < 50 → note it but readiness alone never blocks; everything protected by a precedent is listed separately, never as a finding.

## Rules

- Numbers unedited: report what the tools returned, never round a failing number into a passing one.
- Findings must carry evidence (counts, nodeIds) and a one-call fix each.
- Offer — do not perform — fixes. The QA gate is a read-only pass; repairs are a separate, approved session.
- If the designer wants the report in-file: create a page named `· QA Report <date>` and write the report as text there (ask first — it adds a page to their file).
- Big files: run ghosts page-set by page-set (`pageIds`) instead of one giant pass, and say which pages were covered. Silence about coverage reads as "covered everything" — never let it.
