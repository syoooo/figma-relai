import { beforeEach, describe, expect, test } from "bun:test";
import { RelaiError } from "@figma-relai/shared";
import { dispatch } from "./dispatcher.js";
import { readGuards, setGuardedPages } from "./handlers/guards.js";
import "./handlers/batch.js";
import "./handlers/text.js";

// Just enough of the figma global for the no-go list: pages, the list stored
// in shared plugin data, and a few nodes whose page is known. The agent's own
// zones are plugin-session state, so each test uses pages no other test adds.
const PAGES = [
  { id: "0:1", name: "Work", type: "PAGE", parent: null },
  { id: "0:2", name: "Brand", type: "PAGE", parent: null },
  { id: "0:3", name: "Scratch A", type: "PAGE", parent: null },
  { id: "0:4", name: "Scratch B", type: "PAGE", parent: null },
  { id: "0:5", name: "Scratch C", type: "PAGE", parent: null },
];
const page = (id: string) => PAGES.find((p) => p.id === id)!;
const NODES: Record<string, { id: string; type: string; parent: unknown }> = {
  "10:1": { id: "10:1", type: "TEXT", parent: page("0:2") }, // on Brand
  "10:2": { id: "10:2", type: "RECTANGLE", parent: page("0:1") }, // on Work
};
for (let i = 0; i < 200; i++) NODES[`11:${i}`] = { id: `11:${i}`, type: "RECTANGLE", parent: page("0:1") };

let stored: string;

beforeEach(() => {
  stored = "";
  (globalThis as unknown as { figma: unknown }).figma = {
    root: {
      children: PAGES,
      getSharedPluginData: () => stored,
      setSharedPluginData: (_ns: string, _key: string, value: string) => {
        stored = value;
      },
    },
    currentPage: page("0:1"),
    ui: { postMessage: () => {} },
    getNodeByIdAsync: async (id: string) => NODES[id] ?? null,
  };
});

function guardPages(...ids: string[]) {
  stored = JSON.stringify({ pages: ids });
}

async function failure(command: string, params: Record<string, unknown>): Promise<RelaiError> {
  try {
    await dispatch(command, params);
  } catch (error) {
    return error as RelaiError;
  }
  throw new Error(`expected ${command} to fail`);
}

describe("set_guards from an agent", () => {
  test("lifting the designer's zone is refused as designer-only, and the zone stays", async () => {
    guardPages("0:2");
    const error = await failure("set_guards", { remove: ["0:2"] });
    expect(error.code).toBe("designer_only");
    expect(error.message).toStartWith("Designer-only:");
    expect(error.message).toContain('"Brand"');
    expect(readGuards().pages).toEqual(["0:2"]);
  });

  test("the full-list form that drops a designer zone is refused too", async () => {
    guardPages("0:2");
    const error = await failure("set_guards", { pages: [] });
    expect(error.code).toBe("designer_only");
    expect(readGuards().pages).toEqual(["0:2"]);
  });

  test("an agent can add a zone and lift the one it added in this session", async () => {
    guardPages("0:2");
    const added = (await dispatch("set_guards", { add: ["0:3"], pages: ["0:2", "0:3"] })) as {
      guarded: string[];
      added: string[];
    };
    expect(added.guarded).toEqual(["0:2", "0:3"]);
    expect(added.added).toEqual(["0:3"]);

    const lifted = (await dispatch("set_guards", { remove: ["0:3"] })) as { guarded: string[]; lifted: string[] };
    expect(lifted.guarded).toEqual(["0:2"]);
    expect(lifted.lifted).toEqual(["0:3"]);
  });

  test("a zone the designer lifted and set again is the designer's, not the agent's", async () => {
    await dispatch("set_guards", { add: ["0:4"] });
    setGuardedPages([]); // the designer lifts it in the panel
    setGuardedPages(["0:4"]); // and sets it again
    const error = await failure("set_guards", { remove: ["0:4"] });
    expect(error.code).toBe("designer_only");
    expect(readGuards().pages).toEqual(["0:4"]);
  });

  test("a zone the agent added and the designer kept stays the agent's to lift", async () => {
    await dispatch("set_guards", { add: ["0:5"] });
    setGuardedPages(["0:5", "0:2"]); // the designer adds another zone in the panel
    const lifted = (await dispatch("set_guards", { remove: ["0:5"] })) as { guarded: string[] };
    expect(lifted.guarded).toEqual(["0:2"]);
  });

  test("set_guards wrapped in batch_execute is refused the same way", async () => {
    guardPages("0:2");
    const results = (await dispatch("batch_execute", {
      commands: [{ command: "set_guards", params: { pages: [] } }],
    })) as Array<{ success: boolean; code?: string }>;
    expect(results[0].success).toBe(false);
    expect(results[0].code).toBe("designer_only");
    expect(readGuards().pages).toEqual(["0:2"]);
  });

  test("a request with no add, remove or pages is invalid", async () => {
    const error = await failure("set_guards", {});
    expect(error.code).toBe("invalid_params");
  });
});

describe("bulk text edits and no-go zones", () => {
  test("an item on a guarded page blocks the whole edit before anything is written", async () => {
    guardPages("0:2");
    const error = await failure("set_multiple_text_contents", {
      text: [
        { nodeId: "10:2", text: "fine" },
        { nodeId: "10:1", text: "brand copy" },
      ],
    });
    expect(error.code).toBe("guard_blocked");
    expect(error.message).toContain("10:1");
  });

  test("items off guarded pages go through to the handler", async () => {
    guardPages("0:2");
    const results = (await dispatch("set_multiple_text_contents", {
      text: [{ nodeId: "10:2", text: "x" }],
    })) as Array<{ nodeId: string; code?: string }>;
    expect(results[0].nodeId).toBe("10:2");
    expect(results[0].code).toBe("precondition_failed"); // a rectangle, not text; the guard let it through
  });

  test("the item past 200 is checked too", async () => {
    guardPages("0:2");
    const text = Array.from({ length: 200 }, (_, i) => ({ nodeId: `11:${i}`, text: "x" }));
    text.push({ nodeId: "10:1", text: "brand copy" });
    const error = await failure("set_multiple_text_contents", { text });
    expect(error.code).toBe("guard_blocked");
  });
});
