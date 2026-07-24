import { describe, expect, test } from "bun:test";
import { mapPropertiesToCommands, propertiesSchema } from "./properties.js";

describe("mapPropertiesToCommands", () => {
  test("empty properties → no commands", () => {
    expect(mapPropertiesToCommands("1:1", {})).toEqual([]);
  });

  test("layoutMode is ordered before padding/align/sizing", () => {
    const calls = mapPropertiesToCommands("1:1", {
      paddingTop: 8,
      layoutSizingHorizontal: "FILL",
      layoutMode: "HORIZONTAL",
      primaryAxisAlignItems: "CENTER",
    });
    const order = calls.map((c) => c.command);
    expect(order.indexOf("set_layout_mode")).toBeLessThan(order.indexOf("set_padding"));
    expect(order.indexOf("set_layout_mode")).toBeLessThan(order.indexOf("set_axis_align"));
    expect(order.indexOf("set_layout_mode")).toBeLessThan(order.indexOf("set_layout_sizing"));
  });

  test("fills/strokes pass through raw, including [] to clear", () => {
    expect(mapPropertiesToCommands("1:1", { fills: [] })).toEqual([
      { command: "set_fills", params: { nodeId: "1:1", fills: [] } },
    ]);
    const paint = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }];
    expect(mapPropertiesToCommands("1:1", { fills: paint, strokes: [] })).toEqual([
      { command: "set_fills", params: { nodeId: "1:1", fills: paint, strokes: [] } },
    ]);
    expect(propertiesSchema.safeParse({ fills: [] }).success).toBe(true);
  });

  test("groups related fields into one command", () => {
    const calls = mapPropertiesToCommands("1:1", {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      paddingTop: 4,
      paddingLeft: 8,
    });
    expect(calls).toEqual([
      { command: "move_node", params: { nodeId: "1:1", x: 10, y: 20 } },
      { command: "resize_node", params: { nodeId: "1:1", width: 100, height: 50 } },
      { command: "set_padding", params: { nodeId: "1:1", paddingTop: 4, paddingLeft: 8 } },
    ]);
  });

  test("effects map to typed add_* commands; removeEffects precedes them", () => {
    const calls = mapPropertiesToCommands("1:1", {
      removeEffects: true,
      effects: [
        { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.3 }, offsetY: 4, radius: 8 },
        { type: "LAYER_BLUR", radius: 2 },
      ],
    });
    expect(calls.map((c) => c.command)).toEqual([
      "remove_effects",
      "add_drop_shadow",
      "add_blur",
    ]);
    expect(calls[1].params.offsetY).toBe(4);
    expect(calls[2].params).toEqual({ nodeId: "1:1", radius: 2 });
  });

  test("variable bindings fan out per property", () => {
    const calls = mapPropertiesToCommands("1:1", {
      boundVariables: { fills: "VariableID:1", width: "VariableID:2" },
    });
    expect(calls).toEqual([
      { command: "bind_variable", params: { nodeId: "1:1", property: "fills", variableId: "VariableID:1" } },
      { command: "bind_variable", params: { nodeId: "1:1", property: "width", variableId: "VariableID:2" } },
    ]);
  });

  test("strokeWeight alone still issues set_stroke_color with default color", () => {
    const calls = mapPropertiesToCommands("1:1", { strokeWeight: 2 });
    expect(calls[0].command).toBe("set_stroke_color");
    expect(calls[0].params.weight).toBe(2);
  });
});

describe("propertiesSchema", () => {
  test("rejects zero/negative dimensions", () => {
    expect(propertiesSchema.safeParse({ width: 0 }).success).toBe(false);
    expect(propertiesSchema.safeParse({ height: -5 }).success).toBe(false);
    expect(propertiesSchema.safeParse({ width: 10 }).success).toBe(true);
  });

  test("rejects unknown properties (strict)", () => {
    expect(propertiesSchema.safeParse({ fillColour: { r: 1, g: 0, b: 0 } }).success).toBe(false);
  });

  test("gradient requires at least 2 stops", () => {
    const one = propertiesSchema.safeParse({
      gradient: { gradientType: "GRADIENT_LINEAR", stops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }] },
    });
    expect(one.success).toBe(false);
  });
});
