import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { RelayCore, RelaiError, type PeerMeta, type ResultMeta } from "@figma-relai/shared";
import { startEmbeddedRelay, type EmbeddedRelay } from "./embedded-relay.js";
import { FigmaConnection, receiptOf } from "./connection.js";

// A real relay and fake plugin peers, so per-call targeting is tested across
// the same wire the plugin uses.

const PORT = 19731;
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

async function relay(port = PORT): Promise<EmbeddedRelay> {
  const r = await startEmbeddedRelay(port, "test");
  if (!r) throw new Error(`port ${port} is taken`);
  cleanups.push(() => r.close());
  return r;
}

// A relay whose sockets the test can close, to drop the link mid-call
async function closableRelay(port: number): Promise<{ sockets: Set<WebSocket> }> {
  const http: Server = createServer();
  await new Promise<void>((resolve) => http.listen(port, "127.0.0.1", resolve));
  const core = new RelayCore<WebSocket>({ version: "test" });
  const wss = new WebSocketServer({ server: http });
  const sockets = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    sockets.add(ws);
    core.handleOpen(ws);
    ws.on("message", (data) => core.handleMessage(ws, data.toString()));
    ws.on("close", () => {
      sockets.delete(ws);
      core.handleClose(ws);
    });
  });
  cleanups.push(() => {
    for (const ws of sockets) ws.terminate();
    wss.close();
    http.close();
  });
  return { sockets };
}

interface FakePlugin {
  commands: Array<{ id: string; command: string; call?: { protocol: number; expectFile?: string } }>;
  send(message: unknown): void;
  leave(): Promise<void>;
}

type Answer = (cmd: { id: string; command: string }) => { result?: unknown; meta?: ResultMeta; events?: unknown[] } | null;

async function plugin(
  room: string,
  meta: PeerMeta,
  answer: Answer = () => ({ result: { ok: true } }),
  port = PORT
): Promise<FakePlugin> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: "null" } });
  const commands: FakePlugin["commands"] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  const send = (message: unknown) => ws.send(JSON.stringify({ type: "message", room, message }));
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== "broadcast" || !msg.message?.command) return;
    const { id, command, call } = msg.message;
    commands.push({ id, command, call });
    const reply = answer({ id, command });
    if (reply) send({ id, ...reply });
  });
  ws.send(JSON.stringify({ type: "join", id: `join-${room}`, room, role: "plugin", meta }));
  await new Promise((r) => setTimeout(r, 50));
  const leave = async () => {
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  };
  cleanups.push(() => ws.terminate());
  return { commands, send, leave };
}

function connection(options: ConstructorParameters<typeof FigmaConnection>[2] = {}, port = PORT) {
  const conn = new FigmaConnection("localhost", port, options);
  cleanups.push(() => conn.disconnect());
  return conn;
}

async function failure(promise: Promise<unknown>): Promise<RelaiError> {
  return promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (err) => err as RelaiError
  );
}

describe("per-call room", () => {
  test("reaches the named plugin and leaves the default room alone", async () => {
    await relay();
    const alpha = await plugin("room-a", { fileName: "Alpha", protocol: 2 });
    const beta = await plugin("room-b", { fileName: "Beta", protocol: 2 });
    const moves: string[] = [];
    const conn = connection({ onRoomChanged: (r) => moves.push(r) });
    await conn.joinRoom("room-a");

    const { receipt } = await conn.sendCommandDetailed("get_selection", {}, 5000, { room: "room-b" });

    expect(beta.commands.map((c) => c.command)).toEqual(["get_selection"]);
    expect(alpha.commands).toEqual([]);
    expect(conn.room).toBe("room-a");
    expect(moves).toEqual(["room-a"]);
    expect(receipt).toMatchObject({ room: "room-b", file: "Beta", command: "get_selection", outcome: "applied" });
    expect(receipt.id).toBe(beta.commands[0].id);

    // A call without a room still goes to the default room
    await conn.sendCommandDetailed("get_selection", {}, 5000);
    expect(alpha.commands.length).toBe(1);
  });

  test("a plugin absent from the named room fails fast without re-pairing", async () => {
    await relay();
    await plugin("room-a", { fileName: "Alpha" });
    const conn = connection();
    await conn.joinRoom("room-a");
    const t0 = Date.now();
    const err = await failure(conn.sendCommandDetailed("get_selection", {}, 5000, { room: "nobody-here" }));
    expect(err.code).toBe("plugin_absent");
    expect(err.outcome).toBe("not_applied");
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(conn.room).toBe("room-a");
  });

  test("events from other rooms are not collected", async () => {
    await relay();
    const beta = await plugin("room-b", { fileName: "Beta" }, () => ({
      result: { ok: true },
      events: [{ type: "selection", mine: true }],
    }));
    const conn = connection();
    await conn.joinRoom("room-b");
    // Another client's result, broadcast into a room this socket is in
    beta.send({ id: "someone-else", result: {}, events: [{ type: "selection", mine: false }] });
    await new Promise((r) => setTimeout(r, 50));
    expect(conn.consumeEvents()).toEqual([]);

    const { result } = await conn.sendCommandDetailed("get_selection", {}, 5000);
    expect((result as { designer_events: unknown[] }).designer_events).toEqual([{ type: "selection", mine: true }]);
  });
});

