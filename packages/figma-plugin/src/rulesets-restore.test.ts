import { describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import {
  contentHash,
  KitRefusedError,
  reconcileOnLoad,
  restoreFromRuleset,
  rulesetOpResult,
  rulesetToMarkdown,
  type RestoreResult,
  type Ruleset,
} from "./handlers/rulesets.js";
import { memoryOpResult } from "./handlers/memory.js";
import { PanelFailureError } from "./panel-failure.js";
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

describe("the auto-restore switch", () => {
  test("off: a load that finds the file's law gone writes nothing", async () => {
    setup([], [precedent("s1")], false);
    expect(await reconcileOnLoad()).toMatchObject({ healed: false, status: { state: "file-empty", autoRestore: false } });
    expect(shared.get("relai:conventions")).toBeUndefined();
    expect(shared.get("relai:conventionsAt")).toBeUndefined();
    expect(memoryIds()).toEqual([]);
  });

  test("on: a load that finds the file's own law writes nothing", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", { autoRestore: true, seedPrecedents: [precedent("s1")] });
    const link = shared.get("relai:rulesetLink");
    expect(await reconcileOnLoad()).toMatchObject({ healed: false, status: { state: "drifted", autoRestore: true } });
    expect(shared.get("relai:conventions")).toBe("# mine");
    expect(shared.get("relai:conventionsAt")).toBe("2026-09-10T00:00:00.000Z");
    expect(shared.get("relai:rulesetLink")).toBe(link);
    expect(shared.get("relai:memory")).toBeUndefined();
  });

  test("import keeps this machine's switch, either way", async () => {
    for (const local of [true, false]) {
      linked(LAW, "2026-09-10T00:00:00.000Z", { autoRestore: local });
      const kit = (stored as Ruleset[])[0];
      const markdown = rulesetToMarkdown({ ...kit, conventions: "# imported", autoRestore: !local });
      const out = (await dispatch("import_ruleset", { markdown })) as { overwrote: boolean; autoRestore: boolean };
      expect(out).toMatchObject({ overwrote: true, autoRestore: local });
      expect((stored as Ruleset[])[0]).toMatchObject({ conventions: "# imported", autoRestore: local });
    }
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

describe("a failed panel action carries why, for the panel to word", () => {
  async function failed(command: string, params: Record<string, unknown>) {
    const error = await thrown(() => dispatch(command, params));
    expect(error).toBeInstanceOf(PanelFailureError);
    return { failure: (error as PanelFailureError).failure, message: (error as Error).message };
  }
  const unlinked = () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    shared.delete("relai:rulesetLink");
  };

  test("an action that needs a kit, on a file that uses none", async () => {
    unlinked();
    const message = "This file is not linked to a ruleset. Use link_ruleset first.";
    expect(await failed("push_to_ruleset", {})).toEqual({ failure: { code: "not_linked" }, message });
    expect(await failed("restore_from_ruleset", {})).toEqual({ failure: { code: "not_linked" }, message });
    expect(await failed("promote_precedent", { id: "p1" })).toEqual({
      failure: { code: "not_linked" },
      message: "This file is not linked to a ruleset — link one before promoting.",
    });
  });

  test("a kit that is not on this machine", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    expect(await failed("link_ruleset", { name: "gone" })).toEqual({
      failure: { code: "kit_missing", kit: "gone" },
      message: 'No ruleset named "gone". list_rulesets shows what exists.',
    });
  });

  test("a precedent that is gone", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    expect(await failed("promote_precedent", { id: "nope" })).toEqual({
      failure: { code: "precedent_missing" },
      message: 'No precedent with id "nope".',
    });
  });

  test("saving or sending a file with no rules, or too many", async () => {
    linked("", "", {});
    expect(await failed("save_ruleset", { name: "new", fromFile: true })).toEqual({
      failure: { code: "no_rules" },
      message: "This file has no conventions to save from.",
    });
    expect(await failed("push_to_ruleset", {})).toEqual({
      failure: { code: "no_rules" },
      message: "This file has no conventions to push.",
    });
    linked("x".repeat(20001), "2026-09-10T00:00:00.000Z", {});
    expect(await failed("save_ruleset", { name: "new", fromFile: true })).toEqual({
      failure: { code: "rules_too_long", chars: 20001, limit: 20000 },
      message: "Conventions doc is 20001 chars — keep it under 20000.",
    });
  });

  test("a machine already holding the most kits", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    stored = Array.from({ length: 30 }, (_, i) => ({ ...(stored as Ruleset[])[0], name: `k${i}` }));
    const full = { failure: { code: "kit_limit" as const, limit: 30 }, message: "Ruleset limit reached (30)." };
    expect(await failed("save_ruleset", { name: "new", fromFile: true })).toEqual(full);
    expect(await failed("import_ruleset", { markdown: "---\nrelai-ruleset: new\n---\n\n# law\n" })).toEqual(full);
  });

  test("an import that is empty or was not exported from a kit", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    expect(await failed("import_ruleset", { markdown: "  " })).toEqual({
      failure: { code: "import_empty" },
      message: "Provide the ruleset markdown to import.",
    });
    expect(await failed("import_ruleset", { markdown: "# law\n" })).toMatchObject({
      failure: { code: "import_no_name" },
      message: expect.stringContaining("Ruleset name missing — this markdown has no `relai-ruleset:` frontmatter"),
    });
  });

  test("a kit store that did not keep the write", async () => {
    linked("# mine", "2026-09-10T00:00:00.000Z", {});
    const storage = (figma as unknown as { clientStorage: { setAsync: unknown } }).clientStorage;
    const keep = storage.setAsync;
    // The store answers but keeps something else
    storage.setAsync = async () => {
      stored = [];
    };
    try {
      expect(await failed("save_ruleset", { name: "new", fromFile: true })).toMatchObject({
        failure: { code: "kit_not_kept" },
        message: expect.stringContaining("The ruleset store did not keep that write"),
      });
    } finally {
      storage.setAsync = keep;
    }
  });

  test("the op results carry it beside the unchanged message", async () => {
    unlinked();
    const error = await thrown(() => dispatch("push_to_ruleset", {}));
    expect(rulesetOpResult("push", { error })).toEqual({
      type: "ruleset-op-result",
      op: "push",
      ok: false,
      failure: { code: "not_linked" },
      message: "This file is not linked to a ruleset. Use link_ruleset first.",
    });
    const tooLong = await thrown(() => dispatch("record_precedent", { text: "x".repeat(300) }));
    expect(memoryOpResult("record", tooLong)).toEqual({
      type: "memory-op-result",
      op: "record",
      ok: false,
      failure: { code: "precedent_too_long", chars: 300, limit: PRECEDENT_TEXT_MAX },
      message: `Precedent text is 300 chars — keep it under ${PRECEDENT_TEXT_MAX} (one adjudication, one sentence).`,
    });
    const gone = await thrown(() => dispatch("promote_precedent", { id: "p1" }));
    expect(memoryOpResult("promote", gone, "p1")).toEqual({
      type: "memory-op-result",
      op: "promote",
      ok: false,
      failure: { code: "not_linked" },
      message: "This file is not linked to a ruleset — link one before promoting.",
      id: "p1",
    });
    expect(memoryOpResult("record", new Error("odd"))).toEqual({
      type: "memory-op-result",
      op: "record",
      ok: false,
      message: "odd",
    });
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
