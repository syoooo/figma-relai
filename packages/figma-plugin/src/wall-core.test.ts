import { describe, expect, test } from "bun:test";
import type { PageRef } from "@figma-relai/shared";
import { buildIndex, type PrecedentEntry } from "./memory-core.js";
import {
  collectNodeRefs,
  isWriteCommand,
  migrateConfirmLevel,
  needsApproval,
  taxTier,
} from "./write-guard.js";
import {
  attachPreflight,
  batchApproval,
  batchScale,
  cardPrecedents,
  designerOnlyGuardMessage,
  fingerprint,
  fnv1a,
  guardChangeVerdict,
  lawRestoredWarning,
  legacyConfirmLevel,
  panelLostNotice,
  panelMessageVerdict,
  persistShape,
  preflightPrecedents,
  reconcileWalls,
  resolveFileWalls,
  voiceDiff,
  voiceNotices,
  wallsKey,
  type CommandRules,
  type FileWalls,
  type PrecedentContext,
  type VoiceSnap,
  type Walls,
} from "./wall-core.js";

const PAGES: PageRef[] = [
  { id: "1:1", name: "Work" },
  { id: "2:1", name: "Brand / Masters" },
  { id: "3:1", name: "Legal" },
];

const walls = (over: Partial<Walls> = {}): Walls => ({
  confirmLevel: "risk",
  allowCodeExec: true,
  scopeLock: null,
  guards: ["2:1"],
  ...over,
});

const entry = (w: Walls): FileWalls => ({
  confirmLevel: w.confirmLevel,
  allowCodeExec: w.allowCodeExec,
  scopeLock: w.scopeLock,
});

describe("legacyConfirmLevel", () => {
  test("matches write-guard's migrateConfirmLevel for every legacy combination", () => {
    for (const mode of [undefined, "off", "bulk", "all"] as const) {
      for (const high of [undefined, true, false]) {
        expect(legacyConfirmLevel(mode, high)).toBe(migrateConfirmLevel(mode, high));
      }
    }
  });
});

describe("wallsKey", () => {
  test("prefers the file's seed, falls back to fileKey, never uses the name", () => {
    expect(wallsKey({ seed: "ab12", fileKey: "KEY" })).toBe("seed:ab12");
    expect(wallsKey({ seed: "", fileKey: "KEY" })).toBe("key:KEY");
    expect(wallsKey({})).toBeNull();
  });
});

describe("resolveFileWalls", () => {
  const key = "seed:ab12";

  test("per-file entry wins", () => {
    const r = resolveFileWalls(
      {
        confirmLevel: "open",
        allowCodeExec: true,
        wallsByFile: { [key]: { confirmLevel: "bulk", allowCodeExec: false, scopeLock: { ids: ["5:5"], names: ["Card"] } } },
      },
      key
    );
    expect(r).toEqual({
      walls: { confirmLevel: "bulk", allowCodeExec: false, scopeLock: { ids: ["5:5"], names: ["Card"] } },
      perFile: true,
      migratedLegacyLock: false,
    });
  });

  test("falls back to the machine-wide defaults", () => {
    const r = resolveFileWalls({ confirmLevel: "all", allowCodeExec: false }, key);
    expect(r.walls).toEqual({ confirmLevel: "all", allowCodeExec: false, scopeLock: null });
    expect(r.perFile).toBe(false);
  });

  test("legacy requireApproval/confirmHighRisk still migrate", () => {
    expect(resolveFileWalls({ requireApproval: "bulk" }, key).walls.confirmLevel).toBe("bulk");
    expect(resolveFileWalls({ confirmHighRisk: false }, key).walls.confirmLevel).toBe("open");
    expect(resolveFileWalls({}, key).walls).toEqual({ confirmLevel: "risk", allowCodeExec: true, scopeLock: null });
  });

  test("legacy machine-wide lock is not inherited by another file", () => {
    const store = { scopeLock: { ids: ["9:9"], names: ["Other file"] } };
    expect(resolveFileWalls(store, key).walls.scopeLock).toBeNull();
    expect(resolveFileWalls(store, key, { legacyLockHere: false }).migratedLegacyLock).toBe(false);
  });

  test("legacy lock is taken over by the file whose nodes it names", () => {
    const r = resolveFileWalls({ scopeLock: { ids: ["9:9"], names: ["Hero"] } }, key, { legacyLockHere: true });
    expect(r.walls.scopeLock).toEqual({ ids: ["9:9"], names: ["Hero"] });
    expect(r.migratedLegacyLock).toBe(true);
  });

  test("a renamed file keeps its walls: the key has no name in it", () => {
    const store = { wallsByFile: { "seed:ab12": { confirmLevel: "all" as const, allowCodeExec: false, scopeLock: null } } };
    expect(resolveFileWalls(store, wallsKey({ seed: "ab12" })!).walls.confirmLevel).toBe("all");
  });

  test("unreadable entry values fall back to the defaults", () => {
    const r = resolveFileWalls(
      { confirmLevel: "bulk", wallsByFile: { [key]: { confirmLevel: "loud", allowCodeExec: "yes", scopeLock: { ids: [] } } as never } },
      key
    );
    expect(r.walls).toEqual({ confirmLevel: "bulk", allowCodeExec: true, scopeLock: null });
  });
});

