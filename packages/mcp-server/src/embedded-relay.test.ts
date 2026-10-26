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

// Whether the handshake completes. The Origin goes in as a plain header: the
// `origin` option and the unexpected-response event are not implemented by
// Bun's ws client, which is what runs these tests.
function dial(port: number, origin?: string): Promise<"open" | "refused"> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}`,
      origin === undefined ? {} : { headers: { Origin: origin } }
    );
    const timer = setTimeout(() => reject(new Error("no handshake answer")), 3000);
    ws.on("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve("open");
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolve("refused");
    });
  });
}

describe("embedded relay Origin check", () => {
  test("a localhost web page is refused before it can list rooms", async () => {
    const relay = await start(TEST_PORT + 2);
    expect(relay).not.toBeNull();
    expect(await dial(TEST_PORT + 2, "http://localhost:3000")).toBe("refused");
    expect(await dial(TEST_PORT + 2, "https://example.com")).toBe("refused");
  });

  test("the plugin panel (origin null) and clients without an Origin connect", async () => {
    const relay = await start(TEST_PORT + 3);
    expect(relay).not.toBeNull();
    expect(await dial(TEST_PORT + 3, "null")).toBe("open");
    expect(await dial(TEST_PORT + 3)).toBe("open");
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
