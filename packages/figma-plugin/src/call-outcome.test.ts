import { describe, expect, test } from "bun:test";
import { RelaiError } from "@figma-relai/shared";
import {
  checkExpectedFile,
  classifyError,
  denialError,
  resultMeta,
  resultOutcome,
  scanCancelled,
  SKIPPED_ITEM,
  toErrorPayload,
} from "./call-outcome.js";

describe("classifying a failed command", () => {
  test("a coded error keeps its code and the code's default outcome", () => {
    const error = new RelaiError("guard_blocked", "Page is an AI no-go zone");
    expect(classifyError(error, { phase: "handler", write: true })).toEqual({
      code: "guard_blocked",
      outcome: "not_applied",
      retry: "needs_human",
    });
  });

  test("an uncoded error inside a write's handler is unknown", () => {
    expect(classifyError(new Error("boom"), { phase: "handler", write: true })).toEqual({
      code: "handler_error",
      outcome: "unknown",
      retry: "read_canvas_first",
    });
  });

  test("an uncoded error on a read is not_applied", () => {
    expect(classifyError(new Error("boom"), { phase: "handler", write: false }).outcome).toBe("not_applied");
  });

  test("an uncoded error before the handler ran is not_applied even for a write", () => {
    expect(classifyError("boom", { phase: "preflight", write: true }).outcome).toBe("not_applied");
  });

  test("a failure after the handler finished reports the command as applied", () => {
    expect(classifyError(new Error("boom"), { phase: "after", write: true })).toEqual({
      code: "handler_error",
      outcome: "applied",
      retry: "read_canvas_first",
    });
  });

  test("Figma's 'Unable to establish connection' is figma_internal, never a lost link", () => {
    const error = new Error("in getNodeByIdAsync: Unable to establish connection to the server");
    expect(classifyError(error, { phase: "handler", write: true })).toEqual({
      code: "figma_internal",
      outcome: "unknown",
      retry: "read_canvas_first",
    });
    expect(classifyError(error, { phase: "handler", write: false }).outcome).toBe("not_applied");
  });

  test("script_error is unknown, script_compile_error is not_applied", () => {
    expect(classifyError(new RelaiError("script_error", "x"), { phase: "handler", write: true }).outcome).toBe(
      "unknown"
    );
    expect(
      classifyError(new RelaiError("script_compile_error", "x"), { phase: "handler", write: true }).outcome
    ).toBe("not_applied");
  });

  test("the payload keeps the message byte-for-byte and adds the command", () => {
    const message = 'Scope lock: node 1:2 is outside "Card"';
    const error = new RelaiError("scope_locked", message);
    expect(toErrorPayload(error, { phase: "handler", write: true, command: "move_node" })).toEqual({
      message,
      command: "move_node",
      code: "scope_locked",
      outcome: "not_applied",
      retry: "needs_human",
    });
  });
});

describe("approval cards that end without a yes", () => {
  test("each cause has its own code, and none of them ran the command", () => {
    expect(denialError("designer").code).toBe("denied_by_designer");
    expect(denialError("designer").message).toBe("Denied by designer");
    expect(denialError("timeout").code).toBe("approval_timeout");
    expect(denialError("stop").code).toBe("cancelled");
    for (const cause of ["designer", "timeout", "stop"] as const) {
      expect(denialError(cause).outcome).toBe("not_applied");
    }
  });

  test("a Stop on the card does not read like the old panel's unconfirmed cancel", () => {
    expect(denialError("stop").message).not.toContain("Cancelled by designer");
  });
});

describe("the plugin's own file check", () => {
  test("no expected file means no check", () => {
    expect(checkExpectedFile(undefined, "Checkout")).toBeNull();
    expect(checkExpectedFile({ protocol: 2 }, "Checkout")).toBeNull();
  });

  test("the live name must match exactly", () => {
    expect(checkExpectedFile({ protocol: 2, expectFile: "Checkout" }, "Checkout")).toBeNull();
    const error = checkExpectedFile({ protocol: 2, expectFile: "Checkout" }, "Checkout v2");
    expect(error?.code).toBe("wrong_file");
    expect(error?.outcome).toBe("not_applied");
    expect(error?.message).toContain('"Checkout v2"');
  });

  test("names compare after NFC normalization", () => {
    const composed = "デザイン";
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    expect(checkExpectedFile({ protocol: 2, expectFile: decomposed }, composed)).toBeNull();
  });
});

describe("the outcome of a command that returned", () => {
  test("a single command that finished is applied", () => {
    expect(resultOutcome("set_fill_color", { id: "1:2" })).toEqual({ outcome: "applied" });
  });

  test("a batch stopped part-way is applied and partial; skipped items are not_applied", () => {
    const items = [
      { command: "set_fill_color", success: true, outcome: "applied" },
      { command: "set_fill_color", success: false, ...SKIPPED_ITEM },
      { command: "set_fill_color", success: false, ...SKIPPED_ITEM },
    ];
    expect(SKIPPED_ITEM.outcome).toBe("not_applied");
    expect(resultOutcome("batch_execute", items)).toEqual({ outcome: "applied", partial: true });
  });

  test("a batch item that may have written makes the whole call unknown", () => {
    const items = [
      { success: true, outcome: "applied" },
      { success: false, code: "handler_error", outcome: "unknown" },
    ];
    expect(resultOutcome("batch_execute", items)).toEqual({ outcome: "unknown" });
  });

  test("a batch stopped before its first item is not_applied", () => {
    expect(resultOutcome("batch_execute", [{ ...SKIPPED_ITEM }, { ...SKIPPED_ITEM }])).toEqual({
      outcome: "not_applied",
    });
  });

  test("arrays from other commands are not read as item outcomes", () => {
    expect(resultOutcome("scan_text_nodes", [{ outcome: "not_applied" }])).toEqual({ outcome: "applied" });
  });

  test("the result metadata carries the live file and the write flag", () => {
    expect(resultMeta("batch_execute", true, [{ outcome: "applied" }, { ...SKIPPED_ITEM }], "Checkout")).toEqual({
      protocol: 2,
      write: true,
      file: "Checkout",
      outcome: "applied",
      partial: true,
    });
  });
});

describe("a scan stopped by the designer", () => {
  test("a read-only scan changed nothing", () => {
    const error = scanCancelled(0, 0);
    expect(error.code).toBe("cancelled");
    expect(error.outcome).toBe("not_applied");
  });

  test("a fixing scan that already wrote reports applied and partial", () => {
    const error = scanCancelled(3, 3);
    expect(error.code).toBe("cancelled");
    expect(error.outcome).toBe("applied");
    expect(error.partial).toBe(true);
    expect(error.retry).toBe("read_canvas_first");
  });

  test("a fix that was tried but never confirmed is unknown", () => {
    expect(scanCancelled(0, 1).outcome).toBe("unknown");
  });
});
