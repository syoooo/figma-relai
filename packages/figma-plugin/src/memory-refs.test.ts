import { beforeEach, describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import { attachPrecedents, readMemory, recordGatePrecedent } from "./handlers/memory.js";
import type { PrecedentEntry } from "./memory-core.js";

// Just enough of the figma global to record a precedent: root shared plugin
// data, variable and node lookups, pages and the panel channel.
const shared = new Map<string, string>();
const variables = new Map([["VariableID:1:23", { id: "VariableID:1:23", name: "Badge/border" }]]);
const nodes = new Map([["5:6", { id: "5:6", name: "Card" }]]);

beforeEach(() => {
  shared.clear();
  (globalThis as unknown as { figma: unknown }).figma = {
    root: {
      children: [{ id: "0:1", name: "Page 1" }],
      getSharedPluginData: (ns: string, key: string) => shared.get(`${ns}:${key}`) ?? "",
      setSharedPluginData: (ns: string, key: string, value: string) => void shared.set(`${ns}:${key}`, value),
    },
    currentPage: { id: "0:2" },
    variables: {
      getVariableByIdAsync: async (id: string) => {
        if (!id.startsWith("VariableID:")) throw new Error(`Invalid variable id: ${id}`);
        return variables.get(id) ?? null;
      },
    },
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
    ui: { postMessage: () => {} },
  };
});

const record = (refs: unknown) => dispatch("record_precedent", { text: "Badge border=1 is intent", refs });

describe("precedent token refs", () => {
  test("a bare N:M gets the VariableID: prefix; node and page refs are left as given", async () => {
    await record({ tokens: ["1:23"], nodes: ["5:6", "404:1"], pages: ["0:1"] });
    expect(readMemory()[0].refs).toEqual({
      tokens: [{ id: "VariableID:1:23", name: "Badge/border" }],
      nodes: [
        { id: "5:6", name: "Card" },
        { id: "404:1", name: undefined },
      ],
      pages: [{ id: "0:1", name: "Page 1" }],
    });
  });

  test("a precedent recorded with a bare N:M surfaces on a write to that variable", async () => {
    await record({ tokens: ["1:23"] });
    const out = attachPrecedents("update_variable", { variableId: "VariableID:1:23" }, { ok: true }) as {
      precedents?: unknown[];
    };
    expect(out.precedents).toHaveLength(1);
  });

  test("a token ref that names no variable is refused and nothing is saved", async () => {
    await expect(record({ tokens: ["VariableID:1:23", "9:9", "VariableID:8:8"] })).rejects.toThrow(
      'No variable found for token ref "9:9" (as VariableID:9:9), "VariableID:8:8" — nothing was saved.'
    );
    expect(readMemory()).toEqual([]);
  });

  test("update takes the same path: prefixed when bare, refused when missing", async () => {
    const { id } = (await record({ nodes: ["5:6"] })) as { id: string };
    await dispatch("update_precedent", { id, refs: { tokens: ["1:23"] } });
    expect(readMemory()[0].refs).toEqual({ tokens: [{ id: "VariableID:1:23", name: "Badge/border" }] });

    const before: PrecedentEntry[] = readMemory();
    await expect(dispatch("update_precedent", { id, refs: { tokens: ["7:7"] } })).rejects.toThrow(
      'No variable found for token ref "7:7" (as VariableID:7:7)'
    );
    expect(readMemory()).toEqual(before);
  });
});

describe("gate precedents and token refs", () => {
  test("a variable that can't be found keeps the designer's reason, without the token ref", async () => {
    await recordGatePrecedent("delete_variable", { variableId: "VariableID:9:9" }, false, "never delete brand tokens");
    const entries = readMemory();
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("rejected delete_variable: never delete brand tokens");
    expect(entries[0].refs?.tokens).toBeUndefined();
    expect(entries[0].refs).toEqual({ pages: [{ id: "0:2", name: undefined }] });
  });

  test("a bare N:M from the approved command is saved with the VariableID: prefix", async () => {
    await recordGatePrecedent("update_variable", { variableId: "1:23" }, true, "border stays 1");
    const entries = readMemory();
    expect(entries).toHaveLength(1);
    expect(entries[0].refs).toEqual({ tokens: [{ id: "VariableID:1:23", name: "Badge/border" }] });
  });
});
