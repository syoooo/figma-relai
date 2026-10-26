import { describe, expect, test } from "bun:test";
import { serializeResult } from "./handlers/execute-code.js";
import { serializeNode } from "./utils/node-helpers.js";

// What execute_figma hands back: Figma's own node objects become budgeted
// summaries, everything else a script returns comes back as it is.
const fakeNode = () => ({
  id: "1:2",
  name: "Card",
  type: "FRAME",
  parent: null,
  visible: true,
  children: [],
  getPluginData: () => "",
});

describe("execute_figma results", () => {
  test("a plain object with id, type and parent comes back whole", () => {
    const row = { id: "1:2", type: "FRAME", parent: "0:1", extra: "kept" };
    expect(serializeResult(row)).toEqual(row);
  });

  test("plain rows inside an array keep their fields", () => {
    const rows = [
      { id: "1:2", type: "TEXT", parent: "1:1", chars: 12 },
      { id: "1:3", type: "TEXT", parent: "1:1", chars: 40 },
    ];
    expect(serializeResult({ rows })).toEqual({ rows });
  });

  test("a real node (it carries Figma's methods) is summarized", () => {
    const node = fakeNode();
    expect(serializeResult(node)).toEqual(serializeNode(node as unknown as SceneNode));
    expect(serializeResult({ found: node })).toEqual({ found: serializeNode(node as unknown as SceneNode) });
  });

  test("a style is not taken for a node: it has methods but no parent", () => {
    const style = { id: "S:abc,", type: "PAINT", name: "Brand/Primary", paints: [], getPluginData: () => "" };
    expect(serializeResult(style)).toEqual({ id: "S:abc,", type: "PAINT", name: "Brand/Primary", paints: [] });
  });
});