describe("expect_file", () => {
  test("a mismatch is refused before anything is sent, naming the right room", async () => {
    await relay();
    const alpha = await plugin("room-a", { fileName: "Alpha", protocol: 2 });
    await plugin("room-b", { fileName: "Beta", protocol: 2 });
    const conn = connection();
    await conn.joinRoom("room-a");

    const err = await failure(conn.sendCommandDetailed("create_frame", {}, 5000, { expectFile: "Beta" }));
    expect(err.code).toBe("wrong_file");
    expect(err.outcome).toBe("not_applied");
    expect(err.message).toContain('Room room-a is on "Alpha", not "Beta"');
    expect(err.message).toContain("room-b");
    expect(receiptOf(err)).toBeUndefined();
    expect(alpha.commands).toEqual([]);
  });

  test("a match is sent, and the plugin is asked to recheck only on protocol 2", async () => {
    await relay();
    const modern = await plugin("room-a", { fileName: "Café", protocol: 2 });
    const legacy = await plugin("room-b", { fileName: "Beta" });
    const conn = connection();
    await conn.joinRoom("room-a");

    // NFC: the decomposed spelling names the same file
    await conn.sendCommandDetailed("create_frame", {}, 5000, { expectFile: "Café" });
    expect(modern.commands[0].call).toEqual({ protocol: 2, expectFile: "Café" });

    await conn.sendCommandDetailed("create_frame", {}, 5000, { room: "room-b", expectFile: "Beta" });
    expect(legacy.commands[0].call).toEqual({ protocol: 2 });
  });

  test("a plugin that reported no file name fails closed", async () => {
    await relay();
    const quiet = await plugin("room-a", {});
    const conn = connection();
    await conn.joinRoom("room-a");
    const err = await failure(conn.sendCommandDetailed("create_frame", {}, 5000, { expectFile: "Alpha" }));
    expect(err.code).toBe("cannot_verify_file");
    expect(quiet.commands).toEqual([]);
  });
});

describe("following a plugin that moved", () => {
  test("same file: follows silently", async () => {
    await relay();
    const first = await plugin("room-a", { fileName: "Alpha" });
    const conn = connection();
    await conn.sendCommandDetailed("get_selection", {}, 5000); // auto-pairs with room-a
    await first.leave();
    const reopened = await plugin("room-c", { fileName: "Alpha" });

    await conn.sendCommandDetailed("get_selection", {}, 5000);
    expect(reopened.commands.length).toBe(1);
    expect(conn.room).toBe("room-c");
  });

  test("different file: the first call is refused, the next goes through", async () => {
    await relay();
    const first = await plugin("room-a", { fileName: "Alpha" });
    const conn = connection();
    await conn.sendCommandDetailed("get_selection", {}, 5000);
    await first.leave();
    const branch = await plugin("room-c", { fileName: "Alpha (branch)" });

    const err = await failure(conn.sendCommandDetailed("create_frame", {}, 5000));
    expect(err.code).toBe("room_changed");
    expect(err.outcome).toBe("not_applied");
    expect(err.message).toContain('"Alpha (branch)" (room room-c)');
    expect(branch.commands).toEqual([]);

    await conn.sendCommandDetailed("create_frame", {}, 5000);
    expect(branch.commands.length).toBe(1);
  });

  test("different file named by expect_file: goes through at once", async () => {
    await relay();
    const first = await plugin("room-a", { fileName: "Alpha" });
    const conn = connection();
    await conn.sendCommandDetailed("get_selection", {}, 5000);
    await first.leave();
    const other = await plugin("room-c", { fileName: "Gamma" });

    await conn.sendCommandDetailed("create_frame", {}, 5000, { expectFile: "Gamma" });
    expect(other.commands.length).toBe(1);
  });
});

