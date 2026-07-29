import { describe, it, expect } from "bun:test";
import { suggestScopes, scopeWarning } from "./variables.js";

describe("suggestScopes", () => {
  it("reads the scope out of the token's own name", () => {
    expect(suggestScopes("Card/border-radius", "FLOAT")).toEqual(["CORNER_RADIUS"]);
    expect(suggestScopes("Button/spacing/content-gap/md", "FLOAT")).toEqual(["GAP"]);
    expect(suggestScopes("Divider/border-width/sm", "FLOAT")).toEqual(["STROKE_FLOAT"]);
    expect(suggestScopes("Icon/size/md", "FLOAT")).toEqual(["WIDTH_HEIGHT"]);
    expect(suggestScopes("Link/text-color/hovered", "COLOR")).toEqual(["TEXT_FILL"]);
    expect(suggestScopes("Input/border-color/focused", "COLOR")).toEqual(["STROKE_COLOR"]);
    expect(suggestScopes("General/background-color/surface-default", "COLOR")).toEqual([
      "FRAME_FILL",
      "SHAPE_FILL",
    ]);
  });

  it("keeps a guess inside the scopes its type can take", () => {
    // "border-width" reads as a stroke float, but a COLOR can't take one
    expect(suggestScopes("Card/border-width", "COLOR")).toBeNull();
  });

  it("says nothing when the name gives nothing away", () => {
    expect(suggestScopes("Brand/token-7", "FLOAT")).toBeNull();
  });

  it("has no opinion about types without scopes", () => {
    expect(suggestScopes("Button/hasIcon", "BOOLEAN")).toBeNull();
  });
});

describe("scopeWarning", () => {
  it("names the scope when the name is legible", () => {
    const w = scopeWarning("Dialog/radius", "FLOAT");
    expect(w).toContain("ALL_SCOPES");
    expect(w).toContain("CORNER_RADIUS");
    expect(w).toContain("set_scopes");
  });

  it("falls back to the menu for that type", () => {
    const w = scopeWarning("Brand/token-7", "COLOR")!;
    expect(w).toContain("TEXT_FILL");
    expect(w).not.toContain("CORNER_RADIUS");
  });

  it("stays quiet where scopes don't apply", () => {
    expect(scopeWarning("Button/hasIcon", "BOOLEAN")).toBeNull();
  });
});