describe("persistShape", () => {
  const mine: FileWalls = { confirmLevel: "bulk", allowCodeExec: false, scopeLock: null };

  test("keeps other files' entries and non-wall fields", () => {
    const stored = {
      locale: "ja",
      roomsByFile: { a: "room-a" },
      wallsByFile: { "seed:other": { confirmLevel: "open" as const, allowCodeExec: true, scopeLock: null } },
    };
    const next = persistShape(stored, "seed:mine", mine, { asDefault: false, dropLegacyLock: false });
    expect(next.locale).toBe("ja");
    expect(next.roomsByFile).toEqual({ a: "room-a" });
    expect(next.wallsByFile).toEqual({ "seed:other": stored.wallsByFile["seed:other"], "seed:mine": mine });
    expect(next.confirmLevel).toBeUndefined();
  });

  test("a panel change also refreshes the default for new files", () => {
    const next = persistShape({ confirmLevel: "open" }, "seed:mine", mine, { asDefault: true, dropLegacyLock: false });
    expect(next.confirmLevel).toBe("bulk");
    expect(next.allowCodeExec).toBe(false);
  });

  test("drops the legacy lock only once a file took it over", () => {
    const stored = { scopeLock: { ids: ["9:9"], names: ["Hero"] } };
    expect(persistShape(stored, "k", mine, { asDefault: true, dropLegacyLock: false }).scopeLock).toEqual(stored.scopeLock);
    expect("scopeLock" in persistShape(stored, "k", mine, { asDefault: true, dropLegacyLock: true })).toBe(false);
  });

  test("does not mutate what it was given", () => {
    const stored = { wallsByFile: {} };
    persistShape(stored, "k", mine, { asDefault: true, dropLegacyLock: true });
    expect(stored).toEqual({ wallsByFile: {} });
  });
});

