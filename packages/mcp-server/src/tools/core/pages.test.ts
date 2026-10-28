import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SendCommandFn } from "../../tool-registry.js";
import { register } from "./pages.js";

// manage_pages through a fake server and a fake plugin: which commands reach
// the plugin, with which params.
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean }>;

function setup(guarded: string[]) {
  const sent: Array<{ command: string; params: Record<string, unknown> }> = [];
  const sendCommand = (async (command: string, params: Record<string, unknown>) => {
    sent.push({ command, params });
    if (command === "get_guards") {
      return { pages: ["0:1", "0:2", "0:3"].map((id) => ({ id, guarded: guarded.includes(id) })) };
    }
    return { ok: true };
  }) as unknown as SendCommandFn;
  let handler: Handler | undefined;
  const server = {
    tool: (_name: string, ...rest: unknown[]) => {
      handler = rest[rest.length - 1] as Handler;
    },
  } as unknown as McpServer;
  register(server, sendCommand);
  return { sent, call: (args: Record<string, unknown>) => handler!(args) };
}

describe("manage_pages guards", () => {
  test("unguard asks the plugin to remove that one page, with no full list", async () => {
    const { sent, call } = setup(["0:2"]);
    await call({ action: "unguard", pageId: "0:2" });
    expect(sent).toEqual([{ command: "set_guards", params: { remove: ["0:2"] } }]);
  });

  test("guard sends add and pages", async () => {
    const { sent, call } = setup(["0:2"]);
    await call({ action: "guard", pageId: "0:3" });
    expect(sent.at(-1)).toEqual({ command: "set_guards", params: { add: ["0:3"], pages: ["0:2", "0:3"] } });
  });

  test("guard and unguard need a pageId", async () => {
    const { sent, call } = setup([]);
    expect((await call({ action: "unguard" })).isError).toBe(true);
    expect((await call({ action: "guard" })).isError).toBe(true);
    expect(sent).toEqual([]);
  });
});
