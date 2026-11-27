import { beforeEach, describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import "./handlers/node-create.js";

// Just enough of the figma global to make shapes: each create call returns a
// node that starts with Figma's default grey fill and no stroke.
type FakeShape = { id: string; name: string; fills: unknown[]; strokes: unknown[]; resize: () => void };
let made: FakeShape[];

const GREY = { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 };

beforeEach(() => {
  made = [];
  const shape = () => {
    const node: FakeShape = { id: `1:${made.length + 1}`, name: "", fills: [GREY], strokes: [], resize: () => {} };
    made.push(node);
    return node;
  };
  (globalThis as unknown as { figma: unknown }).figma = {
    root: { getSharedPluginData: () => "" },
    createRectangle: shape,
    createEllipse: shape,
    createPolygon: shape,
    createStar: shape,
  };
});

describe("create_node shapes take fillColor and strokeColor", () => {
  for (const command of ["create_rectangle", "create_ellipse", "create_polygon", "create_star"]) {
    test(command, async () => {
      await dispatch(command, {
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        fillColor: { r: 1, g: 0, b: 0 },
        strokeColor: { r: 0, g: 0, b: 1, a: 0.5 },
      });
      expect(made[0].fills).toEqual([{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }]);
      expect(made[0].strokes).toEqual([{ type: "SOLID", color: { r: 0, g: 0, b: 1 }, opacity: 0.5 }]);
    });

    test(`${command} without colors keeps Figma's default fill`, async () => {
      await dispatch(command, { x: 0, y: 0, width: 40, height: 40 });
      expect(made[0].fills).toEqual([GREY]);
      expect(made[0].strokes).toEqual([]);
    });
  }
});