describe("wall-timing", () => {
  const seenOf = (w: Walls) => ({ guards: [...w.guards], walls: entry(w) });

  test("script clears guards → restored, blamed on code", () => {
    const auth = walls();
    const r = reconcileWalls(auth, { ...seenOf(auth), guards: [] }, "after_code", PAGES);
    expect(r.writeGuards).toEqual(["2:1"]);
    expect(r.notices).toEqual([
      { kind: "law_restored", key: "guards", pages: [{ id: "2:1", name: "Brand / Masters" }], by: "code" },
    ]);
  });

  test("panel lift during a script survives the script's clear", () => {
    // The panel lifted 3:1 first (copy and file changed), then the script cleared everything
    const auth = walls({ guards: ["2:1"] });
    const r = reconcileWalls(auth, { ...seenOf(auth), guards: [] }, "after_code", PAGES);
    expect(r.next.guards).toEqual(["2:1"]);
    expect(r.writeGuards).toEqual(["2:1"]);
  });

  test("panel add during a script is kept, nothing to do", () => {
    const auth = walls({ guards: ["2:1", "3:1"] });
    const r = reconcileWalls(auth, seenOf(auth), "after_code", PAGES);
    expect(r.writeGuards).toBeNull();
    expect(r.writeSettings).toBe(false);
    expect(r.notices).toEqual([]);
  });

  test("delayed write is restored at the next entry, source unknown", () => {
    const auth = walls();
    const r = reconcileWalls(auth, { ...seenOf(auth), guards: [] }, "entry", PAGES);
    expect(r.notices[0]).toMatchObject({ kind: "law_restored", key: "guards", by: "unknown" });
  });

  test("settings tamper is rewritten from the copy", () => {
    const auth = walls({ confirmLevel: "bulk", allowCodeExec: false, scopeLock: { ids: ["5:5"], names: ["Card"] } });
    const tampered = { confirmLevel: "open" as const, allowCodeExec: true, scopeLock: null };
    const r = reconcileWalls(auth, { guards: auth.guards, walls: tampered }, "after_code", PAGES);
    expect(r.writeSettings).toBe(true);
    expect(r.next).toEqual(auth);
    expect(r.notices).toEqual([
      { kind: "law_restored", key: "settings", fields: ["confirmLevel", "allowCodeExec", "scopeLock"], by: "code" },
    ]);
  });

  test("a deleted entry is written back", () => {
    const auth = walls();
    const r = reconcileWalls(auth, { guards: auth.guards, walls: null }, "entry", PAGES);
    expect(r.writeSettings).toBe(true);
    expect(r.next).toEqual(auth);
  });

  test("a panel raise still on its way to storage never rolls back and is not reported", () => {
    const auth = walls({ confirmLevel: "bulk" });
    const stale = { ...entry(auth), confirmLevel: "risk" as const };
    const r = reconcileWalls(auth, { guards: auth.guards, walls: stale }, "after_code", PAGES, {
      settingsWritePending: true,
    });
    expect(r.next.confirmLevel).toBe("bulk");
    expect(r.writeSettings).toBe(true);
    expect(r.notices).toEqual([]);
  });

  test("a zone added elsewhere is adopted", () => {
    const auth = walls();
    const r = reconcileWalls(auth, { ...seenOf(auth), guards: ["2:1", "3:1"] }, "entry", PAGES);
    expect(r.next.guards).toEqual(["2:1", "3:1"]);
    expect(r.writeGuards).toBeNull();
    expect(r.notices).toEqual([
      { kind: "law_tightened_outside", key: "guards", pages: [{ id: "3:1", name: "Legal" }] },
    ]);
  });

  test("a zone lifted elsewhere is written back", () => {
    const auth = walls({ guards: ["2:1", "3:1"] });
    const r = reconcileWalls(auth, { ...seenOf(auth), guards: ["2:1"] }, "entry", PAGES);
    expect(r.writeGuards).toEqual(["2:1", "3:1"]);
  });

  test("stricter settings in storage are adopted; the lock never is", () => {
    const auth = walls();
    const stricter = { confirmLevel: "all" as const, allowCodeExec: false, scopeLock: { ids: ["7:7"], names: ["X"] } };
    const r = reconcileWalls(auth, { guards: auth.guards, walls: stricter }, "entry", PAGES);
    expect(r.next.confirmLevel).toBe("all");
    expect(r.next.allowCodeExec).toBe(false);
    expect(r.next.scopeLock).toBeNull();
    expect(r.notices).toEqual([
      { kind: "law_tightened_outside", key: "settings", fields: ["confirmLevel", "allowCodeExec"] },
      { kind: "law_restored", key: "settings", fields: ["scopeLock"], by: "unknown" },
    ]);
  });

  test("deleted pages drop out of the no-go list", () => {
    const auth = walls({ guards: ["2:1", "8:8"] });
    const r = reconcileWalls(auth, { guards: ["2:1", "9:9"], walls: entry(auth) }, "entry", PAGES);
    expect(r.next.guards).toEqual(["2:1"]);
    expect(r.notices).toEqual([]);
  });

  test("the result warning names what was put back", () => {
    const auth = walls();
    const r = reconcileWalls(auth, { guards: [], walls: entry(auth) }, "after_code", PAGES);
    expect(lawRestoredWarning(r.notices)).toStartWith('LAW RESTORED: Relai\'s own law was changed outside the panel (no-go zones: "Brand / Masters")');
    expect(lawRestoredWarning([])).toBeNull();
  });
});

