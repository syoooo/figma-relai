import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../cli/manifest.js";
import { VERSION } from "../version.js";

// Every tool a result recommends (`tool: "…"` in recommended_next, fix and
// error hints), a description points to ("Follow with …", "Use after …") or a
// suggestion names has to be one the server actually exposes. A name that
// isn't sends the agent to a tool call that can only fail.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

function referencedTools(): Array<{ name: string; where: string }> {
  const out: Array<{ name: string; where: string }> = [];
  for (const file of sources(import.meta.dir)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const where = `${file.slice(import.meta.dir.length + 1)}:${i + 1}`;
        for (const m of line.matchAll(/\btool:\s*"([a-z_]+)"/g)) out.push({ name: m[1], where });
        const prose = [
          ...line.matchAll(/(?:Follow with|Use after) ([^."`]+)/g),
          ...line.matchAll(/suggestion:\s*"([^"]+)"/g),
        ];
        for (const m of prose) {
          for (const n of m[1].matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) out.push({ name: n[0], where });
        }
      });
  }
  return out;
}

describe("recommended tools", () => {
  test("every recommended tool name is an exposed tool", async () => {
    const exposed = new Set((await buildManifest(VERSION)).tools.map((t) => t.name));
    const refs = referencedTools();
    expect(refs.length).toBeGreaterThan(20);
    expect(refs.filter((r) => !exposed.has(r.name))).toEqual([]);
  });
});
