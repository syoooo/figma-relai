import { describe, expect, test } from "bun:test";
import { RelaiError } from "@figma-relai/shared";
import { RequestTracker } from "./request-tracker.js";
import { runInCommandSlot, type CommandSlot } from "./call-scope.js";

function track(tracker: RequestTracker, id: string, ms: number, code?: "timeout" | "relay_unresponsive") {
  return new Promise((resolve, reject) => tracker.add(id, resolve, reject, ms, code));
}

async function rejection(promise: Promise<unknown>): Promise<RelaiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RelaiError);
    return error as RelaiError;
  }
  throw new Error("expected a rejection");
}

describe("RequestTracker", () => {
  test("timeout rejects with code timeout and outcome unknown", async () => {
    const error = await rejection(track(new RequestTracker(), "a", 10));
    expect(error.code).toBe("timeout");
    expect(error.outcome).toBe("unknown");
    expect(error.retry).toBe("read_canvas_first");
    expect(error.message).toStartWith("Request to Figma timed out");
  });

  test("a relay request that times out is relay_unresponsive and not applied", async () => {
    const error = await rejection(track(new RequestTracker(), "a", 10, "relay_unresponsive"));
    expect(error.code).toBe("relay_unresponsive");
    expect(error.outcome).toBe("not_applied");
    expect(error.message).toContain("nothing changed");
  });

  test("extended timeout after progress also reports unknown", async () => {
    const tracker = new RequestTracker();
    const promise = track(tracker, "a", 1000);
    tracker.resetTimeout("a", 10);
    const error = await rejection(promise);
    expect(error.code).toBe("timeout");
    expect(error.outcome).toBe("unknown");
  });

  test("markCancelRequested shortens the wait to the grace period", async () => {
    const tracker = new RequestTracker();
    const promise = track(tracker, "a", 60000);
    tracker.markCancelRequested("a", 10);
    tracker.resetTimeout("a", 60000); // progress after Stop must not extend it
    const error = await rejection(promise);
    expect(error.code).toBe("cancel_unconfirmed");
    expect(error.outcome).toBe("unknown");
  });

  test("a second Stop for the same request keeps the first grace period", async () => {
    const tracker = new RequestTracker();
    const promise = track(tracker, "a", 60000);
    // The panel and the plugin both report the Stop
    expect(tracker.markCancelRequested("a", 10)).toBe(true);
    expect(tracker.markCancelRequested("a", 60000)).toBe(true);
    const error = await rejection(promise);
    expect(error.code).toBe("cancel_unconfirmed");
  });

  test("a real result inside the grace resolves and is marked as after Stop", async () => {
    const tracker = new RequestTracker();
    const slot: CommandSlot = { closed: false };
    const promise = runInCommandSlot(slot, () => track(tracker, "a", 60000));
    tracker.markCancelRequested("a", 1000);
    tracker.resolve("a", { done: true });
    await expect(promise).resolves.toEqual({ done: true });
    expect(slot.settled).toEqual({ id: "a", meta: undefined, cancelRequested: true });
  });

  test("a closed link rejects every request with link_dropped, keeping the reason", async () => {
    const tracker = new RequestTracker();
    const a = track(tracker, "a", 60000);
    const b = track(tracker, "b", 60000);
    tracker.rejectAll("The link to Figma dropped");
    for (const error of [await rejection(a), await rejection(b)]) {
      expect(error.code).toBe("link_dropped");
      expect(error.outcome).toBe("unknown");
      expect(error.message).toBe("The link to Figma dropped");
    }
    expect(tracker.size).toBe(0);
  });

  test("the last request settled in a slot is recorded with its result metadata", async () => {
    const tracker = new RequestTracker();
    const slot: CommandSlot = { closed: false };
    const meta = { protocol: 2 as const, write: true, file: "Checkout", outcome: "applied" as const };
    await runInCommandSlot(slot, async () => {
      const join = track(tracker, "join-1", 1000, "relay_unresponsive");
      tracker.resolve("join-1", "joined");
      await join;
      const command = track(tracker, "cmd-1", 1000);
      tracker.resolve("cmd-1", {}, meta);
      await command;
    });
    expect(slot.settled).toEqual({ id: "cmd-1", meta, cancelRequested: undefined });
  });

  test("a closed slot ignores requests that settle later", async () => {
    const tracker = new RequestTracker();
    const slot: CommandSlot = { closed: false };
    const late = runInCommandSlot(slot, async () => {
      const first = track(tracker, "cmd-1", 1000);
      tracker.resolve("cmd-1", 1);
      await first;
      return track(tracker, "probe-1", 1000);
    });
    while (!tracker.has("probe-1")) await Promise.resolve();
    slot.closed = true;
    tracker.resolve("probe-1", 2);
    await late;
    expect(slot.settled?.id).toBe("cmd-1");
  });
});
