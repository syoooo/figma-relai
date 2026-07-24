import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getQuickJS } from "quickjs-emscripten";

// Figma's plugin sandbox runs on an old QuickJS build whose compiler rejects
// some syntax that modern engines (and esbuild's es2015 output) accept — e.g.
// `for (const x of await f())` fails the WHOLE bundle with "InternalError:
// stack underflow", bricking the plugin at launch. This test compiles the
// built code.js in quickjs-emscripten (the same VM family) so that class of
// bug is caught in CI instead of in Figma.
//
// Compile success = anything but InternalError; a ReferenceError for the
// missing `figma` global is expected (compilation finished, execution began).

describe("sandbox VM compatibility", () => {
  test("code.js compiles in the Figma-sandbox VM family", async () => {
    const source = readFileSync(join(import.meta.dir, "..", "code.js"), "utf8");
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();
    try {
      const result = vm.evalCode(source);
      if (result.error) {
        const err = vm.dump(result.error) as { name?: string; message?: string };
        result.error.dispose();
        expect(err.name).not.toBe("InternalError");
        expect(err.name).toBe("ReferenceError"); // 'figma' is not defined
      } else {
        result.value.dispose();
        throw new Error("code.js ran without touching the figma global — suspicious for a plugin bundle");
      }
    } finally {
      vm.dispose();
    }
  });

  test("the for-of-await pattern itself still reproduces (canary)", async () => {
    // If this canary ever starts passing, Figma upgraded their VM and the
    // pitfall entry can be retired.
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();
    try {
      const lowered = // esbuild's es2015 lowering of: for (const x of await g()) {}
        "function f(){return __async(this,null,function*(){for(const x of yield g()){}})}";
      const helper =
        "var __async=(t,e,n)=>new Promise((r,o)=>{});function g(){return Promise.resolve([])}";
      const result = vm.evalCode(helper + lowered);
      if (result.error) {
        const err = vm.dump(result.error) as { name?: string };
        result.error.dispose();
        expect(err.name).toBe("InternalError");
      } else {
        result.value.dispose();
        throw new Error("canary compiled — Figma-family VM may have been fixed");
      }
    } finally {
      vm.dispose();
    }
  });
});