describe("guard-change", () => {
  const none = new Set<string>();

  test("pure additions pass and join the session's agent-added set", () => {
    const v = guardChangeVerdict(["2:1"], { add: ["3:1"] }, none);
    expect(v).toMatchObject({ ok: true, next: ["2:1", "3:1"], added: ["3:1"], removed: [], agentAdded: ["3:1"] });
  });

  test("any removal of a designer's zone is refused, whole request", () => {
    const v = guardChangeVerdict(["2:1"], { add: ["3:1"], remove: ["2:1"] }, none);
    expect(v.ok).toBe(false);
    expect(v.refused).toEqual(["2:1"]);
    expect(v.next).toEqual(["2:1"]);
    expect(v.agentAdded).toEqual([]);
  });

  test("lifting a zone the agent added this session passes", () => {
    const v = guardChangeVerdict(["2:1", "3:1"], { remove: ["3:1"] }, new Set(["3:1"]));
    expect(v).toMatchObject({ ok: true, next: ["2:1"], removed: ["3:1"], agentAdded: [] });
  });

  test("the older {pages} form is diffed against the current list", () => {
    expect(guardChangeVerdict(["2:1"], { pages: ["2:1", "3:1"] }, none)).toMatchObject({ ok: true, added: ["3:1"] });
    expect(guardChangeVerdict(["2:1", "3:1"], { pages: ["3:1"] }, none)).toMatchObject({ ok: false, refused: ["2:1"] });
  });

  test("{add, pages} prefers add", () => {
    const v = guardChangeVerdict(["2:1"], { add: ["3:1"], pages: ["3:1"] }, none);
    expect(v).toMatchObject({ ok: true, next: ["2:1", "3:1"], removed: [] });
  });

  test("empty pages clears nothing and is refused when zones exist", () => {
    expect(guardChangeVerdict(["2:1"], { pages: [] }, none)).toMatchObject({ ok: false, refused: ["2:1"], next: ["2:1"] });
    expect(guardChangeVerdict([], { pages: [] }, none)).toMatchObject({ ok: true, next: [] });
  });

  test("ids that are not pages of this file are ignored", () => {
    const pages = new Set(PAGES.map((p) => p.id));
    expect(guardChangeVerdict(["2:1", "gone"], { pages: ["2:1", "nope"] }, none, pages)).toMatchObject({
      ok: true,
      added: [],
      removed: [],
      next: ["2:1", "gone"],
    });
  });

  test("a request with no list is invalid", () => {
    const v = guardChangeVerdict(["2:1"], {}, none);
    expect(v.ok).toBe(false);
    expect(v.invalid).toContain("set_guards needs");
  });

  test("the refusal text starts with Designer-only: and points to the panel", () => {
    const text = designerOnlyGuardMessage([{ id: "2:1", name: "Brand / Masters" }]);
    expect(text).toStartWith("Designer-only:");
    expect(text).toContain('"Brand / Masters"');
    expect(text).toContain("Relai panel");
  });
});

describe("designer-only panel messages", () => {
  const idle = { running: 0, lastEndedAt: null };

  test("refused while a script runs and shortly after", () => {
    expect(panelMessageVerdict("guards-set", { running: 1, lastEndedAt: null }, 1000)).toEqual({
      accept: false,
      reason: "script_running",
    });
    expect(panelMessageVerdict("save-settings", { running: 0, lastEndedAt: 1000 }, 2500)).toEqual({
      accept: false,
      reason: "script_cooldown",
    });
    expect(panelMessageVerdict("approval-response", { running: 0, lastEndedAt: 1000 }, 4000)).toEqual({ accept: true });
  });

  test("other messages always pass", () => {
    expect(panelMessageVerdict("focus-node", { running: 2, lastEndedAt: null }, 0)).toEqual({ accept: true });
    expect(panelMessageVerdict("cancel-command", { running: 1, lastEndedAt: null }, 0)).toEqual({ accept: true });
    expect(panelMessageVerdict("scope-lock", idle, 0)).toEqual({ accept: true });
  });

  test("a reloaded panel or a dropped relay link is reported", () => {
    const before = { panelBoots: 1, relayConnected: true };
    expect(panelLostNotice(before, before)).toBeNull();
    expect(panelLostNotice(before, { panelBoots: 2, relayConnected: false })).toEqual({
      kind: "panel_lost",
      panelReloaded: true,
      relayDropped: true,
    });
    expect(panelLostNotice({ panelBoots: 1, relayConnected: false }, { panelBoots: 1, relayConnected: false })).toBeNull();
  });
});

