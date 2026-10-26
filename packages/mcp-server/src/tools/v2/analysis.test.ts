import { beforeEach, describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { register } from "./analysis.js";

// diff_nodes checkpoints are held in server memory: these tests drive the real
// handler through a fake server and a fake plugin, and pin that the tool never
// writes to (or reads from) the file's pluginData.

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

let diffNodes: Handler;
let calls: Array<{ command: string; params: any }>;
let nodes: Map<string, any>;

const frame = (id: string, width = 100) => ({
  id,
  name: `Frame ${id}`,
  type: "FRAME",
  width,
  height: 40,
  layoutMode: "HORIZONTAL",
  itemSpacing: 8,
});

const parse = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text);

beforeEach(() => {
  calls = [];
  nodes = new Map([["1:1", frame("1:1")]]);
  const handlers = new Map<string, Handler>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => handlers.set(name, rest[rest.length - 1] as Handler),
  } as unknown as McpServer;
  const sendCommand: SendCommandFn = async (command, params) => {
    calls.push({ command, params });
    if (command === "get_node_info") return nodes.get((params as { nodeId: string }).nodeId) ?? null;
    return null;
  };
  register(server, sendCommand);
  diffNodes = handlers.get("diff_nodes")!;
});

describe("diff_nodes checkpoints", () => {
  test("save then compare reports what changed since the save", async () => {
    const saved = parse(await diffNodes({ nodeIdA: "1:1", checkpoint: "save" }));
    expect(saved.data).toEqual({ nodeId: "1:1", saved: true });

    nodes.get("1:1").width = 240;
    nodes.get("1:1").itemSpacing = 16;
    const res = parse(await diffNodes({ nodeIdA: "1:1", checkpoint: "compare" }));
    expect(res.data.identical).toBe(false);
    expect(res.data.differences).toEqual([
      { field: "width", nodeA: 100, nodeB: 240 },
      { field: "layout.gap", nodeA: 8, nodeB: 16 },
    ]);
  });

  test("compare right after save is identical", async () => {
    await diffNodes({ nodeIdA: "1:1", checkpoint: "save" });
    const res = parse(await diffNodes({ nodeIdA: "1:1", checkpoint: "compare" }));
    expect(res.data.identical).toBe(true);
    expect(res.data.differences).toEqual([]);
  });

  test("compare without a save is an error", async () => {
    const res = parse(await diffNodes({ nodeIdA: "1:1", checkpoint: "compare" }));
    expect(res.error.category).toBe("invalid_input");
    expect(res.error.message).toContain("No checkpoint for '1:1'");
    expect(res.error.recovery.suggestion).toContain("server memory");
    expect(calls).toEqual([]); // never falls back to a legacy relai.checkpoint pluginData
  });

  test("never touches pluginData — only get_node_info reaches the plugin", async () => {
    await diffNodes({ nodeIdA: "1:1", checkpoint: "save" });
    nodes.get("1:1").width = 120;
    await diffNodes({ nodeIdA: "1:1", checkpoint: "compare" });
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.command === "get_node_info")).toBe(true);
  });

  test("keeps the latest 200 checkpoints, dropping the oldest save", async () => {
    for (let i = 0; i < 200; i++) {
      nodes.set(`n:${i}`, frame(`n:${i}`));
      await diffNodes({ nodeIdA: `n:${i}`, checkpoint: "save" });
    }
    // Re-saving n:0 makes it the newest, so the 201st save evicts n:1 instead
    await diffNodes({ nodeIdA: "n:0", checkpoint: "save" });
    nodes.set("n:200", frame("n:200"));
    await diffNodes({ nodeIdA: "n:200", checkpoint: "save" });

    expect(parse(await diffNodes({ nodeIdA: "n:1", checkpoint: "compare" })).error.message).toContain(
      "No checkpoint"
    );
    for (const id of ["n:0", "n:2", "n:200"]) {
      expect(parse(await diffNodes({ nodeIdA: id, checkpoint: "compare" })).data.identical).toBe(true);
    }
  });
});
