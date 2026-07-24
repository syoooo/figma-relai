# Janitorial cleanup

The chores designers postpone for months — layer renaming, token drift, spacing normalization — are where an agent earns trust fastest. These jobs are big, mechanical, and easy to verify. Do them conservatively and loudly.

## Ground rules

- **Preview before bulk.** Use `dryRun:true` on `batch_execute` / `set_properties`, or report findings first (`analyze_design`), and tell the designer the scale ("about 140 renames on this page — go?"). If the plugin's approval gate is on, big writes will ask them anyway.
- **Scope tightly.** Work page by page (or within the designer's selection). Never sweep the whole file unasked.
- **Never rename or restyle library instances' internals** — only top-level frames/groups the team owns.

## Recipes

### Rename layers by content
`Frame 427` tells nobody anything. Walk the target scope with `execute_figma` + `relai.query`, and derive names:
- A frame whose only text child says "Submit" → `Button/Submit` (match the file's existing naming pattern from `get_design_system`, don't invent one).
- Text nodes → their content, truncated (`Heading: Pricing plans`).
- Skip nodes that already have deliberate names (anything not matching `/^(Frame|Group|Rectangle|Ellipse|Vector|Line) \d+$/`).
Return the rename list; apply via one `batch_execute` of `rename_node` commands.

### Tokenize hardcoded values
`analyze_design aspect:"tokens"` finds hardcoded colors/numbers that visually match existing variables; `manage_variables action:"tokenize" fix:true` binds them in one pass. Report anything close-but-not-matching (deltaE just over tolerance) instead of silently snapping it.

### Normalize spacing
In auto-layout scopes, collect `itemSpacing`/padding values; flag off-scale values (not on the file's 4/8pt grid or spacing variables) and propose the nearest on-scale value. Apply only after the designer confirms the mapping.

### Sweep detached instances
`analyze_design aspect:"components"` lists likely-detached instances. Offer to re-link obvious ones (matching component still exists) and just report the rest — re-attaching wrong is worse than detached.

## Report format

End with counts and jump-points: what changed, what was skipped and why, node ids for spot-checking (the designer can click entries in the plugin feed).

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
