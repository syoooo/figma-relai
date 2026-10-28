import { beforeEach, describe, expect, test } from "bun:test";
import { dispatch } from "./dispatcher.js";
import { attachPrecedents, preflightPrecedents, readMemory, recordGatePrecedent } from "./handlers/memory.js";
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

describe("precedents matched before the write", () => {
  test("a write's result lists the precedents first, marked before_write", async () => {
    await record({ nodes: ["5:6"] });
    const out = attachPrecedents("set_properties", { nodeId: "5:6" }, { id: "5:6", updated: true }) as Record<
      string,
      unknown
    >;
    expect(Object.keys(out)).toEqual(["precedents", "precedentsMatched", "id", "updated"]);
    expect(out.precedentsMatched).toBe("before_write");
  });

  test("the match taken before dispatch is the one attached, whatever the write changed", async () => {
    const { id } = (await record({ nodes: ["5:6"] })) as { id: string };
    const pre = preflightPrecedents("delete_node", { nodeId: "5:6" });
    await dispatch("remove_precedent", { id });
    const out = attachPrecedents("delete_node", { nodeId: "5:6" }, { deleted: "5:6" }, pre) as {
      precedents?: Array<{ text: string }>;
    };
    expect(out.precedents?.[0].text).toBe("Badge border=1 is intent");
  });

  test("each command in a batch carries its own precedents", async () => {
    await record({ nodes: ["5:6"] });
    const params = {
      commands: [
        { command: "set_properties", params: { nodeId: "1:1" } },
        { command: "set_properties", params: { nodeId: "5:6" } },
      ],
    };
    const pre = preflightPrecedents("batch_execute", params);
    const out = attachPrecedents(
      "batch_execute",
      params,
      [
        { command: "set_properties", success: true, result: {} },
        { command: "set_properties", success: true, result: {} },
      ],
      pre
    ) as Array<Record<string, unknown>>;
    expect(out[0]).not.toHaveProperty("precedents");
    expect(out[1].precedents).toHaveLength(1);
  });

  test("reads and memory commands surface nothing", async () => {
    await record({ nodes: ["5:6"] });
    expect(preflightPrecedents("get_node_info", { nodeId: "5:6" })).toBeNull();
    expect(preflightPrecedents("update_precedent", { nodeId: "5:6" })).toBeNull();
  });

  test("precedents a script wrote straight into file memory surface on the next write", async () => {
    await record({ nodes: ["5:6"] });
    expect(preflightPrecedents("set_properties", { nodeId: "7:7" })).toBeNull();
    const raw: PrecedentEntry = {
      id: "raw1",
      date: "2026-10-28",
      kind: "intent",
      text: "written by a script",
      refs: { nodes: [{ id: "7:7" }] },
      source: "chat",
    };
    shared.set("relai:memory", JSON.stringify([raw, ...readMemory()]));
    expect(preflightPrecedents("set_properties", { nodeId: "7:7" })?.surfaced?.precedents[0].text).toBe(
      "written by a script"
    );
  });
});
