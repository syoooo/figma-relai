import { describe, expect, test } from "bun:test";
import { styleCountsFrom } from "./context.js";

describe("styleCountsFrom", () => {
  test("plugin object shape {paintStyles, textStyles, ...}", () => {
    expect(
      styleCountsFrom({
        paintStyles: [{ id: "a" }],
        textStyles: [{ id: "b" }, { id: "c" }],
        effectStyles: [],
        gridStyles: [],
      })
    ).toEqual({ paint: 1, text: 2, effect: 0, grid: 0, total: 3 });
  });

  test("legacy flat array shape", () => {
    expect(
      styleCountsFrom([{ type: "PAINT" }, { type: "TEXT" }, { type: "TEXT" }, { type: "GRID" }])
    ).toEqual({ paint: 1, text: 2, effect: 0, grid: 1, total: 4 });
  });

  test("null / garbage → zeros", () => {
    expect(styleCountsFrom(null).total).toBe(0);
    expect(styleCountsFrom(undefined).total).toBe(0);
    expect(styleCountsFrom("nope").total).toBe(0);
  });
});