describe("join report", () => {
  test("names the file, the branch's main file and whether a plugin is there", async () => {
    await relay();
    await plugin("room-b", { fileName: "Checkout v2" }, ({ command }) =>
      command === "get_file_identity"
        ? { result: { cached: true, rootName: "Checkout v2", identity: { fileKey: "k", fileName: "Checkout", branchName: "Checkout v2" } } }
        : { result: { ok: true } }
    );
    const conn = connection();

    expect(await conn.joinRoom("room-b")).toEqual({ room: "room-b", pluginPresent: true, file: "Checkout v2" });
    await conn.sendCommandDetailed("get_file_identity", {}, 5000);
    expect(await conn.joinRoom("room-b")).toEqual({
      room: "room-b",
      pluginPresent: true,
      file: "Checkout v2",
      branchOf: "Checkout",
    });
    expect(await conn.joinRoom("empty-room")).toEqual({ room: "empty-room", pluginPresent: false });
  });
});

describe("no relay", () => {
  test("a call with nothing listening fails as not_connected, nothing sent", async () => {
    const conn = connection({}, PORT + 3);
    const err = await failure(conn.sendCommandDetailed("get_selection", {}, 5000));
    expect(err.code).toBe("not_connected");
    expect(err.outcome).toBe("not_applied");
    expect(receiptOf(err)).toBeUndefined();
  });
});

describe("dropped link", () => {
  test("a call in flight fails with link_dropped, the close code and the takeover note", async () => {
    const port = PORT + 1;
    const { sockets } = await closableRelay(port);
    await plugin("room-a", { fileName: "Alpha" }, () => null, port); // never answers
    const conn = connection({ isHost: () => false }, port);
    await conn.joinRoom("room-a");

    const pending = failure(conn.sendCommandDetailed("create_frame", {}, 5000));
    await new Promise((r) => setTimeout(r, 50));
    // Close the agent's socket only (the plugin's stays up)
    const agentSocket = [...sockets].at(-1)!;
    agentSocket.close(4001, "test");
    const err = await pending;

    expect(err.code).toBe("link_dropped");
    expect(err.outcome).toBe("unknown");
    expect(err.retry).toBe("read_canvas_first");
    expect(err.message).toContain("close code 4001");
    expect(err.message).toContain("takes over hosting");
    expect(receiptOf(err)).toMatchObject({ command: "create_frame", room: "room-a", outcome: "unknown", code: "link_dropped" });
  });

  test("after a reconnect, the default room and a room a call named both work again", async () => {
    const port = PORT + 2;
    const { sockets } = await closableRelay(port);
    const alpha = await plugin("room-a", { fileName: "Alpha" }, undefined, port);
    const beta = await plugin("room-b", { fileName: "Beta" }, undefined, port);
    const conn = connection({}, port);
    await conn.joinRoom("room-a");
    await conn.sendCommandDetailed("get_selection", {}, 5000, { room: "room-b" });

    [...sockets].at(-1)!.close(4002, "test");
    // The connection redials after 2 seconds
    await new Promise((r) => setTimeout(r, 2600));

    await conn.sendCommandDetailed("get_selection", {}, 5000);
    await conn.sendCommandDetailed("get_selection", {}, 5000, { room: "room-b" });
    expect(alpha.commands.length).toBe(1);
    expect(beta.commands.length).toBe(2);
    expect(conn.room).toBe("room-a");
  });
});
