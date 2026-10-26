import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CALL_META_KEY, RelaiError, type CallMeta, type ResultMeta } from "@figma-relai/shared";
import {
  withCallEnvelope,
  isEnveloped,
  currentCallTarget,
  MAX_TEXT_CHARS,
  RECEIPT_LABEL,
  type ToolResult,
} from "./call-envelope.js";
import { RequestTracker } from "./request-tracker.js";
import { registerAllTools } from "./tools/index.js";
import type { SendCommandFn } from "./tool-registry.js";
import { errorResult as semanticError } from "./semantic/errors.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

// A stand-in for McpServer that keeps each registered handler
function collector() {
  const handlers = new Map<string, Handler>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => {
      handlers.set(name, rest[rest.length - 1] as Handler);
    },
  } as unknown as McpServer;
  return { server, handlers };
}

function envelope(send: SendCommandFn) {
  const { server, handlers } = collector();
  const env = withCallEnvelope(server, send);
  return { ...env, handlers, call: (name: string, args: Record<string, unknown> = {}) => handlers.get(name)!(args) };
}

// A plugin command answered through a real tracker, the way the connection does
function viaTracker(answer: (tracker: RequestTracker, id: string) => void): SendCommandFn {
  const tracker = new RequestTracker();
  let n = 0;
  return () =>
    new Promise((resolve, reject) => {
      const id = `req-${++n}-0000-0000`;
      tracker.add(id, resolve, reject, 1000);
      queueMicrotask(() => answer(tracker, id));
    });
}

const meta = (r: ToolResult) => r._meta?.[CALL_META_KEY] as CallMeta;
const texts = (r: ToolResult) => r.content.map((c) => c.text);
const receipt = (r: ToolResult) => r.content.find((c) => c.text?.startsWith(RECEIPT_LABEL))?.text;

let stateDir: string;
const previousStateDir = process.env.FIGMA_RELAI_STATE_DIR;
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "relai-envelope-"));
  process.env.FIGMA_RELAI_STATE_DIR = stateDir;
});
afterEach(() => {
  if (previousStateDir === undefined) delete process.env.FIGMA_RELAI_STATE_DIR;
  else process.env.FIGMA_RELAI_STATE_DIR = previousStateDir;
  rmSync(stateDir, { recursive: true, force: true });
});

describe("every registered tool", () => {
  test("goes through the envelope", () => {
    const env = envelope(async () => ({}));
    registerAllTools(env.server, env.sendCommand);
    expect(env.handlers.size).toBeGreaterThan(25);
    for (const [, handler] of env.handlers) expect(isEnveloped(handler)).toBe(true);
    // analyze_design dispatches to aspect handlers it keeps to itself
    expect(env.handlers.has("analyze_design")).toBe(true);
    expect([...env.handlers.keys()].some((n) => n.startsWith("analyze_") && n !== "analyze_design")).toBe(false);
  });

  test("a registration form the envelope cannot wrap is refused", () => {
    const env = envelope(async () => ({}));
    expect(() => (env.server.tool as (...a: unknown[]) => void)("bare", async () => ({}))).toThrow(
      "call envelope"
    );
  });
});

