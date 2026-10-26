import { beforeEach, describe, expect, test } from "bun:test";
import { RelaiError } from "@figma-relai/shared";
import { dispatch } from "./dispatcher.js";
import { LEGACY_MAX_RESULT_CHARS } from "./utils/serialize-result.js";
import "./handlers/execute-code.js";

// Just enough of the figma global to run a script: code execution allowed,
// no no-go zones, no nodes, and the plugin-wide skipInvisibleInstanceChildren
// flag at its design-mode default.
let fakeFigma: { skipInvisibleInstanceChildren: boolean; [key: string]: unknown };
let allowCodeExec: boolean;

beforeEach(() => {
  allowCodeExec = true;
  fakeFigma = {
    skipInvisibleInstanceChildren: false,
    clientStorage: { getAsync: async () => ({ allowCodeExec }) },
    root: { getSharedPluginData: () => "" },
    getNodeByIdAsync: async () => null,
  };
  (globalThis as unknown as { figma: unknown }).figma = fakeFigma;
});

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

  test("code execution switched off is code_exec_disabled", async () => {
    allowCodeExec = false;
    const error = await failure({ code: "return 1;" });
    expect(error.code).toBe("code_exec_disabled");
    expect(error.message).toStartWith("Code execution is disabled.");
  });

  test("an older server still gets the 50,000-character cut; a protocol 2 server gets the whole result", async () => {
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
