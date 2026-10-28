import { beforeEach, describe, expect, test } from "bun:test";
import { RelaiError, type LawNotice } from "@figma-relai/shared";
import { dispatch } from "./dispatcher.js";
import { LEGACY_MAX_RESULT_CHARS } from "./utils/serialize-result.js";
import { setCodeRunWalls } from "./handlers/execute-code.js";
import type { VoiceSnap, Walls } from "./wall-core.js";

// Just enough of the figma global to run a script: code execution allowed,
// no no-go zones, no nodes, and the plugin-wide skipInvisibleInstanceChildren
// flag at its design-mode default. The walls are a stand-in for the plugin's
// own copy that records what execute_code asked of it.
let fakeFigma: { skipInvisibleInstanceChildren: boolean; [key: string]: unknown };
let walls: Walls;
let posted: unknown[];
let events: string[];
let afterCode: LawNotice[];
let guardsStored: string;
const nodes = new Map<string, unknown>();
const voice: VoiceSnap = {
  epoch: 0,
  prints: {
    memory: { len: 0, fnv: "811c9dc5" },
    conventions: { len: 0, fnv: "811c9dc5" },
    conventionsAt: { len: 0, fnv: "811c9dc5" },
    rulesetLink: { len: 0, fnv: "811c9dc5" },
  },
};

beforeEach(() => {
  walls = { confirmLevel: "risk", allowCodeExec: true, scopeLock: null, guards: [] };
  posted = [];
  events = [];
  afterCode = [];
  guardsStored = "";
  nodes.clear();
  fakeFigma = {
    skipInvisibleInstanceChildren: false,
    // Storage says the opposite of the walls: execute_code must not read it
    clientStorage: { getAsync: async () => ({ allowCodeExec: !walls.allowCodeExec }) },
    root: { getSharedPluginData: () => guardsStored, children: [] },
    currentPage: { id: "0:1" },
    ui: { postMessage: (message: unknown) => posted.push(message) },
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
  };
  (globalThis as unknown as { figma: unknown }).figma = fakeFigma;
  setCodeRunWalls({
    currentWalls: () => walls,
    snapshotVoice: () => {
      events.push("snapshot");
      return voice;
    },
    scriptStarted: () => events.push("started"),
    scriptEnded: () => events.push("ended"),
    checkpoint: async (where, pre) => {
      events.push(`checkpoint:${where}:${pre === voice}`);
      return [...afterCode];
    },
  });
});

const restoredGuards: LawNotice = {
  kind: "law_restored",
  key: "guards",
  pages: [{ id: "0:9", name: "Brand / Masters" }],
  by: "code",
};

async function failure(params: Record<string, unknown>): Promise<RelaiError> {
  try {
    await dispatch("execute_code", params);
  } catch (error) {
    return error as RelaiError;
  }
  throw new Error("expected execute_code to fail");
}

describe("execute_code", () => {
  test("a script that turns on skipInvisibleInstanceChildren leaves it as it found it", async () => {
    const out = (await dispatch("execute_code", {
      code: "figma.skipInvisibleInstanceChildren = true; return figma.skipInvisibleInstanceChildren;",
    })) as { result: unknown };
    expect(out.result).toBe(true);
    expect(fakeFigma.skipInvisibleInstanceChildren).toBe(false);
  });

  test("the flag is put back when the script throws, and the error is script_error with an unknown outcome", async () => {
    const error = await failure({ code: "figma.skipInvisibleInstanceChildren = true; throw new Error('late');" });
    expect(fakeFigma.skipInvisibleInstanceChildren).toBe(false);
    expect(error).toBeInstanceOf(RelaiError);
    expect(error.code).toBe("script_error");
    expect(error.outcome).toBe("unknown");
    expect(error.message).toContain("late");
    expect(error.message).toContain("Scripts are not atomic");
  });

  test("a script that does not compile is script_compile_error and changed nothing", async () => {
    const error = await failure({ code: "return (;" });
    expect(error.code).toBe("script_compile_error");
    expect(error.outcome).toBe("not_applied");
  });

  test("code execution switched off in the plugin's own walls is code_exec_disabled, whatever storage says", async () => {
    walls.allowCodeExec = false;
    const error = await failure({ code: "return 1;" });
    expect(error.code).toBe("code_exec_disabled");
    expect(error.message).toStartWith("Code execution is disabled.");
    expect(events).toEqual([]);
  });

  test("an older server gets a cut under Claude Code's 50,000-character limit; a protocol 2 server gets the whole result", async () => {
    expect(LEGACY_MAX_RESULT_CHARS).toBeLessThan(50000);
    const code = `return "x".repeat(${LEGACY_MAX_RESULT_CHARS * 2});`;
    const legacy = (await dispatch("execute_code", { code })) as { result: unknown; truncated?: unknown };
    expect(legacy.truncated).toBe(true);
    expect(typeof legacy.result).toBe("string");
    expect((legacy.result as string).length).toBeLessThan(LEGACY_MAX_RESULT_CHARS + 100);

    const full = (await dispatch("execute_code", { code, callProtocol: 2 })) as {
      result: unknown;
      truncated?: unknown;
    };
    expect(full.truncated).toBeUndefined();
    expect(full.result).toBe("x".repeat(LEGACY_MAX_RESULT_CHARS * 2));
  });
});

