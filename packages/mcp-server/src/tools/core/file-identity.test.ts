import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { addressableKey, describeIdentity, resolveFileIdentity } from "./file-identity.js";
import { VERSION } from "../../version.js";

// The lookup broke in three consecutive releases without a single test failing,
// so what is stubbed here is exactly what Figma actually sends: a component
// endpoint that answers with `file_key` and no `file_name`.

const realFetch = globalThis.fetch;
let calls: string[] = [];

function stubFigma(routes: Record<string, unknown>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([fragment]) => url.includes(fragment));
    if (!hit) return new Response(JSON.stringify({ err: "not found" }), { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  }) as typeof fetch;
}

const CANDIDATES = [{ key: "abc123", name: "Button", kind: "set" as const }];

let probe: Record<string, unknown> = {
  cached: false,
  rootName: "refinement",
  candidates: CANDIDATES,
};

const stored: Array<Record<string, unknown>> = [];
const sendCommand = (async (command: string, params?: Record<string, unknown>) => {
  if (command === "get_file_identity") return probe;
  if (command === "set_file_identity") {
    stored.push(params ?? {});
    return { stored: true };
  }
  throw new Error(`unexpected command ${command}`);
}) as Parameters<typeof resolveFileIdentity>[0];

beforeEach(() => {
  calls = [];
  stored.length = 0;
  probe = { cached: false, rootName: "refinement", candidates: CANDIDATES };
  process.env.FIGMA_TOKEN = "figd_test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.FIGMA_TOKEN;
});

describe("resolveFileIdentity", () => {
  test("finds the branch even though the component endpoint omits file_name", async () => {
    stubFigma({
      "/component_sets/abc123": { meta: { file_key: "MAINKEY" } },
      "/files/MAINKEY": {
        name: "[MASTER] Gin",
        branches: [
          { key: "OTHER", name: "hagiWork" },
          { key: "BRANCHKEY", name: "refinement" },
        ],
      },
    });

    const identity = await resolveFileIdentity(sendCommand);

    expect(identity.fileKey).toBe("MAINKEY");
    expect(identity.fileName).toBe("[MASTER] Gin");
    expect(identity.branchKey).toBe("BRANCHKEY");
    expect(identity.branchName).toBe("refinement");
    // Comments live per branch — addressing MAINKEY reads an empty list
    expect(addressableKey(identity)).toBe("BRANCHKEY");
    expect(describeIdentity(identity)).toBe('[MASTER] Gin (branch "refinement")');
    expect(stored[0]?.componentKey).toBe("abc123");
  });

  // Two servers can share one plugin, and the cache is read before anything
  // else — so an answer worked out by other code outlives the fix that
  // corrects it. 0.7.3 was cleared by hand three times in one afternoon for
  // exactly this.
  test("uses a cached answer this release computed, without asking Figma", async () => {
    probe = {
      cached: true,
      rootName: "refinement",
      candidates: CANDIDATES,
      identity: { fileKey: "MAINKEY", fileName: "[MASTER] Gin", branchName: "refinement", branchKey: "B", by: VERSION },
    };
    stubFigma({});

    const identity = await resolveFileIdentity(sendCommand);

    expect(identity.fileKey).toBe("MAINKEY");
    expect(calls).toEqual([]);
  });

  test("ignores a cached answer another release computed, and redoes the work", async () => {
    probe = {
      cached: true,
      rootName: "refinement",
      candidates: CANDIDATES,
      // What 0.7.3 actually stored: the branch reporting itself as the file
      identity: { fileKey: "MAINKEY", fileName: "refinement", by: "0.7.3" },
    };
    stubFigma({
      "/component_sets/abc123": { meta: { file_key: "MAINKEY" } },
      "/files/MAINKEY": { name: "[MASTER] Gin", branches: [{ key: "BRANCHKEY", name: "refinement" }] },
    });

    const identity = await resolveFileIdentity(sendCommand);

    expect(identity.fileName).toBe("[MASTER] Gin");
    expect(identity.branchKey).toBe("BRANCHKEY");
    expect(identity.by).toBe(VERSION);
    expect(calls.length).toBeGreaterThan(0);
  });

  // The server updates itself; the plugin only changes when the designer
  // re-imports it. An older plugin returns a hit with no candidates beside it,
  // and refusing the only answer there is would be a regression, not a fix.
  test("keeps a foreign answer when the plugin is too old to offer a redo", async () => {
    probe = {
      cached: true,
      rootName: "refinement",
      identity: { fileKey: "MAINKEY", fileName: "refinement", by: "0.7.3" },
    };
    stubFigma({});

    const identity = await resolveFileIdentity(sendCommand);

    expect(identity.fileKey).toBe("MAINKEY");
    expect(calls).toEqual([]);
  });

  test("an unstamped entry predates the stamp, so it is not trusted either", async () => {
    probe = {
      cached: true,
      rootName: "refinement",
      candidates: CANDIDATES,
      identity: { fileKey: "MAINKEY", fileName: "refinement" },
    };
    stubFigma({
      "/component_sets/abc123": { meta: { file_key: "MAINKEY" } },
      "/files/MAINKEY": { name: "[MASTER] Gin", branches: [{ key: "BRANCHKEY", name: "refinement" }] },
    });

    expect((await resolveFileIdentity(sendCommand)).branchKey).toBe("BRANCHKEY");
  });

  test("leaves the branch fields off when the document is the main file", async () => {
    stubFigma({
      "/component_sets/abc123": { meta: { file_key: "MAINKEY" } },
      "/files/MAINKEY": { name: "refinement", branches: [] },
    });

    const identity = await resolveFileIdentity(sendCommand);

    expect(identity.branchKey).toBeUndefined();
    expect(addressableKey(identity)).toBe("MAINKEY");
  });
});
