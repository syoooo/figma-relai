// Session timeline — a per-machine ring buffer of write commands, so "what
// did the agent touch that day" survives past the live activity feed. Audit
// lane only: entries link back to nodes; no canvas time-travel (Figma's
// version history plus checkpoints already cover restoration).

import { registerHandler } from "../dispatcher.js";

const LOG_KEY = "relai.writeLog";
const CHECKUP_KEY = "relai.lastCheckup";
const MAX_ENTRIES = 500;
const FLUSH_MS = 1500;

export interface WriteLogEntry {
  ts: number;
  sid: string; // plugin-run session id
  file: string;
  cmd: string;
  nodes: string[]; // up to 5 touched node ids
  ok: boolean;
  n?: number; // touched count when notable (bulk)
}

export const SESSION_ID = Math.random().toString(36).slice(2, 8);

let cache: WriteLogEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function loadLog(): Promise<WriteLogEntry[]> {
  if (cache) return cache;
  try {
    const raw = (await figma.clientStorage.getAsync(LOG_KEY)) as WriteLogEntry[] | undefined;
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (cache) {
      figma.clientStorage.setAsync(LOG_KEY, cache).catch(() => {
        // Best-effort persistence — the live feed still has this session
      });
    }
  }, FLUSH_MS);
}

export async function appendWriteLog(
  cmd: string,
  nodes: string[],
  ok: boolean,
  touched?: number
): Promise<void> {
  const log = await loadLog();
  log.unshift({
    ts: Date.now(),
    sid: SESSION_ID,
    file: figma.root.name,
    cmd,
    nodes: nodes.slice(0, 5),
    ok,
    ...(touched && touched >= 10 ? { n: touched } : {}),
  });
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  scheduleFlush();
}

export async function stampCheckup(): Promise<void> {
  try {
    await figma.clientStorage.setAsync(CHECKUP_KEY, Date.now());
  } catch {
    // best effort
  }
}

export async function getLastCheckup(): Promise<number | null> {
  try {
    const v = (await figma.clientStorage.getAsync(CHECKUP_KEY)) as number | undefined;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

registerHandler("list_write_log", async (params) => {
  const log = await loadLog();
  const limit =
    typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, MAX_ENTRIES) : 200;
  return { entries: log.slice(0, limit), total: log.length, currentSession: SESSION_ID };
});
