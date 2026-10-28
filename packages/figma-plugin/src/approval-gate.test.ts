import { describe, expect, test } from "bun:test";
import { createApprovalGate, type ApprovalSettled } from "./approval-gate.js";

// Manual clock: timers fire only when the test says so
function harness() {
  const timers = new Map<number, { fn: () => void; ms: number; repeat: boolean }>();
  let next = 1;
  const posted: unknown[] = [];
  const keepalives: string[] = [];
  const settled: ApprovalSettled[] = [];
  const gate = createApprovalGate({
    timeoutMs: 120000,
    keepaliveMs: 10000,
    post: (m) => posted.push(m),
    keepalive: (id) => keepalives.push(id),
    onSettled: (s) => settled.push(s),
    now: () => 1000,
    setTimer: (fn, ms) => (timers.set(next, { fn, ms, repeat: false }), next++),
    clearTimer: (h) => timers.delete(h as number),
    setRepeat: (fn, ms) => (timers.set(next, { fn, ms, repeat: true }), next++),
    clearRepeat: (h) => timers.delete(h as number),
  });
  const fire = (repeat: boolean) => {
    for (const t of [...timers.values()]) if (t.repeat === repeat) t.fn();
  };
  return { gate, timers, posted, keepalives, settled, fire };
}

describe("approval gate", () => {
  test("a request posts the card with its scale and the agent's intent", () => {
    const { gate, posted } = harness();
    void gate.request("c1", "execute_code", { description: "  rebuild the table  " });
    expect(posted).toEqual([
      {
        type: "approval-request",
        id: "c1",
        command: "execute_code",
        scale: expect.any(String),
        intent: "rebuild the table",
        timeoutMs: 120000,
        deadline: 121000,
      },
    ]);
  });

  test("the card shows the precedents the command matched, none when it matched none", () => {
    const { gate, posted } = harness();
    void gate.request("c1", "delete_node", {}, ["keep the hero"]);
    void gate.request("c2", "delete_node", {}, []);
    expect(posted[0]).toMatchObject({ id: "c1", precedents: ["keep the hero"] });
    expect(posted[1]).not.toHaveProperty("precedents");
  });

  test("the designer's answer settles it and clears both timers", async () => {
    const { gate, timers } = harness();
    const p = gate.request("c1", "delete_node", {});
    expect(timers.size).toBe(2);
    gate.answer("c1", true);
    expect(await p).toEqual({ verdict: "approved" });
    expect(timers.size).toBe(0);
  });

  test("no answer before the timeout denies with cause timeout", async () => {
    const { gate, fire, settled } = harness();
    const p = gate.request("c1", "delete_node", {});
    fire(false);
    expect(await p).toEqual({ verdict: "denied", cause: "timeout" });
    expect(settled[0]).toMatchObject({ approved: false, cause: "timeout" });
  });

  test("stop denies with cause stop", async () => {
    const { gate } = harness();
    const p = gate.request("c1", "delete_node", {});
    gate.answer("c1", false, undefined, "stop");
    expect(await p).toEqual({ verdict: "denied", cause: "stop" });
  });

  test("a typed reason reaches onSettled trimmed; blank reasons are dropped", async () => {
    const { gate, settled } = harness();
    const a = gate.request("a", "delete_node", {});
    const b = gate.request("b", "delete_node", {});
    gate.answer("a", false, "  keep the hero  ");
    gate.answer("b", true, "   ");
    expect(await a).toEqual({ verdict: "denied", cause: "designer", reason: "keep the hero" });
    await b;
    expect(settled.map((s) => s.reason)).toEqual(["keep the hero", undefined]);
  });

  test("the keepalive fires while the card waits", () => {
    const { gate, fire, keepalives } = harness();
    void gate.request("c1", "delete_node", {});
    fire(true);
    fire(true);
    expect(keepalives).toEqual(["c1", "c1"]);
  });

  test("pendingCount tracks open requests and stray answers are ignored", async () => {
    const { gate, settled } = harness();
    const p = gate.request("c1", "delete_node", {});
    expect(gate.pendingCount()).toBe(1);
    gate.answer("other", true);
    expect(gate.pendingCount()).toBe(1);
    gate.answer("c1", true);
    await p;
    gate.answer("c1", false);
    expect(gate.pendingCount()).toBe(0);
    expect(settled).toHaveLength(1);
  });
});
