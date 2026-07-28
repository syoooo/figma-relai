// Single source of truth for Figma Plugin API pitfalls.
//
// Consumed in two places so the knowledge can never drift:
//  1. Runtime — the plugin's execute_code handler matches raw Figma errors
//     against `pattern` and appends `hint`, so the AI self-corrects in one
//     round-trip.
//  2. Build time — scripts/inject-pitfalls.ts renders `doc` bullets into the
//     figma-plugin-api cheat sheet, which ships as an MCP prompt.
//
// Adding a lesson learned = adding one entry here.

export interface Pitfall {
  /** RegExp source, matched case-insensitively against the raw error message. null = doc-only (silent pitfalls that never throw). */
  pattern: string | null;
  /** One-liner appended to the runtime error as "Hint: …". Empty for doc-only entries. */
  hint: string;
  /** Markdown bullet for the cheat sheet. */
  doc: string;
}

export const PITFALLS: Pitfall[] = [
  {
    pattern: "not a function",
    hint: "Figma's VM often omits which symbol failed ('not a function' with no name). Usual cause: an API from a different agent stack that doesn't exist in this sandbox — e.g. node.query() or figma.notify(). Search with findAll/findAllWithCriteria; when the message names nothing, bisect the script.",
    doc: "**`not a function` errors may name no symbol** — Figma's VM drops the subject. Usual cause: APIs from other agent tools that don't exist here (`node.query()`, `figma.notify()`). Use `findAll`/`findAllWithCriteria` for search; bisect when the message names nothing.",
  },
  {
    pattern: "unloaded font",
    hint: "await figma.loadFontAsync(node.fontName) before editing text — new TextNodes default to Inter Regular; for mixed ranges load every font from getRangeAllFontNames().",
    doc: "**Editing text without loading its font throws** (`unloaded font`). `await figma.loadFontAsync(textNode.fontName)` first; new TextNodes default to Inter Regular; when `fontName === figma.mixed`, load every font from `getRangeAllFontNames()`.",
  },
  {
    pattern: "getNodeById",
    hint: "This plugin runs in dynamic-page mode — use await figma.getNodeByIdAsync(id) instead of getNodeById.",
    doc: "**`getNodeById` throws in dynamic-page mode** — always `await figma.getNodeByIdAsync(id)`.",
  },
  {
    pattern: "explicitly loaded",
    hint: "Non-current pages must be loaded before traversal: await page.loadAsync() before reading page.children or calling findAll.",
    doc: "**Traversing a non-current page throws until you `await page.loadAsync()`** — `figma.currentPage` is always loaded, other pages are not.",
  },
  {
    pattern: "layoutSizing",
    hint: "layoutSizing FILL/HUG needs auto-layout — on the parent for FILL, on the node itself for HUG. Set layoutMode on the frame first.",
    doc: "**`layoutSizingHorizontal/Vertical` throw without auto-layout** — FILL requires the parent to have a `layoutMode`, HUG requires it on the node itself.",
  },
  {
    pattern: "Starter plan",
    hint: "This file hit the free-plan page limit — reuse an existing page (find it via figma.root.children) instead of figma.createPage().",
    doc: "**`createPage()` throws on the free plan once a file has 3 pages** — reuse an existing page instead.",
  },
  {
    pattern: "read.?only property '(width|height)'",
    hint: "width/height are read-only — use node.resize(w, h) (and note resize on an auto-layout frame pins that axis to FIXED).",
    doc: "**`width`/`height` are read-only** — use `node.resize(w, h)`.",
  },
  {
    pattern: "symbol",
    hint: "You probably hit figma.mixed (a Symbol) — properties like fontSize/cornerRadius/fills return it when values differ across ranges or children. Compare with === figma.mixed before using the value.",
    doc: "**`figma.mixed` is a Symbol** returned by `fontSize`, `cornerRadius`, `fills` etc. when values differ across ranges/children — check `=== figma.mixed` before use; never JSON-serialize it.",
  },
  {
    pattern: "of undefined",
    hint: "A lookup returned undefined — if you searched pages or nodes by exact name, names may have been changed by the designer. Locate by type/content (e.g. c.type === \"COMPONENT_SET\") instead.",
    doc: "**Exact-name lookups are fragile** — designers rename pages and layers freely; locate nodes by type/content instead of `name ===`.",
  },
  {
    pattern: "does not exist",
    hint: "The node id is stale — the node was likely deleted or lives on another page. Re-read the document to get current ids.",
    doc: "**Stale node ids throw `does not exist`** — nodes get deleted while you work; re-read before editing and check `node.removed`.",
  },
  {
    pattern: "not extensible",
    hint: "Figma nodes can't hold custom properties (they're non-extensible). Stash data with node.setPluginData(key, value), or return it from the script.",
    doc: "**Nodes are non-extensible** — `node.myCustomProp = x` throws `object is not extensible`; use `setPluginData` or return the data instead.",
  },
  // ── silent pitfalls: nothing throws, results are just wrong ──
  {
    pattern: null,
    hint: "",
    doc: "**Shadow `spread` renders only on shapes or frames with `clipsContent: true`** — a focus ring built from spread shadows is invisible on a non-clipping frame/component.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**`resize()` on an auto-layout frame silently pins that axis to FIXED**, overriding `primaryAxisSizingMode: \"AUTO\"`. Append children first, then set `layoutSizingHorizontal = \"HUG\"`; use `resize` only for the fixed cross-axis.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Per-corner radius** (`topLeftRadius` …) only exists on RectangleCornerMixin nodes (rectangles, frames, components) — polygons, stars and lines throw.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Instance children can't be added or removed** — detach first, or edit the main component.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Figma's slot feature (Convert to slot, ⇧⌘S) has no Plugin API** — no createSlot/convertToSlot exists (verified against typings 1.123 and at runtime, 2026-07). Scaffold a frame named \"Slot\", select it for the designer (navigate select), and let them press the shortcut.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A converted SLOT node stops hugging** — after the designer converts a frame to a slot it carries its own fixed size. Re-assert `layoutSizingVertical = \"HUG\"` (and the intended horizontal mode) on the SLOT node afterwards; the API can still edit its layout props.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Variantizing can silently pin the hug axis to FIXED** — observed after clone → counterAxisSizingMode/width-variable changes → combineAsVariants: the variants' `primaryAxisSizingMode` ended up FIXED though the source hugged. Always verify sizing modes on every variant after combineAsVariants and re-assert `\"AUTO\"`.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A backgrounded Figma window suspends the plugin iframe** — timers freeze and the socket can't pong, so the relay's staleness sweep kicks the plugin and the frozen 2s redial never fires until the window regains attention. The panel redials on visibilitychange/focus (ui.html ≥0.2.4); when a paired plugin goes missing mid-session, ask the designer to click the Figma window before assuming anything is broken.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A freshly-converted slot can still report `type: \"FRAME\"` to the Plugin API** — the layer panel shows the slot badge while getNodeByIdAsync returns FRAME (a reload boundary was observed to fix it). Never gate automation on `type === \"SLOT\"`; match the frame by name and trust the designer's visual confirmation.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Deleted variables are soft-deleted ghosts** — `getVariableByIdAsync` still resolves them with name AND working values (`Variable` has no `removed` property), so bindings to them keep rendering while being invisible in pickers and dead on publish. To test aliveness, check membership in `getLocalVariablesAsync()` (remote variables are legitimately absent — check `variable.remote`).",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Variables cannot be reordered via the API** (`variableIds` is read-only; the `move…After` methods exist only for styles) — new variables always append last; panel order is manual-drag only. NEVER delete-and-recreate variables to reorder: bindings reference variable IDs, so every binding in the file silently dies (observed in production; the ghosts keep rendering, hiding the damage).",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A remote (library) text style dominates variable bindings** — on text with a remote style applied, `setBoundVariable` writes appear to succeed but snap back to the style's own bindings. Clear the style first (`await setTextStyleIdAsync(\"\")`), then bind.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Binding writes inside instances silently revert — with two escape hatches.** `setBoundVariable` on a node nested inside an INSTANCE succeeds without error, then reverts (instance roots placed directly in a main ARE writable; anything deeper is not). What does persist: reassigning the whole `fills`/`strokes` array (variable-bound paints ride inside), and range-level `setRangeBoundVariable` on text. Verify after writing; never trust the call alone.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A bound `strokeWeight` renders nothing while `strokes` is empty, and wrappers don't hug stroke thickness.** A LINE's visible weight lives entirely in its stroke paint; the frame around it keeps its own raw height/width, so the panel shows an unbound number with empty Fill/Stroke — looking broken when it isn't. Inspect the LINE child's stroke bindings, not the wrapper; and bind the wrapper's thickness-axis dimension to the same variable so nothing stays raw.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**`setBoundVariable(\"strokeWeight\", …)` is a silent no-op on FRAME-family nodes.** Frames and components bind stroke weight per side — `strokeTopWeight` / `strokeRightWeight` / `strokeBottomWeight` / `strokeLeftWeight`; the uniform `strokeWeight` field only binds on stroke-geometry nodes like LINE. No error is thrown, the binding just never appears — read back `boundVariables` after writing.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Cloning a variant escapes its component set — onto whatever page the user is viewing.** `variant.clone()` parents the copy to `figma.currentPage` as a standalone COMPONENT (not into the set) — plain nodes inside components clone to the current page too. Every `componentPropertyReferences` pointing at set-level properties is silently severed, and native SLOT children are demoted to plain FRAMEs (slot-ness needs set context). Recover by `componentSet.appendChild(clone)`, re-assigning ALL references (`visible`, `slotContentId`, …) — a SLOT can be restored by cloning a surviving SLOT node from a sibling variant (SLOT clones keep their type) and relinking `componentPropertyReferences.slotContentId`. Audit every set-scoped feature after adoption; none of it comes back on its own.",
  },
  {
    pattern: "Component set.*existing errors",
    hint: "The set has mismatched or duplicate variant names — every variant must carry the same axes with unique values. Rename stragglers to unique same-axis values (e.g. a temporary legacy-* value) to heal the set, then migrate instances and delete the leftovers.",
    doc: "**Uneven variant renames/deletes poison the whole component set.** If variants end up with mismatched axis segments (some carry `axis=value`, others don't) or duplicate names, the set enters an error state where `componentPropertyDefinitions` AND every instance's `variantProperties`/`setProperties` throw (`Component set has existing errors`). Escape: rename stragglers so all variants share the same axes with unique values (temporary `legacy-*` values work), which heals the set — then migrate and delete.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**`setProperties` DOES work on instances nested inside other instances** — it records as an override on the outer instance. Only variable-binding writes (`setBoundVariable`) silently revert inside instance internals. Don't skip nested instances when migrating variant or boolean properties; skip them only for binding writes.",
  },
  {
    pattern: "Plugin runtime aborted",
    hint: "The sandbox VM ran out of room marshalling values, not time. Usual cause: reading a deep-wrapped property (componentProperties, overrides, boundVariables, exportSettings) across thousands of nodes — each access copies a fresh object into the VM. Chunk the scan (a few hundred nodes per execute_figma), collect only the fields you need, and never build one array holding every node's full property object.",
    doc: "**`Plugin runtime aborted` is an out-of-memory, not a timeout.** The stack shows `deepWrap` recursing into `newString` before `abort`. Reading deep-wrapped properties — `componentProperties`, `overrides`, `boundVariables`, `exportSettings` — copies a fresh object into the QuickJS sandbox on EVERY access, so a loop over tens of thousands of instances kills the runtime even though each read looks free. Chunk the scan and keep only the fields you need. (Real case: `componentProperties` over 29,861 instances aborted; the same scan over 7,139 was fine.)",
  },
  {
    pattern: null,
    hint: "",
    doc: "**What a file USES is not what its library HAS.** `get_design_system`'s remote-used list only reports components the file already placed — a library component nobody has dragged in yet is invisible to the plugin, and no amount of scanning the document will reveal it. Read the published catalog before concluding a component doesn't exist (one real case: a design system's `TextArea` was declared missing and hand-rebuilt from a stretched `Text Field`, because the file had never used the real one).",
  },
  {
    pattern: null,
    hint: "",
    doc: "**A component property's identity is the `#id` suffix, not its display name.** Renaming `show label#4525:247` to `hasLabel#4525:247` in the library keeps every instance's override — text and boolean values survive a library update untouched. VARIANT axes are the opposite: they have no id and are matched by name, so renaming an axis or its values (`layout=horizontal` → `labelPosition=side`) is the only thing that actually drops instances back to a default. When auditing a library migration, snapshot the variant axes and ignore the renamed text/boolean props.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**`importComponentSetByKeyAsync` returns the file's LOCAL copy, not the latest published version.** If the file holds a stale copy of a library component, the import hands back the stale one and looks authoritative. To see what is actually published, read `componentPropertyDefinitions` over REST (`/v1/files/{key}/nodes?ids={node_id}&depth=1`) and compare. Importing is also expensive — each call materialises the whole set (a 72-variant set is thousands of nodes), and a handful in one script will abort the sandbox.",
  },
  {
    pattern: "no setter for property",
    hint: "Some layout properties are read-only and have an imperative setter instead. Grid children: gridRowAnchorIndex/gridColumnAnchorIndex are readonly — call node.setGridChildPosition(row, column). Grid tracks: gridColumnSizes/gridRowSizes cannot be assigned as arrays, but gridColumnCount/gridRowCount are writable and the returned GridTrackSize objects have their own .type/.value setters.",
    doc: "**GRID auto-layout has read-only positions and imperative setters.** `gridRowAnchorIndex` / `gridColumnAnchorIndex` are readonly — move a child with `node.setGridChildPosition(row, column)` (spans stay writable: `gridColumnSpan`). `gridColumnSizes` / `gridRowSizes` reject array assignment (`no setter for property`), but `gridColumnCount` / `gridRowCount` are writable and each returned `GridTrackSize` has `.type` / `.value` setters — so add a track by raising the count, then set the new track's type. Shrinking the row count is how you drop a leftover empty row.",
  },
  {
    pattern: null,
    hint: "",
    doc: "**Dot-prefixed components are never published**, so their keys 404 on every REST endpoint. Figma hides `.`-prefixed assets from the publish dialog; they exist only nested inside published parents. When resolving a key → file via `/v1/components/{key}`, skip names starting with `.` — and note a component SET's key resolves only at `/v1/component_sets/{key}`, never at `/v1/components/{key}` (and vice versa). Relatedly, `/v1/files/{key}/components` returns the individual VARIANTS (`size=md, state=default`); the components a designer names live in `/component_sets`.",
  },
];

// First matching pitfall's hint, or null. Doc-only entries never match.
export function pitfallHint(message: string): string | null {
  for (const p of PITFALLS) {
    if (p.pattern && new RegExp(p.pattern, "i").test(message)) return p.hint;
  }
  return null;
}
