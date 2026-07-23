import { beforeEach, describe, expect, test } from "bun:test";
import { recordCommand, getSessionLog, clearSessionLog } from "./session-log.js";

describe("session log", () => {
  beforeEach(() => clearSessionLog());

  test("records entries in order with outcome", () => {
    recordCommand({ ts: 1, command: "create_frame", ok: true, ms: 12 });
    recordCommand({ ts: 2, command: "set_fill_color", nodeId: "1:2", ok: false, ms: 5, error: "Node not found" });
    const log = getSessionLog();
    expect(log.length).toBe(2);
    expect(log[1].ok).toBe(false);
    expect(log[1].nodeId).toBe("1:2");
  });

  test("ring buffer caps at 200 keeping the newest", () => {
    for (let i = 0; i < 250; i++) {
      recordCommand({ ts: i, command: "cmd" + i, ok: true, ms: 1 });
    }
    const log = getSessionLog();
    expect(log.length).toBe(200);
    expect(log[0].command).toBe("cmd50");
    expect(log[199].command).toBe("cmd249");
  });

  test("getSessionLog returns a copy", () => {
    recordCommand({ ts: 1, command: "a", ok: true, ms: 1 });
    getSessionLog().pop();
    expect(getSessionLog().length).toBe(1);
  });
});
