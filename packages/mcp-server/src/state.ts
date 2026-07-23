import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Persisted pairing state so the AI reconnects to the same room across
// sessions without the designer re-pasting a join command.

export interface RelaiState {
  room?: string;
  updatedAt?: string;
}

function stateDir(): string {
  return process.env.FIGMA_RELAI_STATE_DIR ?? join(homedir(), ".figma-relai");
}

function statePath(): string {
  return join(stateDir(), "state.json");
}

export function loadState(): RelaiState {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as RelaiState;
  } catch {
    return {};
  }
}

export function saveState(patch: Partial<RelaiState>): void {
  try {
    mkdirSync(stateDir(), { recursive: true });
    const next = { ...loadState(), ...patch, updatedAt: new Date().toISOString() };
    writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n");
  } catch {
    // State persistence is best-effort; pairing still works via list_rooms
  }
}
