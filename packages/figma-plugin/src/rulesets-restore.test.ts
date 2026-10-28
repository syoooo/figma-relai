import { describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import {
  contentHash,
  KitRefusedError,
  reconcileOnLoad,
  restoreFromRuleset,
  rulesetOpResult,
  type RestoreResult,
  type Ruleset,
} from "./handlers/rulesets.js";
import { snapshotVoice } from "./walls.js";
import "./handlers/plugin-data.js";
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

  test("the automatic heal returns the kit's date and the skipped seeds for the panel's card, with no toast", async () => {
    const { memory, seeds } = tooMany();
    setup(memory, seeds, true);
    expect(await reconcileOnLoad()).toEqual({
      healed: true,
      name: "kit",
      kitUpdatedAt: "2026-09-01T00:00:00.000Z",
      precedentsSkipped: { count: 2, limit: MEMORY_MAX_ENTRIES },
    });
    expect(notices).toEqual([]);
  });

  test("a heal that skips nothing names only the kit and its date", async () => {
    setup([], [precedent("s1")], true);
    expect(await reconcileOnLoad()).toEqual({ healed: true, name: "kit", kitUpdatedAt: "2026-09-01T00:00:00.000Z" });
  });

  test("a panel link with restore reports the skipped seeds for the kit card", async () => {
    const { memory, seeds } = tooMany();
    setup(memory, seeds);
    const out = (await dispatch("link_ruleset", { name: "kit", restore: true })) as { restored: RestoreResult | null };
    expect(rulesetOpResult("link", { restored: out.restored })).toEqual({
      type: "ruleset-op-result",
      op: "link",
      ok: true,
      precedentsSkipped: { count: 2, limit: MEMORY_MAX_ENTRIES },
    });
    expect(notices).toEqual([]);
  });

  test("a panel restore or link that skips nothing reports no skipped seeds", async () => {
    setup([precedent("a")], [precedent("s1")]);
    const restored = (await dispatch("restore_from_ruleset", {})) as RestoreResult;
    expect(rulesetOpResult("restore", { restored })).toEqual({ type: "ruleset-op-result", op: "restore", ok: true });
    const out = (await dispatch("link_ruleset", { name: "kit" })) as { restored: RestoreResult | null };
    expect(rulesetOpResult("link", { restored: out.restored })).toEqual({ type: "ruleset-op-result", op: "link", ok: true });
    expect(notices).toEqual([]);
  });
});

// A linked file with its own law, synced to the kit at `syncedLaw`.
function linked(fileLaw: string, fileAt: string, kit: Partial<Ruleset>, syncedLaw = LAW): void {
  shared.clear();
  notices.length = 0;
  shared.set("relai:conventions", fileLaw);
  shared.set("relai:conventionsAt", fileAt);
  shared.set("relai:rulesetLink", JSON.stringify({ name: "kit", lastSyncHash: contentHash(syncedLaw) }));
  stored = [
    {
      name: "kit",
      conventions: LAW,
      seedPrecedents: [],
      autoRestore: false,
      provenance: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      ...kit,
    },
  ];
}

