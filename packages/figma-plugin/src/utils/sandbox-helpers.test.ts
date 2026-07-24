import { describe, expect, test } from "bun:test";
import { lintCreatedNodes, setProps, queryNodes, type QueryNode } from "./sandbox-helpers.js";

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

describe("queryNodes (selector subset)", () => {
  // page > [Card A(FRAME) > [Title(TEXT), Body(TEXT)], Card B(FRAME) > [Group(GROUP) > [Title(TEXT)]], Hero(RECTANGLE)]
  function tree() {
    const mk = (type: string, name: string, children: QueryNode[] = []): QueryNode => {
      const n: QueryNode = { type, name, children, parent: null };
      for (const c of children) (c as { parent: QueryNode }).parent = n;
      return n;
    };
    const titleA = mk("TEXT", "Title");
    const body = mk("TEXT", "Body");
    const cardA = mk("FRAME", "Card A", [titleA, body]);
    const titleB = mk("TEXT", "Title");
    const group = mk("GROUP", "Group", [titleB]);
    const cardB = mk("FRAME", "Card B", [group]);
    const hero = mk("RECTANGLE", "Hero");
    const page = mk("PAGE", "Page 1", [cardA, cardB, hero]);
    return { page, cardA, cardB, titleA, titleB, body, hero, group };
  }

  test("type and wildcard", () => {
    const { page } = tree();
    expect(queryNodes(page, "TEXT").length).toBe(3);
    expect(queryNodes(page, "frame").length).toBe(2); // case-insensitive
    expect(queryNodes(page, "*").length).toBe(7);
  });

  test("name attribute operators", () => {
    const { page, cardA, hero } = tree();
    expect(queryNodes(page, "[name=Card A]")).toEqual([cardA]);
    expect(queryNodes(page, "FRAME[name^=Card]").length).toBe(2);
    expect(queryNodes(page, "[name*=ero]")).toEqual([hero]);
    expect(queryNodes(page, "[name$=B]").map((n) => n.name)).toEqual(["Card B"]);
  });

  test("descendant vs direct child", () => {
    const { page, titleA, titleB } = tree();
    expect(queryNodes(page, "FRAME TEXT[name=Title]")).toEqual([titleA, titleB]);
    expect(queryNodes(page, "FRAME > TEXT[name=Title]")).toEqual([titleA]); // titleB is under GROUP
  });

  test("empty and garbage selectors match nothing instead of crashing", () => {
    const { page } = tree();
    expect(queryNodes(page, "")).toEqual([]);
    expect(queryNodes(page, "   ")).toEqual([]);
    expect(queryNodes(page, ",")).toEqual([]);
    expect(queryNodes(page, "[[[")).toEqual([]);
    expect(queryNodes(page, "> >")).toEqual([]);
    expect(queryNodes(page, "NOSUCHTYPE, ")).toEqual([]);
  });

  test("comma union and subtree scoping", () => {
    const { page, cardB } = tree();
    expect(queryNodes(page, "RECTANGLE, GROUP").length).toBe(2);
    expect(queryNodes(cardB, "TEXT").length).toBe(1); // scoped to Card B
    expect(queryNodes(cardB, "FRAME").length).toBe(0); // scope itself not matched
  });
});
