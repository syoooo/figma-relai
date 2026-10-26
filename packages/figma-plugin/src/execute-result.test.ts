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

  // Figma's styles keep their fields on the prototype, as getters; a plain
  // object literal does not show that, so this fake does.
  class HostPaintStyle {
    get id() {
      return "S:abc,";
    }
    get type() {
      return "PAINT";
    }
    get name() {
      return "Brand/Primary";
    }
    get key() {
      return "abc";
    }
    get description() {
      return "";
    }
    get remote() {
      return false;
    }
    get paints() {
      return [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }];
    }
    getPluginData() {
      return "";
    }
  }

  test("a style whose fields sit on the prototype comes back with them", () => {
    const expected = {
      id: "S:abc,",
      type: "PAINT",
      name: "Brand/Primary",
      key: "abc",
      description: "",
      remote: false,
      paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
    };
    expect(serializeResult(new HostPaintStyle())).toEqual(expected);
    expect(serializeResult({ found: new HostPaintStyle() })).toEqual({ found: expected });
  });
});
