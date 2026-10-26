import { beforeEach, describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import "./handlers/annotations.js";

// Just enough of the figma global for annotation writes: node lookup, where a
// node that takes annotations carries an `annotations` array, and a root with
// no no-go zones (the page guard runs on every dispatch once it is loaded).
type FakeNode = { id: string; name: string; type: string; annotations?: Array<Record<string, unknown>> };
let nodes: Map<string, FakeNode>;

beforeEach(() => {
  nodes = new Map<string, FakeNode>([
    ["1:1", { id: "1:1", name: "Card", type: "FRAME", annotations: [] }],
    ["1:2", { id: "1:2", name: "Cluster", type: "GROUP" }],
  ]);
  (globalThis as unknown as { figma: unknown }).figma = {
    root: { getSharedPluginData: () => "" },
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
  };
});

describe("annotate set", () => {
  test("writes the label as a labelMarkdown string", async () => {
    await dispatch("set_annotation", { nodeId: "1:1", labelMarkdown: "**Use** the 8px grid" });
    expect(nodes.get("1:1")!.annotations).toEqual([{ labelMarkdown: "**Use** the 8px grid" }]);
  });

  test("leaves an unset categoryId off and keeps a given one", async () => {
    await dispatch("set_annotation", { nodeId: "1:1", labelMarkdown: "a" });
    await dispatch("set_annotation", { nodeId: "1:1", labelMarkdown: "b", categoryId: "cat:1" });
    const [first, second] = nodes.get("1:1")!.annotations!;
    expect("categoryId" in first).toBe(false);
    expect("properties" in first).toBe(false);
    expect(second).toEqual({ labelMarkdown: "b", categoryId: "cat:1" });
  });

  test("keeps existing annotations, written back with one label each", async () => {
    // Figma reads an annotation back with both label and labelMarkdown.
    nodes.get("1:1")!.annotations = [
      { label: "old", labelMarkdown: "old" },
      { label: "plain only" },
      { properties: [{ type: "width" }] },
    ];
    await dispatch("set_annotation", { nodeId: "1:1", labelMarkdown: "new" });
    expect(nodes.get("1:1")!.annotations).toStrictEqual([
      { labelMarkdown: "old" },
      { label: "plain only" },
      { properties: [{ type: "width" }] },
      { labelMarkdown: "new" },
    ]);
  });

  test("a node type without annotations is an error naming the type", async () => {
    await expect(dispatch("set_annotation", { nodeId: "1:2", labelMarkdown: "x" })).rejects.toThrow("GROUP");
  });
});

describe("annotate set_multiple", () => {
  test("writes labelMarkdown and reports per item, telling not-found from unsupported", async () => {
    const out = (await dispatch("set_multiple_annotations", {
      annotations: [
        { nodeId: "1:1", labelMarkdown: "ok" },
        { nodeId: "1:2", labelMarkdown: "group" },
        { nodeId: "9:9", labelMarkdown: "gone" },
      ],
    })) as Array<{ nodeId: string; success: boolean; error?: string }>;
    expect(nodes.get("1:1")!.annotations).toEqual([{ labelMarkdown: "ok" }]);
    expect(out[0]).toEqual({ nodeId: "1:1", success: true });
    expect(out[1].success).toBe(false);
    expect(out[1].error).toContain("GROUP");
    expect(out[2]).toEqual({ nodeId: "9:9", success: false, error: "Not found" });
  });
});
