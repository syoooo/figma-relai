import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneResultFiles, resultsDir, writeResultFile } from "./result-files.js";

let dir: string;
const previous = process.env.FIGMA_RELAI_STATE_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "relai-results-"));
  process.env.FIGMA_RELAI_STATE_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.FIGMA_RELAI_STATE_DIR;
  else process.env.FIGMA_RELAI_STATE_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

describe("writeResultFile", () => {
  test("writes the full text under the state directory, readable only by the owner", () => {
    const path = writeResultFile("7c1e-42", '{"a":1}');
    expect(path).toBeDefined();
    expect(path!.startsWith(resultsDir())).toBe(true);
    expect(path!.endsWith("-7c1e-42.json")).toBe(true);
    expect(readFileSync(path!, "utf8")).toBe('{"a":1}');
    expect(statSync(path!).mode & 0o777).toBe(0o600);
  });

  test("plain text gets a .txt file and a missing call id still gets a name", () => {
    const path = writeResultFile(undefined, "not json");
    expect(path!.endsWith(".txt")).toBe(true);
  });

  test("keeps only the newest files and drops ones older than a day", () => {
    const results = resultsDir();
    writeResultFile("seed", "x");
    for (let i = 0; i < 5; i++) writeFileSync(join(results, `old-${i}.txt`), "x");
    const stale = join(results, "stale.txt");
    writeFileSync(stale, "x");
    const twoDaysAgo = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, twoDaysAgo, twoDaysAgo);
    pruneResultFiles(results, 3);
    const left = readdirSync(results);
    expect(left).not.toContain("stale.txt");
    expect(left.length).toBe(3);
  });
});