describe("successful calls", () => {
  test("a write reports applied with the request id, file and a receipt line after the body", async () => {
    const pluginMeta: ResultMeta = { protocol: 2, write: true, file: "Checkout v2", outcome: "applied" };
    const env = envelope(viaTracker((t, id) => t.resolve(id, { id: "1:2" }, pluginMeta)));
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("set_text", { nodeId: "1:2", text: "Hi" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(texts(result)[0]!)).toBeTruthy(); // the body is unchanged and first
    expect(meta(result)).toMatchObject({
      v: 1,
      outcome: "applied",
      calls: [{ id: "req-1-0000-0000", outcome: "applied", write: true }],
      target: { file: "Checkout v2" },
    });
    expect(texts(result).at(-1)).toBe(`${RECEIPT_LABEL} applied — the command ran · call req-1-00 · file "Checkout v2"`);
  });

  test("a read adds metadata but no receipt line", async () => {
    const pluginMeta: ResultMeta = { protocol: 2, write: false, file: "F", outcome: "applied" };
    const env = envelope(viaTracker((t, id) => t.resolve(id, { name: "Doc" }, pluginMeta)));
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("get_document_overview");
    expect(meta(result).outcome).toBe("applied");
    expect(receipt(result)).toBeUndefined();
    expect(result.content).toHaveLength(1);
  });

  test("an older plugin's batch is judged from its items", async () => {
    const env = envelope(async () => [
      { command: "set_fill_color", success: true, result: {} },
      { command: "set_fill_color", success: false, error: "Node not found: 9:9" },
    ]);
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("batch_execute", { commands: [{ command: "set_fill_color" }, { command: "set_fill_color" }] });
    expect(meta(result)).toMatchObject({ outcome: "applied", partial: true });
    expect(meta(result).calls[0].items).toEqual([
      { command: "set_fill_color", outcome: "applied" },
      { command: "set_fill_color", outcome: "not_applied", code: "node_not_found" },
    ]);
    expect(receipt(result)).toContain("partly");
  });

  test("a tool that never reaches the plugin reports no outcome", async () => {
    const env = envelope(async () => ({}));
    env.server.tool("local_thing", "d", {}, async () => ({ content: [{ type: "text", text: "ok" }] }));
    const result = await env.call("local_thing");
    expect(meta(result)).toEqual({ v: 1, calls: [] });
    expect(result.content).toHaveLength(1);
  });
});

describe("failed calls", () => {
  test("every tool sets isError and a code when the plugin command fails", async () => {
    const env = envelope(async () => {
      throw new RelaiError("guard_blocked", "That page is a no-go zone");
    });
    registerAllTools(env.server, env.sendCommand);
    // Tools that need only plugin commands; REST-backed ones are left out
    for (const name of ["set_text", "execute_figma", "batch_execute", "get_document_overview", "screenshot", "export_asset", "create_node"]) {
      const args = name === "batch_execute" ? { commands: [{ command: "x" }] } : { nodeId: "1:2", code: "1", type: "FRAME", text: "t" };
      const result = await env.call(name, args);
      expect(result.isError).toBe(true);
      expect(meta(result).error?.code).toBe("guard_blocked");
      expect(meta(result).outcome).toBe("not_applied");
      expect(receipt(result)).toContain("guard_blocked");
    }
  });

  test("a timeout is unknown and says to read the canvas first", async () => {
    const env = envelope(viaTracker(() => {})); // never answers; the tracker times out
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("execute_figma", { code: "return 1" });
    expect(result.isError).toBe(true);
    expect(texts(result)[0]).toStartWith("Error: Request to Figma timed out");
    expect(meta(result)).toMatchObject({
      outcome: "unknown",
      error: { code: "timeout", retry: "read_canvas_first" },
      calls: [{ id: "req-1-0000-0000", command: "execute_code", outcome: "unknown", code: "timeout" }],
    });
    expect(receipt(result)).toContain("unknown — it may have changed the file; read the canvas before retrying · timeout");
  });

  test("an uncoded plugin error is classified by its wording", async () => {
    const env = envelope(async () => {
      throw new Error("[set_fill_color] Scope lock: 3:4 is outside the locked frame");
    });
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("set_properties", { nodeIds: ["3:4"], properties: { opacity: 0.5 } });
    expect(meta(result).error?.code).toBe("scope_locked");
    expect(meta(result).outcome).toBe("not_applied");
  });

  test("an unrecognised error on a write is unknown", async () => {
    const env = envelope(async () => {
      throw new Error("something odd");
    });
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("execute_figma", { code: "x" });
    expect(meta(result)).toMatchObject({ outcome: "unknown", error: { code: "handler_error", retry: "read_canvas_first" } });
  });

  test("a failed read is not_applied even when its wording is unrecognised", async () => {
    const env = envelope(async () => {
      throw new Error("something odd");
    });
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("get_document_overview");
    expect(result.isError).toBe(true);
    expect(meta(result).outcome).toBe("not_applied");
  });

  test("a tool that prints Error: without isError is still a failure", async () => {
    const env = envelope(async () => {
      throw new RelaiError("link_dropped", "The link to Figma dropped");
    });
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("batch_execute", { commands: [{ command: "x" }] });
    expect(texts(result)[0]).toBe("Error: The link to Figma dropped");
    expect(result.isError).toBe(true);
    expect(meta(result)).toMatchObject({ outcome: "unknown", error: { code: "link_dropped" } });
  });

  test("a tool's own error that never reached the plugin is tool_error", async () => {
    const env = envelope(async () => ({}));
    env.server.tool("local_thing", "d", {}, async () => {
      throw new Error("bad input");
    });
    const result = await env.call("local_thing");
    expect(result.isError).toBe(true);
    expect(texts(result)[0]).toBe("Error: bad input");
    expect(meta(result).error).toEqual({ code: "tool_error", retry: "fix_input" });
    expect(meta(result).outcome).toBeUndefined();
  });

  test("a v2 partial failure keeps its stated outcome", async () => {
    const env = envelope(async () => ({}));
    env.server.tool("v2_thing", "d", {}, async () =>
      semanticError("partial_failure", "3 of 5 written", { suggestion: "read back" })
    );
    const result = await env.call("v2_thing");
    expect(meta(result)).toMatchObject({
      outcome: "applied",
      partial: true,
      error: { code: "tool_error", retry: "read_canvas_first" },
    });
  });
});

describe("long results", () => {
  test("text over the limit is cut and the full text saved to a local file", async () => {
    const big = "x".repeat(MAX_TEXT_CHARS + 1234);
    const env = envelope(viaTracker((t, id) => t.resolve(id, { data: big })));
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("export_asset", { nodeId: "1:2" });
    const truncated = meta(result).truncated!;
    expect(truncated.returned).toBe(MAX_TEXT_CHARS);
    expect(truncated.total).toBeGreaterThan(MAX_TEXT_CHARS + 1234);
    expect(truncated.file!.startsWith(join(stateDir, "results"))).toBe(true);
    expect(JSON.parse(readFileSync(truncated.file!, "utf8")).data).toBe(big);
    expect(texts(result)[0]).toEndWith(`the full result is in ${truncated.file}]`);
    expect(texts(result)[0]!.length).toBeLessThan(MAX_TEXT_CHARS + 300);
  });

  test("an older plugin's cut reports the full length (cut chars plus 50,000)", async () => {
    const env = envelope(async () => ({
      result: `${"y".repeat(50000)}… [truncated 70000 chars — return a smaller value]`,
      logs: [],
      truncated: true,
    }));
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("execute_figma", { code: "x" });
    expect(meta(result).truncated?.total).toBe(120000);
    expect(meta(result).truncated?.file).toBeUndefined();
  });

  test("an older plugin's cut is never saved as the full result, even when escaping makes it longer", async () => {
    const env = envelope(async () => ({
      result: `${"\"".repeat(50000)}… [truncated 10 chars — return a smaller value]`,
      logs: [],
      truncated: true,
    }));
    registerAllTools(env.server, env.sendCommand);
    const result = await env.call("execute_figma", { code: "x" });
    expect(meta(result).truncated).toMatchObject({ total: 50010, returned: MAX_TEXT_CHARS });
    expect(meta(result).truncated?.file).toBeUndefined();
    expect(texts(result)[0]).toEndWith("the full result could not be saved]");
  });
});

describe("per-call target", () => {
  test("room and expect_file reach the command, not the tool", async () => {
    const seen: { args?: Record<string, unknown>; target?: unknown } = {};
    const env = envelope(async () => {
      seen.target = currentCallTarget();
      return { ok: true };
    });
    (env.server.tool as (...a: unknown[]) => void)(
      "probe",
      "a test tool",
      {},
      async (args: Record<string, unknown>) => {
        seen.args = args;
        await env.sendCommand("get_selection", {});
        return { content: [{ type: "text", text: "{}" }] };
      }
    );
    const result = await env.call("probe", { room: "room-b", expect_file: "Beta", other: 1 });
    expect(seen.args).toEqual({ other: 1 });
    expect(seen.target).toEqual({ room: "room-b", expectFile: "Beta" });
    // A call that names its target always gets a receipt line
    expect(receipt(result)).toContain("room room-b");
  });

  test("wrapping an enveloped server again changes nothing", () => {
    const env = envelope(async () => ({}));
    const again = withCallEnvelope(env.server, env.sendCommand);
    expect(again.server).toBe(env.server);
    expect(again.sendCommand).toBe(env.sendCommand);
  });

  test("every plugin tool accepts room and expect_file", async () => {
    const { buildManifest } = await import("./cli/manifest.js");
    const manifest = await buildManifest("0.0.0");
    for (const tool of manifest.tools) {
      const props = Object.keys((tool.inputSchema as { properties?: object }).properties ?? {});
      if (tool.name === "join_room" || tool.name === "get_events") {
        expect(props).not.toContain("expect_file");
      } else {
        expect(props).toContain("room");
        expect(props).toContain("expect_file");
      }
    }
  });
});

describe("over MCP", () => {
  test("isError, the receipt line and _meta reach a real client", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createServer } = await import("./server.js");
    const server = createServer();
    const env = withCallEnvelope(server, async () => {
      throw new RelaiError("timeout", "Request to Figma timed out");
    });
    registerAllTools(env.server, env.sendCommand);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "envelope-test", version: "0" });
    await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
    const result = (await client.callTool({ name: "execute_figma", arguments: { code: "1" } })) as ToolResult;
    await client.close();
    await server.close();
    expect(result.isError).toBe(true);
    expect(receipt(result)).toContain("unknown");
    expect(meta(result)).toMatchObject({ v: 1, outcome: "unknown", error: { code: "timeout" } });
  });
});