async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("kit refusals", () => {
  test("a push over a kit that moved is refused with the facts, and the agent's text is unchanged", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", { updatedBy: "Other file" }, "# older");
    const error = await thrown(() => dispatch("push_to_ruleset", {}));
    expect(error).toBeInstanceOf(KitRefusedError);
    expect((error as KitRefusedError).refusal).toEqual({
      code: "kit_lease",
      kit: "kit",
      kitChars: LAW.length,
      kitUpdatedAt: "2026-09-01T00:00:00.000Z",
      updatedBy: "Other file",
      fileChars: "# mine".length,
    });
    expect((error as Error).message).toBe(
      `Ruleset "kit" has changed since this file last synced it (kit ${LAW.length} chars, updated 2026-09-01T00:00:00.000Z by "Other file"). ` +
        `Review with list/export first; pass force:true only if this file's law should replace it.`
    );
    expect((stored as Ruleset[])[0].conventions).toBe(LAW);
  });

  test("a restore over newer file law is refused with both sides, and the agent's text is unchanged", async () => {
    linked("# newer", "2026-09-10T00:00:00.000Z", {});
    const error = await thrown(() => dispatch("restore_from_ruleset", {}));
    expect((error as KitRefusedError).refusal).toEqual({
      code: "kit_older",
      kit: "kit",
      kitChars: LAW.length,
      kitUpdatedAt: "2026-09-01T00:00:00.000Z",
      fileChars: "# newer".length,
      fileUpdatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect((error as Error).message).toBe(
      `Restore would overwrite newer law. This file's conventions (7 chars, written 2026-09-10T00:00:00.000Z) ` +
        `are more recent than ruleset "kit" (${LAW.length} chars, 2026-09-01T00:00:00.000Z). ` +
        `If the file's law is the one to keep, push it up instead (file → kit). ` +
        `To replace the file anyway, restore with force: true.`
    );
    expect(shared.get("relai:conventions")).toBe("# newer");
  });

  test("force still goes through", async () => {
    linked("# newer", "2026-09-10T00:00:00.000Z", {});
    await dispatch("restore_from_ruleset", { force: true });
    expect(shared.get("relai:conventions")).toBe(LAW);
  });
});

describe("ruleset-op-result", () => {
  test("a refused push carries the refusal and the same message", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {}, "# older");
    const error = await thrown(() => dispatch("push_to_ruleset", {}));
    expect(rulesetOpResult("push", { error })).toEqual({
      type: "ruleset-op-result",
      op: "push",
      ok: false,
      refusal: (error as KitRefusedError).refusal,
      message: (error as Error).message,
    });
  });

  test("any other failure carries only its message", () => {
    expect(rulesetOpResult("delete", { error: new Error('No ruleset named "x".') })).toEqual({
      type: "ruleset-op-result",
      op: "delete",
      ok: false,
      message: 'No ruleset named "x".',
    });
  });

  test("a restore that left seeds out says how many, against which limit", async () => {
    setup(many(MEMORY_MAX_ENTRIES - 1), [precedent("s1"), precedent("s2")]);
    const restored = (await dispatch("restore_from_ruleset", {})) as RestoreResult;
    expect(rulesetOpResult("restore", { restored })).toEqual({
      type: "ruleset-op-result",
      op: "restore",
      ok: true,
      precedentsSkipped: { count: 2, limit: MEMORY_MAX_ENTRIES },
    });
  });

  test("a plain success is just ok", () => {
    expect(rulesetOpResult("unlink", {})).toEqual({ type: "ruleset-op-result", op: "unlink", ok: true });
    expect(rulesetOpResult("link", { restored: null })).toEqual({ type: "ruleset-op-result", op: "link", ok: true });
  });
});

describe("voice writes are counted before they happen", () => {
  test("writing conventions, the link or memory moves the epoch; reading does not", async () => {
    setup([], [precedent("s1")]);
    const start = snapshotVoice();
    expect(snapshotVoice().epoch).toBe(start.epoch);
    await dispatch("set_conventions", { content: "# set" });
    const afterConventions = snapshotVoice();
    expect(afterConventions.epoch).toBeGreaterThan(start.epoch);
    expect(afterConventions.prints.conventions).not.toEqual(start.prints.conventions);
    await dispatch("unlink_ruleset", {});
    expect(snapshotVoice().epoch).toBeGreaterThan(afterConventions.epoch);
    const beforeRecord = snapshotVoice().epoch;
    await dispatch("record_precedent", { text: "one ruling" });
    expect(snapshotVoice().epoch).toBeGreaterThan(beforeRecord);
  });

  test("a raw write that bypasses Relai changes the prints but not the epoch", () => {
    setup([], []);
    const before = snapshotVoice();
    shared.set("relai:memory", JSON.stringify([precedent("raw")]));
    const after = snapshotVoice();
    expect(after.epoch).toBe(before.epoch);
    expect(after.prints.memory).not.toEqual(before.prints.memory);
  });
});
