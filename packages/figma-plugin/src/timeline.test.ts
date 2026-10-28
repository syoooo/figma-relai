import { expect, test } from "bun:test";
import type { WriteLogWhy } from "@figma-relai/shared";
import { appendWriteLog } from "./handlers/timeline.js";

test("a write-log entry keeps why it did not run, and entries without one stay as they were", async () => {
  const saved: unknown[] = [];
  (globalThis as unknown as { figma: unknown }).figma = {
    root: { name: "Checkout v2" },
    clientStorage: {
      getAsync: async () => undefined,
      setAsync: async (_key: string, value: unknown) => saved.push(structuredClone(value)),
    },
  };
  // Hold the flush timer so it runs here, not after another test file has
  // replaced the figma global
  const realSetTimeout = globalThis.setTimeout;
  const flushes: Array<() => void> = [];
  globalThis.setTimeout = ((fn: () => void) => {
    flushes.push(fn);
    return 1;
  }) as unknown as typeof setTimeout;
  try {
    const whys: WriteLogWhy[] = ["denied", "timeout", "stopped", "undelivered"];
    for (const why of whys) await appendWriteLog("set_text", ["1:2"], why === "undelivered", undefined, why);
    await appendWriteLog("set_text", ["1:3"], true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  // What reaches plugin storage is what list_write_log later reads back
  expect(flushes).toHaveLength(1);
  flushes[0]!();
  const entries = (saved[0] as Array<Record<string, unknown>>).slice(0, 5);
  expect(entries.map((e) => e.why)).toEqual([undefined, "undelivered", "stopped", "timeout", "denied"]);
  expect("why" in entries[0]!).toBe(false);
  expect(entries[1]).toMatchObject({ cmd: "set_text", file: "Checkout v2", ok: true, why: "undelivered" });
});
