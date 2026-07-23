// Ring buffer of every command this server sent to the plugin — the AI's own
// audit trail, surfaced through get_events (scope: "agent"). Complements the
// plugin's activity feed: the designer sees it live, the AI can review it.

export interface SessionLogEntry {
  ts: number;
  command: string;
  nodeId?: string;
  ok: boolean;
  ms: number;
  error?: string;
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
