import { describe, expect, test } from "bun:test";
import {
  CALL_META_KEY,
  ERROR_CODES,
  ERROR_DEFAULTS,
  RelaiError,
  aggregateOutcome,
  inferLegacyCode,
  isErrorCode,
} from "./types/call.js";

describe("error codes", () => {
  test("ERROR_DEFAULTS covers every code and nothing else", () => {
    expect(Object.keys(ERROR_DEFAULTS).sort()).toEqual([...ERROR_CODES].sort());
  });

  test("codes are unique lowercase snake_case", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  test("every unknown outcome tells the caller to read the canvas first", () => {
    for (const code of ERROR_CODES) {
      if (ERROR_DEFAULTS[code].outcome === "unknown") {
        expect(ERROR_DEFAULTS[code].retry).toBe("read_canvas_first");
      }
    }
  });

  test("isErrorCode accepts codes and rejects anything else", () => {
    expect(isErrorCode("wrong_file")).toBe(true);
    expect(isErrorCode("WRONG_FILE")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});

describe("RelaiError", () => {
  test("keeps its message byte-for-byte and takes the code's defaults", () => {
    const message = "Page \"Archive\" is a no-go zone — ask the designer";
    const error = new RelaiError("guard_blocked", message);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(message);
    expect(error.code).toBe("guard_blocked");
    expect(error.outcome).toBe("not_applied");
    expect(error.retry).toBe("needs_human");
    expect(error.partial).toBeUndefined();
  });

  test("an explicit outcome wins over the default", () => {
    const error = new RelaiError("cancelled", "Stopped after 3 of 8", {
      outcome: "applied",
      retry: "read_canvas_first",
      partial: true,
    });
    expect(error.outcome).toBe("applied");
    expect(error.retry).toBe("read_canvas_first");
    expect(error.partial).toBe(true);
  });
});

describe("aggregateOutcome", () => {
  test("unknown dominates", () => {
    expect(aggregateOutcome(["applied", "unknown", "not_applied"])).toEqual({ outcome: "unknown" });
  });

  test("applied plus not_applied is applied and partial", () => {
    expect(aggregateOutcome(["applied", "not_applied"])).toEqual({ outcome: "applied", partial: true });
    expect(aggregateOutcome(["applied", "applied"])).toEqual({ outcome: "applied" });
  });

  test("all not_applied is not_applied", () => {
    expect(aggregateOutcome(["not_applied", "not_applied"])).toEqual({ outcome: "not_applied" });
  });
});

describe("inferLegacyCode", () => {
  test("the old panel's own Stop reply is not trusted", () => {
    expect(inferLegacyCode({ message: "Cancelled by designer", cancelled: true })).toEqual({
      code: "cancel_unconfirmed",
      outcome: "unknown",
      retry: "read_canvas_first",
    });
  });

  test("a denial maps to not_applied", () => {
    expect(inferLegacyCode({ message: "Denied by designer", command: "delete_node", cancelled: true })).toMatchObject({
      code: "denied_by_designer",
      outcome: "not_applied",
    });
  });

  test("known wordings map to their codes, plain strings included", () => {
    expect(inferLegacyCode("Scope lock: node 1:2 is outside").code).toBe("scope_locked");
    expect(inferLegacyCode({ message: "Code execution is disabled in the panel" }).code).toBe("code_exec_disabled");
    expect(inferLegacyCode({ message: "Node not found: 1:2" }).code).toBe("node_not_found");
    expect(inferLegacyCode({ message: "Node 1:2 has been deleted. Re-read the parent." }).code).toBe("node_not_found");
    expect(inferLegacyCode("Unknown command: read_variables").code).toBe("unknown_command");
  });

  test("an unrecognised message maps to handler_error and unknown", () => {
    expect(inferLegacyCode({ message: "Unable to establish connection" })).toEqual({
      code: "handler_error",
      outcome: "unknown",
      retry: "read_canvas_first",
    });
  });
});

test("the result metadata key has a reverse-DNS prefix", () => {
  expect(CALL_META_KEY).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+\/[a-z]+$/);
});
