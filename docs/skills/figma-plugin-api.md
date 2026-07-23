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

## Pitfalls that throw (or silently do the wrong thing)

- **Shadow `spread` renders only on shapes or frames with `clipsContent: true`** — a focus ring built from spread shadows is invisible on a non-clipping frame/component.
- **`resize()` on an auto-layout frame pins that axis to FIXED**, silently overriding `primaryAxisSizingMode: "AUTO"`. To hug content, append children first, then set `layoutSizingHorizontal = "HUG"` (and use `resize` only for the fixed cross-axis).
- `resize(w, h)` with `w <= 0 || h <= 0`; resizing nodes without `resize` (e.g. some text auto-resize modes — set `textAutoResize` first).
- Setting layout-child props (`layoutSizing*`, `layoutAlign`) when the **parent** has `layoutMode: "NONE"`.
- `layoutWrap = "WRAP"` on VERTICAL; `counterAxisAlignItems = "BASELINE"` on VERTICAL.
- Editing `characters` without loading fonts → "unloaded font".
- Per-corner radius (`topLeftRadius` …) on nodes without RectangleCornerMixin (polygons, stars, lines).
- Touching `node.removed === true` nodes; writing to `locked` nodes is allowed by API but surprises designers — check first.
- `instance.children` mutations — detach first or edit the main component.

## Return values

Return JSON-serializable data (the bridge summarizes nodes automatically and truncates >50k chars). Prefer returning `{ id, name, type }` summaries over whole nodes. `console.log` is captured and returned in `logs`.
