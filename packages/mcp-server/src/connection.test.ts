import { describe, expect, test } from "bun:test";
import { chooseRepairRoom, formatFigmaError, routeResponse } from "./connection.js";
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

describe("chooseRepairPairing", () => {
  const room = (r: string, hasPlugin: boolean, fileName?: string) =>
    ({ room: r, hasPlugin, fileName }) as never;

  test("the plugin moved rooms — follow it", () => {
    // Reopening the plugin, or switching a file to one of its branches, hands
    // it a fresh room. ensureRoom() only picks a room when there is none, so
    // without this every command reported "the plugin is not open" while
    // join_room cheerfully listed the live one.
    const got = chooseRepairRoom("prime-nexus-65c2c075", [
      room("prime-nexus-65c2c075", false),
      room("clear-grid-390167c5", true, "refine"),
    ]);
    expect(got.room).toBe("clear-grid-390167c5");
  });

  test("genuinely gone — say so, and do not invent a room", () => {
    const got = chooseRepairRoom("old-room", [room("old-room", false)]);
    expect(got.room).toBeUndefined();
    expect(got.error).toContain("not open");
  });

  test("several live plugins — name them instead of guessing", () => {
    const got = chooseRepairRoom("old-room", [
      room("a", true, "gin"),
      room("b", true, "other"),
    ]);
    expect(got.room).toBeUndefined();
    expect(got.error).toContain('"gin" (room a)');
    expect(got.error).toContain('"other" (room b)');
  });

  test("never re-pairs to the stale room itself", () => {
    const got = chooseRepairRoom("old-room", [room("old-room", true)]);
    expect(got.room).toBeUndefined();
  });

  // The guard that keeps this from becoming a different bug lives at the call
  // site: a room the CALLER named is never traded away. Someone who joins the
  // room of a file they are about to open is waiting for it, and following
  // whichever plugin happens to be live would put their writes in the wrong
  // document. Only rooms we picked for them are followed. (Caught by the
  // adversarial smoke, W3: an explicit join to an empty room must fail fast.)
});
