# Figma Plugin API Cheat Sheet — for `execute_figma`

Rules and patterns for writing code that runs in the plugin sandbox. Work in small incremental scripts and `screenshot` between steps.

## Non-negotiable rules (dynamic-page mode)

- **Node lookup is async**: `await figma.getNodeByIdAsync(id)` — `getNodeById` throws in this plugin.
- **Load pages before traversal**: `await page.loadAsync()` before `page.findAll(...)` on a non-current page; `figma.currentPage` is always loaded.
- **Load fonts before ANY text edit**: `await figma.loadFontAsync(textNode.fontName)` — if `fontName === figma.mixed`, load every range: `for (const f of textNode.getRangeAllFontNames(0, textNode.characters.length)) await figma.loadFontAsync(f)`.
- **`figma.mixed` is a Symbol**: properties like `fontSize`, `cornerRadius`, `fills` return it when values differ across ranges/children. Check `=== figma.mixed` before using; never JSON-serialize it.

## Common patterns

```js
// Selection
const sel = figma.currentPage.selection;          // read
figma.currentPage.selection = [node];             // write

// Create + place
const frame = figma.createFrame();
frame.resize(320, 200);                            // width/height are read-only; use resize()
parent.appendChild(frame);                         // default parent is currentPage

// Fills/strokes are ARRAYS and must be reassigned wholesale
node.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];  // rgb 0-1, no alpha key — use opacity
const fills = JSON.parse(JSON.stringify(node.fills));              // clone before mutating
fills[0].color.r = 0; node.fills = fills;

// Auto-layout: set layoutMode FIRST, then padding/spacing/align
frame.layoutMode = "VERTICAL";
frame.itemSpacing = 8; frame.paddingTop = 16;
child.layoutSizingHorizontal = "FILL";             // requires PARENT with auto-layout

// Components
const comp = await figma.importComponentByKeyAsync(key);  // team library
const inst = comp.createInstance();
inst.setProperties({ Variant: "Primary" });        // throws on unknown property names

// Variables
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const v = figma.variables.createVariable("name", collection, "COLOR");
v.setValueForMode(modeId, { r: 0, g: 0, b: 0 });
node.setBoundVariable("fills", v);                 // binding paint needs figma.variables.setBoundVariableForPaint on the paint object for fills in older APIs — prefer setBoundVariable where available

// Export (returns Uint8Array)
const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
```

## `relai.*` helpers — the shortest path is the correct one

Alongside `figma`, scripts get a `relai` object whose helpers are immune to the pitfalls below. Prefer them:

```js
await relai.text(parent, "Hello", { font: {family:"IBM Plex Mono", style:"Regular"}, size: 14, color: {r:0,g:0,b:0} });
                                          // loads the font BEFORE writing characters
const card = relai.autoLayout("VERTICAL", { name: "Card", itemSpacing: 8 });
                                          // auto-layout frame, both axes hugging
relai.set(node, { layoutMode: "HORIZONTAL", width: 320, opacity: 0.9 });
                                          // layoutMode applied first; width/height via resize()
relai.hug(node);                          // HUG that sticks — call after appending children
relai.focusRing(button);                  // clipsContent + double spread shadows that render
const page = await relai.page(p => p.children.some(c => c.name === "Button"));
                                          // find pages by CONTENT — names get renamed
const titles = relai.query('FRAME[name^=Card] > TEXT');
                                          // CSS-like search on the current page; relai.query(node, sel) scopes to a subtree.
                                          // Supported: TYPE, *, [name=] [name*=] [name^=] [name$=], descendant, >, comma.
                                          // NOT supported: pseudo-classes, dot-paths, sibling combinators — use findAll.
relai.placeholder(section);               // construction veil so the designer sees work-in-progress
relai.placeholder(section, false);        // ALWAYS remove when the section is done
```

Two important facts: **scripts are NOT atomic** — on error, changes made before the throw persist, so keep scripts small and clean up after failures; and results may carry a `warnings` array for silent mistakes the lint catches on relai-created nodes and any node ids you return (e.g. spread shadows on a non-clipping frame). Convention: **return every created/mutated node id** (`return { createdNodeIds: [...] }`) — it powers both follow-up calls and the lint.

## Pitfalls that throw (or silently do the wrong thing)

When one of these throws inside `execute_figma`, the error already carries the remedy as a `Hint:` — this list is generated from the same registry (`packages/shared/src/pitfalls.ts`).

<!-- PITFALLS:START -->
- **Editing text without loading its font throws** (`unloaded font`). `await figma.loadFontAsync(textNode.fontName)` first; new TextNodes default to Inter Regular; when `fontName === figma.mixed`, load every font from `getRangeAllFontNames()`.
- **`getNodeById` throws in dynamic-page mode** — always `await figma.getNodeByIdAsync(id)`.
- **Traversing a non-current page throws until you `await page.loadAsync()`** — `figma.currentPage` is always loaded, other pages are not.
- **`layoutSizingHorizontal/Vertical` throw without auto-layout** — FILL requires the parent to have a `layoutMode`, HUG requires it on the node itself.
- **`createPage()` throws on the free plan once a file has 3 pages** — reuse an existing page instead.
- **`width`/`height` are read-only** — use `node.resize(w, h)`.
- **`figma.mixed` is a Symbol** returned by `fontSize`, `cornerRadius`, `fills` etc. when values differ across ranges/children — check `=== figma.mixed` before use; never JSON-serialize it.
- **Exact-name lookups are fragile** — designers rename pages and layers freely; locate nodes by type/content instead of `name ===`.
- **Stale node ids throw `does not exist`** — nodes get deleted while you work; re-read before editing and check `node.removed`.
- **Nodes are non-extensible** — `node.myCustomProp = x` throws `object is not extensible`; use `setPluginData` or return the data instead.
- **Shadow `spread` renders only on shapes or frames with `clipsContent: true`** — a focus ring built from spread shadows is invisible on a non-clipping frame/component.
- **`resize()` on an auto-layout frame silently pins that axis to FIXED**, overriding `primaryAxisSizingMode: "AUTO"`. Append children first, then set `layoutSizingHorizontal = "HUG"`; use `resize` only for the fixed cross-axis.
- **Per-corner radius** (`topLeftRadius` …) only exists on RectangleCornerMixin nodes (rectangles, frames, components) — polygons, stars and lines throw.
- **Instance children can't be added or removed** — detach first, or edit the main component.
- **Figma's slot feature (Convert to slot, ⇧⌘S) has no Plugin API** — no createSlot/convertToSlot exists (verified against typings 1.123 and at runtime, 2026-07). Scaffold a frame named "Slot", select it for the designer (navigate select), and let them press the shortcut.
<!-- PITFALLS:END -->

Also: `resize(w, h)` throws on `w <= 0 || h <= 0`; `layoutWrap = "WRAP"` is HORIZONTAL-only, `counterAxisAlignItems = "BASELINE"` too; writing to `locked` nodes is allowed by the API but surprises designers — check first.

## Return values

Return JSON-serializable data (the bridge summarizes nodes automatically and truncates >50k chars). Prefer returning `{ id, name, type }` summaries over whole nodes. `console.log` is captured and returned in `logs`.

---

*Tool parameter contracts are deliberately not duplicated in this document — every tool is self-describing over MCP, and `npx figma-relai docs <tool>` (or the generated `docs/manifest.json`) is the always-current reference.*
