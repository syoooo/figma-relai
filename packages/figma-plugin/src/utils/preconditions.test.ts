import { describe, expect, test } from "bun:test";
import {
  checkNodeType,
  checkSupports,
  checkAutoLayoutFrame,
  checkAutoLayoutChild,
  checkInAutoLayout,
  checkHorizontalOnly,
  type NodeLike,
} from "./preconditions.js";

const rect = (over: Partial<NodeLike> = {}): NodeLike => ({
  id: "1:1",
  name: "Rect",
  type: "RECTANGLE",
  ...over,
});

const frame = (over: Partial<NodeLike> = {}): NodeLike => ({
  id: "1:2",
  name: "Frame",
  type: "FRAME",
  layoutMode: "NONE",
  ...over,
});

describe("checkNodeType", () => {
  test("passes for allowed types", () => {
    expect(checkNodeType(rect(), ["RECTANGLE", "FRAME"])).toBeNull();
  });

  test("names actual and expected types on mismatch", () => {
    const msg = checkNodeType(rect(), ["INSTANCE"]);
    expect(msg).toContain("RECTANGLE");
    expect(msg).toContain("INSTANCE");
    expect(msg).toContain("1:1");
  });
});

describe("checkSupports", () => {
  test("passes when the property exists", () => {
    expect(checkSupports(frame(), "layoutMode")).toBeNull();
  });

  test("names the node type when the property is missing", () => {
    const msg = checkSupports(rect(), "layoutMode");
    expect(msg).toContain("RECTANGLE");
    expect(msg).toContain("layoutMode");
  });
});

describe("checkAutoLayoutFrame", () => {
  test("passes for HORIZONTAL and VERTICAL", () => {
    expect(checkAutoLayoutFrame(frame({ layoutMode: "HORIZONTAL" }), "padding")).toBeNull();
    expect(checkAutoLayoutFrame(frame({ layoutMode: "VERTICAL" }), "padding")).toBeNull();
  });

  test("fails for NONE with a set_layout_mode suggestion", () => {
    const msg = checkAutoLayoutFrame(frame(), "padding");
    expect(msg).toContain("auto-layout");
    expect(msg).toContain("set_layout_mode");
  });

  test("fails for nodes without layoutMode", () => {
    expect(checkAutoLayoutFrame(rect(), "padding")).not.toBeNull();
  });
});

describe("checkAutoLayoutChild", () => {
  test("passes when the parent has auto-layout", () => {
    const child = rect({ parent: frame({ layoutMode: "HORIZONTAL" }) });
    expect(checkAutoLayoutChild(child, "layoutSizing FILL")).toBeNull();
  });

  test("fails when the parent has layoutMode NONE, naming the parent", () => {
    const child = rect({ parent: frame({ name: "Container" }) });
    const msg = checkAutoLayoutChild(child, "layoutSizing FILL");
    expect(msg).toContain("Container");
    expect(msg).toContain("NONE");
  });

  test("fails when there is no parent", () => {
    const msg = checkAutoLayoutChild(rect(), "layoutSizing FILL");
    expect(msg).toContain("no parent");
  });
});

describe("checkInAutoLayout", () => {
  test("passes for an auto-layout frame itself", () => {
    expect(checkInAutoLayout(frame({ layoutMode: "VERTICAL" }), "layoutSizing")).toBeNull();
  });

  test("passes for a child of an auto-layout frame", () => {
    const child = rect({ parent: frame({ layoutMode: "HORIZONTAL" }) });
    expect(checkInAutoLayout(child, "layoutSizing")).toBeNull();
  });

  test("fails when neither the node nor its parent has auto-layout", () => {
    const child = rect({ parent: frame() });
    expect(checkInAutoLayout(child, "layoutSizing")).not.toBeNull();
  });
});

describe("checkHorizontalOnly", () => {
  test("passes for HORIZONTAL layout", () => {
    expect(
      checkHorizontalOnly(frame({ layoutMode: "HORIZONTAL" }), "layoutWrap", "WRAP")
    ).toBeNull();
  });

  test("fails for VERTICAL layout, naming the value and current mode", () => {
    const msg = checkHorizontalOnly(frame({ layoutMode: "VERTICAL" }), "layoutWrap", "WRAP");
    expect(msg).toContain("WRAP");
    expect(msg).toContain("VERTICAL");
  });

  test("fails for nodes without layoutMode", () => {
    expect(checkHorizontalOnly(rect(), "counterAxisAlignItems", "BASELINE")).not.toBeNull();
  });
});
