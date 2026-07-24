import { describe, expect, test } from "bun:test";
import { RelayCore, type RelaySocket } from "./relay-core.js";

class FakeSocket implements RelaySocket {
  sent: unknown[] = [];
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  // Messages of a given type, most recent last
  ofType(type: string): Array<Record<string, unknown>> {
    return (this.sent as Array<Record<string, unknown>>).filter((m) => m.type === type);
  }
}

function connect(core: RelayCore<FakeSocket>): FakeSocket {
  const ws = new FakeSocket();
  core.handleOpen(ws);
  return ws;
}

function join(core: RelayCore<FakeSocket>, ws: FakeSocket, room: string, role?: string) {
  core.handleMessage(ws, JSON.stringify({ type: "join", id: `join-${room}-${role}`, room, role }));
}

describe("RelayCore", () => {
  test("hello probe identifies the relay", () => {
    const core = new RelayCore<FakeSocket>({ version: "9.9.9" });
    const ws = connect(core);
    core.handleMessage(ws, JSON.stringify({ type: "hello" }));
    expect(ws.ofType("hello")).toEqual([
      { type: "hello", server: "figma-relai", version: "9.9.9" },
    ]);
  });

  test("join responds with the request id so the MCP promise resolves", () => {
    const core = new RelayCore<FakeSocket>();
    const ws = connect(core);
    core.handleMessage(ws, JSON.stringify({ type: "join", id: "req-1", room: "r1" }));
    const withId = ws
      .ofType("system")
      .find((m) => (m.message as { id?: string })?.id === "req-1");
    expect(withId).toBeDefined();
    expect((withId!.message as { result: string }).result).toContain("r1");
  });

  test("presence is broadcast to all members including the newcomer", () => {
    const core = new RelayCore<FakeSocket>();
    const plugin = connect(core);
    join(core, plugin, "r1", "plugin");
    expect(plugin.ofType("presence").at(-1)?.peers).toEqual([{ role: "plugin", meta: undefined }]);

    const agent = connect(core);
    join(core, agent, "r1", "agent");
    const latest = plugin.ofType("presence").at(-1)?.peers as Array<{ role: string; meta?: unknown }>;
    expect(latest.map((p) => p.role).sort()).toEqual(["agent", "plugin"]);
    expect(agent.ofType("presence").length).toBe(1);
  });

  test("presence updates when a peer disconnects", () => {
    const core = new RelayCore<FakeSocket>();
    const plugin = connect(core);
    const agent = connect(core);
    join(core, plugin, "r1", "plugin");
    join(core, agent, "r1", "agent");
    core.handleClose(plugin);
    const latest = agent.ofType("presence").at(-1)?.peers as Array<{ role: string; meta?: unknown }>;
    expect(latest).toEqual([{ role: "agent", meta: undefined }]);
  });

  test("list_rooms reports plugin presence and agent counts, skipping empty rooms", () => {
    const core = new RelayCore<FakeSocket>();
    const plugin = connect(core);
    const agent = connect(core);
    const loner = connect(core);
    join(core, plugin, "r1", "plugin");
    join(core, agent, "r1", "agent");
    join(core, loner, "gone", "agent");
    core.handleClose(loner);

    const asker = connect(core);
    core.handleMessage(asker, JSON.stringify({ type: "list_rooms", id: "q1" }));
    const result = asker.ofType("list_rooms_result")[0];
    expect(result.id).toBe("q1");
    expect(result.rooms).toEqual([{ room: "r1", hasPlugin: true, agentCount: 1 }]);
  });

  test("list_rooms carries the plugin's fileName when provided", () => {
    const core = new RelayCore<FakeSocket>();
    const plugin = connect(core);
    core.handleMessage(plugin, JSON.stringify({
      type: "join", id: "j1", room: "r1", role: "plugin", meta: { fileName: "Landing v2" },
    }));
    const asker = connect(core);
    core.handleMessage(asker, JSON.stringify({ type: "list_rooms", id: "q" }));
    expect(asker.ofType("list_rooms_result")[0].rooms).toEqual([
      { room: "r1", hasPlugin: true, agentCount: 0, fileName: "Landing v2" },
    ]);
  });

  test("message broadcasts to peers but not the sender, and requires membership", () => {
    const core = new RelayCore<FakeSocket>();
    const a = connect(core);
    const b = connect(core);
    join(core, a, "r1", "agent");
    join(core, b, "r1", "plugin");

    core.handleMessage(a, JSON.stringify({ type: "message", room: "r1", message: { id: "m1", command: "ping", params: {} } }));
    expect(b.ofType("broadcast").length).toBe(1);
    expect(a.ofType("broadcast").length).toBe(0);

    const stranger = connect(core);
    core.handleMessage(stranger, JSON.stringify({ type: "message", room: "r1", message: { id: "m2" } }));
    expect(stranger.ofType("error").at(-1)?.message).toBe("Must join room first");
    expect(b.ofType("broadcast").length).toBe(1);
  });

  test("unknown roles are tracked as 'unknown' (backward compatibility)", () => {
    const core = new RelayCore<FakeSocket>();
    const legacy = connect(core);
    core.handleMessage(legacy, JSON.stringify({ type: "join", id: "j", room: "r1" }));
    expect(legacy.ofType("presence").at(-1)?.peers).toEqual([{ role: "unknown", meta: undefined }]);
  });
});
