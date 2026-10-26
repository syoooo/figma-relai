import { describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import {
  contentHash,
  notifySkippedSeeds,
  reconcileOnLoad,
  restoreFromRuleset,
  type RestoreResult,
  type Ruleset,
} from "./handlers/rulesets.js";
import {
  MEMORY_MAX_BYTES,
  MEMORY_MAX_ENTRIES,
  PRECEDENT_TEXT_MAX,
  serializedSize,
  type PrecedentEntry,
} from "./memory-core.js";

// Just enough of the figma global for a restore: root shared plugin data,
// clientStorage (the kit store), the panel channel and toasts.
const shared = new Map<string, string>();
let stored: unknown = [];
const notices: string[] = [];
(globalThis as unknown as { figma: unknown }).figma = {
  root: {
    name: "test file",
    getSharedPluginData: (ns: string, key: string) => shared.get(`${ns}:${key}`) ?? "",
    setSharedPluginData: (ns: string, key: string, value: string) => void shared.set(`${ns}:${key}`, value),
  },
  clientStorage: {
    getAsync: async () => stored,
    setAsync: async (_key: string, value: unknown) => {
      stored = value;
    },
  },
  ui: { postMessage: () => {} },
  notify: (message: string) => void notices.push(message),
};

const LAW = "# law\n- one rule";
const precedent = (id: string, text = "short"): PrecedentEntry => ({
  id,
  date: "2026-09-25",
  kind: "intent",
  text,
  source: "chat",
});
const many = (n: number, text?: string) =>
  Array.from({ length: n }, (_, i) => precedent(`p${String(i).padStart(3, "0")}`, text));

// A linked file whose law was wiped (the merge wound), holding `memory`.
function setup(memory: PrecedentEntry[], seeds: PrecedentEntry[], autoRestore = false): void {
  shared.clear();
  notices.length = 0;
  shared.set("relai:memory", memory.length ? JSON.stringify(memory) : "");
  shared.set("relai:rulesetLink", JSON.stringify({ name: "kit", lastSyncHash: "" }));
  const kit: Ruleset = {
    name: "kit",
    conventions: LAW,
    seedPrecedents: seeds,
    autoRestore,
    provenance: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  stored = [kit];
}

const memoryIds = () => (JSON.parse(shared.get("relai:memory") || "[]") as PrecedentEntry[]).map((e) => e.id);

function expectLawRestored(): void {
  expect(shared.get("relai:conventions")).toBe(LAW);
  expect(Number.isFinite(Date.parse(shared.get("relai:conventionsAt") ?? ""))).toBe(true);
  expect(JSON.parse(shared.get("relai:rulesetLink") ?? "null")).toEqual({
    name: "kit",
    lastSyncHash: contentHash(LAW),
  });
}

describe("restoreFromRuleset seeds", () => {
  test("seeds that fit are written as before", async () => {
    setup([precedent("a")], [precedent("s1"), precedent("s2")]);
    const r = await restoreFromRuleset();
    expect(r.precedentsSeeded).toBe(2);
    expect(r.precedentsSkipped).toBeUndefined();
    expect(memoryIds()).toEqual(["s1", "s2", "a"]);
    expectLawRestored();
  });

  test("too many seeds: none are written, the law still is", async () => {
    const memory = many(MEMORY_MAX_ENTRIES - 1);
    // One seed is already in the file: the skip counts only the two missing ones
    setup(memory, [precedent(memory[0].id), precedent("s1"), precedent("s2")]);
    const r = await restoreFromRuleset();
    expect(r.precedentsSeeded).toBe(0);
    expect(r.precedentsSkipped).toMatchObject({ count: 2, reason: "entries", limit: MEMORY_MAX_ENTRIES, overBy: 1 });
    expect(r.precedentsSkipped?.next).toContain("restore again");
    expect(memoryIds()).toEqual(memory.map((e) => e.id));
    expectLawRestored();
  });

  test("seeds too large: none are written, the law still is", async () => {
    const memory = many(179, "y".repeat(PRECEDENT_TEXT_MAX));
    const seeds = [precedent("s1"), precedent("s2", "y".repeat(PRECEDENT_TEXT_MAX))];
    const overBy = serializedSize([...seeds, ...memory]) - MEMORY_MAX_BYTES;
    expect(overBy).toBeGreaterThan(0);
    expect(memory.length + seeds.length).toBeLessThanOrEqual(MEMORY_MAX_ENTRIES);
    setup(memory, seeds);
    const r = await restoreFromRuleset();
    expect(r.precedentsSeeded).toBe(0);
    expect(r.precedentsSkipped).toMatchObject({ count: 2, reason: "size", limit: MEMORY_MAX_BYTES, overBy });
    expect(memoryIds()).toEqual(memory.map((e) => e.id));
    expectLawRestored();
  });

  test("seeds already in the file don't count against capacity", async () => {
    const memory = [precedent("s1"), ...many(MEMORY_MAX_ENTRIES - 2)];
    setup(memory, [precedent("s1"), precedent("s2")]);
    const r = await restoreFromRuleset();
    expect(r.precedentsSeeded).toBe(1);
    expect(r.precedentsSkipped).toBeUndefined();
    expect(memoryIds()).toEqual(["s2", ...memory.map((e) => e.id)]);
    expect(memoryIds().length).toBe(MEMORY_MAX_ENTRIES);
    expectLawRestored();
  });
});

describe("restore notices", () => {
  const tooMany = () => {
    const memory = many(MEMORY_MAX_ENTRIES - 1);
    return { memory, seeds: [precedent("s1"), precedent("s2")] };
  };
  const skippedLine = " — 2 seed precedents skipped, file memory full";

  test("the automatic heal names the skipped seeds", async () => {
    const { memory, seeds } = tooMany();
    setup(memory, seeds, true);
    expect(await reconcileOnLoad()).toEqual({ healed: true, name: "kit" });
    expect(notices).toEqual([`Relai: restored conventions from ruleset "kit" (kit last written 2026-09-01)${skippedLine}`]);
  });

  test("a panel restore that skips seeds says so in the same words", async () => {
    const { memory, seeds } = tooMany();
    setup(memory, seeds);
    notifySkippedSeeds((await dispatch("restore_from_ruleset", {})) as RestoreResult);
    expect(notices).toEqual([`Relai: restored conventions from ruleset "kit"${skippedLine}`]);
  });

  test("a panel link with restore that skips seeds says so too", async () => {
    const { memory, seeds } = tooMany();
    setup(memory, seeds);
    const out = (await dispatch("link_ruleset", { name: "kit", restore: true })) as { restored: RestoreResult | null };
    notifySkippedSeeds(out.restored);
    expect(notices).toEqual([`Relai: restored conventions from ruleset "kit"${skippedLine}`]);
  });

  test("a panel restore or link that skips nothing stays quiet", async () => {
    setup([precedent("a")], [precedent("s1")]);
    notifySkippedSeeds((await dispatch("restore_from_ruleset", {})) as RestoreResult);
    const out = (await dispatch("link_ruleset", { name: "kit" })) as { restored: RestoreResult | null };
    notifySkippedSeeds(out.restored);
    expect(notices).toEqual([]);
  });
});
