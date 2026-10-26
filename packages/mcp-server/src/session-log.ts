// Ring buffer of every command this server sent to the plugin — the AI's own
// audit trail, surfaced through get_events (scope: "agent"). Complements the
// plugin's activity feed: the designer sees it live, the AI can review it.

import type { ErrorCode, Outcome } from "@figma-relai/shared";

export interface SessionLogEntry {
  ts: number;
  command: string;
  nodeId?: string;
  ok: boolean;
  ms: number;
  error?: string;
  id?: string; // the request id, absent when the command was never sent
  room?: string;
  outcome?: Outcome; // whether the command may have changed the file
  partial?: boolean;
  code?: ErrorCode; // set on failures
}

const MAX_ENTRIES = 200;
let entries: SessionLogEntry[] = [];

export function recordCommand(entry: SessionLogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
}

export function getSessionLog(): SessionLogEntry[] {
  return [...entries];
}

export function clearSessionLog(): void {
  entries = [];
}
