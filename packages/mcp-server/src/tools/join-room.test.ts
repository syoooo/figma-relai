import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRoomTool } from "./index.js";

type Room = { room: string; hasPlugin: boolean; fileName?: string };
type Handler = (args: { room?: string }) => Promise<{ content: Array<{ text: string }> }>;

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
    async (room) => void joined.push(room),
    async () => rooms
  );
  const call = async (room: string) => (await handler!({ room })).content[0].text;
  return { call, joined };
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
});