describe("voiceDiff", () => {
  const snap = (epoch: number, memory: string): VoiceSnap => ({
    epoch,
    prints: {
      memory: fingerprint(memory),
      conventions: fingerprint("c"),
      conventionsAt: fingerprint("2026-01-01"),
      rulesetLink: fingerprint(""),
    },
  });

  test("FNV-1a matches the published 32-bit vectors", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
    expect(fnv1a("foobar")).toBe("bf9cf968");
  });

  test("epoch moved → nothing blamed", () => {
    expect(voiceDiff(snap(1, "[]"), snap(2, '[{"id":"x"}]'))).toEqual([]);
  });

  test("fingerprint changed, epoch still → key reported", () => {
    expect(voiceDiff(snap(1, "[]"), snap(1, '[{"id":"x"}]'))).toEqual(["memory"]);
    expect(voiceNotices(snap(1, "[]"), snap(1, "[1]"))).toEqual([
      { kind: "law_edited_by_code", key: "memory", before: fingerprint("[]"), after: fingerprint("[1]") },
    ]);
  });
});

describe("needsApproval batch", () => {
  const rules: CommandRules = { isWrite: isWriteCommand, taxTier, needsApproval, bulkThreshold: 10 };
  const sub = (command: string, params: Record<string, unknown> = {}) => ({ command, params });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `1:${i}`);

  test("RISK: a batch with delete_variable asks", () => {
    expect(batchApproval("risk", [sub("set_fill_color"), sub("delete_variable")], rules)).toMatchObject({
      asks: true,
      ghostRisk: 1,
      asking: [1],
    });
  });

  test("RISK: a batch with detach_instance or a 10+ node delete asks", () => {
    expect(batchApproval("risk", [sub("detach_instance", { nodeId: "1:1" })], rules).asks).toBe(true);
    expect(batchApproval("risk", [sub("delete_multiple_nodes", { nodeIds: ids(10) })], rules).asks).toBe(true);
    expect(batchApproval("risk", [sub("delete_multiple_nodes", { nodeIds: ids(9) })], rules).asks).toBe(false);
  });

  test("BULK: one execute_code asks; 9 plain writes stay silent; 10 ask", () => {
    expect(batchApproval("bulk", [sub("execute_code", { code: "1" })], rules)).toMatchObject({ asks: true, codeRuns: 1 });
    expect(batchApproval("bulk", Array.from({ length: 9 }, () => sub("set_fill_color")), rules).asks).toBe(false);
    expect(batchApproval("bulk", Array.from({ length: 10 }, () => sub("set_fill_color")), rules).asks).toBe(true);
  });

  test("OPEN: nothing asks, even a wrapped delete_variable", () => {
    expect(batchApproval("open", [sub("delete_variable"), sub("execute_code")], rules).asks).toBe(false);
  });

  test("ALL: a read-only batch no longer asks; one write does", () => {
    expect(batchApproval("all", [sub("get_node_info"), sub("get_pages")], rules).asks).toBe(false);
    expect(batchApproval("all", [sub("get_node_info"), sub("set_fill_color")], rules).asks).toBe(true);
  });

  test("a nested batch is judged through", () => {
    const nested = sub("batch_execute", { commands: [sub("delete_variable")] });
    expect(batchApproval("risk", [sub("get_pages"), nested], rules)).toMatchObject({ asks: true, total: 2, asking: [1] });
    const reads = sub("batch_execute", { commands: [sub("get_pages")] });
    expect(batchApproval("all", [reads], rules).asks).toBe(false);
  });

  test("nesting deeper than 3 is too deep", () => {
    const wrap = (inner: unknown) => sub("batch_execute", { commands: [inner] });
    // Top level is depth 0; three nested levels reach depth 3
    expect(batchApproval("risk", [wrap(wrap(sub("get_pages")))], rules).tooDeep).toBe(false);
    const deep = batchApproval("risk", [wrap(wrap(wrap(sub("delete_variable"))))], rules);
    expect(deep.tooDeep).toBe(true);
    expect(deep.asks).toBe(false);
  });

  test("unreadable items count as writes that ask", () => {
    expect(batchApproval("risk", [{ params: {} }], rules)).toMatchObject({ asks: true, malformed: 1 });
    expect(batchApproval("risk", "not a list", rules)).toMatchObject({ asks: true, malformed: 1 });
    expect(batchApproval("open", [{}], rules).asks).toBe(false);
  });

  test("the scale line names execute_code and the tax counts", () => {
    const v = batchApproval(
      "bulk",
      [sub("execute_code"), sub("delete_variable"), sub("delete_style"), sub("flatten_node", { nodeId: "1:1" })],
      rules
    );
    expect(batchScale(v)).toBe("4 commands · contains execute_code · 2 ghost-risk · 1 irreversible");
  });
});

