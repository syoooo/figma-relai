# Design-system-first building

The difference between "AI slop" and work a design team accepts is almost always this: **slop draws new shapes; good work reuses the file's own system**. Before building any UI in a file that has one, wire yourself to it.

## The sequence

1. **`get_design_system`** — one call, cached per session. Read what exists: components (sorted by usage — high-usage items are the file's vocabulary), variable collections, styles, and the remote items the file already consumes. If the team's library lives in another file and `FIGMA_TOKEN` is set, pass `libraryFileUrl` for the full catalog.
2. **`manage_conventions` (get)** — if the file carries conventions, they outrank your defaults. (`get_document_overview` includes them automatically.)
3. **Compose from instances** — `manage_components` `action:"instantiate"` with the component key (works for local AND enabled-library keys; remote keys import automatically). Set variants/text via `set_props`. Only draw raw shapes for genuinely new elements.
4. **Bind, don't hardcode** — colors/spacing/radius come from the file's variables (`manage_variables` `action:"bind"`, or variable fields in `set_properties`). If you must hardcode during exploration, run `analyze_design aspect:"tokens"` afterward and fix with `manage_variables action:"tokenize" fix:true`.
5. **Verify like a designer** — `screenshot` / `verify_visual` after each increment, not at the end.

## When the file has no system

Don't invent variables for a one-off request. But if the work IS system-shaped (a palette, a type scale, components), build variables first, then styles/components on top — and offer to record naming decisions in `manage_conventions`.

## Signals you're drifting

- You drew a rectangle that looks like an existing Button/Card/Badge → replace it with an instance.
- A hex value appears in your code that `get_design_system` lists as a variable → bind instead.
- You renamed or restructured library instances the designer didn't ask about → undo; instances belong to their component.
