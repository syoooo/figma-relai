import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CALL_META_KEY, RelaiError } from "@figma-relai/shared";
import { registerRoomTool } from "./index.js";

type Room = { room: string; hasPlugin: boolean; fileName?: string; branchOf?: string };
type Result = { content: Array<{ text: string }>; isError?: boolean; _meta?: Record<string, unknown> };
type Handler = (args: { room?: string }) => Promise<Result>;

function joinRoomTool(rooms: Room[]) {
  const joined: string[] = [];
  let handler: Handler | undefined;
  const server = {
    tool: (_name: string, ...rest: unknown[]) => {
      handler = rest[rest.length - 1] as Handler;
    },
  } as unknown as McpServer;
  registerRoomTool(
    server,
    async (room) => {
      joined.push(room);
      const here = rooms.find((r) => r.room === room && r.hasPlugin);
      return {
        room,
        pluginPresent: here !== undefined,
        ...(here?.fileName ? { file: here.fileName } : {}),
        ...(here?.branchOf ? { branchOf: here.branchOf } : {}),
      };
    },
    async () => rooms
  );
  const result = (room: string) => handler!({ room });
  const call = async (room: string) => (await result(room)).content[0].text;
  return { call, result, joined };
}

describe("join_room", () => {
  test("names the file in the room it joined", async () => {
    const { call, joined } = joinRoomTool([{ room: "relai-a1", hasPlugin: true, fileName: "Checkout flow" }]);
    const text = await call("relai-a1");
    expect(joined).toEqual(["relai-a1"]);
    expect(text).toStartWith('Joined room relai-a1 — "Checkout flow".');
  });

  test("says when no plugin is there yet", async () => {
    const { call } = joinRoomTool([{ room: "relai-a1", hasPlugin: true, fileName: "Checkout flow" }]);
    expect(await call("relai-b2")).toContain("no plugin is there yet");
  });

  test("says every agent on this server process shares the one room", async () => {
    const { call } = joinRoomTool([{ room: "relai-a1", hasPlugin: true, fileName: "Checkout flow" }]);
    expect(await call("relai-a1")).toContain("moves them all");
  });

  test("names the main file when the room is on one of its branches", async () => {
    const { call } = joinRoomTool([
      { room: "relai-a1", hasPlugin: true, fileName: "Checkout v2", branchOf: "Checkout" },
    ]);
    expect(await call("relai-a1")).toStartWith('Joined room relai-a1 — "Checkout v2", a branch of "Checkout".');
  });

  test("puts the room and file in the result metadata", async () => {
    const { result } = joinRoomTool([{ room: "relai-a1", hasPlugin: true, fileName: "Checkout flow" }]);
    expect((await result("relai-a1"))._meta?.[CALL_META_KEY]).toEqual({
      v: 1,
      calls: [],
      target: { room: "relai-a1", file: "Checkout flow" },
    });
  });

  test("a failed join reads as an error", async () => {
    let handler: Handler | undefined;
    const server = {
      tool: (_name: string, ...rest: unknown[]) => {
        handler = rest[rest.length - 1] as Handler;
      },
    } as unknown as McpServer;
    registerRoomTool(
      server,
      async () => {
        throw new RelaiError("relay_unresponsive", "The relay did not answer the join to room x.");
      },
      async () => []
    );
    expect((await handler!({ room: "x" })).content[0].text).toBe(
      "Error: The relay did not answer the join to room x."
    );
  });
});