describe("precedent-preflight", () => {
  const entries: PrecedentEntry[] = [
    { id: "n", date: "2026-10-01", kind: "decision", text: "The hero card keeps its 24px radius.", refs: { nodes: [{ id: "5:5" }] }, source: "chat" },
    { id: "t", date: "2026-10-02", kind: "intent", text: "Brand blue is not for text.", refs: { tokens: [{ id: "VariableID:1" }] }, source: "chat" },
    { id: "p", date: "2026-10-03", kind: "decision", text: "Legal copy changes need sign-off.", refs: { pages: [{ id: "3:1" }] }, source: "chat" },
  ];
  const index = buildIndex(entries);
  const ctx: PrecedentContext = {
    pageId: "1:1",
    isWrite: isWriteCommand,
    nodeRefs: collectNodeRefs,
    skip: new Set(["record_precedent", "set_conventions"]),
  };

  test("a delete is matched on the node it is about to remove", () => {
    const pre = preflightPrecedents(index, "delete_node", { nodeId: "5:5" }, ctx);
    expect(pre?.surfaced?.precedents.map((p) => p.text)).toEqual(["The hero card keeps its 24px radius."]);
  });

  test("batch sub-commands are matched one by one", () => {
    const pre = preflightPrecedents(
      index,
      "batch_execute",
      {
        commands: [
          { command: "set_fill_color", params: { nodeId: "1:2" } },
          { command: "set_bound_variable", params: { nodeId: "1:3", variableId: "VariableID:1" } },
        ],
      },
      ctx
    );
    expect(pre?.surfaced).toBeNull();
    expect(pre?.items?.[0]).toBeNull();
    expect(pre?.items?.[1]?.surfaced?.precedents[0].text).toBe("Brand blue is not for text.");
  });

  test("reads and memory commands never match", () => {
    expect(preflightPrecedents(index, "get_node_info", { nodeId: "5:5" }, ctx)).toBeNull();
    expect(preflightPrecedents(index, "record_precedent", { nodeId: "5:5" }, ctx)).toBeNull();
  });

  test("page-level matches use the page the designer is on before the write", () => {
    const pre = preflightPrecedents(index, "set_text", { nodeId: "1:9" }, { ...ctx, pageId: "3:1" });
    expect(pre?.surfaced?.precedents[0].text).toBe("Legal copy changes need sign-off.");
  });

  test("surfaced precedents come first in key order and say they were matched before the write", () => {
    const pre = preflightPrecedents(index, "delete_node", { nodeId: "5:5" }, ctx);
    const out = attachPreflight({ deleted: "5:5" }, pre) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["precedents", "precedentsMatched", "deleted"]);
    expect(out.precedentsMatched).toBe("before_write");
  });

  test("a result that already carries precedents is left alone", () => {
    const pre = preflightPrecedents(index, "delete_node", { nodeId: "5:5" }, ctx);
    const result = { precedents: [], deleted: "5:5" };
    expect(attachPreflight(result, pre)).toBe(result);
    expect(attachPreflight("text", pre)).toBe("text");
  });

  test("a batch result carries each precedent on its own item", () => {
    const params = {
      commands: [
        { command: "set_fill_color", params: { nodeId: "1:2" } },
        { command: "delete_node", params: { nodeId: "5:5" } },
      ],
    };
    const pre = preflightPrecedents(index, "batch_execute", params, ctx);
    const out = attachPreflight(
      [
        { command: "set_fill_color", success: true, result: {} },
        { command: "delete_node", success: false, error: "locked" },
      ],
      pre
    ) as Array<Record<string, unknown>>;
    expect("precedents" in out[0]).toBe(false);
    expect(Object.keys(out[1])[0]).toBe("precedents");
    expect(out[1].command).toBe("delete_node");
  });

  test("the approval card gets at most 2 texts, each cut to 160 characters", () => {
    const long: PrecedentEntry = { ...entries[0], id: "l", text: "x".repeat(200), refs: { nodes: [{ id: "6:6" }] } };
    const pre = preflightPrecedents(
      buildIndex([long, ...entries]),
      "batch_execute",
      {
        commands: [
          { command: "delete_node", params: { nodeId: "6:6" } },
          { command: "delete_node", params: { nodeId: "5:5" } },
          { command: "set_bound_variable", params: { nodeId: "1:3", variableId: "VariableID:1" } },
        ],
      },
      ctx
    );
    const lines = cardPrecedents(pre);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(160);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(lines[1]).toBe("The hero card keeps its 24px radius.");
    expect(cardPrecedents(null)).toEqual([]);
  });
});
