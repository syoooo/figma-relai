import { describe, expect, test } from "bun:test";
import { formatFigmaError, routeResponse } from "./connection.js";
import { RequestTracker } from "./request-tracker.js";

function trackedPromise(tracker: RequestTracker, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    tracker.add(id, resolve, reject, 5000);
  });
}

describe("routeResponse", () => {
  test("rejects on an error-only response (no result field)", async () => {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "req-1");
    routeResponse({ id: "req-1", error: "in set_characters: font is not loaded" }, tracker);
    await expect(promise).rejects.toThrow("font is not loaded");
  });

  test.each([0, "", false])("resolves falsy result %p", async (result) => {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "req-2");
    routeResponse({ id: "req-2", result }, tracker);
    await expect(promise).resolves.toBe(result);
  });

  test("resolves a normal object result", async () => {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "req-3");
    routeResponse({ id: "req-3", result: { id: "1:1", name: "Frame" } }, tracker);
    await expect(promise).resolves.toEqual({ id: "1:1", name: "Frame" });
  });

  test("rejects with error even when a result is also present", async () => {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "req-4");
    routeResponse({ id: "req-4", result: {}, error: "boom" }, tracker);
    await expect(promise).rejects.toThrow("boom");
  });

  test("ignores responses for unknown ids", () => {
    const tracker = new RequestTracker();
    routeResponse({ id: "unknown", result: 1 }, tracker);
    expect(tracker.size).toBe(0);
  });

  test("ignores responses without an id", () => {
    const tracker = new RequestTracker();
    routeResponse({ result: 1 }, tracker);
    expect(tracker.size).toBe(0);
  });
});

describe("formatFigmaError", () => {
  test("passes plain strings through", () => {
    expect(formatFigmaError("Unknown command: foo")).toBe("Unknown command: foo");
  });

  test("formats structured errors with command and node context", () => {
    const formatted = formatFigmaError({
      message: "Cannot set layoutSizingHorizontal",
      command: "set_layout_sizing",
      nodeId: "123:45",
      nodeType: "RECTANGLE",
    });
    expect(formatted).toBe(
      "[set_layout_sizing] Cannot set layoutSizingHorizontal (node 123:45, type RECTANGLE)"
    );
  });

  test("omits missing context fields", () => {
    expect(formatFigmaError({ message: "boom", command: "resize_node" })).toBe(
      "[resize_node] boom"
    );
  });
});
