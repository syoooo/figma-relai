import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { startEmbeddedRelay, type EmbeddedRelay } from "./embedded-relay.js";
import { loadState, saveState } from "./state.js";

const TEST_PORT = 19155;
let relays: EmbeddedRelay[] = [];

afterEach(() => {
  for (const r of relays) r.close();
  relays = [];
});

async function start(port: number): Promise<EmbeddedRelay | null> {
  const relay = await startEmbeddedRelay(port, "test");
  if (relay) relays.push(relay);
  return relay;
}

describe("startEmbeddedRelay (bind-or-connect)", () => {
  test("first caller binds, second gets null, takeover works after close", async () => {
    const first = await start(TEST_PORT);
    expect(first).not.toBeNull();

    const second = await start(TEST_PORT);
    expect(second).toBeNull();

    first!.close();
    relays = [];
    // Port release is asynchronous; retry briefly
    let takeover: EmbeddedRelay | null = null;
    for (let i = 0; i < 20 && !takeover; i++) {
      await new Promise((r) => setTimeout(r, 50));
      takeover = await start(TEST_PORT);
    }
    expect(takeover).not.toBeNull();
  });

  test("hosted relay answers the hello probe over a real WebSocket", async () => {
    const relay = await start(TEST_PORT + 1);
    expect(relay).not.toBeNull();

    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`);
      const timer = setTimeout(() => reject(new Error("no hello reply")), 3000);
      ws.on("open", () => ws.send(JSON.stringify({ type: "hello" })));
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "hello") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
      });
      ws.on("error", reject);
    });

    expect(reply.server).toBe("figma-relai");
    expect(reply.version).toBe("test");
  });
});

describe("state persistence", () => {
  test("saveState/loadState round-trips the room via FIGMA_RELAI_STATE_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "relai-state-"));
    process.env.FIGMA_RELAI_STATE_DIR = dir;
    try {
      expect(loadState()).toEqual({});
      saveState({ room: "calm-atlas-a1b2c3d4" });
      expect(loadState().room).toBe("calm-atlas-a1b2c3d4");
      const raw = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
      expect(raw.updatedAt).toBeTruthy();
    } finally {
      delete process.env.FIGMA_RELAI_STATE_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
