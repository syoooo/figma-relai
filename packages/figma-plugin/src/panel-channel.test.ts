import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A script run through execute_figma gets the plugin's own figma object. These
// checks keep the designer's channel and the walls out of its reach.
const SRC = import.meta.dir;
const read = (file: string) => readFileSync(join(SRC, file), "utf8");
const sources = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
const code = (text: string) => text.replace(/\/\/.*$/gm, "");

describe("the panel channel", () => {
  test("main.ts never assigns figma.ui.onmessage", () => {
    expect(code(read("main.ts"))).not.toMatch(/figma\.ui\.onmessage\s*=/);
    expect(code(read("main.ts"))).toMatch(/figma\.ui\.on\("message",/);
  });

  test("only walls.ts writes the stored settings", () => {
    const writers = sources(".").filter((file) => {
      const text = code(read(file));
      return /relai\.settings|SETTINGS_KEY/.test(text) && /clientStorage\.setAsync/.test(text);
    });
    expect(writers).toEqual(["walls.ts"]);
  });

  test("execute_figma checks the walls held in walls.ts", () => {
    // execute-code.ts refuses to run until main.ts hands it the copy
    expect(code(read("main.ts"))).toMatch(
      /setCodeRunWalls\(\{ currentWalls, snapshotVoice, scriptStarted, scriptEnded, checkpoint \}\)/
    );
    expect(code(read("main.ts"))).toMatch(/from "\.\/walls\.js"/);
  });

  test("the kit card's overwrite reaches push and restore", () => {
    // The panel sends force after a refused push or restore; dropping it
    // refuses the overwrite the designer just confirmed
    expect(code(read("main.ts"))).toMatch(/dispatch\("push_to_ruleset", \{ force: msg\.force === true \}\)/);
    expect(code(read("main.ts"))).toMatch(/dispatch\("restore_from_ruleset", \{ force: msg\.force === true \}\)/);
  });
});
