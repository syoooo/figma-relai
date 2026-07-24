import { describe, expect, test } from "bun:test";
import { lintCreatedNodes, setProps, CREATE_METHODS } from "./sandbox-helpers.js";

describe("lintCreatedNodes", () => {
  const spread = { type: "DROP_SHADOW", spread: 4, visible: true };

  test("flags spread shadows on non-clipping frames", () => {
    const warnings = lintCreatedNodes([
      { id: "1:1", name: "ring", effects: [spread], clipsContent: false },
    ]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("clipsContent");
    expect(warnings[0]).toContain("1:1");
  });

  test("stays silent when clipsContent is true, spread is 0, or effect hidden", () => {
    expect(lintCreatedNodes([
      { id: "1", name: "ok", effects: [spread], clipsContent: true },
      { id: "2", name: "no-spread", effects: [{ type: "DROP_SHADOW", spread: 0 }], clipsContent: false },
      { id: "3", name: "hidden", effects: [{ type: "DROP_SHADOW", spread: 4, visible: false }], clipsContent: false },
      { id: "4", name: "shape-no-clip-prop", effects: [spread] }, // rectangles: no clipsContent — spread renders
    ])).toEqual([]);
  });
});

describe("setProps ordering", () => {
  function fakeNode() {
    const ops: string[] = [];
    return {
      ops,
      width: 100,
      height: 50,
      resize(w: number, h: number) { ops.push(`resize(${w},${h})`); this.width = w; this.height = h; },
      set layoutMode(v: unknown) { ops.push(`layoutMode=${v}`); },
      set opacity(v: unknown) { ops.push(`opacity=${v}`); },
    };
  }

  test("layoutMode first, width/height routed through resize, rest after", () => {
    const n = fakeNode();
    setProps(n as never, { opacity: 0.5, width: 320, layoutMode: "HORIZONTAL" });
    expect(n.ops).toEqual(["layoutMode=HORIZONTAL", "resize(320,50)", "opacity=0.5"]);
  });

  test("width-only resize keeps current height", () => {
    const n = fakeNode();
    setProps(n as never, { height: 80 });
    expect(n.ops).toEqual(["resize(100,80)"]);
  });
});

test("CREATE_METHODS covers the common factories", () => {
  for (const m of ["createFrame", "createText", "createComponent", "combineAsVariants", "createNodeFromSvg"]) {
    expect(CREATE_METHODS.has(m)).toBe(true);
  }
});
