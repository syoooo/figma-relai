import { describe, expect, test } from "bun:test";
import {
  MEMORY_MAX_ENTRIES,
  PRECEDENT_TEXT_MAX,
  assertCapacity,
  buildIndex,
  makeId,
  matchPrecedents,
  toSurfaced,
  validatePrecedentInput,
  type PrecedentEntry,
} from "./memory-core.js";

const entry = (over: Partial<PrecedentEntry> = {}): PrecedentEntry => ({
  id: makeId(),
  date: "2026-07-26",
  kind: "intent",
  text: "KARTE Badge border=1 is intent",
  source: "chat",
  ...over,
});

describe("validatePrecedentInput", () => {
  test("defaults kind to intent and trims text", () => {
    expect(validatePrecedentInput(undefined, "  keep it  ")).toEqual({ kind: "intent", text: "keep it" });
  });
  test("rejects empty text", () => {
    expect(() => validatePrecedentInput("decision", "   ")).toThrow(/required/);
  });
  test("rejects over-long text with the limit in the message", () => {
    expect(() => validatePrecedentInput("decision", "x".repeat(PRECEDENT_TEXT_MAX + 1))).toThrow(
      new RegExp(String(PRECEDENT_TEXT_MAX))
    );
  });
  test("rejects unknown kind", () => {
    expect(() => validatePrecedentInput("vibe", "text")).toThrow(/decision \| intent \| correction/);
  });
});

describe("assertCapacity", () => {
  test("accepts under the entry cap", () => {
    expect(() => assertCapacity([entry()], entry())).not.toThrow();
  });
  test("rejects at the entry cap with consolidation hint", () => {
    const full = Array.from({ length: MEMORY_MAX_ENTRIES }, () => entry());
    expect(() => assertCapacity(full, entry())).toThrow(/consolidate/);
  });
  test("rejects when serialized size would blow the byte budget", () => {
    const fat = Array.from({ length: 190 }, () => entry({ text: "y".repeat(PRECEDENT_TEXT_MAX) }));
    const candidate = entry({ text: "y".repeat(PRECEDENT_TEXT_MAX) });
    expect(() => assertCapacity(fat, candidate)).toThrow(/KB/);
  });
});

describe("index + match", () => {
  const a = entry({ id: "a", refs: { tokens: [{ id: "VariableID:1:1", name: "Badge/border" }] } });
  const b = entry({ id: "b", refs: { nodes: [{ id: "9:9" }] } });
  const c = entry({ id: "c", refs: { pages: [{ id: "0:1", name: "Color" }] } });
  const index = buildIndex([a, b, c]);

  test("token hit", () => {
    expect(matchPrecedents(index, { tokenIds: ["VariableID:1:1"] }).map((e) => e.id)).toEqual(["a"]);
  });
  test("node hit", () => {
    expect(matchPrecedents(index, { nodeIds: ["9:9"] }).map((e) => e.id)).toEqual(["b"]);
  });
  test("page hits rank after direct hits and results dedupe", () => {
    const hits = matchPrecedents(index, { tokenIds: ["VariableID:1:1"], nodeIds: ["9:9"], pageId: "0:1" });
    expect(hits.map((e) => e.id)).toEqual(["a", "b", "c"]);
    const again = matchPrecedents(index, { nodeIds: ["9:9", "9:9"] });
    expect(again.length).toBe(1);
  });
  test("no refs, no hits", () => {
    expect(matchPrecedents(index, { tokenIds: ["nope"] })).toEqual([]);
  });

  test("gate entries never match at page level, still match direct refs", () => {
    const gatePage = entry({ id: "gp", source: "gate", refs: { pages: [{ id: "0:1" }] } });
    const gateNode = entry({ id: "gn", source: "gate", refs: { nodes: [{ id: "7:7" }] } });
    const idx = buildIndex([gatePage, gateNode, c]);
    expect(matchPrecedents(idx, { pageId: "0:1" }).map((e) => e.id)).toEqual(["c"]);
    expect(matchPrecedents(idx, { nodeIds: ["7:7"] }).map((e) => e.id)).toEqual(["gn"]);
  });
});

describe("toSurfaced", () => {
  test("null on empty", () => {
    expect(toSurfaced([])).toBeNull();
  });
  test("caps at two with a pointer to the rest", () => {
    const out = toSurfaced([entry(), entry(), entry()]);
    expect(out?.precedents.length).toBe(2);
    expect(out?.more).toContain("+1 more");
  });
});
