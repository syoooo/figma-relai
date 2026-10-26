import { beforeEach, describe, expect, test } from "bun:test";
import { RelaiError } from "@figma-relai/shared";
import { cancelCommand, clearCancelled, dispatch, registerHandler } from "./dispatcher.js";
import { resultOutcome } from "./call-outcome.js";
import "./handlers/batch.js";
import "./handlers/text.js";

// Just enough of the figma global for the multi-item handlers: progress
// messages go nowhere, the root has no no-go zones, and text nodes load
// their fonts. onFontLoad lets a test press Stop part-way through.
type FakeText = { id: string; name: string; type: string; characters: string };
let nodes: Map<string, FakeText | { id: string; name: string; type: string }>;
let onFontLoad: () => void;

beforeEach(() => {
  onFontLoad = () => {};
  nodes = new Map<string, FakeText | { id: string; name: string; type: string }>([
    ["1:1", { id: "1:1", name: "Title", type: "TEXT", characters: "a" }],
    ["1:2", { id: "1:2", name: "Body", type: "TEXT", characters: "b" }],
    ["1:3", { id: "1:3", name: "Note", type: "TEXT", characters: "c" }],
    ["1:9", { id: "1:9", name: "Card", type: "FRAME" }],
  ]);
  for (const node of nodes.values()) {
    (node as unknown as { getRangeFontName: () => FontName }).getRangeFontName = () => ({
      family: "Inter",
      style: "Regular",
    });
  }
  (globalThis as unknown as { figma: unknown }).figma = {
    ui: { postMessage: () => {} },
    root: { getSharedPluginData: () => "" },
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
    loadFontAsync: async () => onFontLoad(),
  };
});

registerHandler("test_write", async () => ({ ok: true }));
registerHandler("test_write_fails", async () => {
  throw new Error("boom");
});
registerHandler("get_test_read_fails", async () => {
  throw new Error("boom");
});
registerHandler("test_write_missing_node", async () => {
  throw new RelaiError("node_not_found", "Node not found: 9:9");
});
registerHandler("test_press_stop", async () => {
  cancelCommand("batch-stop");
  return { ok: true };
});
registerHandler("test_echo_protocol", async (params) => ({ protocol: params.callProtocol }));

type Item = { success: boolean; outcome: string; code?: string; error?: string; result?: unknown };

describe("batch_execute items", () => {
  test("a Stop part-way lists every skipped command, and the batch is applied and partial", async () => {
    const items = (await dispatch("batch_execute", {
      commandId: "batch-stop",
      commands: [
        { command: "test_write" },
        { command: "test_press_stop" },
        { command: "test_write" },
        { command: "test_write" },
      ],
    })) as Item[];
    clearCancelled("batch-stop");

    expect(items.map((i) => i.outcome)).toEqual(["applied", "applied", "not_applied", "not_applied"]);
    expect(items[2]).toMatchObject({ success: false, code: "cancelled" });
    expect(items[3].error).toContain("Cancelled by designer");
    expect(resultOutcome("batch_execute", items)).toEqual({ outcome: "applied", partial: true });
  });

  test("each failure is classified on its own: a failed write is unknown, a failed read or a coded check is not", async () => {
    const items = (await dispatch("batch_execute", {
      commandId: "batch-fail",
      commands: [
        { command: "test_write_fails" },
        { command: "get_test_read_fails" },
        { command: "test_write_missing_node" },
      ],
    })) as Item[];

    expect(items.map((i) => [i.code, i.outcome])).toEqual([
      ["handler_error", "unknown"],
      ["handler_error", "not_applied"],
      ["node_not_found", "not_applied"],
    ]);
    expect(resultOutcome("batch_execute", items)).toEqual({ outcome: "unknown" });
  });

  test("items get the batch's protocol, not one they name themselves", async () => {
    const withProtocol = (await dispatch("batch_execute", {
      commandId: "batch-p2",
      callProtocol: 2,
      commands: [{ command: "test_echo_protocol", params: { callProtocol: 9 } }],
    })) as Item[];
    expect(withProtocol[0].result).toEqual({ protocol: 2 });

    const without = (await dispatch("batch_execute", {
      commandId: "batch-p1",
      commands: [{ command: "test_echo_protocol", params: { callProtocol: 9 } }],
    })) as Item[];
    expect(without[0].result).toEqual({ protocol: undefined });
  });
});

describe("set_multiple_text_contents items", () => {
  test("a Stop part-way keeps the written text and lists every skipped item", async () => {
    onFontLoad = () => cancelCommand("text-stop");
    const items = (await dispatch("set_multiple_text_contents", {
      commandId: "text-stop",
      text: [
        { nodeId: "1:1", text: "New title" },
        { nodeId: "1:2", text: "New body" },
        { nodeId: "1:3", text: "New note" },
      ],
    })) as Item[];
    clearCancelled("text-stop");

    expect((nodes.get("1:1") as FakeText).characters).toBe("New title");
    expect((nodes.get("1:2") as FakeText).characters).toBe("b");
    expect(items.map((i) => i.outcome)).toEqual(["applied", "not_applied", "not_applied"]);
    expect(items[1].code).toBe("cancelled");
    expect(resultOutcome("set_multiple_text_contents", items)).toEqual({ outcome: "applied", partial: true });
  });

  test("an id that is missing or not text changed nothing", async () => {
    const items = (await dispatch("set_multiple_text_contents", {
      commandId: "text-bad",
      text: [
        { nodeId: "9:9", text: "x" },
        { nodeId: "1:9", text: "x" },
      ],
    })) as Item[];
    expect(items.map((i) => [i.code, i.outcome])).toEqual([
      ["node_not_found", "not_applied"],
      ["precondition_failed", "not_applied"],
    ]);
    expect(items[0].error).toBe("Not a text node");
  });
});
