import { describe, expect, test } from "bun:test";
import { PITFALLS, pitfallHint } from "./pitfalls.js";

describe("pitfallHint", () => {
  test("maps real Figma error messages to remedies", () => {
    expect(
      pitfallHint('in set_characters: Cannot write to node with unloaded font "Inter Regular".')
    ).toContain("loadFontAsync");
    expect(
      pitfallHint("Cannot call getNodeById in documentAccess: dynamic-page mode.")
    ).toContain("getNodeByIdAsync");
    expect(
      pitfallHint("Cannot access children of a page that has not been explicitly loaded.")
    ).toContain("loadAsync");
    expect(
      pitfallHint("The Starter plan only comes with 3 pages. Upgrade to Professional…")
    ).toContain("reuse an existing page");
    expect(
      pitfallHint("cannot read property 'loadAsync' of undefined")
    ).toContain("type/content");
    expect(
      pitfallHint("Cannot assign to read only property 'width' of object")
    ).toContain("resize");
  });

  test("unknown errors return null", () => {
    expect(pitfallHint("something completely unrelated happened")).toBeNull();
    expect(pitfallHint("")).toBeNull();
  });

  test("registry entries are well-formed", () => {
    for (const p of PITFALLS) {
      expect(p.doc.length).toBeGreaterThan(20);
      if (p.pattern) {
        expect(() => new RegExp(p.pattern!, "i")).not.toThrow();
        expect(p.hint.length).toBeGreaterThan(20);
      }
    }
  });
});
