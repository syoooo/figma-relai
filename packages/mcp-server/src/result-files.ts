import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stateDir } from "./state.js";

// Full text of tool results that were cut before reaching the model. Files
// stay on this machine, only the newest few are kept, and none outlives a
// day, so design content does not pile up in the state directory.

const KEEP_FILES = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function resultsDir(): string {
  return join(stateDir(), "results");
}

/**
 * Write a result's full text and return the file's path, or undefined when
 * it could not be written (the caller still cuts the text, it just has no
 * file to point at).
 */
export function writeResultFile(callId: string | undefined, text: string): string | undefined {
  try {
    const dir = resultsDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    pruneResultFiles(dir, KEEP_FILES - 1);
    const id = (callId ?? "").replace(/[^A-Za-z0-9_-]/g, "") || randomUUID();
    const path = join(dir, `${Date.now()}-${id}.${looksLikeJson(text) ? "json" : "txt"}`);
    writeFileSync(path, text, { mode: 0o600 });
    return path;
  } catch {
    return undefined;
  }
}

// Delete files older than a day, then the oldest beyond `keep`
export function pruneResultFiles(dir: string = resultsDir(), keep: number = KEEP_FILES): void {
  const now = Date.now();
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json") || name.endsWith(".txt"))
    .map((name) => ({ path: join(dir, name), mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  files.forEach((file, index) => {
    if (index >= keep || now - file.mtime > MAX_AGE_MS) {
      try {
        unlinkSync(file.path);
      } catch {
        // Another process may have pruned it first
      }
    }
  });
}

function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
