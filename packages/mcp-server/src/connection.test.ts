import { describe, expect, test } from "bun:test";
import { RelaiError, type ResultMeta } from "@figma-relai/shared";
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

describe("routeResponse error codes", () => {
  async function rejection(error: unknown): Promise<RelaiError> {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "e");
    routeResponse({ id: "e", error }, tracker);
    return promise.then(
      () => {
        throw new Error("expected a rejection");
      },
      (err) => err as RelaiError
    );
  }

  test("rejects with the plugin's code, keeping the text", async () => {
    const err = await rejection({
      message: "Page is a no-go zone",
      command: "create_frame",
      code: "guard_blocked",
    });
    expect(err).toBeInstanceOf(RelaiError);
    expect(err.code).toBe("guard_blocked");
    expect(err.outcome).toBe("not_applied");
    expect(err.message).toBe("[create_frame] Page is a no-go zone");
  });

  test("the plugin's outcome and partial flag override the code's defaults", async () => {
    const err = await rejection({ message: "Stopped", code: "cancelled", outcome: "applied", partial: true });
    expect(err.outcome).toBe("applied");
    expect(err.partial).toBe(true);
  });

  test("an outcome outside the three values is ignored", async () => {
    const err = await rejection({ message: "x", code: "handler_error", outcome: "maybe" });
    expect(err.outcome).toBe("unknown");
  });

  test("infers a code for plugins that predate codes", async () => {
    expect((await rejection("Denied by designer")).code).toBe("denied_by_designer");
    const unknown = await rejection({ message: "something odd" });
    expect(unknown.code).toBe("handler_error");
    expect(unknown.outcome).toBe("unknown");
  });

  test("passes the plugin's result metadata along", async () => {
    const tracker = new RequestTracker();
    const promise = trackedPromise(tracker, "m");
    const seen: Array<[string, ResultMeta]> = [];
    const meta: ResultMeta = { protocol: 2, write: true, file: "Checkout", outcome: "applied" };
    routeResponse({ id: "m", result: { ok: true }, meta }, tracker, (id, m) => seen.push([id, m]));
    await expect(promise).resolves.toEqual({ ok: true });
    expect(seen).toEqual([["m", meta]]);
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
    expect(got.code).toBe("plugin_absent");
  });

  test("several live plugins — name them instead of guessing", () => {
    const got = chooseRepairRoom("old-room", [
      room("a", true, "Design system"),
      room("b", true, "other"),
    ]);
    expect(got.room).toBeUndefined();
    expect(got.error).toContain('"Design system" (room a)');
    expect(got.error).toContain('"other" (room b)');
    expect(got.code).toBe("room_ambiguous");
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
