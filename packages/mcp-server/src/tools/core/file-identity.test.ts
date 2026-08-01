import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { addressableKey, describeIdentity, resolveFileIdentity } from "./file-identity.js";

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

const probe = {
  cached: false,
  rootName: "refinement",
  candidates: [{ key: "abc123", name: "Button", kind: "set" as const }],
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
