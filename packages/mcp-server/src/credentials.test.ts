import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearToken, credentialsPath, loadToken, saveToken, tokenSource } from "./credentials.js";

// The token is the one secret this process holds; these pin the two things
// that would matter if they broke — precedence and file mode.

let dir: string;
let priorEnv: string | undefined;
let priorDir: string | undefined;

beforeEach(() => {
  priorEnv = process.env.FIGMA_TOKEN;
  priorDir = process.env.FIGMA_RELAI_STATE_DIR;
  delete process.env.FIGMA_TOKEN;
  dir = mkdtempSync(join(tmpdir(), "relai-creds-"));
  process.env.FIGMA_RELAI_STATE_DIR = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (priorEnv === undefined) delete process.env.FIGMA_TOKEN;
  else process.env.FIGMA_TOKEN = priorEnv;
  if (priorDir === undefined) delete process.env.FIGMA_RELAI_STATE_DIR;
  else process.env.FIGMA_RELAI_STATE_DIR = priorDir;
});

describe("credentials", () => {
  test("no token anywhere reads as absent", () => {
    expect(loadToken()).toBeUndefined();
    expect(tokenSource()).toBeNull();
  });

  test("saved token round-trips and reports the file as its source", () => {
    saveToken("figd_stored");
    expect(loadToken()).toBe("figd_stored");
    expect(tokenSource()).toBe("file");
  });

  test("the file is written 0600", () => {
    const path = saveToken("figd_stored");
    expect(path).toBe(credentialsPath());
    const mode = statSync(path).mode & 0o777;
    expect(mode.toString(8)).toBe("600");
  });

  test("env wins over the stored file", () => {
    saveToken("figd_stored");
    process.env.FIGMA_TOKEN = "figd_from_env";
    expect(loadToken()).toBe("figd_from_env");
    expect(tokenSource()).toBe("env");
  });

  test("blank env does not mask the stored token", () => {
    saveToken("figd_stored");
    process.env.FIGMA_TOKEN = "   ";
    expect(loadToken()).toBe("figd_stored");
    expect(tokenSource()).toBe("file");
  });

  test("logout removes the file and is idempotent", () => {
    saveToken("figd_stored");
    expect(clearToken()).toBe(true);
    expect(loadToken()).toBeUndefined();
    expect(clearToken()).toBe(false);
  });

  test("a corrupt credentials file reads as absent instead of throwing", () => {
    writeFileSync(credentialsPath(), "{ not json");
    expect(loadToken()).toBeUndefined();
    expect(tokenSource()).toBeNull();
  });
});
