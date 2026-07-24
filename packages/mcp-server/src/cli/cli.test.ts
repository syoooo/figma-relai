import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIGMA_COMMANDS, PITFALLS } from "@figma-relai/shared";

// The manifest is the anti-drift contract — these tests pin it to the live
// registries so the published JSON can never disagree with the code.
// They run against dist (build first), same constraint as sandbox-vm.test.ts.

const pkgDir = join(import.meta.dir, "..", "..");
const run = (...args: string[]) =>
  spawnSync("node", [join(pkgDir, "dist", "index.js"), ...args], {
    encoding: "utf8",
    timeout: 30000,
  });

describe("figma-relai manifest", () => {
  const out = run("manifest");
  const manifest = JSON.parse(out.stdout);

  test("stdout is pure JSON with the contract shape", () => {
    expect(out.status).toBe(0);
    expect(Object.keys(manifest).sort()).toEqual(
      ["name", "pitfalls", "pluginCommands", "prompts", "tools", "version"].sort()
    );
  });

  test("version matches package.json", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    expect(manifest.version).toBe(pkg.version);
  });

  test("every tool ships a JSON schema and a category", () => {
    expect(manifest.tools.length).toBeGreaterThanOrEqual(32);
    for (const tool of manifest.tools) {
      expect(tool.inputSchema?.type).toBe("object");
      expect(typeof tool.category).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  test("commands and pitfalls mirror the runtime registries", () => {
    expect(manifest.pluginCommands).toEqual([...FIGMA_COMMANDS]);
    expect(manifest.pitfalls.length).toBe(PITFALLS.length);
  });

  test("the committed docs/manifest.json is in sync with the build", () => {
    const committed = JSON.parse(
      readFileSync(join(pkgDir, "..", "..", "docs", "manifest.json"), "utf8")
    );
    expect(committed.version).toBe(manifest.version);
    expect(committed.tools.length).toBe(manifest.tools.length);
  });
});

describe("figma-relai docs", () => {
  test("renders a parameter table for a named tool", () => {
    const out = run("docs", "set_properties");
    expect(out.stdout).toContain("# set_properties");
    expect(out.stdout).toContain("| nodeIds |");
    expect(out.stdout).toContain("dryRun");
  });

  test("renders the index when no tool is given", () => {
    const out = run("docs");
    expect(out.stdout).toContain("get_design_system");
    expect(out.stdout).toContain("figma-relai docs <tool>");
  });

  test("unknown tool lists what exists instead of erroring", () => {
    const out = run("docs", "not_a_tool");
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('Unknown tool "not_a_tool"');
    expect(out.stdout).toContain("execute_figma");
  });
});

describe("figma-relai doctor", () => {
  test("--json reports every check with status and detail", () => {
    const out = run("doctor", "--json");
    const results = JSON.parse(out.stdout);
    const checks = results.map((r: { check: string }) => r.check);
    expect(checks).toEqual(["node", "relay", "plugin", "state", "token"]);
    for (const r of results) {
      expect(["ok", "warn"]).toContain(r.status);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