describe("execute_code after the script", () => {
  test("the script window opens before the script and closes before the after_code check", async () => {
    await dispatch("execute_code", { code: "return 1;" });
    expect(events).toEqual(["snapshot", "started", "ended", "checkpoint:after_code:true"]);
  });

  test("a script that compiles nothing opens no window and runs no check", async () => {
    await failure({ code: "return (;" });
    expect(events).toEqual([]);
  });

  test("walls the script loosened come back as law, a LAW RESTORED warning and one panel notice", async () => {
    afterCode = [restoredGuards];
    const out = (await dispatch("execute_code", { code: "return 1;", commandId: "req-7" })) as {
      law?: LawNotice[];
      warnings?: string[];
    };
    expect(out.law).toEqual([restoredGuards]);
    expect(out.warnings?.[0]).toStartWith("LAW RESTORED:");
    expect(out.warnings?.[0]).toContain('"Brand / Masters"');
    expect(posted).toEqual([{ type: "law-notice", commandId: "req-7", command: "execute_code", notices: [restoredGuards] }]);
  });

  test("a script that throws is still checked, and its error says what was put back", async () => {
    afterCode = [restoredGuards];
    const error = await failure({ code: "throw new Error('late');" });
    expect(events).toEqual(["snapshot", "started", "ended", "checkpoint:after_code:true"]);
    expect(error.code).toBe("script_error");
    expect(error.message).toContain("late");
    expect(error.message).toContain("LAW RESTORED:");
    expect(posted).toHaveLength(1);
  });

  test("nothing to report adds no law, no warning and no panel message", async () => {
    const out = (await dispatch("execute_code", { code: "return 1;" })) as Record<string, unknown>;
    expect(out.law).toBeUndefined();
    expect(out.violations).toBeUndefined();
    expect(out.warnings).toBeUndefined();
    expect(posted).toEqual([]);
  });

  test("nodes the script reached on a no-go page come back as a guard violation and a script_breach notice", async () => {
    const page = { id: "0:9", name: "Brand / Masters", type: "PAGE", parent: null };
    for (const id of ["31:1", "31:2"]) nodes.set(id, { id, name: id, type: "RECTANGLE", parent: page });
    guardsStored = JSON.stringify({ pages: ["0:9"] });
    const out = (await dispatch("execute_code", { code: "return ['31:1', '31:2'];", commandId: "req-8" })) as {
      law?: LawNotice[];
      violations?: unknown[];
      warnings?: string[];
    };
    const violation = { kind: "guard", count: 2, nodeIds: ["31:1", "31:2"], pages: [{ id: "0:9", name: "Brand / Masters" }] };
    expect(out.violations).toEqual([violation]);
    expect(out.law).toEqual([{ kind: "script_breach", violations: [violation] } as LawNotice]);
    expect(out.warnings?.some((w) => w.startsWith("GUARD VIOLATION:"))).toBe(true);
    expect(posted).toEqual([{ type: "law-notice", commandId: "req-8", command: "execute_code", notices: out.law }]);
  });
});
