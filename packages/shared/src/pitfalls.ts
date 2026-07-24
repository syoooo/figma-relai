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
];

// First matching pitfall's hint, or null. Doc-only entries never match.
export function pitfallHint(message: string): string | null {
  for (const p of PITFALLS) {
    if (p.pattern && new RegExp(p.pattern, "i").test(message)) return p.hint;
  }
  return null;
}
